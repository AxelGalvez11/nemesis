"use client";

// SessionChat — orchestrates the Sessions page (shell spec §B1): wires the
// local sessions store to the mobile-recipe chat wiring (lib/workspace/chat-api.ts),
// tying together ChatHeader, Thread, and Composer. Draft mode (no session
// selected yet) creates the session lazily on first submit, matching the
// desktop's "/" = uncommitted new chat until the first message lands.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { prepareChatAttachments } from "@/lib/workspace/chat-attachments";
import { type ChatErrorKind, sendChatTurn } from "@/lib/workspace/chat-api";
import { sessionsStore, useSessionMessages, useSessions, type SessionMessage } from "@/lib/workspace/sessions-store";

import { ChatHeader } from "./chat-header";
import { Composer, type ComposerMode } from "./composer";
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

const PREVIEW_REPLY =
  "This is a preview build — replies here are canned. Sign in on the real app to chat with Nemesis.";

function titleFromPrompt(text: string) {
  const compact = text.trim().replace(/\s+/g, " ");
  return compact.length <= 54 ? compact : `${compact.slice(0, 54).trimEnd()}…`;
}

export function SessionChat() {
  const preview = useWorkspacePreview();
  const { session: authSession } = useAuth();
  const uid = preview ? "preview-user" : (authSession?.user.id ?? null);

  const { selectedId, working } = useSessions();
  const { session, messages } = useSessionMessages(selectedId);

  const [error, setError] = useState<{ sessionId: string; text: string; kind: ChatErrorKind } | null>(null);
  const [rightRailOpen, setRightRailOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<SessionRailPanel>("sources");
  const [composerMode, setComposerMode] = useState<ComposerMode>("chat");
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
    turnStartedAt.current.set(targetId, Date.now());
    sessionsStore.setWorking(targetId, true);

    const controller = new AbortController();
    abortControllers.current.set(targetId, controller);

    try {
      const reply = await sendChatTurn(targetUid, history, text, controller.signal);
      if (reply.text) {
        sessionsStore.appendMessage(targetId, { at: new Date().toISOString(), content: reply.text, role: "assistant", ...(reply.sources.length ? { sources: reply.sources } : {}) });
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

  const handleSubmit = useCallback(
    async (text: string, files: File[]) => {
      if (!uid) return;
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
  const outputs = useMemo(() => messages.flatMap((message) => message.outputs ?? []), [messages]);

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
            <RecordWorkspace className="absolute inset-x-6 bottom-[calc(var(--composer-measured-height)+1.75rem)] top-4 z-10 max-sm:inset-x-3" />
          ) : (
            <Thread busy={busy} centeredComposer={isFreshThread} error={turnError} key={selectedId ?? "draft"} liveSeconds={liveSeconds} onEditMessage={handleEditMessage} onOpenSources={openSources} turns={turns} />
          )}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-24 bg-linear-to-t from-(--ui-chat-surface-background) via-[color-mix(in_srgb,var(--ui-chat-surface-background)_82%,transparent)] to-transparent backdrop-blur-[2px] [mask-image:linear-gradient(to_top,black_35%,transparent)]" />
          <Composer busy={busy} centered={isFreshThread && composerMode === "chat"} onModeChange={setComposerMode} onStop={handleStop} onSubmit={handleSubmit} placeholder={placeholder} showRecordCompanion={false} />
        </div>
      </div>
      {rightRailOpen && <SessionRightRail onCollapse={() => setRightRailOpen(false)} onPanelChange={setRightPanel} outputs={outputs} panel={rightPanel} sources={sources} />}
    </div>
  );
}
