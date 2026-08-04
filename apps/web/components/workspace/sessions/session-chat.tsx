"use client";

// SessionChat — orchestrates the Sessions page (shell spec §B1): wires the
// local sessions store to the mobile-recipe chat wiring (lib/workspace/chat-api.ts),
// tying together ChatHeader, Thread, and Composer. Draft mode (no session
// selected yet) creates the session lazily on first submit, matching the
// desktop's "/" = uncommitted new chat until the first message lands.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { studyCreationPreferencePrompt } from "@nemesis/shared";

import { useAuth } from "@/components/AuthProvider";
import { useNotebooks } from "@/components/workspace/notebooks/notebooks-store";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { listSources } from "@/lib/notebooks/api";
import { sendNotebookTurn } from "@/lib/notebooks/chat";
import { chatDisplayText, draftAttachmentRecords, partitionImportables, prepareChatAttachments } from "@/lib/workspace/chat-attachments";
import { conflictSummary, splitCalendarConflicts } from "@/lib/workspace/calendar-conflicts";
import { type ChatErrorKind, sendChatTurn } from "@/lib/workspace/chat-api";
import { executeAgentTool } from "@/lib/workspace/agent-tools";
import type { PendingDelete } from "@nemesis/shared";
import { DEFAULT_CHAT_EFFORT, type ChatEffort } from "@/lib/workspace/chat-effort";
import { groupTurns } from "@/lib/workspace/session-turns";
import { sessionsStore, useSessionMessages, useSessions, type SessionMessage } from "@/lib/workspace/sessions-store";
import { useRecordingArtifacts, type RecordingArtifactDraft } from "@/lib/workspace/recording-artifacts";
import { loadCalendarEvents, saveCalendarEvent, type CalendarEvent } from "@/lib/workspace/calendar-model";
import { AnkiImportDialog } from "@/components/workspace/study/anki-import-dialog";
import { requestRecordingNote } from "@/lib/workspace/recording-note";
import { writeLibraryNote } from "@/lib/workspace/library-write";


import { ChatHeader } from "./chat-header";
import { ChatSuggestions } from "./chat-suggestions";
import { Composer, type ComposerMode } from "./composer";
import { ProjectPill } from "./project-pill";
import { Thread } from "./thread";
import type { TurnError } from "./assistant-message";
import { SessionRightRail, type SessionRailPanel } from "./session-right-rail";
import { RecordWorkspace, type RecordControls } from "./record-workspace";
import { SyllabusDialog } from "../calendar/syllabus-dialog";

/** Where a recording's notes are filed. Its own folder so a semester of
 *  lectures stays browsable next to the student's typed notes. */
const RECORDINGS_FOLDER = "Nemesis/Recordings";

/** The placeholder name a session gets when the recorder creates it. Only a
 *  session still carrying this gets renamed to the recording's own title. */
const RECORDED_SESSION_TITLE = "Recorded session";

/** An id for a message or artifact this tab is about to create. Guarded because
 *  crypto.randomUUID is absent on http:// origins in some browsers, and an
 *  exception here would take out the whole recording follow-up. */
function newLocalId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

function isDocumentFile(file: File): boolean {
  return /\.(pdf|docx|pptx)$/i.test(file.name);
}

function looksLikeSyllabus(file: File): boolean {
  return isDocumentFile(file) &&
    /(syllabus|course[\s_-]*(schedule|outline)|class[\s_-]*schedule)/i.test(file.name);
}

/** The student's own words asking for a calendar import. This is what catches
 *  real syllabi whose filenames say nothing ("Fall-2026-PHCY-2105-01-….pdf")
 *  — the owner attached four of those with "here are my syllabuses, put them
 *  into the calendar" and the old name-only gate sent them all to the generic
 *  text path, where the model surfaced 3 dates out of four courses. Kept
 *  narrow on purpose: "what's the deadline in this paper?" must NOT trigger. */
function asksForCalendarImport(text: string): boolean {
  return /syllab/i.test(text) || (/\b(add|put|import|load)\b/i.test(text) && /calendar|schedule/i.test(text));
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
  // A delete the model asked for and the confirmation gate held. Nothing has
  // been deleted; only the click below carries it out.
  const [pendingDelete, setPendingDelete] = useState<{ pending: PendingDelete; sessionId: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rightRailOpen, setRightRailOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<SessionRailPanel>("sources");
  const [composerMode, setComposerMode] = useState<ComposerMode>("chat");
  // A ref, not state: the effort in force when a turn is SENT is what matters,
  // and re-rendering the thread because a dropdown moved would be waste.
  const effortRef = useRef<ChatEffort>(DEFAULT_CHAT_EFFORT);
  const [recording, setRecording] = useState(false);
  /** What the thinking strip says right now — a live phrase from the model's
   *  streamed thoughts or a tool verb ("Searching the web"). Keyed to a
   *  session so a label from a backgrounded turn never shows on another chat. */
  const [liveActivity, setLiveActivity] = useState<{ label: string; sessionId: string } | null>(null);
  /** Why the last stop happened. Set in the same commit as `recording`, so the
   *  recorder never sees capture end without knowing whether to keep the audio. */
  const [discardRecording, setDiscardRecording] = useState(false);
  const handleRecordingChange = useCallback((next: boolean, options?: { discard?: boolean }) => {
    setDiscardRecording(options?.discard === true);
    setRecording(next);
  }, []);
  /** Pause/Continue lives on the COMPOSER (owner 2026-08-03) while the hook
   *  lives in RecordWorkspace — the panel hands its controls up through
   *  registerControls and reports `paused` back down one way, so the button
   *  and the panel can never disagree. */
  const [recordingPaused, setRecordingPaused] = useState(false);
  /** True while a finished recording is still uploading/transcribing. The
   *  panel MUST stay mounted through this — unmounting mid-flight loses the
   *  recording silently — so the render below keeps it up even if the student
   *  has already left record mode. */
  const [recordingBusy, setRecordingBusy] = useState(false);
  const recordControlsRef = useRef<RecordControls | null>(null);
  const registerRecordControls = useCallback((controls: RecordControls | null) => {
    recordControlsRef.current = controls;
    if (!controls) setRecordingPaused(false);
  }, []);
  const handleRecordingPauseToggle = useCallback(() => {
    const controls = recordControlsRef.current;
    if (!controls) return;
    if (recordingPaused) controls.resume();
    else controls.pause();
  }, [recordingPaused]);
  // A deck handed over from the composer. Held here so the Study importer —
  // deck picker, progress, and error copy all already reviewed — is what runs,
  // rather than a second import path invented for chat.
  const [deckToImport, setDeckToImport] = useState<File | null>(null);
  // A QUEUE, front file first: attaching several syllabi at once walks the
  // reviewed importer through them one dialog at a time (owner 2026-08-03
  // attached four). Closing a dialog — imported or cancelled — advances it.
  const [syllabusImport, setSyllabusImport] = useState<{ files: File[]; targetId: string } | null>(null);
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
      }, effort, (label) => {
        setLiveActivity(label ? { label, sessionId: targetId } : null);
      });
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
      // The gate held a delete. The card goes up alongside the reply, which is
      // telling them to confirm. Never persisted — closing the tab declines it.
      if (reply.pendingDelete) setPendingDelete({ pending: reply.pendingDelete, sessionId: targetId });
    } catch (err) {
      if (!isAbortError(err)) {
        setError({ kind: "unreachable", sessionId: targetId, text: "Something went wrong sending that. Try again." });
      }
    } finally {
      sessionsStore.setWorking(targetId, false);
      turnStartedAt.current.delete(targetId);
      abortControllers.current.delete(targetId);
      // Only this turn's own label — a newer turn on another session may
      // already own the strip.
      setLiveActivity((current) => (current?.sessionId === targetId ? null : current));
    }
  }, []);

  /** 🔴 RE-ENTERS THE SAME EXECUTOR rather than deleting anything itself.
   *  `confirmed: true` skips only the gate — the uuid check, the row lookup and
   *  the empty-deck rule all run again, so a card clicked long after the fact
   *  gets the guard's honest answer instead of doing damage. */
  const confirmPendingDelete = useCallback(async () => {
    const held = pendingDelete;
    if (!held || deleting) return;
    setDeleting(true);
    const result = await executeAgentTool(
      { arguments: JSON.stringify(held.pending.args), id: "confirmed", name: held.pending.tool },
      { confirmed: true },
    );
    const failed = result && typeof result === "object" && "error" in (result as Record<string, unknown>);
    sessionsStore.upsertAssistantMessage(
      held.sessionId,
      new Date().toISOString(),
      failed
        ? String((result as { error: unknown }).error)
        : `Deleted ${held.pending.target}.${held.pending.recoverable ? " It is in your trash if you want it back." : ""}`,
      undefined,
      true,
    );
    setPendingDelete(null);
    setDeleting(false);
  }, [deleting, pendingDelete]);

  const cancelPendingDelete = useCallback(() => {
    const held = pendingDelete;
    if (!held) return;
    sessionsStore.upsertAssistantMessage(
      held.sessionId,
      new Date().toISOString(),
      `Kept ${held.pending.target}. Nothing was deleted.`,
      undefined,
      true,
    );
    setPendingDelete(null);
  }, [pendingDelete]);

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

      // A syllabus is a calendar import, not free-form attachment context.
      // Route it through the same quote-verified review flow as Calendar's own
      // importer instead of asking the chat model to rediscover dates and call
      // add_calendar_event repeatedly (the path that mis-mapped this account).
      // The gate: a filename that says syllabus, OR the student's own words
      // asking for a calendar import while documents are attached. Only when
      // EVERY attached file qualifies — a syllabus mixed in with lecture notes
      // stays a normal question rather than being split into two flows.
      const importIntent = asksForCalendarImport(text);
      const syllabusFiles = files.filter((file) => looksLikeSyllabus(file) || (importIntent && isDocumentFile(file)));
      if (syllabusFiles.length > 0 && syllabusFiles.length === files.length && !preview) {
        const targetId = selectedId ?? sessionsStore.create().id;
        const history = sessionsStore.getState().sessions.find((s) => s.id === targetId)?.messages ?? [];
        if (history.length === 0) sessionsStore.rename(targetId, titleFromPrompt(text || syllabusFiles[0]!.name));
        sessionsStore.appendMessage(targetId, {
          at: new Date().toISOString(),
          content: chatDisplayText(text, syllabusFiles),
          role: "user",
        });
        setError(null);
        setSyllabusImport({ files: syllabusFiles, targetId });
        return;
      }

      if (projectId && !preview) {
        await submitIntoProject(projectId, text, files);
        return;
      }
      const targetId = selectedId ?? sessionsStore.create().id;
      const history = sessionsStore.getState().sessions.find((s) => s.id === targetId)?.messages ?? [];
      const displayText = chatDisplayText(text, files);
      if (!displayText) return;
      if (history.length === 0) sessionsStore.rename(targetId, titleFromPrompt(text || files[0]?.name || "New session"));
      setError(null);
      const preferenceQuestion =
        files.length === 0 ? studyCreationPreferencePrompt(text) : null;
      if (preferenceQuestion) {
        sessionsStore.appendMessage(targetId, {
          at: new Date().toISOString(),
          content: displayText,
          role: "user",
        });
        sessionsStore.appendMessage(targetId, {
          at: new Date(Date.now() + 1).toISOString(),
          content: preferenceQuestion,
          role: "assistant",
        });
        return;
      }

      const previewReply = () => {
        sessionsStore.setWorking(targetId, true);
        window.setTimeout(() => {
          sessionsStore.appendMessage(targetId, { at: new Date().toISOString(), content: PREVIEW_REPLY, role: "assistant" });
          sessionsStore.setWorking(targetId, false);
        }, 900);
      };

      if (files.length === 0) {
        sessionsStore.appendMessage(targetId, { at: new Date().toISOString(), content: displayText, role: "user" });
        if (preview) return previewReply();
        void runTurn(uid, targetId, history, text.trim());
        return;
      }

      // FILES ATTACHED. The message goes up NOW and the thinking strip says
      // "Reading your files…" — extraction used to run first, one file at a
      // time, with the composer already cleared and nothing else on screen
      // (owner 2026-08-03: "the chat lags behind when user uploads files").
      // The optimistic message is local-only (appendPending); resolvePending
      // afterwards writes the ONE cloud copy, with the durable attachment
      // records — appendMessage's cloud upsert keeps the first write of an id
      // forever, so appending early and patching later would freeze the
      // name-only chips into the record.
      const messageId = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      sessionsStore.appendPending(targetId, {
        at: new Date().toISOString(),
        attachments: draftAttachmentRecords(files),
        content: displayText,
        id: messageId,
        role: "user",
      });
      sessionsStore.setWorking(targetId, true);
      setLiveActivity({ label: "Reading your files…", sessionId: targetId });
      let prepared: Awaited<ReturnType<typeof prepareChatAttachments>>;
      try {
        prepared = await prepareChatAttachments(text, files, uid);
      } catch {
        sessionsStore.resolvePending(targetId, messageId, { content: displayText });
        sessionsStore.setWorking(targetId, false);
        setLiveActivity((current) => (current?.sessionId === targetId ? null : current));
        setError({ kind: "generic", sessionId: targetId, text: "Couldn't read the attached files — try sending them again." });
        return;
      }
      sessionsStore.resolvePending(targetId, messageId, { attachments: prepared.attachments, content: prepared.displayText });
      setLiveActivity((current) => (current?.sessionId === targetId && current.label === "Reading your files…" ? null : current));
      if (preview) return previewReply();
      void runTurn(uid, targetId, history, prepared.wireText);
    },
    [preview, projectId, runTurn, selectedId, submitIntoProject, uid],
  );

  const handleStop = useCallback(() => {
    if (!selectedId) return;
    abortControllers.current.get(selectedId)?.abort();
  }, [selectedId]);

  const importSyllabusEvents = useCallback(async (events: CalendarEvent[]) => {
    if (!uid || preview || !syllabusImport) throw new Error("Sign in to import a syllabus.");
    // What is already on the calendar decides what happens next: exact repeats
    // (same name, same day) are skipped, so importing the same syllabus twice
    // cannot double every deadline — and time collisions are saved but called
    // out, because which one moves is the student's decision, not the
    // importer's (owner 2026-08-03: "recognize... if there are dates that
    // conflict").
    const existing = (await loadCalendarEvents({ preview: false, userId: uid })).events;
    const split = splitCalendarConflicts(events, existing);
    const saved: CalendarEvent[] = [];
    for (const event of split.toSave) saved.push(await saveCalendarEvent(event, { preview: false, userId: uid }));
    const summary = conflictSummary(split);
    if (!saved.length && !summary) return;
    const firstDate = [...saved].sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
    const artifactId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `calendar-${Date.now().toString(36)}`;
    const sourceName = syllabusImport.files[0]?.name ?? "your syllabus";
    const added = saved.length
      ? `Added ${saved.length} verified event${saved.length === 1 ? "" : "s"} from ${sourceName} to your calendar.`
      : `Nothing new to add from ${sourceName}.`;
    sessionsStore.appendMessage(syllabusImport.targetId, {
      at: new Date().toISOString(),
      content: [added, summary].filter(Boolean).join(" "),
      ...(saved.length ? {
        outputs: [{
          id: artifactId,
          kind: "event" as const,
          route: `/calendar${firstDate ? `?date=${encodeURIComponent(firstDate)}` : ""}`,
          title: `${saved.length} syllabus event${saved.length === 1 ? "" : "s"}`,
        }],
      } : {}),
      role: "assistant",
    });
  }, [preview, syllabusImport, uid]);

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

  // Opening the recorder does NOT create a conversation any more (owner
  // 2026-07-29: "if user opens recording that the session isnt automatically
  // named as 'recording', it should only rename once a recording has
  // finished"). Creating one here meant that merely pressing Record — or
  // opening it and changing your mind — left an empty "Recorded session" row in
  // the sidebar forever, and a sidebar of those is the exact problem the
  // recording title was added to solve.
  //
  // The conversation is created by handleRecordingFinished instead, after its
  // empty-draft guard, so it only exists once there is a recording to put in it.
  const handleModeChange = useCallback((mode: ComposerMode) => {
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
    // Deliberately BELOW the empty-draft guard above: a recording that captured
    // nothing must leave no conversation behind, which was the whole point of
    // not creating one when the recorder opened. create() also selects the new
    // session and hands it back, so this names it and opens it in one step.
    const targetId = selectedId ?? sessionsStore.create(RECORDED_SESSION_TITLE).id;

    // THE CARD GOES UP FIRST, BEFORE ANY OF THE WORK BELOW.
    //
    // Everything that follows is awaited — a whole compose pass over the
    // transcript, then the artifact write, then the Library write — and until
    // this callback was changed NOTHING was posted until all of it finished. So
    // the recorder closed, the thread appeared empty for the length of an LLM
    // call, and the student's recording looked like it had been thrown away
    // (owner 2026-07-30: "when i 'saved to chat' the chat went back to blank").
    //
    // The placeholder carries the transcript it already has, so even the pending
    // card is backed by something real rather than being pure decoration.
    const pendingMessageId = newLocalId();
    sessionsStore.appendPending(targetId, {
      at: new Date().toISOString(),
      content: "Recording captured. Writing up your notes…",
      id: pendingMessageId,
      outputs: [{
        durationSeconds: draft.durationSeconds,
        id: newLocalId(),
        kind: "recording",
        // Not the finished title: that is written by the same pass that writes
        // the notes and does not exist yet. Renaming under the student as it
        // resolves is honest — it is what actually happens.
        polish: "pending",
        title: "Recording",
        transcript: draft.transcript,
      }],
      role: "assistant",
    });

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
      const { fallbackModel, notes, title } = uid
        ? await requestRecordingNote({ transcript: draft.transcript, uid })
        : { fallbackModel: null, notes: "", title: "" };
      // targetId, not the hook's own contextId: when this callback created the
      // session a moment ago, that prop is still the previous render's value.
      const artifact = await createArtifact({ ...draft, notes }, title, targetId);

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
      // RESOLVES the placeholder rather than appending beside it — appending
      // would leave the pulsing card on screen forever, next to the finished
      // one. This is also the first and only time this message reaches the
      // cloud, which is what keeps a half-written state from being persisted.
      sessionsStore.resolvePending(targetId, pendingMessageId, {
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
          // SAY WHEN A BACKUP ENGINE WROTE THESE. The answer engine falls
          // through to a spare when the usual one is unreachable, which keeps
          // recordings working during an outage and is worth keeping. But on
          // 2026-07-29 it downgraded the notes for days with nothing to show
          // for it — they stopped following their own prompt and every signal
          // still read as success. A student cannot ask for a rewrite of a
          // problem nobody told them about.
          fallbackModel
            ? "\n\nHeads up: my usual notes engine was unavailable, so a backup wrote these and they may be less organised than normal. Ask me to rewrite them and I will use the transcript."
            : "",
        ].join(""),
        outputs: [{ createdAt: artifact.createdAt, durationSeconds: artifact.durationSeconds, id: artifact.id, kind: "recording", notes: artifact.notes, title: artifact.title, transcript: artifact.transcript }],
      });
    })().catch((cause) => {
      // Was `.catch(() => undefined)`. Anything that threw between saving the
      // artifact and posting the card vanished without a trace, which is a
      // recording that exists in Outputs and nowhere else with no way to tell
      // why. Say so in the thread instead of dropping it.
      console.error("recording follow-up failed", cause);
      if (!targetId) return;
      // Also RESOLVES rather than appends. A throw used to be the one path that
      // left the placeholder untouched, so the student would have been told the
      // write-up failed while a card pulsed away beside it, apparently still
      // working. `outputs: []` clears the pending card; the transcript is not
      // lost, it is on the artifact this failure did not reach.
      sessionsStore.resolvePending(targetId, pendingMessageId, {
        content: "Your recording was saved, but writing it up failed. The audio and transcript are safe — ask me to write the notes and I will use them.",
        outputs: [],
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
          {composerMode === "record" || recordingBusy ? (
            <RecordWorkspace
              accessToken={authSession?.access_token ?? null}
              active={recording}
              className="absolute inset-x-6 bottom-[calc(var(--composer-measured-height)+1.75rem)] top-4 z-10 max-sm:inset-x-3"
              discard={discardRecording}
              uid={uid}
              onBusyChange={setRecordingBusy}
              onDiscarded={() => setComposerMode("chat")}
              onFinished={handleRecordingFinished}
              onPausedChange={setRecordingPaused}
              registerControls={registerRecordControls}
            />
          ) : (
            <Thread activity={liveActivity?.sessionId === selectedId ? liveActivity.label : null} busy={busy} centeredComposer={isFreshThread} error={turnError} key={selectedId ?? "draft"} liveSeconds={liveSeconds} onEditMessage={handleEditMessage} onOpenSources={openSources} turns={turns} />
          )}
          {/* The tap that has to happen before the chat deletes anything. Sits
              directly above the composer, over the fade, so it is between the
              student and their next message rather than something to scroll to.
              Keep is the plain button; Delete is the only red control here. */}
          {pendingDelete && pendingDelete.sessionId === selectedId ? (
            <div
              className="absolute inset-x-0 bottom-28 z-30 mx-auto w-full max-w-2xl rounded-xl border border-red-500/40 bg-(--ui-chat-surface-background) p-4 shadow-lg"
              role="alertdialog"
              data-testid="confirm-delete-card"
            >
              <p className="text-sm font-semibold text-(--ui-text-primary)">
                Delete {pendingDelete.pending.target}?
              </p>
              <p className="mt-1 text-sm text-(--ui-text-secondary)">
                {pendingDelete.pending.recoverable
                  ? "It moves to your trash, so you can get it back."
                  : "This cannot be undone."}
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  className="rounded-md border border-(--ui-border) px-4 py-2 text-sm text-(--ui-text-primary) disabled:opacity-60"
                  disabled={deleting}
                  onClick={cancelPendingDelete}
                  type="button"
                >
                  Keep
                </button>
                <button
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  data-testid="confirm-delete-confirm"
                  disabled={deleting}
                  onClick={() => { void confirmPendingDelete(); }}
                  type="button"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ) : null}
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
            belowCenter={isFreshThread && composerMode === "chat" && !busy ? (
              <ChatSuggestions onPick={(prompt) => { void handleSubmit(prompt, []); }} />
            ) : undefined}
            busy={busy}
            centered={isFreshThread && composerMode === "chat"}
            mode={composerMode}
            onEffortChange={(effort) => { effortRef.current = effort; }}
            onModeChange={handleModeChange}
            onRecordingChange={handleRecordingChange}
            onRecordingPauseToggle={handleRecordingPauseToggle}
            onStop={handleStop}
            onSubmit={handleSubmit}
            recordingBusy={recordingBusy}
            recordingPaused={recordingPaused}
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
      {syllabusImport && syllabusImport.files.length > 0 ? (
        <SyllabusDialog
          // Keyed per file so each syllabus in the queue gets a fresh dialog;
          // closing one (imported or cancelled) advances to the next.
          key={`${syllabusImport.targetId}:${syllabusImport.files.length}:${syllabusImport.files[0]!.name}`}
          initialFile={syllabusImport.files[0]!}
          onClose={() => setSyllabusImport((current) =>
            current && current.files.length > 1 ? { ...current, files: current.files.slice(1) } : null,
          )}
          onImport={importSyllabusEvents}
          uid={preview ? null : uid}
        />
      ) : null}
    </div>
  );
}
