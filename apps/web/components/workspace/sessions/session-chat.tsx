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
import { partitionImportables, prepareChatAttachments } from "@/lib/workspace/chat-attachments";
import { type ChatErrorKind, sendChatTurn } from "@/lib/workspace/chat-api";
import { DEFAULT_CHAT_EFFORT, type ChatEffort } from "@/lib/workspace/chat-effort";
import { groupTurns } from "@/lib/workspace/session-turns";
import { sessionsStore, useSessionMessages, useSessions, type SessionMessage } from "@/lib/workspace/sessions-store";
import { useRecordingArtifacts, type RecordingArtifactDraft } from "@/lib/workspace/recording-artifacts";
import { AnkiImportDialog } from "@/components/workspace/study/anki-import-dialog";
import { requestRecordingNote } from "@/lib/workspace/recording-note";
import { writeLibraryNote } from "@/lib/workspace/library-write";


import { ChatHeader } from "./chat-header";
import { Composer, type ComposerMode } from "./composer";
import { ProjectPill } from "./project-pill";
import { Thread } from "./thread";
import type { TurnError } from "./assistant-message";
import { SessionRightRail, type SessionRailPanel } from "./session-right-rail";
import { RecordWorkspace } from "./record-workspace";

/** Where a recording's notes are filed. Its own folder so a semester of
 *  lectures stays browsable next to the student's typed notes. */
const RECORDINGS_FOLDER = "Nemesis/Recordings";

/** The placeholder name a session gets when the recorder creates it. Only a
 *  session still carrying this gets renamed to the recording's own title. */
const RECORDED_SESSION_TITLE = "Recorded session";

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
  // A deck handed over from the composer. Held here so the Study importer —
  // deck picker, progress, and error copy all already reviewed — is what runs,
  // rather than a second import path invented for chat.
  const [deckToImport, setDeckToImport] = useState<File | null>(null);
  const { artifacts: recordingArtifacts, createArtifact } = useRecordingArtifacts({ contextId: selectedId, preview, surface: "sessions", userId: uid });
  const turnStartedAt = useRef<Map<string, number>>(new Map());
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const [, forceTick] = useReducer((n: number) => n + 1, 0);

  const busy = selectedId ? Boolean(working[selectedId]) : false;

  // Live elapsed-seconds ticker for whichever session is currently in view.
  const liveSeconds = (() => {
    if (!busy || !selectedId) return null;
    const startedAt = turnStartedAt.current.get(selectedId);
    if (!startedAt) return null;
    return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  })();

  // Only ticks while the currently-viewed session is busy — an in-flight turn
  // on a session you've navigated away from keeps its own start timestamp in
  // turnStartedAt and needs no per-second re-render until it's back in view.
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(forceTick, 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  const turns = useMemo(() => groupTurns(messages), [messages]);
  const turnError: TurnError | null = error && error.sessionId === selectedId ? { kind: error.kind, text: error.text } : null;

  const runTurn = useCallback(async (targetUid: string, targetId: string, history: SessionMessage[], text: string) => {
    const effort = effortRef.current;
    turnStartedAt.current.set(targetId, Date.now());
    sessionsStore.setWorking(targetId, true);

    const controller = new AbortController();
    abortControllers.current.set(targetId, controller);
    const assistantAt = new Date().toISOString();

    try {
      const reply = await sendChatTurn(targetUid, history, text, controller.signal, (_delta, accumulated) => {
        sessionsStore.upsertAssistantMessage(targetId, assistantAt, accumulated, undefined, false);
      }, effort);
      if (reply.text) {
        sessionsStore.upsertAssistantMessage(targetId, assistantAt, reply.text, reply.sources, true, reply.outputs);
      } else if (reply.outputs?.length) {
        sessionsStore.upsertAssistantMessage(
          targetId,
          assistantAt,
          "Created and saved to your workspace.",
          reply.sources,
          true,
          reply.outputs,
        );
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

      // An Anki deck dropped into chat is an IMPORT, not a question. The text
      // extractor has nothing to say about a zipped SQLite database, so this
      // used to answer "no text extractor is available for this format" while
      // the app carried a whole reviewed importer for exactly this file.
      // Hand it there; anything else attached alongside still goes to the model.
      const { decks, rest } = partitionImportables(files);
      const [deck] = decks;
      if (deck) {
        setDeckToImport(deck);
        if (!text.trim() && rest.length === 0) return;
        files = rest;
      }

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
    [preview, projectId, runTurn, selectedId, submitIntoProject, uid],
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
    if (mode === "record" && !sessionsStore.getState().selectedId) sessionsStore.create(RECORDED_SESSION_TITLE);
    setComposerMode(mode);
  }, []);

  const handleRecordingFinished = useCallback((draft: RecordingArtifactDraft) => {
    setRecording(false);
    setComposerMode("chat");
    if (draft.durationSeconds <= 0 && !draft.transcript.trim() && !draft.notes.trim()) return;
    // Deliberately NOT opening the Outputs panel (owner 2026-07-28: "recorded
    // session did not save into chat as part of the conversation as artifact,
    // it only saved in the outputs section"). Leaving the panel alone keeps the
    // student in the conversation, where the artifact belongs.
    //
    // That alone did not fix it, and the earlier note here — blaming the rail
    // sliding open — was wrong. The card was posted and persisted every time
    // (chat_messages holds it with the artifact under meta.outputs); the THREAD
    // was throwing it away, because grouping dropped any assistant message with
    // no unanswered question above it, which is every recording. See
    // lib/workspace/session-turns.ts.
    const targetId = selectedId;
    void (async () => {
      // ONE compose pass over the whole transcript (owner 2026-07-27). There are
      // no live notes to fall back on any more — nothing is written during the
      // recording — so when this fails the transcript is what the student keeps,
      // and the message below has to say so rather than claim notes exist.
      //
      // The same pass names the recording (owner 2026-07-28: "can the note
      // title also be renamed instead of being just 'recording'") — a title
      // costs nothing extra folded in here, and it is what the Library note,
      // its filename, and the chat card are all called. An empty title is not
      // an error: createArtifact falls back to the dated name.
      const { notes, title } = uid
        ? await requestRecordingNote({ transcript: draft.transcript, uid })
        : { notes: "", title: "" };
      const artifact = await createArtifact({ ...draft, notes }, title);

      // A sidebar of identical "Recorded session" rows has the same problem the
      // title fixes, so borrow it — but only while the session still carries the
      // name the recorder gave it. A student who renamed it, or who recorded
      // partway through a real conversation, keeps their own title.
      const sessionTitle = sessionsStore.getState().sessions.find((entry) => entry.id === targetId)?.title;
      if (targetId && title && sessionTitle === RECORDED_SESSION_TITLE) sessionsStore.rename(targetId, title);

      // The third destination (owner ask 2026-07-27). Until now a recording
      // reached the Outputs panel and the chat card but never the Library, so
      // it stayed stranded in one conversation instead of joining the semester.
      let libraryPath: string | null = null;
      if (uid && !preview && notes.trim()) {
        try {
          libraryPath = (await writeLibraryNote({ content: notes, folder: RECORDINGS_FOLDER, title: artifact.title, userId: uid })).path;
        } catch {
          // Saving to the Library is a bonus destination, not the recording
          // itself — a failure here must not discard the artifact above.
          libraryPath = null;
        }
      }

      // The artifact also lands in the chat itself as a clickable card
      // (owner ask 2026-07-20) — message outputs sync to cloud meta.
      if (!targetId) return;
      sessionsStore.appendMessage(targetId, {
        at: new Date().toISOString(),
        // The silence gate's saving is reported, not hidden: the student's
        // allowance was charged for the shorter audio, so they should be able
        // to reconcile a 60-minute lecture reading as 45 minutes.
        content: [
          libraryPath
            ? `Recording captured. The notes are saved in your Library at ${libraryPath}. Want me to link them to your existing notes on this topic?`
            : notes.trim()
              ? "Recording captured — transcript and notes are ready."
              : "Recording captured. The transcript is saved, but writing the notes failed — ask me to write them up and I will use the transcript.",
          draft.silenceSkipped ? `\n\n${draft.silenceSkipped}.` : "",
        ].join(""),
        outputs: [{ createdAt: artifact.createdAt, durationSeconds: artifact.durationSeconds, id: artifact.id, kind: "recording", notes: artifact.notes, title: artifact.title, transcript: artifact.transcript }],
        role: "assistant",
      });
    })().catch((cause) => {
      // Was `.catch(() => undefined)`. Anything that threw between saving the
      // artifact and posting the card vanished without a trace, which is a
      // recording that exists in Outputs and nowhere else with no way to tell
      // why. Say so in the thread instead of dropping it.
      console.error("recording follow-up failed", cause);
      if (!targetId) return;
      sessionsStore.appendMessage(targetId, {
        at: new Date().toISOString(),
        content: "Your recording was saved, but writing it up failed. The audio and transcript are safe — ask me to write the notes and I will use them.",
        role: "assistant",
      });
    });
  }, [createArtifact, preview, selectedId, uid]);

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
              uid={uid}
              onFinished={handleRecordingFinished}
            />
          ) : (
            <Thread busy={busy} centeredComposer={isFreshThread} error={turnError} key={selectedId ?? "draft"} liveSeconds={liveSeconds} onEditMessage={handleEditMessage} onOpenSources={openSources} turns={turns} />
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
      <AnkiImportDialog
        initialFile={deckToImport}
        onOpenChange={(next) => { if (!next) setDeckToImport(null); }}
        open={deckToImport !== null}
      />
    </div>
  );
}
