// Multi-thread chat store (pure logic) — so chats "save to the sidebar" like a
// ChatGPT/Claude history instead of one rolling transcript. Dependency-free +
// Deno-testable (the file IO + Supabase network calls live in api/chat.ts).
//
// One store per signed-in user holds every thread with its messages; the sidebar
// lists thread summaries (title + when), tapping one reopens it. Titles derive
// from the first user message. Empty (never-sent) threads are hidden from the
// list so a stack of blank "New chat" rows can't accumulate.
//
// Cloud-first pivot (§6): this file also owns the PURE reconciliation between
// the on-device cache (this store, offline-safe + instant-open) and the cloud
// `chat_threads`/`chat_messages` tables (same tables/semantics as web §4). The
// actual `supabase.from(...)` calls live in api/chat.ts; everything here is a
// plain data transform so it stays Deno-testable with no network/RN deps.
//
// Sync model: thread ids and message ids are client-generated UUIDs (see
// api/chat.ts's newThreadId/newMessageId — a dependency-free v4 generator,
// since Hermes has no global crypto.randomUUID and adding a polyfill would
// violate the OTA fingerprint freeze). Stable ids mean every cloud write is an
// upsert/insert-with-conflict-ignore keyed on `id`, so a message can safely be
// re-sent after a dropped connection without ever duplicating a row.

import type { ChatMsg, ChatRole, ChatSource } from "./chat-thread.ts";

export interface ChatThread {
  id: string;
  title: string;
  /** ISO — when the thread was first created. */
  createdAt: string;
  /** ISO — last message time; the sidebar sorts on this, newest first. */
  updatedAt: string;
  /** Pinned threads sort ABOVE the rest in the sidebar (owner 2026-07-18). Absent /
   *  false = not pinned. */
  pinned?: boolean;
  messages: ChatMsg[];
}

/** The lightweight row the drawer renders (no message bodies). */
export interface ThreadSummary {
  id: string;
  title: string;
  updatedAt: string;
  pinned: boolean;
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

// Pinned threads first (owner 2026-07-18), then newest-first within each group.
function byPinnedThenUpdated(a: ChatThread, b: ChatThread): number {
  const ap = a.pinned === true ? 0 : 1;
  const bp = b.pinned === true ? 0 : 1;
  if (ap !== bp) return ap - bp;
  return byUpdatedDesc(a, b);
}

/** Sidebar rows — pinned first, then newest first — hiding threads that never got a
 *  message. */
export function threadSummaries(store: ThreadStore): ThreadSummary[] {
  return store.threads
    .filter((thread) => thread.messages.length > 0)
    .slice()
    .sort(byPinnedThenUpdated)
    .map((thread) => ({ id: thread.id, title: thread.title, updatedAt: thread.updatedAt, pinned: thread.pinned === true }));
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
    // Pinned state survives new messages (owner 2026-07-18).
    ...(existing?.pinned ? { pinned: true } : {}),
  };
  const rest = store.threads.filter((thread) => thread.id !== id);
  const threads = [updated, ...rest].sort(byUpdatedDesc).slice(0, MAX_THREADS);
  return { threads, v: 2 };
}

export function removeThread(store: ThreadStore, id: string): ThreadStore {
  return { threads: store.threads.filter((thread) => thread.id !== id), v: 2 };
}

/** Set (or clear) a thread's pinned flag; an unknown id is a no-op. Pure. */
export function setThreadPinned(store: ThreadStore, id: string, pinned: boolean): ThreadStore {
  return {
    threads: store.threads.map((thread) => (thread.id === id ? { ...thread, pinned } : thread)),
    v: 2,
  };
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
    // Persisted pin survives reload (owner 2026-07-18).
    ...(value.pinned === true ? { pinned: true } : {}),
  };
}

// ── Cloud reconciliation (pure — see api/chat.ts for the network I/O) ───────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Dependency-free UUID v4 (Math.random-based). Hermes/RN has no global
 *  `crypto.randomUUID`, and adding a crypto polyfill would violate the OTA
 *  fingerprint freeze (§0) — these only need to be unique row identifiers
 *  under owner-only RLS, not cryptographically unguessable. Exported (rather
 *  than kept private in api/chat.ts) so isValidThreadId covers it in tests —
 *  this generator is the thing the whole cloud-sync id scheme depends on. */
export function generateUuidV4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** `chat_threads.id`/`chat_messages.id` are Postgres `uuid` columns. Threads
 *  created by pre-cloud builds (shipped TestFlight 2026-07) used a non-uuid
 *  local id format — this flags those so the one-time migration can remap
 *  them BEFORE the first cloud write (an invalid uuid literal fails the insert
 *  outright). */
export function isValidThreadId(id: string): boolean {
  return UUID_RE.test(id);
}

/** Rename a thread's id everywhere in the store (migration only — a valid-uuid
 *  thread never needs this). Unknown id is a no-op. Pure. */
export function remapThreadId(store: ThreadStore, oldId: string, newId: string): ThreadStore {
  return { threads: store.threads.map((thread) => (thread.id === oldId ? { ...thread, id: newId } : thread)), v: 2 };
}

/** Backfill a stable id on any message that predates the id field (cached by a
 *  build before this cloud-sync pivot). `makeId` is injected so this stays
 *  pure/deterministic in tests; api/chat.ts passes the real UUID generator. */
export function ensureMessageIds(messages: ChatMsg[], makeId: () => string): ChatMsg[] {
  return messages.map((message) => (message.id ? message : { ...message, id: makeId() }));
}

/** Which of `current`'s messages are new relative to `previous` — an id-based
 *  set difference (falling back to a role/at/content key for the rare pre-id
 *  legacy row), NOT a position/count diff. That distinction matters once a
 *  thread hits MAX_MESSAGES_PER_THREAD: upsertThread evicts the OLDEST message
 *  to stay at the cap, so the total count stops growing even though a
 *  genuinely new message just arrived — a count-based "new since N" would
 *  silently stop uploading anything for that thread forever. Re-sending a
 *  message that's already synced is harmless either way (the cloud insert is
 *  conflict-ignore on the stable id). */
export function newMessagesSince(current: ChatMsg[], previous: ChatMsg[]): ChatMsg[] {
  const key = (message: ChatMsg) => message.id ?? `${message.role}|${message.at}|${message.content}`;
  const known = new Set(previous.map(key));
  return current.filter((message) => !known.has(key(message)));
}

/** The `chat_threads` columns needed to merge a cloud row into the local
 *  cache (message bodies are fetched/merged separately, per-thread, only when
 *  a thread is actually opened — see setThreadMessages/mergeMessages). */
export interface CloudThreadMeta {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Merge a freshly-fetched cloud thread list into the local cache: cloud
 *  metadata wins for threads it knows about; cloud-only threads are added as
 *  message-less stubs (hydrated the moment they're opened). A local thread
 *  NOT present in the cloud list is KEPT AS-IS rather than deleted — it may
 *  simply not have synced yet (offline write, or a dropped fire-and-forget
 *  call); the only way a thread disappears locally is the explicit delete
 *  action. (No Realtime / multi-device tombstones in this v1 — see §6/§12.) */
export function mergeCloudThreadList(store: ThreadStore, cloudThreads: CloudThreadMeta[]): ThreadStore {
  const byId = new Map(store.threads.map((thread) => [thread.id, thread] as const));
  for (const cloud of cloudThreads) {
    const existing = byId.get(cloud.id);
    byId.set(cloud.id, {
      createdAt: cloud.createdAt,
      id: cloud.id,
      messages: existing?.messages ?? [],
      title: cloud.title,
      updatedAt: cloud.updatedAt,
      ...(cloud.pinned ? { pinned: true } : {}),
    });
  }
  const threads = Array.from(byId.values()).sort(byUpdatedDesc).slice(0, MAX_THREADS);
  return { threads, v: 2 };
}

/** The `chat_messages` columns needed to map a cloud row back into a ChatMsg. */
export interface CloudMessageRow {
  id: unknown;
  role: unknown;
  content: unknown;
  meta: unknown;
  created_at: unknown;
}

function isChatRole(value: unknown): value is ChatRole {
  return value === "user" || value === "assistant";
}

/** Tolerant parse of the `meta` jsonb column's `{ sources?: [...] }` shape —
 *  same field shape as web's SessionSource (title/url/description), so a
 *  thread written from the phone reads back identically on web with no
 *  translation layer. */
function sourcesFromMeta(meta: unknown): ChatSource[] {
  if (typeof meta !== "object" || meta === null) return [];
  const raw = (meta as Record<string, unknown>).sources;
  if (!Array.isArray(raw)) return [];
  const sources: ChatSource[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const { title, url, description } = entry as Record<string, unknown>;
    if (typeof title === "string" && typeof url === "string") {
      sources.push({ description: typeof description === "string" ? description : "", title, url });
    }
  }
  return sources;
}

/** Map one `chat_messages` row into a ChatMsg. Rows with role='system' (never
 *  written by this client, but the column allows it) are dropped — only
 *  user/assistant turns ever render in the transcript. `created_at` is
 *  re-serialized through `Date` so every ChatMsg.at is the SAME canonical
 *  `Z`-suffixed format regardless of origin (local `toISOString()` vs
 *  Postgres's `timestamptz` text form) — otherwise a lexicographic sort/merge
 *  across local + cloud timestamps can order them wrong. Returns null for a
 *  malformed row. */
export function chatMsgFromCloudRow(row: CloudMessageRow): ChatMsg | null {
  if (!isChatRole(row.role) || typeof row.content !== "string" || typeof row.created_at !== "string") return null;
  const parsed = new Date(row.created_at);
  if (Number.isNaN(parsed.getTime())) return null; // toISOString() throws on an invalid Date
  const at = parsed.toISOString();
  const sources = sourcesFromMeta(row.meta);
  return {
    at,
    content: row.content,
    ...(typeof row.id === "string" ? { id: row.id } : {}),
    role: row.role,
    ...(sources.length ? { sources } : {}),
  };
}

/** Merge a thread's local + cloud message lists: de-duplicated by stable id
 *  (falling back to a role/at/content key for the rare pre-id legacy row),
 *  sorted chronologically. Cloud is listed first so an exact-duplicate id
 *  prefers the cloud copy (it's the one with a normalized `at` + any `meta`
 *  the cloud attached). Handles both directions — a message this device sent
 *  while offline (local-only) and a message another device/session added
 *  (cloud-only) both survive the merge. */
export function mergeMessages(local: ChatMsg[], cloud: ChatMsg[]): ChatMsg[] {
  const seen = new Set<string>();
  const merged: ChatMsg[] = [];
  for (const message of [...cloud, ...local]) {
    const key = message.id ?? `${message.role}|${message.at}|${message.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(message);
  }
  return merged.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** Replace a thread's message list (the result of a cloud merge) without
 *  disturbing its title/pinned/timestamps — unlike upsertThread, this is a
 *  READ-time reconciliation, not a new-message event, so it must NOT bump
 *  updatedAt or re-derive the title (that would reshuffle the sidebar just
 *  from opening a thread). Falls back to constructing a fresh thread entry
 *  if the id is unknown locally (a cloud-only thread opened before its stub
 *  was merged in — defensive; the normal flow always merges the list first). */
export function setThreadMessages(store: ThreadStore, id: string, messages: ChatMsg[], nowIso: string): ThreadStore {
  const capped = messages.slice(-MAX_MESSAGES_PER_THREAD);
  const existing = store.threads.find((thread) => thread.id === id);
  const updated: ChatThread = existing
    ? { ...existing, messages: capped }
    : {
        createdAt: capped[0]?.at ?? nowIso,
        id,
        messages: capped,
        title: deriveThreadTitle(capped),
        updatedAt: capped[capped.length - 1]?.at ?? nowIso,
      };
  const rest = store.threads.filter((thread) => thread.id !== id);
  const threads = [updated, ...rest].sort(byUpdatedDesc).slice(0, MAX_THREADS);
  return { threads, v: 2 };
}
