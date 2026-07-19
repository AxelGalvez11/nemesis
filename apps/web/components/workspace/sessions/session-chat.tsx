"use client";

// SessionChat — orchestrates the Sessions page (shell spec §B1): wires the
// local sessions store to the mobile-recipe chat wiring (lib/workspace/chat-api.ts),
// tying together ChatHeader, Thread, and Composer. Draft mode (no session
// selected yet) creates the session lazily on first submit, matching the
// desktop's "/" = uncommitted new chat until the first message lands.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { type ChatErrorKind, sendChatTurn } from "@/lib/workspace/chat-api";
import { sessionsStore, useSessionMessages, useSessions, type SessionMessage } from "@/lib/workspace/sessions-store";

import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import { Thread, type ThreadTurn } from "./thread";
import type { TurnError } from "./assistant-message";

// Desktop t.composer.newSessionPlaceholders / followUpPlaceholders (shell spec §B7).
const NEW_SESSION_PLACEHOLDERS = [
  "What are we building?",
  "Give Nemesis a task",
  "What's on your mind?",
  "Describe what you need",
  "What should we tackle?",
  "Ask anything",
  "Start with a goal",
];
const FOLLOW_UP_PLACEHOLDERS = [
  "Send a follow-up",
  "Add more context",
  "Refine the request",
  "What's next?",
  "Keep it going",
  "Push it further",
  "Adjust or continue",
];

function pickPlaceholder(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0] ?? "";
}

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

export function SessionChat() {
  const preview = useWorkspacePreview();
  const { session: authSession } = useAuth();
  const uid = preview ? "preview-user" : (authSession?.user.id ?? null);

  const { selectedId, working } = useSessions();
  const { session, messages } = useSessionMessages(selectedId);

  const [error, setError] = useState<{ sessionId: string; text: string; kind: ChatErrorKind } | null>(null);
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
        sessionsStore.appendMessage(targetId, { at: new Date().toISOString(), content: reply.text, role: "assistant" });
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
    (text: string) => {
      if (!uid) return;
      const targetId = selectedId ?? sessionsStore.create().id;
      setError(null);

      if (preview) {
        sessionsStore.appendMessage(targetId, { at: new Date().toISOString(), content: text, role: "user" });
        sessionsStore.setWorking(targetId, true);
        window.setTimeout(() => {
          sessionsStore.appendMessage(targetId, { at: new Date().toISOString(), content: PREVIEW_REPLY, role: "assistant" });
          sessionsStore.setWorking(targetId, false);
        }, 900);
        return;
      }

      const history = sessionsStore.getState().sessions.find((s) => s.id === targetId)?.messages ?? [];
      sessionsStore.appendMessage(targetId, { at: new Date().toISOString(), content: text, role: "user" });
      void runTurn(uid, targetId, history, text);
    },
    [preview, runTurn, selectedId, uid],
  );

  const handleStop = useCallback(() => {
    if (!selectedId) return;
    abortControllers.current.get(selectedId)?.abort();
  }, [selectedId]);

  const isFreshThread = messages.length === 0;
  const placeholder = useMemo(
    () => pickPlaceholder(isFreshThread ? NEW_SESSION_PLACEHOLDERS : FOLLOW_UP_PLACEHOLDERS),
    [selectedId, isFreshThread],
  );

  return (
    <div className="relative isolate flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background)">
      {session && <ChatHeader session={session} />}
      <div
        className="relative min-h-0 max-w-full flex-1 overflow-hidden bg-(--ui-chat-surface-background) contain-[layout_paint]"
        data-slot="composer-bounds"
      >
        <Thread busy={busy} centeredComposer={isFreshThread} error={turnError} liveSeconds={liveSeconds} turns={turns} />
      </div>
      <Composer busy={busy} centered={isFreshThread} onStop={handleStop} onSubmit={handleSubmit} placeholder={placeholder} />
    </div>
  );
}
