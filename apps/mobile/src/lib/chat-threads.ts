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

import type { ChatAttachment, ChatMsg, ChatOutput, ChatRole, ChatSource, MessageThinking } from "./chat-thread.ts";

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

/**
 * How many threads the on-device cache keeps, oldest evicted first.
 *
 * This is a SYNC CEILING, not just a cache size: the drawer lists what the store
 * holds, so a thread evicted here is one the student can still see on the web app
 * but cannot reach on their phone. At 60 an ordinary account was ~20 chats away
 * from that, which is why this is far larger than it needs to be.
 *
 * Raising it is cheap because a thread merged in from the cloud carries METADATA
 * ONLY — mergeCloudThreadList sets `messages: []`, and bodies are filled in only
 * for threads actually opened. A cached row is a title, an id and two timestamps,
 * on the order of a hundred bytes. The eviction rule stays so a pathological
 * account still has a bound.
 */
export const MAX_THREADS = 500;
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

/** Upsert a thread's messages: cap message count, bump updatedAt, keep the store
 *  within MAX_THREADS (oldest evicted). Preserves createdAt. Pure.
 *
 *  Title rule (owner 2026-07-23: rename must stick): derive the title ONLY while
 *  the thread is still untitled ("New chat"). Once it has a real title — the
 *  first-message derivation, a manual rename (renameThreadTitle below), or a
 *  title synced down from web — that title is PRESERVED across later saves. The
 *  old behavior re-derived on every save, which silently reverted any rename the
 *  moment the next message was sent. */
export function upsertThread(store: ThreadStore, id: string, messages: ChatMsg[], nowIso: string): ThreadStore {
  const capped = messages.slice(-MAX_MESSAGES_PER_THREAD);
  const existing = store.threads.find((thread) => thread.id === id);
  const keepTitle = existing && existing.title.length > 0 && existing.title !== UNTITLED_THREAD;
  const updated: ChatThread = {
    createdAt: existing?.createdAt ?? nowIso,
    id,
    messages: capped,
    title: keepTitle ? existing.title : deriveThreadTitle(capped),
    updatedAt: nowIso,
    // Pinned state survives new messages (owner 2026-07-18).
    ...(existing?.pinned ? { pinned: true } : {}),
  };
  const rest = store.threads.filter((thread) => thread.id !== id);
  const threads = [updated, ...rest].sort(byUpdatedDesc).slice(0, MAX_THREADS);
  return { threads, v: 2 };
}

/** Set a thread's title to a manual value (owner 2026-07-23 sidebar rename).
 *  Trimmed and capped; a blank title or unknown id is a no-op. upsertThread
 *  preserves this on later saves, so a following message won't revert it. Pure. */
export function renameThreadTitle(store: ThreadStore, id: string, title: string): ThreadStore {
  const clean = title.trim().slice(0, 80);
  if (!clean) return store;
  return {
    threads: store.threads.map((thread) => (thread.id === id ? { ...thread, title: clean } : thread)),
    v: 2,
  };
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
 *  build before this cloud-sync pivot), or that a caller constructed without
 *  one this turn. `makeId` receives the message itself — callers pass
 *  `deriveMessageId` (below) rather than a random generator, and the
 *  injection point stays so this remains pure/deterministic in tests. */
export function ensureMessageIds(messages: ChatMsg[], makeId: (message: ChatMsg) => string): ChatMsg[] {
  return messages.map((message) => (message.id ? message : { ...message, id: makeId(message) }));
}

/** Deterministic, dependency-free 32-hex-digit hash of a string: four
 *  differently-salted 32-bit FNV-1a-style passes concatenated to 128 bits.
 *  NOT cryptographic — the point is that equal inputs ALWAYS produce the
 *  same output, never that the output is unguessable. No crypto dependency
 *  needed (Hermes has no global crypto.subtle, and one is deliberately not
 *  polyfilled — see generateUuidV4 above). */
function hash32Hex(input: string): string {
  const salts = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca77];
  let out = "";
  for (const salt of salts) {
    let h = salt;
    for (let i = 0; i < input.length; i++) {
      h = Math.imul(h ^ input.charCodeAt(i), 0x01000193);
    }
    out += (h >>> 0).toString(16).padStart(8, "0");
  }
  return out;
}

/** A message's `chat_messages.id`, derived DETERMINISTICALLY from
 *  (threadId, role, at, content) — the `makeId` ensureMessageIds() uses for
 *  a message that doesn't have one yet, in place of a random generator.
 *
 *  Why determinism matters: the phone Chat screen (chat.tsx) calls
 *  saveThreadMessages() TWICE per turn — once immediately with the new user
 *  message, then again once the reply lands, with that SAME user-message
 *  object appended into a longer array. The object never gets the id the
 *  FIRST call assigned (that id only ever lived inside ensureMessageIds'
 *  returned copy, not back on the screen's own object), so the SECOND call's
 *  ensureMessageIds() sees a still-id-less message again. A random makeId()
 *  would mint a DIFFERENT id than the first call did, and newMessagesSince()
 *  — which by then compares by id, since every message already has one —
 *  would treat the second copy as a brand-new message and sync it again:
 *  one logical user turn ends up as TWO rows in chat_messages. This was a
 *  real, shipped bug — confirmed against prod: a thread with two rows
 *  sharing identical role/content/created_at. Hashing the same
 *  (threadId, role, at, content) every time collapses both calls onto the
 *  same id, so the second save's copy is recognized as already-synced and
 *  never re-inserted.
 *
 *  Scoped by threadId (not just role/at/content) so two different threads —
 *  even two different users, RLS aside — can't collide on a coincidentally
 *  identical message; a collision would otherwise mean the second message
 *  silently never syncs (insert-ignore keeps whichever row landed first). A
 *  genuine collision requires an identical role+at+content within the SAME
 *  thread, which — at millisecond timestamp resolution — only happens for
 *  the exact repeat-call case this function exists to collapse. */
export function deriveMessageId(threadId: string, message: Pick<ChatMsg, "role" | "at" | "content">): string {
  const hex = hash32Hex(`${threadId}|${message.role}|${message.at}|${message.content}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
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

/** The kinds SessionOutput/ChatOutput allows — mirrors web's toSessionOutput
 *  validation set exactly (sessions-cloud.ts) so a malformed/future kind never
 *  round-trips into a value the UI doesn't know how to render. */
const OUTPUT_KINDS = new Set(["flashcards", "slides", "test", "mindmap", "note", "event", "report", "recording", "other"]);

/** Tolerant parse of the `meta` jsonb column's `{ outputs?: [...] }` shape —
 *  used for BOTH `chat_messages.meta.outputs` (per-turn deliverables) and
 *  `chat_threads.meta.outputs` (session-level artifacts, e.g. recordings) —
 *  same field shape as web's SessionOutput (sessions-store.ts), ported from
 *  its toSessionOutput row parser. Tool-created iOS deliverables are written
 *  here too, including a native Expo route that opens the artifact in Study,
 *  Library, or a full-screen slide viewer. */
export function outputsFromMeta(meta: unknown): ChatOutput[] {
  if (typeof meta !== "object" || meta === null) return [];
  const raw = (meta as Record<string, unknown>).outputs;
  if (!Array.isArray(raw)) return [];
  const outputs: ChatOutput[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, title, kind, url, route, transcript, notes, durationSeconds, createdAt, polish } = entry as Record<string, unknown>;
    if (typeof id !== "string" || typeof title !== "string" || typeof kind !== "string" || !OUTPUT_KINDS.has(kind)) continue;
    outputs.push({
      id,
      kind: kind as ChatOutput["kind"],
      title,
      ...(typeof url === "string" ? { url } : {}),
      ...(typeof route === "string" ? { route } : {}),
      ...(typeof transcript === "string" ? { transcript } : {}),
      ...(typeof notes === "string" ? { notes } : {}),
      ...(typeof durationSeconds === "number" && Number.isFinite(durationSeconds) ? { durationSeconds } : {}),
      ...(typeof createdAt === "string" ? { createdAt } : {}),
      ...(polish === "pending" || polish === "done" ? { polish } : {}),
    });
  }
  return outputs;
}

export function attachmentsFromMeta(meta: unknown): ChatAttachment[] {
  if (typeof meta !== "object" || meta === null) return [];
  const raw = (meta as Record<string, unknown>).attachments;
  if (!Array.isArray(raw)) return [];
  const attachments: ChatAttachment[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const { name, kind, mime, url, storagePath } = entry as Record<string, unknown>;
    if (typeof name !== "string" || (kind !== "image" && kind !== "file")) continue;
    attachments.push({
      name: name.slice(0, 240),
      kind,
      ...(typeof mime === "string" ? { mime: mime.slice(0, 120) } : {}),
      ...(typeof url === "string" ? { url } : {}),
      ...(typeof storagePath === "string" ? { storagePath } : {}),
    });
    if (attachments.length >= 12) break;
  }
  return attachments;
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
  const outputs = outputsFromMeta(row.meta);
  const attachments = attachmentsFromMeta(row.meta);
  const thinking = thinkingFromMeta(row.meta);
  return {
    at,
    content: row.content,
    ...(typeof row.id === "string" ? { id: row.id } : {}),
    role: row.role,
    ...(sources.length ? { sources } : {}),
    ...(outputs.length ? { outputs } : {}),
    ...(attachments.length ? { attachments } : {}),
    ...(thinking ? { thinking } : {}),
  };
}

/** Tolerant parse of the `meta` jsonb column's `{ thinking?: { ms, text } }`
 *  shape. Same posture as sourcesFromMeta: a row written by an older build, or
 *  by the web app which does not set this, simply has none — never a throw. */
export function thinkingFromMeta(meta: unknown): MessageThinking | null {
  if (typeof meta !== "object" || meta === null) return null;
  const raw = (meta as Record<string, unknown>).thinking;
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const text = typeof row.text === "string" ? row.text.trim() : "";
  const ms = Number(row.ms);
  const duration = Number.isFinite(ms) && ms >= 0 ? ms : 0;
  // A fast/non-reasoning turn still keeps ChatGPT's settled "Thought for …"
  // row. There is simply no disclosure body to expand in that case.
  if (!text && duration <= 0) return null;
  return { ms: duration, text };
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

/**
 * Fold a background refresh into what is ON SCREEN — the chat screen's
 * foreground pull and its 8-second poll.
 *
 * 🔴 THIS CANNOT BE `mergeMessages`, AND GETTING THAT WRONG DUPLICATES EVERY
 * MESSAGE IN THE THREAD. mergeMessages keys a message as `id ?? role|at|content`,
 * which is right when BOTH sides come out of the store (everything there has
 * been through ensureMessageIds). On-screen state has not: chat.tsx builds
 * `{ at, content, role }` with no id, and ensureMessageIds hands its ids to the
 * STORE copy, never back to React state. So the same message arrives here
 * id-less from the screen and id-bearing from the store, hashes to two
 * different keys, and both survive. Nothing corrects it afterwards either —
 * the whole point of merging rather than replacing is that state stops being
 * overwritten, so the next poll folds in a list that already holds both copies
 * and keeps them. Every ordinary chat turn would double within 8 seconds of
 * finishing, not just a recording.
 *
 * So identity is checked BOTH ways: by id when there is one, and always by
 * role+timestamp+content. The content key round-trips exactly — the cloud row's
 * `created_at` is written from `message.at` (api/chat.ts cloudMessageRow), not
 * defaulted by the database, so a message read back from Postgres carries the
 * same instant the phone stamped on it.
 *
 * `loaded` is folded in first, so a message present on both sides keeps the
 * copy that has an id and any metadata the cloud attached. That is safe now
 * that lib/artifact-timeline.ts decides which STATE an artifact card shows —
 * this function only has to decide which messages exist.
 */
/**
 * A recording's PLACEHOLDER message — the "Writing up your notes." line that is
 * replaced in place when the write-up lands.
 *
 * 🔴 IT MUST NEVER BE PERSISTED, and that is not a preference. `chat_messages` is
 * insert-only (the upsert runs `ignoreDuplicates: true` and the role has no UPDATE
 * grant), and `newMessagesSince` keys on id. So if the placeholder reaches the
 * cloud, the rewritten version — same id, new text — can never replace it: the
 * sync filters it out as "not new", and the next poll's merge lets the CLOUD copy
 * win by id and drags the frozen "Writing up your notes." back onto the screen,
 * taking the recording's notes off the wire with it. That is exactly the frozen
 * pending card of #358, reintroduced by the fix for the three-blocks complaint.
 *
 * Dropping it from the local store too is the intended cost: during the pending
 * window the artifact still lives in the thread's own outputs, so the card is
 * drawn as the header chip. The message reappears, resolved, the moment the
 * write-up lands and it becomes an ordinary insert.
 */
export function isPendingRecordingMessage(message: ChatMsg): boolean {
  return (message.outputs ?? []).some((output) => output.kind === "recording" && output.polish === "pending");
}

export function withoutPendingRecordings(messages: readonly ChatMsg[]): ChatMsg[] {
  return messages.filter((message) => !isPendingRecordingMessage(message));
}

export function mergeRefreshedMessages(current: readonly ChatMsg[], loaded: readonly ChatMsg[]): ChatMsg[] {
  const contentKey = (message: ChatMsg) => `${message.role}|${message.at}|${message.content}`;
  const seenIds = new Set<string>();
  const seenContent = new Set<string>();
  const merged: ChatMsg[] = [];
  for (const message of [...loaded, ...current]) {
    const key = contentKey(message);
    if (message.id && seenIds.has(message.id)) continue;
    if (seenContent.has(key)) continue;
    if (message.id) seenIds.add(message.id);
    seenContent.add(key);
    merged.push(message);
  }
  return merged
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    .slice(-MAX_MESSAGES_PER_THREAD);
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
