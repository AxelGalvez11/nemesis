"use client";

// Per-notebook-CHAT store, cloud-synced. Each chat thread's messages live in the account
// (notebook_chat_messages) and follow the student across devices. Keys by chatId: hydrate once per
// chat from listMessages, then append optimistically in memory while the cloud INSERT fires in the
// background — the UI never blocks on the write. The wire-message builders stay pure. General mode:
// the model reads the notebook's instructions + the sources' text (grounded/cite-only = Phase 2).

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { postChatCompletion, trimHistory, type WireMsg } from "@/lib/workspace/chat-api";
import { applyChatEffort, DEFAULT_CHAT_EFFORT, type ChatEffort } from "@/lib/workspace/chat-effort";
import { classifyChatRequest, routeInstruction, type ChatRouteDecision } from "@/lib/workspace/chat-routing";
import type { SessionMessage } from "@/lib/workspace/sessions-store";

import { appendMessage, listMessages, touchChat } from "./chats-api";

export type { SessionMessage } from "@/lib/workspace/sessions-store";

/** A notebook chat's own system prompt. GROUNDED MODE (owner 2026-07-20):
 *  answers come from the attached sources only — no web search, no silent
 *  general-knowledge fallback. When the sources don't cover it, the model
 *  says so and points at adding a source / Find sources. */
export const NOTEBOOK_SYSTEM_PROMPT =
  "You are Nemesis, a rigorous study and research partner for learners in any discipline, major, or profession. " +
  "Never assume the user's field or level; infer it from context and adapt. Answer directly before expanding. " +
  "Use markdown when structure helps, render math clearly, and use examples, evidence, or counterarguments when useful. Never use emojis. " +
  "This is a notebook chat: answer ONLY from the sources the student attached (their text is included below) and the student's instructions. " +
  "Point to the relevant source by name when it helps, and distinguish the source's claims from your inference. " +
  "If the sources don't cover the question, say so plainly and suggest attaching a relevant source (or using Find sources) — " +
  "do not answer from outside knowledge, do not search the web, and never invent facts or citations. " +
  "Basic conversational replies (greetings, clarifying what's in this notebook) are fine without sources.";

/** Total characters of source text injected into the system prompt. Bounds the request (the valve
 *  caps too); once sources exceed this, later ones are dropped with a note. RAG is the Phase-2 fix
 *  for when a notebook's sources routinely exceed this budget. */
export const SOURCE_CHAR_BUDGET = 30_000;

export interface NotebookWireSource {
  name: string;
  content: string | null;
}

export interface BuildNotebookWireOpts {
  instructions: string | null;
  sources: NotebookWireSource[];
  history: SessionMessage[];
  userText: string;
  decision?: ChatRouteDecision;
  /** The composer's answer-effort dial; ignored when `decision` is supplied. */
  effort?: ChatEffort;
}

/** Assemble the injected source-context block: each source's name + its text, truncated to stay
 *  within `budget` total characters (earlier sources win). Sources with no text are skipped. Returns
 *  "" when there's nothing to add. PURE. */
export function buildSourceContext(sources: NotebookWireSource[], budget = SOURCE_CHAR_BUDGET): string {
  const withText = sources.filter((s) => (s.content ?? "").trim().length > 0);
  if (!withText.length) return "";
  const parts: string[] = [];
  let used = 0;
  let included = 0;
  for (const s of withText) {
    if (used >= budget) break;
    const remaining = budget - used;
    const body = (s.content ?? "").trim();
    const clip = body.length > remaining ? `${body.slice(0, remaining)}\n…[truncated]` : body;
    parts.push(`### Source: ${s.name}\n${clip}`);
    used += clip.length;
    included += 1;
  }
  const omitted = withText.length - included;
  const footer = omitted > 0 ? `\n\n(${omitted} more source${omitted === 1 ? "" : "s"} not shown — over the size limit.)` : "";
  return `Sources the student added to this notebook:\n\n${parts.join("\n\n")}${footer}`;
}

/** The chat/completions message array for one notebook turn: the notebook system prompt, the
 *  student's instructions (if any), the source text (budgeted), then trimmed history + the new user
 *  message. PURE. */
export function buildNotebookWireMessages(opts: BuildNotebookWireOpts): WireMsg[] {
  const decision = opts.decision ?? applyChatEffort(classifyChatRequest(opts.userText), opts.effort ?? DEFAULT_CHAT_EFFORT);
  const parts = [NOTEBOOK_SYSTEM_PROMPT, routeInstruction(decision.route)];
  const instructions = opts.instructions?.trim();
  if (instructions) {
    parts.push(`This notebook's instructions from the student (follow them):\n${instructions}`);
  }
  const sourceContext = buildSourceContext(opts.sources);
  if (sourceContext) parts.push(sourceContext);
  return [
    { content: parts.join("\n\n"), role: "system" },
    ...trimHistory(opts.history).map((m) => ({ content: m.content, role: m.role })),
    { content: opts.userText, role: "user" },
  ];
}

// ── Cloud-backed transcript store (keyed by chatId) ──────────────────────────

type ChatLoadStatus = "idle" | "loading" | "loaded";

interface ChatSlice {
  messages: SessionMessage[];
  status: ChatLoadStatus;
  working: boolean;
}

const MAX_MESSAGES = 400;
const EMPTY_SLICE: ChatSlice = { messages: [], status: "idle", working: false };

interface StoreState {
  byChat: Record<string, ChatSlice>;
}

let state: StoreState = { byChat: {} };
let previewMode = false;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function setSlice(chatId: string, patch: Partial<ChatSlice>) {
  const prev = state.byChat[chatId] ?? EMPTY_SLICE;
  state = { byChat: { ...state.byChat, [chatId]: { ...prev, ...patch } } };
  emit();
}

const nowIso = () => new Date().toISOString();

/** Cloud rows carry a role that may include "system"; the transcript only renders user/assistant. */
function toEntries(rows: { role: string; content: string; createdAt: string }[]): SessionMessage[] {
  const out: SessionMessage[] = [];
  for (const r of rows) {
    if (r.role === "user" || r.role === "assistant") {
      out.push({ role: r.role, content: r.content, at: r.createdAt || nowIso() });
    }
  }
  return out;
}

/** Hydrate a chat's transcript from the cloud, once. Never refetches a chat that's already loading or
 *  loaded, and never clobbers messages appended optimistically while the fetch was in flight (mirrors
 *  the sources store's stale-guard). */
async function ensureLoaded(chatId: string): Promise<void> {
  if (previewMode) return;
  const slice = state.byChat[chatId];
  if (slice && slice.status !== "idle") return;
  setSlice(chatId, { status: "loading" });
  try {
    const rows = await listMessages(chatId);
    const current = state.byChat[chatId];
    if (!current || current.status !== "loading") return; // superseded (e.g. cleared/reset)
    // Adopt cloud history only if nothing was optimistically appended during the fetch.
    const messages = current.messages.length ? current.messages : toEntries(rows);
    setSlice(chatId, { messages, status: "loaded" });
  } catch {
    setSlice(chatId, { status: "loaded" }); // degrade to whatever's already in memory
  }
}

export const notebookChatStore = {
  subscribe,
  getMessages(chatId: string): SessionMessage[] {
    return (state.byChat[chatId] ?? EMPTY_SLICE).messages;
  },
  ensureLoaded,
  /** Mark a brand-new chat as loaded (empty) so no hydrate runs before its first turn. */
  markLoaded(chatId: string) {
    if ((state.byChat[chatId]?.status ?? "idle") === "idle") setSlice(chatId, { status: "loaded" });
  },
  append(chatId: string, message: SessionMessage) {
    const prev = state.byChat[chatId] ?? EMPTY_SLICE;
    const messages = [...prev.messages, message].slice(-MAX_MESSAGES);
    setSlice(chatId, { messages, status: prev.status === "idle" ? "loaded" : prev.status });
  },
  upsertAssistant(chatId: string, at: string, content: string) {
    const prev = state.byChat[chatId] ?? EMPTY_SLICE;
    const index = prev.messages.findIndex((message) => message.role === "assistant" && message.at === at);
    const message: SessionMessage = { role: "assistant", content, at };
    const messages = index >= 0
      ? prev.messages.map((existing, messageIndex) => messageIndex === index ? message : existing)
      : [...prev.messages, message].slice(-MAX_MESSAGES);
    setSlice(chatId, { messages, status: prev.status === "idle" ? "loaded" : prev.status });
  },
  setWorking(chatId: string, working: boolean) {
    setSlice(chatId, { working });
  },
  /** Dev-preview only: seed transcripts in-memory and stop hitting the network. */
  injectPreview(byChat: Record<string, SessionMessage[]>) {
    previewMode = true;
    const seeded: Record<string, ChatSlice> = {};
    for (const [id, messages] of Object.entries(byChat)) {
      seeded[id] = { messages, status: "loaded", working: false };
    }
    state = { byChat: seeded };
    emit();
  },
};

// ── Send orchestrator ────────────────────────────────────────────────────────

export interface SendNotebookTurnOpts {
  uid: string;
  notebookId: string;
  chatId: string;
  instructions: string | null;
  sources: NotebookWireSource[];
  userText: string;
  displayText?: string;
  signal?: AbortSignal;
  /** The composer's answer-effort dial. Defaults to Medium. */
  effort?: ChatEffort;
}

/** Append the user's message, run one turn with the notebook's instructions + source text injected,
 *  then append the assistant's reply (or a readable error line). The transcript renders from memory
 *  immediately; the cloud INSERTs fire in the background (a failed write only costs cross-device sync,
 *  never the UI). Rethrows only on abort. */
export async function sendNotebookTurn(opts: SendNotebookTurnOpts): Promise<void> {
  const userText = opts.userText.trim();
  if (!userText) return;
  const history = notebookChatStore.getMessages(opts.chatId);
  const displayText = opts.displayText?.trim() || userText;
  notebookChatStore.append(opts.chatId, { role: "user", content: displayText, at: nowIso() });
  notebookChatStore.setWorking(opts.chatId, true);
  void appendMessage({ chatId: opts.chatId, notebookId: opts.notebookId, role: "user", content: displayText }).catch(() => {});
  const decision = applyChatEffort(classifyChatRequest(userText), opts.effort ?? DEFAULT_CHAT_EFFORT);
  const assistantAt = nowIso();
  try {
    // Grounded mode (owner 2026-07-20): notebook answers come only from the
    // attached sources — the web-search grounding step is intentionally gone.
    const reply = await postChatCompletion(
      opts.uid,
      buildNotebookWireMessages({
        instructions: opts.instructions,
        sources: opts.sources,
        history,
        userText,
        decision,
      }),
      {
        decision,
        signal: opts.signal,
        onDelta: (_delta, accumulated) => notebookChatStore.upsertAssistant(opts.chatId, assistantAt, accumulated),
      },
    );
    const text = reply.text ?? reply.errorText ?? "Something went wrong. Try again.";
    notebookChatStore.upsertAssistant(opts.chatId, assistantAt, text);
    if (reply.text) {
      void appendMessage({ chatId: opts.chatId, notebookId: opts.notebookId, role: "assistant", content: reply.text }).catch(() => {});
    }
    void touchChat(opts.chatId).catch(() => {});
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    notebookChatStore.upsertAssistant(opts.chatId, assistantAt, "You're offline — chat needs a connection. Try again in a moment.");
  } finally {
    notebookChatStore.setWorking(opts.chatId, false);
  }
}

// ── React hook ────────────────────────────────────────────────────────────────

const EMPTY_STATE: StoreState = { byChat: {} };

function getSnapshot(): StoreState {
  return state;
}

function getServerSnapshot(): StoreState {
  return EMPTY_STATE;
}

export interface UseNotebookChatApi {
  messages: SessionMessage[];
  working: boolean;
}

export function useNotebookChat(chatId: string | null): UseNotebookChatApi {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    if (chatId) void notebookChatStore.ensureLoaded(chatId);
  }, [chatId]);
  const slice = chatId ? snap.byChat[chatId] : undefined;
  return {
    messages: slice?.messages ?? [],
    working: slice?.working ?? false,
  };
}
