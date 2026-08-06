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
import { sniffsAsSyllabus } from "@/lib/workspace/syllabus-sniff";
import { consumeSeededChatIntent } from "@/lib/workspace/composer-seed";
import { conflictSummary, splitCalendarConflicts } from "@/lib/workspace/calendar-conflicts";
import { type ChatErrorKind, sendChatTurn } from "@/lib/workspace/chat-api";
import { executeAgentTool } from "@/lib/workspace/agent-tools";
import type { PendingDelete } from "@nemesis/shared";
import { DEFAULT_CHAT_EFFORT, type ChatEffort } from "@/lib/workspace/chat-effort";
import { groupTurns } from "@/lib/workspace/session-turns";
import { sessionsStore, useSessionMessages, useSessions, type SessionMessage } from "@/lib/workspace/sessions-store";
import { useRecordingArtifacts } from "@/lib/workspace/recording-artifacts";
import {
  decideRecordingCard,
  displayedRecordingContent,
  nextRecordingSessionTitle,
} from "@/lib/workspace/recording-card-state";
import { refreshRecordingJobs } from "@/lib/workspace/recording-jobs-store";
import { useRecordingJobs } from "@/lib/workspace/use-recording-jobs";
import { loadCalendarEvents, saveCalendarEvent, type CalendarEvent } from "@/lib/workspace/calendar-model";
import { AnkiImportDialog } from "@/components/workspace/study/anki-import-dialog";


import { ChatHeader } from "./chat-header";
import { ChatSuggestions } from "./chat-suggestions";
import { Composer, type ComposerMode } from "./composer";
import { ProjectPill } from "./project-pill";
import { Thread } from "./thread";
import type { TurnError } from "./assistant-message";
import { SessionRightRail, type SessionRailPanel } from "./session-right-rail";
import { RecordWorkspace, type RecordControls } from "./record-workspace";
import type { RecordingHandoff, RecordingTarget } from "./use-recording";
import { SyllabusDialog } from "../calendar/syllabus-dialog";

// Recordings are still filed by COURSE (owner 2026-08-05) — the old hardcoded
// "Nemesis/Recordings" pile organized a semester of lectures by who made the
// note instead of what class it was. That matching moved SERVER-SIDE on the same
// day: it needs the finished notes to decide a course, and waiting for those is
// exactly what this page stopped doing. See the `filing` stage in
// supabase/functions/recording-worker.

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
  const { jobs: recordingJobs, loaded: recordingJobsLoaded } = useRecordingJobs();
  // Re-read the artifacts whenever ANY watched job moves. That is what makes
  // results appear progressively: the transcript lands on the artifact at the
  // `composing` stage, so the card becomes openable then rather than at the end.
  // Cheap — one indexed read of this conversation's own rows, a handful of times
  // per recording.
  const recordingJobsRefreshKey = useMemo(
    () => recordingJobs.map((job) => `${job.id}:${job.stage}:${job.status}`).join("|"),
    [recordingJobs],
  );
  // Read-only: the artifact row is created server-side by /api/recordings/jobs
  // together with the job and the Library note, so nothing on this page writes
  // one any more. `recordingJobs` is the account-wide watch — this component
  // observes it, and unmounting does not stop it.
  // `fresh` says whether these rows were read FOR the current job state. Without
  // it a snapshot one round trip behind — transcript present, notes not fetched
  // yet — is indistinguishable from a write-up that failed, which is exactly how
  // a finished lecture came to be reported as lost.
  const { artifacts: recordingArtifacts, fresh: recordingArtifactsFresh } = useRecordingArtifacts({ contextId: selectedId, preview, refreshKey: recordingJobsRefreshKey, surface: "sessions", userId: uid });
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

  /**
   * 🔴 A MESSAGE THAT WRONGLY SAYS A LECTURE WAS LOST IS CORRECTED HERE, ON THE
   * WAY TO THE SCREEN — never by rewriting it. Cards written before the fix in
   * recording-card-state.ts still carry that sentence, and a student re-reads it
   * every time they scroll past. It cannot be rewritten: `chat_messages` has no
   * UPDATE grant, the cloud write ignores duplicates, and the cloud copy wins
   * the merge — so a rewrite reverts. Correcting the rendered text needs none of
   * that, and leaves the student's history untouched.
   */
  const shownMessages = useMemo(() => {
    const notesById = new Map(recordingArtifacts.map((artifact) => [artifact.id, artifact.notes]));
    if (notesById.size === 0) return messages;
    return messages.map((message) => {
      const output = message.outputs?.[0];
      if (!output || output.kind !== "recording") return message;
      const content = displayedRecordingContent(message.content, notesById.get(output.id) ?? "");
      return content === message.content ? message : { ...message, content };
    });
  }, [messages, recordingArtifacts]);

  const turns = useMemo(() => groupTurns(shownMessages), [shownMessages]);
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

      // The CONTENT gate. The filename gate above misses real syllabi — the
      // owner's own are named "Fall-2026-PHCY-2105-01-….pdf", and with no
      // calendar words typed, four courses' schedules (141k characters) went
      // to a plain chat turn, where they cannot survive history trimming into
      // the next turn (2026-08-04: three courses never reached the calendar).
      // Now that extraction has run anyway, the text itself decides: when
      // every attached document READS as a syllabus and the student typed
      // nothing (or asked for a calendar import), this is the deterministic
      // importer's job, not the model's.
      const attachedDocuments = files.filter(isDocumentFile);
      // prepared.sources is index-aligned with `files` by construction.
      const syllabusDocs = files.filter((file, index) => isDocumentFile(file) && sniffsAsSyllabus(prepared.sources[index]?.content ?? ""));
      // 🔴 ONE SPARE FILE USED TO CANCEL THE WHOLE IMPORT. The rule was "every
      // attached document must read as a syllabus", so a student who dragged in
      // three syllabi AND a reading list — or who asked "put these on my
      // calendar" with a lecture deck in the pile — fell through to a plain
      // chat turn, where a hundred thousand characters of schedule get one
      // pass at the model and are gone by the next turn. Asking outright for a
      // calendar import is intent enough on its own now; the syllabi go to the
      // importer and the rest of the pile is simply not part of that job.
      //
      // The all-or-nothing rule still governs the SILENT case (files dropped in
      // with nothing typed), because there the only evidence of what the
      // student wanted is the pile itself.
      const askedToImport = asksForCalendarImport(text);
      const everyDocumentIsSyllabus = syllabusDocs.length === attachedDocuments.length;
      if (
        syllabusDocs.length > 0 &&
        (askedToImport || (!text.trim() && everyDocumentIsSyllabus))
      ) {
        sessionsStore.setWorking(targetId, false);
        setSyllabusImport({ files: syllabusDocs, targetId });
        return;
      }

      void runTurn(uid, targetId, history, prepared.wireText);
    },
    [preview, projectId, runTurn, selectedId, submitIntoProject, uid],
  );

  // One-shot intent from a Library note's Teach me / Flashcards / Test button
  // (owner 2026-08-03, the learning loop): the student clicked a verb, so the
  // request is SENT on arrival with the note attached — not parked in the
  // composer for a second confirmation. The seed is not consumed until auth
  // has an id: handleSubmit drops turns without one, and consuming early
  // would swallow the click on a slow session rehydrate. Ref-guarded so the
  // intent fires exactly once even as handleSubmit's identity changes. In the
  // signed-out preview there is never an id, so the verb lands here as plain
  // navigation — nothing to send with, nothing crashes.
  const chatIntentConsumedRef = useRef(false);
  useEffect(() => {
    if (chatIntentConsumedRef.current || !uid) return;
    chatIntentConsumedRef.current = true;
    const intent = consumeSeededChatIntent();
    if (!intent) return;
    void handleSubmit(intent.prompt, intent.files);
  }, [handleSubmit, uid]);

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
    // The syllabus files themselves were already FILED as Library sources the
    // moment they were attached (persistChatAttachment promotes every stored
    // document, deduped) — uploading again here would only duplicate them.
    // The reply still says so, because the student can't see the filing.
    const storedCount = syllabusImport.files.length;
    if (!saved.length && !summary && !storedCount) return;
    const firstDate = [...saved].sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
    const artifactId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `calendar-${Date.now().toString(36)}`;
    const sourceName = syllabusImport.files[0]?.name ?? "your syllabus";
    const added = saved.length
      ? `Added ${saved.length} verified event${saved.length === 1 ? "" : "s"} from ${sourceName} to your calendar.`
      : `Nothing new to add from ${sourceName}.`;
    const kept = storedCount
      ? `Saved ${storedCount === 1 ? "the syllabus" : `${storedCount} syllabi`} to your Library.`
      : "";
    sessionsStore.appendMessage(syllabusImport.targetId, {
      at: new Date().toISOString(),
      content: [added, kept, summary].filter(Boolean).join(" "),
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

  /**
   * Where a finished recording goes, decided the moment there is audio.
   *
   * Opening the recorder still does not create a conversation (owner
   * 2026-07-29): this is called from inside the hook's finish path, AFTER its
   * empty-capture guard, so a recording that heard nothing leaves no "Recorded
   * session" row behind. The message id is minted here rather than by the hook
   * because it is this component's message.
   */
  const resolveRecordingTarget = useCallback((): RecordingTarget => {
    const contextId = selectedId ?? sessionsStore.create(RECORDED_SESSION_TITLE).id;
    return { contextId, messageId: newLocalId() };
  }, [selectedId]);

  /**
   * The recording is in the pipeline. Post the card and get out of the way.
   *
   * 🔴 EVERYTHING THIS FUNCTION USED TO DO NOW HAPPENS SERVER-SIDE. It used to
   * run the compose pass, write the artifact, match the course, write the
   * Library note and then resolve the placeholder — an awaited chain of four
   * network calls living inside a callback on a chat page. Navigating away
   * killed it part way through, which meant a recording that had already been
   * uploaded, transcribed and BILLED could end up with no notes and no note,
   * and nothing on screen to say why.
   *
   * All of it is now recording_jobs + the recording-worker function. What is
   * left here is one local write: a message carrying the artifact's id. The card
   * reads the job by that id and reports its stage, so the same card renders
   * identically on a page opened ten minutes later on another device.
   */
  const handleRecordingFinished = useCallback((handoff: RecordingHandoff) => {
    setRecording(false);
    setComposerMode("chat");
    // Read the new job NOW rather than on the next scheduled poll — which, with
    // nothing else running, can be twenty seconds away. Twenty seconds of "did
    // that work?" after stopping a lecture is the exact gap being closed here.
    refreshRecordingJobs();

    sessionsStore.appendPending(handoff.contextId, {
      at: new Date().toISOString(),
      content: [
        "Recording saved. I'm writing it up now — you can keep working, or close this page.",
        // The silence gate's saving is reported, not hidden: the student's
        // allowance was charged for the shorter audio, so they should be able to
        // reconcile a 60-minute lecture reading as 45 minutes.
        handoff.silenceSkipped ? `\n\n${handoff.silenceSkipped}.` : "",
      ].join(""),
      id: handoff.messageId,
      outputs: [{
        durationSeconds: handoff.durationSeconds,
        // THE ARTIFACT'S id, not a fresh local one. It is how the card finds its
        // job, how the outputs rail dedupes, and how a later page load pairs
        // this message with the finished transcript and notes.
        id: handoff.artifactId,
        kind: "recording",
        polish: "pending",
        title: handoff.title,
      }],
      role: "assistant",
    });

    // A sidebar of identical "Recorded session" rows is the problem the recording
    // title exists to fix, so the session borrows it once the notes pass has
    // named the recording. Done by the effect below rather than here, because
    // that name does not exist yet — it arrives with the job.
  }, []);

  /**
   * Keep the conversation in step with jobs that finished elsewhere.
   *
   * "Elsewhere" is the normal case now: another tab, another device, or this
   * same tab before a refresh. Everything here is derived from rows the server
   * already wrote, so it converges to the same state however the student got
   * here — which is what makes closing the page safe.
   */
  useEffect(() => {
    if (preview) return;
    for (const job of recordingJobs) {
      if (!job.title || !job.contextId) continue;
      // 🔴 ONLY ONCE THE NOTES PASS HAS RUN. A job is born titled
      // `Recording · <date>` — a placeholder minted before a word has been
      // heard — and `note_sections` is written by the compose pass that also
      // writes the real title, so it is the signal that `job.title` means
      // something. The old code adopted the placeholder the moment the job
      // appeared and then refused to replace it, because its guard only allowed
      // overwriting the "Recorded session" default. Every recorded lecture kept
      // a dated name for good while its real title sat unused on the row.
      if (job.noteSections === null) continue;
      const session = sessionsStore.getState().sessions.find((entry) => entry.id === job.contextId);
      if (!session) continue;
      // A title Nemesis wrote may be improved on. A title the STUDENT wrote is
      // theirs, and nothing here touches it.
      const renamed = nextRecordingSessionTitle({
        composed: job.title,
        current: session.title,
        fallback: RECORDED_SESSION_TITLE,
      });
      if (renamed) sessionsStore.rename(job.contextId, renamed);
    }
  }, [preview, recordingJobs]);

  /**
   * Swap a pending recording card for the finished one.
   *
   * Driven by the ARTIFACT rows rather than by the job that produced them, and
   * that is deliberate: a job disappears once it is ready, but the artifact is
   * permanent. So this works identically for a recording that finished a second
   * ago and one that finished last week and is being scrolled back to — there is
   * no completion event to have missed.
   *
   * Idempotent: a message whose output already carries the transcript is left
   * alone, so this cannot loop against its own writes.
   */
  useEffect(() => {
    if (preview || !selectedId) return;
    const byId = new Map(recordingArtifacts.map((artifact) => [artifact.id, artifact]));
    const jobFor = new Map(recordingJobs.map((job) => [job.artifactId, job]));
    for (const message of messages) {
      const output = message.outputs?.[0];
      if (!output || output.kind !== "recording") continue;
      const artifact = byId.get(output.id);
      // `message.id` is optional on the type for messages built before the store
      // minted ids. One without an id cannot be addressed, so it is left alone
      // rather than resolved by position, which would rewrite the wrong message.
      if (!artifact || !message.id) continue;

      const finished = {
        createdAt: artifact.createdAt,
        durationSeconds: artifact.durationSeconds,
        id: artifact.id,
        kind: "recording" as const,
        notes: artifact.notes,
        title: artifact.title,
        transcript: artifact.transcript,
      };

      // An already-resolved card is left alone HERE. Its wording, if it is one
      // of the wrong ones, is corrected where the thread is rendered — see the
      // `messages` memo above and displayedRecordingContent's comment for why a
      // rewrite cannot work (no UPDATE grant, and cloud wins the merge).
      if (output.polish !== "pending") continue;

      // 🔴 THE DECISION IS NOT MADE HERE. It lives in recording-card-state.ts as
      // a pure function, because the version that lived inline in this effect
      // shipped a card telling a student their finished lecture had been lost,
      // and no test could reach it. `fresh` is the load-bearing input: without
      // it, an artifact fetched one job-state ago looks exactly like a failed
      // write-up.
      const decision = decideRecordingCard({
        job: jobFor.get(output.id) ?? null,
        jobsLoaded: recordingJobsLoaded,
        notes: artifact.notes,
        snapshotFresh: recordingArtifactsFresh,
        transcript: artifact.transcript,
      });
      if (decision.action !== "resolve") continue;

      sessionsStore.resolvePending(selectedId, message.id, { content: decision.content, outputs: [finished] });

      // The conversation borrows the lecture's real name at the same moment,
      // for the same reason: this is the first point at which that name is known
      // to be the composed one rather than the dated placeholder.
      const session = sessionsStore.getState().sessions.find((entry) => entry.id === selectedId);
      const renamed = session
        ? nextRecordingSessionTitle({
          composed: artifact.title,
          current: session.title,
          fallback: RECORDED_SESSION_TITLE,
          placeholder: output.title,
        })
        : null;
      if (renamed) sessionsStore.rename(selectedId, renamed);
    }
  }, [messages, preview, recordingArtifacts, recordingArtifactsFresh, recordingJobs, recordingJobsLoaded, selectedId]);

  const openSources = useCallback(() => {
    setRightPanel("sources");
    setRightRailOpen(true);
  }, []);

  return (
    <div className="relative isolate flex h-full min-w-0 overflow-hidden bg-(--ui-chat-surface-background)">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ChatHeader hideRail={composerMode === "record" || recordingBusy} onOpenRail={() => setRightRailOpen(true)} railOpen={rightRailOpen} session={session} />
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
              // A recording that captured nothing leaves NOTHING behind — no
              // conversation, no card, no note. That is why the hook asks for a
              // target only after its empty-capture guard.
              onEmpty={() => { setRecording(false); setComposerMode("chat"); }}
              onFinished={handleRecordingFinished}
              onPausedChange={setRecordingPaused}
              registerControls={registerRecordControls}
              resolveTarget={resolveRecordingTarget}
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
