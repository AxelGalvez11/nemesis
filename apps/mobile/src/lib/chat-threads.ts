// Multi-thread chat store (pure logic) — so chats "save to the sidebar" like a
// ChatGPT/Claude history instead of one rolling transcript. Dependency-free +
// Deno-testable (the file IO + per-user paths live in api/chat.ts).
//
// One store per signed-in user holds every thread with its messages; the sidebar
// lists thread summaries (title + when), tapping one reopens it. Titles derive
// from the first user message. Empty (never-sent) threads are hidden from the
// list so a stack of blank "New chat" rows can't accumulate.

import type { ChatMsg } from "./chat-thread.ts";

export interface ChatThread {
  id: string;
  title: string;
  /** ISO — when the thread was first created. */
  createdAt: string;
  /** ISO — last message time; the sidebar sorts on this, newest first. */
  updatedAt: string;
  messages: ChatMsg[];
}

/** The lightweight row the drawer renders (no message bodies). */
export interface ThreadSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ThreadStore {
  v: 2;
  threads: ChatThread[];
}

export const MAX_THREADS = 60;
export const MAX_MESSAGES_PER_THREAD = 200;
export const UNTITLED_THREAD = "New chat";

export function emptyStore(): ThreadStore {
  return { threads: [], v: 2 };
}

/** Title from the first user message (single line, ~40 chars), else "New chat". */
export function deriveThreadTitle(messages: ChatMsg[]): string {
  const first = messages.find((message) => message.role === "user")?.content.trim() ?? "";
  if (!first) return UNTITLED_THREAD;
  const oneLine = first.replace(/\s+/g, " ");
  return oneLine.length > 40 ? `${oneLine.slice(0, 39).trim()}…` : oneLine;
}

// ISO 8601 timestamps sort lexicographically in chronological order, so a string
// compare is a valid newest-first ordering.
function byUpdatedDesc(a: ChatThread, b: ChatThread): number {
  if (a.updatedAt === b.updatedAt) return 0;
  return a.updatedAt < b.updatedAt ? 1 : -1;
}

/** Sidebar rows, newest first, hiding threads that never got a message. */
export function threadSummaries(store: ThreadStore): ThreadSummary[] {
  return store.threads
    .filter((thread) => thread.messages.length > 0)
    .slice()
    .sort(byUpdatedDesc)
    .map((thread) => ({ id: thread.id, title: thread.title, updatedAt: thread.updatedAt }));
}

export function getThread(store: ThreadStore, id: string): ChatThread | null {
  return store.threads.find((thread) => thread.id === id) ?? null;
}

/** Upsert a thread's messages: refresh title + updatedAt, cap message count, keep
 *  the store within MAX_THREADS (oldest evicted). Preserves createdAt. Pure. */
export function upsertThread(store: ThreadStore, id: string, messages: ChatMsg[], nowIso: string): ThreadStore {
  const capped = messages.slice(-MAX_MESSAGES_PER_THREAD);
  const existing = store.threads.find((thread) => thread.id === id);
  const updated: ChatThread = {
    createdAt: existing?.createdAt ?? nowIso,
    id,
    messages: capped,
    title: deriveThreadTitle(capped),
    updatedAt: nowIso,
  };
  const rest = store.threads.filter((thread) => thread.id !== id);
  const threads = [updated, ...rest].sort(byUpdatedDesc).slice(0, MAX_THREADS);
  return { threads, v: 2 };
}

export function removeThread(store: ThreadStore, id: string): ThreadStore {
  return { threads: store.threads.filter((thread) => thread.id !== id), v: 2 };
}

/** Parse a persisted store. Tolerant of the OLD single-thread file
 *  ({ v:1, messages }) — it's migrated into one thread using `migratedId`/`nowIso`
 *  so nobody loses their current conversation. Returns an empty store on mismatch. */
export function parseThreadStore(raw: unknown, migratedId: string, nowIso: string): ThreadStore {
  if (typeof raw !== "object" || raw === null) return emptyStore();
  const value = raw as Record<string, unknown>;

  // Legacy single-thread transcript → one thread.
  if (value.v === 1 && Array.isArray(value.messages)) {
    const messages = value.messages.filter(isChatMsg);
    return messages.length ? upsertThread(emptyStore(), migratedId, messages, nowIso) : emptyStore();
  }

  if (value.v !== 2 || !Array.isArray(value.threads)) return emptyStore();
  const threads: ChatThread[] = [];
  for (const entry of value.threads) {
    const thread = castThread(entry);
    if (thread) threads.push(thread);
  }
  return { threads: threads.slice(0, MAX_THREADS), v: 2 };
}

function isChatMsg(row: unknown): row is ChatMsg {
  if (typeof row !== "object" || row === null) return false;
  const { role, content, at } = row as Record<string, unknown>;
  return (role === "user" || role === "assistant") && typeof content === "string" && typeof at === "string";
}

function castThread(row: unknown): ChatThread | null {
  if (typeof row !== "object" || row === null) return null;
  const value = row as Record<string, unknown>;
  if (typeof value.id !== "string" || !value.id) return null;
  const messages = Array.isArray(value.messages) ? value.messages.filter(isChatMsg) : [];
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : "";
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : createdAt;
  return {
    createdAt,
    id: value.id,
    messages: messages.slice(-MAX_MESSAGES_PER_THREAD),
    title: typeof value.title === "string" && value.title ? value.title : deriveThreadTitle(messages),
    updatedAt,
  };
}
