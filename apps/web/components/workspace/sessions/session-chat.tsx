"use client";

// SessionChat — orchestrates the Sessions page (shell spec §B1): wires the
// local sessions store to the mobile-recipe chat wiring (lib/workspace/chat-api.ts),
// tying together ChatHeader, Thread, and Composer. Draft mode (no session
// selected yet) creates the session lazily on first submit, matching the
// desktop's "/" = uncommitted new chat until the first message lands.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/components/AuthProvider";
import { useNotebooks } from "@/components/workspace/notebooks/notebooks-store";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { listSources } from "@/lib/notebooks/api";
import { sendNotebookTurn } from "@/lib/notebooks/chat";
import { routeArtifact } from "@/lib/workspace/artifact-routing";
import { prepareChatAttachments } from "@/lib/workspace/chat-attachments";
import { type ChatErrorKind, sendChatTurn } from "@/lib/workspace/chat-api";
import { DEFAULT_CHAT_EFFORT, type ChatEffort } from "@/lib/workspace/chat-effort";
import { writeLibraryNote } from "@/lib/workspace/library-write";
import { reasoningGlimpse } from "@/lib/workspace/reasoning-preview";
import type { ThinkingPhase } from "@/lib/workspace/thinking-phase";
import { sessionsStore, useSessionMessages, useSessions, type SessionMessage } from "@/lib/workspace/sessions-store";
import { requestRecordingTitle, useRecordingArtifacts, type RecordingArtifactDraft } from "@/lib/workspace/recording-artifacts";

import { ChatHeader } from "./chat-header";
import { Composer, type ComposerMode } from "./composer";
import { ProjectPill } from "./project-pill";
import { Thread, type ThreadTurn } from "./thread";
import type { TurnError } from "./assistant-message";
import { SessionRightRail, type SessionRailPanel } from "./session-right-rail";
import { RecordWorkspace } from "./record-workspace";

function groupTurns(messages: SessionMessage[]): ThreadTurn[] {
  const turns: ThreadTurn[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      turns.push({ assistant: null, user: message });
      continue;
    }
    const open = turns[turns.length - 1];
    if (open && open.assistant === null) open.assistant = message;
    // else: an assistant message with no open user turn — dropped defensively;
    // the submit flow below never produces this shape.
  }
  return turns;
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

// The "Notebooks" half-pill under a fresh thread's composer is the last doorway
// into the retired Notebooks surface (owner 2026-07-23) — its "New notebook"
// lands on a page nothing else links to any more. Hidden behind a flag rather
// than torn out: with no pill, `projectId` can never leave null, so the
// notebook-turn branch below simply stops being reachable and comes back intact
// the day the flag flips. Typed `boolean` so the branch still type-checks.
const NOTEBOOKS_RETIRED: boolean = true;

const PREVIEW_REPLY =
  "This is a preview build — replies here are canned. Sign in on the real app to chat with Nemesis.";

function titleFromPrompt(text: string) {
  const compact = text.trim().replace(/\s+/g, " ");
  return compact.length <= 54 ? compact : `${compact.slice(0, 54).trimEnd()}…`;
}

// How often the buffered reasoning is promoted onto the screen. It streams far
// too fast to render chunk by chunk (~80 chunks/sec on a deep turn), so the
// caller collects it in a ref and this cadence — matched to the phone's
// REASONING_FLUSH_MS — is what a reader can actually follow. It also drives the
// live elapsed timer; the second granularity there is unaffected.
const THINKING_FLUSH_MS = 220;

export function SessionChat() {
  const preview = Boolean(useWorkspacePreview());
  const { session: authSession } = useAuth();
  const uid = preview ? "preview-user" : (authSession?.user.id ?? null);

  const { selectedId, working } = useSessions();
  const { session, messages } = useSessionMessages(selectedId);
  const router = useRouter();
  const pathname = usePathname();
  const navigationRoot = pathname.startsWith("/dev-preview/workspace/") ? "/dev-preview/workspace" : "";
  const notebooks = useNotebooks();
  const [projectId, setProjectId] = useState<string | null>(null);

  const [error, setError] = useState<{ sessionId: string; text: string; kind: ChatErrorKind } | null>(null);
  const [rightRailOpen, setRightRailOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<SessionRailPanel>("sources");
  const [composerMode, setComposerMode] = useState<ComposerMode>("chat");
  // A ref, not state: the effort in force when a turn is SENT is what matters,
  // and re-rendering the thread because a dropdown moved would be waste.
  const effortRef = useRef<ChatEffort>(DEFAULT_CHAT_EFFORT);
  const [recording, setRecording] = useState(false);
  const { artifacts: recordingArtifacts, createArtifact, renameArtifact } = useRecordingArtifacts({ contextId: selectedId, preview, surface: "sessions", userId: uid });
  const turnStartedAt = useRef<Map<string, number>>(new Map());
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  // Live thinking-preview state, keyed by session id the same way turnStartedAt
  // is: an in-flight turn on a session you've navigated away from keeps writing
  // to its own entry, but the render below only reads the selected session's.
  // The reasoning ref holds the RAW accumulated stream; the readable one-line
  // glimpse is derived at render time (reasoningGlimpse), flushed on the tick.
  const phaseBySession = useRef<Map<string, ThinkingPhase>>(new Map());
  const reasoningBySession = useRef<Map<string, string>>(new Map());
  const [, forceTick] = useReducer((n: number) => n + 1, 0);

  const busy = selectedId ? Boolean(working[selectedId]) : false;

  // Live elapsed-seconds ticker for whichever session is currently in view.
  const liveSeconds = (() => {
    if (!busy || !selectedId) return null;
    const startedAt = turnStartedAt.current.get(selectedId);
    if (!startedAt) return null;
    return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  })();

  // The in-flight turn's live thinking state for the session in view. The phase
  // drives the honest status line; the reasoning is flattened to one readable
  // line here (the tick below re-renders often enough to follow the stream).
  const livePhase = busy && selectedId ? phaseBySession.current.get(selectedId) : undefined;
  const liveReasoning = busy && selectedId ? reasoningGlimpse(reasoningBySession.current.get(selectedId) ?? "") : "";

  // Only ticks while the currently-viewed session is busy — an in-flight turn
  // on a session you've navigated away from keeps its own start timestamp in
  // turnStartedAt and needs no re-render until it's back in view. The cadence is
  // fast enough to animate the reasoning line (the seconds granularity is coarser
  // and unaffected).
  //
  // LANDMINE: this tick is the ONLY thing that promotes the buffered reasoning
  // (a ref, updated ~80×/s without a re-render) onto the screen. It works
  // because the render chain from here down — Thread → AssistantMessage →
  // ActivityStrip — is un-memoized, so a forceTick re-runs it and recomputes the
  // glimpse. Wrap any of those in React.memo and the reasoning line freezes.
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(forceTick, THINKING_FLUSH_MS);
    return () => window.clearInterval(id);
  }, [busy]);

  const turns = useMemo(() => groupTurns(messages), [messages]);
  const turnError: TurnError | null = error && error.sessionId === selectedId ? { kind: error.kind, text: error.text } : null;

  const runTurn = useCallback(async (targetUid: string, targetId: string, history: SessionMessage[], text: string) => {
    const effort = effortRef.current;
    turnStartedAt.current.set(targetId, Date.now());
    // Seed the thinking preview before the turn starts working, so the very
    // first render while busy already shows an honest line rather than a blank.
    phaseBySession.current.set(targetId, { kind: "routing" });
    reasoningBySession.current.set(targetId, "");
    sessionsStore.setWorking(targetId, true);

    const controller = new AbortController();
    abortControllers.current.set(targetId, controller);
    const assistantAt = new Date().toISOString();

    try {
      const reply = await sendChatTurn(
        targetUid,
        history,
        text,
        controller.signal,
        (_delta, accumulated) => {
          sessionsStore.upsertAssistantMessage(targetId, assistantAt, accumulated, undefined, false);
        },
        effort,
        (phase) => {
          // A handful of times per turn — cheap to render immediately so the
          // status line (route → search → think → write) stays snappy.
          phaseBySession.current.set(targetId, phase);
          forceTick();
        },
        (_delta, accumulated) => {
          // Fires ~80 times a second on a deep turn: buffer only. The flush tick
          // above is what actually promotes the glimpse onto the screen.
          reasoningBySession.current.set(targetId, accumulated);
        },
      );
      if (reply.text || reply.outputs?.length) {
        // A write with no accompanying prose still gets a short line so the
        // thread never shows a bare card with no context.
        const finalText = reply.text ?? "Saved to your workspace.";
        sessionsStore.upsertAssistantMessage(targetId, assistantAt, finalText, reply.sources, true, reply.outputs);
      } else if (reply.errorText && reply.errorKind) {
        setError({ kind: reply.errorKind, sessionId: targetId, text: reply.errorText });
      }
    } catch (err) {
      if (!isAbortError(err)) {
        setError({ kind: "unreachable", sessionId: targetId, text: "Something went wrong sending that. Try again." });
      }
    } finally {
      sessionsStore.setWorking(targetId, false);
      turnStartedAt.current.delete(targetId);
      phaseBySession.current.delete(targetId);
      reasoningBySession.current.delete(targetId);
      abortControllers.current.delete(targetId);
    }
  }, []);

  // "Work within a project" (owner 2026-07-20): with a project picked, the
  // message starts a chat INSIDE that notebook — instructions + sources apply
  // and the chat lives there — then this page hands off to the notebook view.
  const submitIntoProject = useCallback(
    async (notebookId: string, text: string, files: File[]) => {
      if (!uid) return;
      const prepared = await prepareChatAttachments(text, files, uid);
      if (!prepared.displayText) return;
      setError(null);
      notebooks.select(notebookId);
      const chat = await notebooks.startChat(notebookId, titleFromPrompt(text || files[0]?.name || "New chat"));
      if (!chat) {
        setError({ kind: "generic", sessionId: selectedId ?? "draft", text: "Couldn't start the project chat — check your connection." });
        return;
      }
      const notebook = notebooks.notebooks.find((entry) => entry.id === notebookId) ?? null;
      const sources = await listSources(notebookId).catch(() => []);
      void sendNotebookTurn({
        chatId: chat.id,
        displayText: prepared.displayText,
        instructions: notebook?.instructions ?? null,
        notebookId,
        sources: sources.map((source) => ({ content: source.content, name: source.name })),
        uid,
        userText: prepared.wireText,
      });
      setProjectId(null);
      router.push(`${navigationRoot}/notebooks`);
    },
    [navigationRoot, notebooks, router, selectedId, uid],
  );

  const handleSubmit = useCallback(
    async (text: string, files: File[]) => {
      if (!uid) return;
      if (projectId && !preview) {
        await submitIntoProject(projectId, text, files);
        return;
      }
      const targetId = selectedId ?? sessionsStore.create().id;
      const history = sessionsStore.getState().sessions.find((s) => s.id === targetId)?.messages ?? [];
      const prepared = await prepareChatAttachments(text, files, uid);
      if (!prepared.displayText) return;
      if (history.length === 0) sessionsStore.rename(targetId, titleFromPrompt(text || files[0]?.name || "New session"));
      setError(null);

      if (preview) {
        sessionsStore.appendMessage(targetId, { at: new Date().toISOString(), content: prepared.displayText, role: "user" });
        sessionsStore.setWorking(targetId, true);
        window.setTimeout(() => {
          sessionsStore.appendMessage(targetId, { at: new Date().toISOString(), content: PREVIEW_REPLY, role: "assistant" });
          sessionsStore.setWorking(targetId, false);
        }, 900);
        return;
      }

      sessionsStore.appendMessage(targetId, { at: new Date().toISOString(), content: prepared.displayText, role: "user" });
      void runTurn(uid, targetId, history, prepared.wireText);
    },
    [preview, runTurn, selectedId, uid],
  );

  const handleStop = useCallback(() => {
    if (!selectedId) return;
    abortControllers.current.get(selectedId)?.abort();
  }, [selectedId]);

  const handleEditMessage = useCallback((at: string, content: string) => {
    if (selectedId) sessionsStore.updateMessage(selectedId, at, content);
  }, [selectedId]);

  const isFreshThread = messages.length === 0;
  const placeholder = isFreshThread ? "Ask anything" : "Send a follow-up";
  const sources = useMemo(() => {
    const unique = new Map<string, NonNullable<SessionMessage["sources"]>[number]>();
    for (const message of messages) for (const source of message.sources ?? []) if (!unique.has(source.url)) unique.set(source.url, source);
    return Array.from(unique.values());
  }, [messages]);
  const outputs = useMemo(() => {
    // The finished-recording flow now records the same artifact in the rail
    // source (chat_recording_artifacts) AND on the chat message, so dedupe by
    // id — first occurrence wins.
    const merged = [
      ...recordingArtifacts.map((artifact) => ({ id: artifact.id, kind: "recording" as const, title: artifact.title, transcript: artifact.transcript, notes: artifact.notes, durationSeconds: artifact.durationSeconds, createdAt: artifact.createdAt })),
      ...(session?.outputs ?? []),
      ...messages.flatMap((message) => message.outputs ?? []),
    ];
    const seen = new Set<string>();
    return merged.filter((output) => (seen.has(output.id) ? false : (seen.add(output.id), true)));
  }, [messages, recordingArtifacts, session?.outputs]);

  const handleModeChange = useCallback((mode: ComposerMode) => {
    if (mode === "record" && !sessionsStore.getState().selectedId) sessionsStore.create("Recorded session");
    setComposerMode(mode);
  }, []);

  const handleRecordingFinished = useCallback((draft: RecordingArtifactDraft) => {
    setRecording(false);
    setComposerMode("chat");
    if (draft.durationSeconds <= 0 && !draft.transcript.trim() && !draft.notes.trim()) return;
    setRightPanel("outputs");
    setRightRailOpen(true);
    const targetId = selectedId;
    void (async () => {
      // Persist the recording FIRST. On web the transcript is the only record
      // (no audio file is kept), so it must be durable before the naming
      // round-trip — the row also lands in the right rail instantly with the
      // timestamp title, then refines to the AI name below.
      const artifact = await createArtifact(draft);
      // Name it from the final transcript. The chat card is written once, into
      // an immutable chat_messages row, so its title has to be final BEFORE the
      // append — hence naming happens here, not as an after-the-fact rewrite.
      let title = artifact.title;
      if (uid && !preview) {
        const aiTitle = await requestRecordingTitle(uid, artifact.transcript, artifact.notes);
        if (aiTitle && aiTitle !== artifact.title) {
          try {
            await renameArtifact(artifact.id, aiTitle);
            title = aiTitle;
          } catch {
            // The durable row rename didn't stick — keep the timestamp so the
            // rail and the immutable chat card can't disagree after a reload.
          }
        }
      }
      // Owner item 6: the recording's NOTES also land in the Library under
      // "Recordings/" so they sit beside the student's other saved material.
      // Notes only — filing the transcript too is a separate per-surface
      // setting (item 4), default off and out of this change's scope.
      // Best-effort: a Library hiccup must never block the durable recording
      // row or the thread card below.
      if (uid && !preview && artifact.notes.trim()) {
        const destination = routeArtifact("recording");
        if (destination.surface === "library") {
          try {
            await writeLibraryNote({ content: `# ${title}\n\n${artifact.notes.trim()}`, folder: destination.folder, title, userId: uid });
          } catch {
            // Library unreachable — the recording is still safe in its own row + rail.
          }
        }
      }
      // The artifact also lands in the chat itself as a clickable card
      // (owner ask 2026-07-20) — message outputs sync to cloud meta.
      if (!targetId) return;
      sessionsStore.appendMessage(targetId, {
        at: new Date().toISOString(),
        content: "Recording captured — transcript and notes are ready.",
        outputs: [{ createdAt: artifact.createdAt, durationSeconds: artifact.durationSeconds, id: artifact.id, kind: "recording", notes: artifact.notes, title, transcript: artifact.transcript }],
        role: "assistant",
      });
    })().catch(() => undefined);
  }, [createArtifact, preview, renameArtifact, selectedId, uid]);

  const openSources = useCallback(() => {
    setRightPanel("sources");
    setRightRailOpen(true);
  }, []);

  return (
    <div className="relative isolate flex h-full min-w-0 overflow-hidden bg-(--ui-chat-surface-background)">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ChatHeader onOpenRail={() => setRightRailOpen(true)} railOpen={rightRailOpen} session={session} />
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-(--ui-chat-surface-background) contain-[layout_paint]" data-slot="composer-bounds">
          {composerMode === "record" ? (
            <RecordWorkspace
              accessToken={authSession?.access_token ?? null}
              active={recording}
              className="absolute inset-x-6 bottom-[calc(var(--composer-measured-height)+1.75rem)] top-4 z-10 max-sm:inset-x-3"
              context="A live study, research, class, meeting, or interview session. Infer the subject only from what is spoken."
              contextId={selectedId}
              surface="sessions"
              uid={uid}
              onFinished={handleRecordingFinished}
            />
          ) : (
            <Thread busy={busy} centeredComposer={isFreshThread} error={turnError} key={selectedId ?? "draft"} liveSeconds={liveSeconds} onEditMessage={handleEditMessage} onOpenSources={openSources} phase={livePhase} reasoning={liveReasoning} turns={turns} />
          )}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-24 bg-linear-to-t from-(--ui-chat-surface-background) via-[color-mix(in_srgb,var(--ui-chat-surface-background)_82%,transparent)] to-transparent backdrop-blur-[2px] [mask-image:linear-gradient(to_top,black_35%,transparent)]" />
          <Composer
            belowStart={NOTEBOOKS_RETIRED || !isFreshThread ? undefined : (
              <ProjectPill
                notebooks={notebooks.notebooks}
                onChange={setProjectId}
                onNewProject={() => router.push(`${navigationRoot}/notebooks`)}
                value={projectId}
              />
            )}
            busy={busy}
            centered={isFreshThread && composerMode === "chat"}
            mode={composerMode}
            onEffortChange={(effort) => { effortRef.current = effort; }}
            onModeChange={handleModeChange}
            onRecordingChange={setRecording}
            onStop={handleStop}
            onSubmit={handleSubmit}
            placeholder={projectId ? "Message your notebook" : placeholder}
            showRecordCompanion={false}
          />
        </div>
      </div>
      {rightRailOpen && <SessionRightRail onCollapse={() => setRightRailOpen(false)} onPanelChange={setRightPanel} outputs={outputs} panel={rightPanel} sources={sources} />}
    </div>
  );
}
