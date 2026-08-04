"use client";

// The full chat view inside a notebook (Claude's in-project chat): a "Notebook / Chat" breadcrumb, the
// transcript, shared right rail, and composer. Reads the active chat from the store and sends turns
// through the cloud-backed orchestrator. Preview builds return a canned reply.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconLayoutSidebarRightExpand } from "@tabler/icons-react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { Codicon } from "@/components/desktop-ui/codicon";
import { Button } from "@/components/desktop-ui/button";
import { notebookChatStore, sendNotebookTurn, useNotebookChat, type NotebookWireSource } from "@/lib/notebooks/chat";
import { appendMessage } from "@/lib/notebooks/chats-api";
import { consumeNotebookRecording } from "@/lib/notebooks/record-intent";
import { prepareChatAttachments } from "@/lib/workspace/chat-attachments";
import { DEFAULT_CHAT_EFFORT, type ChatEffort } from "@/lib/workspace/chat-effort";
import { useRecordingArtifacts, type RecordingArtifactDraft } from "@/lib/workspace/recording-artifacts";

import { NotebookComposer } from "./notebook-composer";
import { NotebookTranscript } from "./notebook-transcript";
import { useNotebooks } from "./notebooks-store";
import { SessionRightRail, type SessionRailPanel, type SessionRailSource } from "../sessions/session-right-rail";
import { type ComposerMode } from "../sessions/composer";
import { RecordWorkspace, type RecordControls } from "../sessions/record-workspace";

const PREVIEW_REPLY =
  "This is a preview build — replies here are canned. Sign in on the real app to chat about this notebook.";

export function NotebookChatView() {
  const { session } = useAuth();
  const preview = Boolean(useWorkspacePreview());
  const uid = preview ? "preview-user" : (session?.user.id ?? null);

  const { selected, activeChatId, chats, sources, backToHome } = useNotebooks();
  const { messages, working } = useNotebookChat(activeChatId);
  const [rightRailOpen, setRightRailOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<SessionRailPanel>("sources");
  const [composerMode, setComposerMode] = useState<ComposerMode>("chat");
  const effortRef = useRef<ChatEffort>(DEFAULT_CHAT_EFFORT);
  const [recording, setRecording] = useState(false);
  const [recordCanvasOpen, setRecordCanvasOpen] = useState(false);
  const { artifacts: recordingArtifacts, createArtifact } = useRecordingArtifacts({ contextId: activeChatId, preview, surface: "notebook", userId: uid });

  const wireSources: NotebookWireSource[] = useMemo(
    () => sources.map((s) => ({ name: s.name, content: s.content })),
    [sources],
  );
  const railSources: SessionRailSource[] = useMemo(() => sources.map((source) => ({
    title: source.name,
    ...(source.sourceUrl ? { url: source.sourceUrl } : {}),
    description: source.libraryPath ? `Library · ${source.libraryPath}` : source.kind.toUpperCase(),
  })), [sources]);

  const instructions = selected?.instructions ?? null;
  const notebookId = selected?.id ?? null;

  const outputs = useMemo(() => recordingArtifacts.map((artifact) => ({
    id: artifact.id,
    kind: "recording" as const,
    title: artifact.title,
    transcript: artifact.transcript,
    notes: artifact.notes,
    durationSeconds: artifact.durationSeconds,
    createdAt: artifact.createdAt,
  })), [recordingArtifacts]);

  /** Why the last stop happened, set alongside `recording` so the recorder
   *  never has to guess whether to keep the audio. */
  const [discardRecording, setDiscardRecording] = useState(false);
  const handleRecordingChange = useCallback((active: boolean, options?: { discard?: boolean }) => {
    setDiscardRecording(options?.discard === true);
    setRecording(active);
    if (active) setRecordCanvasOpen(true);
  }, []);

  /** Nothing was saved, so there is nothing to file — just close the canvas. */
  const handleRecordingDiscarded = useCallback(() => {
    setRecording(false);
    setRecordCanvasOpen(false);
    setComposerMode("chat");
  }, []);

  /** Pause/Continue lives on the COMPOSER (owner 2026-08-03); the hook stays
   *  in RecordWorkspace, which hands its controls up and reports `paused`
   *  back — same shape as session-chat, so the two surfaces cannot drift. */
  const [recordingPaused, setRecordingPaused] = useState(false);
  /** True while a finished recording is still uploading/transcribing — the
   *  panel must stay mounted through it or the recording is lost silently. */
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

  // Recorder pressed on the notebook home: the home creates this chat, sets
  // the one-shot intent, and navigates here — pick it up and go live.
  useEffect(() => {
    if (activeChatId && consumeNotebookRecording(activeChatId)) {
      setComposerMode("record");
      setRecordCanvasOpen(true);
      setRecording(true);
    }
  }, [activeChatId]);

  const handleRecordingFinished = useCallback((draft: RecordingArtifactDraft) => {
    setRecording(false);
    setRecordCanvasOpen(false);
    setComposerMode("chat");
    if (draft.durationSeconds <= 0 && !draft.transcript.trim() && !draft.notes.trim()) return;
    setRightPanel("outputs");
    setRightRailOpen(true);
    const chatId = activeChatId;
    const targetNotebookId = notebookId;
    void createArtifact(draft)
      .then((artifact) => {
        if (!chatId) return;
        const content = "Recording captured — transcript and notes are ready.";
        notebookChatStore.append(chatId, {
          at: new Date().toISOString(),
          content,
          outputs: [{ createdAt: artifact.createdAt, durationSeconds: artifact.durationSeconds, id: artifact.id, kind: "recording", notes: artifact.notes, title: artifact.title, transcript: artifact.transcript }],
          role: "assistant",
        });
        // Cloud rows carry plain content only; the artifact itself persists in
        // chat_recording_artifacts, so a reload still shows it under Outputs.
        if (!preview && targetNotebookId) void appendMessage({ chatId, content, notebookId: targetNotebookId, role: "assistant" }).catch(() => {});
      })
      .catch(() => undefined);
  }, [activeChatId, createArtifact, notebookId, preview]);

  const submit = useCallback(
    async (text: string, files: File[]) => {
      if (!activeChatId || !notebookId) return;
      const prepared = await prepareChatAttachments(text, files, uid);
      if (!prepared.displayText) return;
      if (preview) {
        notebookChatStore.append(activeChatId, { role: "user", content: prepared.displayText, at: new Date().toISOString() });
        notebookChatStore.setWorking(activeChatId, true);
        window.setTimeout(() => {
          notebookChatStore.append(activeChatId, { role: "assistant", content: PREVIEW_REPLY, at: new Date().toISOString() });
          notebookChatStore.setWorking(activeChatId, false);
        }, 600);
        return;
      }
      if (!uid) {
        notebookChatStore.append(activeChatId, { role: "assistant", content: "Sign in to chat about this notebook.", at: new Date().toISOString() });
        return;
      }
      void sendNotebookTurn({ uid, notebookId, chatId: activeChatId, effort: effortRef.current, instructions, sources: wireSources, userText: prepared.wireText, displayText: prepared.displayText });
    },
    [activeChatId, notebookId, preview, uid, instructions, wireSources],
  );

  if (!selected || !activeChatId) return null;
  const chat = chats.find((c) => c.id === activeChatId);

  return (
    <div className="flex h-full min-w-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-1.5 px-6 pb-2 pt-[calc(var(--titlebar-height)+1rem)] text-[0.85rem]">
        <button
          type="button"
          onClick={backToHome}
          className="max-w-[16rem] truncate rounded-md px-1.5 py-0.5 text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
        >
          {selected.name}
        </button>
        <Codicon name="chevron-right" size="0.7rem" className="shrink-0 text-(--ui-text-quaternary)" />
        <span className="max-w-[20rem] truncate font-medium text-foreground">{chat?.title ?? "New chat"}</span>
        {!rightRailOpen && <Button aria-label="Open notebook chat sidebar" className="ml-auto" onClick={() => setRightRailOpen(true)} size="icon-xs" variant="ghost"><IconLayoutSidebarRightExpand /></Button>}
        </div>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-6">
          {(composerMode === "record" && recordCanvasOpen) || recordingBusy ? (
            <RecordWorkspace
              accessToken={session?.access_token ?? null}
              active={recording}
              className="mb-2 mt-4 min-h-0 flex-1"
              discard={discardRecording}
              uid={uid}
              onBusyChange={setRecordingBusy}
              onDiscarded={handleRecordingDiscarded}
              onFinished={handleRecordingFinished}
              onPausedChange={setRecordingPaused}
              registerControls={registerRecordControls}
            />
          ) : (
            <NotebookTranscript messages={messages} working={working} />
          )}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-20 bg-linear-to-t from-(--ui-chat-surface-background) to-transparent backdrop-blur-[2px] [mask-image:linear-gradient(to_top,black,transparent)]" />
          <div className="relative z-10 shrink-0 pb-5 pt-2">
            <div className="mx-auto w-full max-w-3xl">
              <NotebookComposer
                autoFocus
                onEffortChange={(effort) => { effortRef.current = effort; }}
                onModeChange={setComposerMode}
                onRecordingChange={handleRecordingChange}
                onRecordingPauseToggle={handleRecordingPauseToggle}
                onSubmit={submit}
                placeholder={`Message ${selected.name}…`}
                recordingBusy={recordingBusy}
                recordingPaused={recordingPaused}
                showRecordCompanion={!recording}
                mode={composerMode}
                working={working}
              />
            </div>
          </div>
        </div>
      </div>
      {rightRailOpen && <SessionRightRail onCollapse={() => setRightRailOpen(false)} onPanelChange={setRightPanel} outputs={outputs} panel={rightPanel} sources={railSources} />}
    </div>
  );
}
