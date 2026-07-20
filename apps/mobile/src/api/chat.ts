// Phone Chat (cloud-first pivot §6): talks to the SAME metered valve as the
// desktop app (nemesis-llm edge function) — server-side model routing, plan
// budgets, and failover all apply unchanged, so chat here bills exactly like
// chat on the Mac. No Mac involvement anywhere in this path.
//
// Cloud-first pivot §6: threads/messages now live in `chat_threads`/
// `chat_messages` (same tables as the web Sessions surface, §4) — the on-disk
// JSON cache stays as an instant-open + offline-read layer, write-through
// synced to the cloud on every mutation. All the merge/mapping logic is pure
// and lives in lib/chat-threads.ts; this file is the I/O layer (Supabase
// calls, streaming fetch, device-key mint, local file cache).
//
// Identity rules (review findings, 2026-07-17 — same class as reviewEvents):
// EVERYTHING here is scoped to the signed-in user's id. The device key lives
// under a per-user SecureStore entry and is only ever minted from a session
// whose user matches; the rolling thread file is per-user too. An account
// switch on this phone can neither read, upload, nor bill against another
// account's conversation — each user's key and thread simply wait for them.
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { fetch as expoFetch } from "expo/fetch";
import { supabase } from "./supabase";
import {
  budgetResetKind,
  buildWireMessages,
  chatErrorKind,
  chatErrorMessage,
  formatWebSearchContext,
  type BudgetResetKind,
  type ChatErrorKind,
  type ChatMsg,
  type ChatSource,
  type WireMsg,
} from "@/lib/chat-thread";
import { classifyChatRequest, type ChatRouteDecision } from "@/lib/chat-routing";
import { readCompletionStream, type CompletionDeltaHandler } from "@/lib/chat-stream";
import {
  chatMsgFromCloudRow,
  emptyStore,
  ensureMessageIds,
  generateUuidV4,
  getThread,
  isValidThreadId,
  MAX_MESSAGES_PER_THREAD,
  MAX_THREADS,
  mergeCloudThreadList,
  mergeMessages,
  newMessagesSince,
  parseThreadStore,
  remapThreadId,
  removeThread,
  setThreadMessages,
  setThreadPinned,
  threadSummaries,
  upsertThread,
  type ChatThread,
  type CloudThreadMeta,
  type ThreadStore,
  type ThreadSummary,
} from "@/lib/chat-threads";

const LLM_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/nemesis-llm`;
const SEARCH_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/nemesis-search/v2/search`;

// SecureStore keys allow [A-Za-z0-9._-]; uuids fit as-is.
const deviceKeyStoreFor = (uid: string) => `nemesis_device_key_v1_${uid}`;

/** Mint a device key for the CURRENT session, only if it belongs to `uid` —
 *  a stale screen from a previous account must never mint under the new one. */
async function mintDeviceKey(uid: string): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session || session.user.id !== uid) return null;
  try {
    const res = await fetch(`${LLM_BASE}/device-key`, {
      body: JSON.stringify({ label: "Nemesis iPhone" }),
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      method: "POST",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { key?: string };
    if (typeof body.key !== "string" || !body.key.startsWith("nmk_")) return null;
    await SecureStore.setItemAsync(deviceKeyStoreFor(uid), body.key);
    return body.key;
  } catch {
    return null;
  }
}

async function deviceKey(uid: string): Promise<string | null> {
  try {
    const stored = await SecureStore.getItemAsync(deviceKeyStoreFor(uid));
    if (stored?.startsWith("nmk_")) return stored;
  } catch {
    // fall through to a fresh mint
  }
  return mintDeviceKey(uid);
}

// ── ids (thread ids double as the `chat_threads.id` uuid PK) ────────────────

/** A fresh thread id. MUST be a valid Postgres uuid — chat_threads.id is a
 *  `uuid` column, and this id is used verbatim as the cloud row's id (the
 *  route param `?c=` needs an id before the first cloud write can happen, so
 *  the id can't wait for a server-assigned one). */
export function newThreadId(): string {
  return generateUuidV4();
}

/** A fresh message id — the identity of its `chat_messages` cloud row. Stable
 *  client-generated ids let every cloud message write be insert-with-
 *  conflict-ignore, so re-sending a message after a dropped connection can
 *  never duplicate a row. */
export function newMessageId(): string {
  return generateUuidV4();
}

// ── web search (§3: phone calls nemesis-search directly with the device key) ─

/** Time-sensitive queries need an explicit date, or a search provider can rank
 *  an older result above today's. Kept minimal on purpose: the phone's ONLY
 *  search trigger is chat-routing.ts's `searchWeb` decision (web's separate
 *  shouldSearchWeb heuristic layer is not ported — see chat-thread.ts). */
function withFreshDateAnchor(query: string): string {
  return `${query.trim()} current as of ${new Date().toISOString().slice(0, 10)}`;
}

/** Prompt-feeding copied from web's chat-api.ts::searchWebContext: fetch live
 *  results and format them into a context block the model is told to cite. */
async function searchWebContext(uid: string, query: string): Promise<{ context: string; sources: ChatSource[] }> {
  const key = await deviceKey(uid);
  if (!key) return { context: "", sources: [] };
  try {
    const res = await fetch(SEARCH_URL, {
      body: JSON.stringify({ limit: 5, query }),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      method: "POST",
    });
    if (!res.ok) return { context: "", sources: [] };
    const body = (await res.json()) as { data?: { web?: ChatSource[] } };
    const sources = (body.data?.web ?? []).filter((source) => source.url).slice(0, 5);
    return { context: formatWebSearchContext(sources), sources };
  } catch {
    return { context: "", sources: [] };
  }
}

// ── chat/completions (streaming) ────────────────────────────────────────────

export interface ChatReply {
  text: string | null;
  errorText: string | null;
  errorKind: ChatErrorKind | null;
  /** Set only on budget errors — which credit window ran dry (drives the
   *  upgrade sheet's reset line). */
  budgetReset: BudgetResetKind | null;
  sources: ChatSource[];
}

/** One completion turn over expo/fetch's streaming Response.body (SDK 56, no
 *  new dep — a real ReadableStream, same shape a browser gives web). Always
 *  requests `stream: true`; readCompletionStream still returns the full
 *  accumulated text when no `onDelta` is supplied, so this is also the
 *  non-streaming path. Never throws — network/API failures come back as a
 *  student-readable line. */
async function postChatCompletion(
  uid: string,
  wireMessages: WireMsg[],
  decision: ChatRouteDecision,
  onDelta?: CompletionDeltaHandler,
): Promise<ChatReply> {
  let key = await deviceKey(uid);
  if (!key) return { budgetReset: null, errorKind: "auth", errorText: "Sign in to chat.", sources: [], text: null };

  const payload = JSON.stringify({
    messages: wireMessages,
    model: decision.model,
    ...(decision.reasoningEffort ? { reasoning_effort: decision.reasoningEffort } : {}),
    stream: true,
  });
  const call = (bearer: string) =>
    expoFetch(`${LLM_BASE}/v1/chat/completions`, {
      body: payload,
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      method: "POST",
    });

  try {
    let res = await call(key);
    // A revoked/unknown key (wiped server-side, restored phone) re-mints once —
    // still strictly under this uid's session.
    if (res.status === 401 || res.status === 403) {
      const fresh = await mintDeviceKey(uid);
      if (fresh) {
        key = fresh;
        res = await call(key);
      }
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as unknown;
      return {
        budgetReset: budgetResetKind(body),
        errorKind: chatErrorKind(res.status, body),
        errorText: chatErrorMessage(res.status, body),
        sources: [],
        text: null,
      };
    }
    const text = await readCompletionStream(res.body, onDelta);
    return text
      ? { budgetReset: null, errorKind: null, errorText: null, sources: [], text }
      : { budgetReset: null, errorKind: "generic", errorText: "The answer came back empty. Try again.", sources: [], text: null };
  } catch {
    return {
      budgetReset: null,
      errorKind: "unreachable",
      errorText: "You're offline — chat needs a connection (your Library still works).",
      sources: [],
      text: null,
    };
  }
}

/** One routed completion turn for the signed-in user `uid`: classifies the
 *  request (model + whether it needs live search), optionally grounds it with
 *  a nemesis-search call, then streams the reply. `onDelta` (optional) is
 *  called with each chunk as it arrives so the screen can render into the
 *  assistant bubble live. Never throws. */
export async function sendChat(
  uid: string,
  history: ChatMsg[],
  userText: string,
  onDelta?: CompletionDeltaHandler,
): Promise<ChatReply> {
  const decision = classifyChatRequest(userText);
  let groundedText = userText;
  let sources: ChatSource[] = [];
  if (decision.searchWeb) {
    const query = decision.route === "current" ? withFreshDateAnchor(userText) : userText;
    const result = await searchWebContext(uid, query);
    sources = result.sources;
    groundedText = result.context
      ? `${userText}\n\n${result.context}`
      : `${userText}\n\nLive search was requested but returned no verifiable sources. Do not guess a current result; say clearly that it could not be verified.`;
  }
  const reply = await postChatCompletion(uid, buildWireMessages(history, groundedText, decision), decision, onDelta);
  return { ...reply, sources };
}

// --- local cache file (instant open + offline read) -------------------------
// One store file per user holds every thread + its messages; the drawer lists
// thread summaries. The OLD single rolling thread (chat-thread-v1-<uid>.json) is
// migrated into the store once, on first read, so nobody loses their conversation.

const legacyThreadPathFor = (uid: string) => `${FileSystem.documentDirectory ?? ""}chat-thread-v1-${uid}.json`;
const storePathFor = (uid: string) => `${FileSystem.documentDirectory ?? ""}chat-threads-v2-${uid}.json`;
const migratedFlagPathFor = (uid: string) => `${FileSystem.documentDirectory ?? ""}chat-threads-cloud-migrated-v1-${uid}.json`;

async function readJson(path: string): Promise<unknown | null> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    return JSON.parse(await FileSystem.readAsStringAsync(path));
  } catch {
    return null;
  }
}

async function writeStore(uid: string, store: ThreadStore): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(storePathFor(uid), JSON.stringify(store));
  } catch {
    // best-effort
  }
}

async function readStore(uid: string): Promise<ThreadStore> {
  const now = new Date().toISOString();
  const current = await readJson(storePathFor(uid));
  if (current) return parseThreadStore(current, newThreadId(), now);
  // First run on the new format: migrate the legacy single thread, if present.
  const legacy = await readJson(legacyThreadPathFor(uid));
  if (legacy) {
    const migrated = parseThreadStore(legacy, newThreadId(), now);
    if (migrated.threads.length) await writeStore(uid, migrated);
    return migrated;
  }
  return emptyStore();
}

// ── cloud sync (write-through + one-time migration) ─────────────────────────
// Thread/message ids are stable client-generated uuids (see newThreadId/
// newMessageId above), so every cloud write below is upsert / insert-with-
// conflict-ignore: re-sending something already there is a harmless no-op.
// That's what makes "fire-and-forget with one retry" safe — a dropped write
// simply gets re-attempted (in full, if needed) the next time this thread is
// saved, with no risk of duplicating a row.

interface SupabaseResult {
  error: { message?: string } | null;
}

/** Attempt `fn` once; on a thrown error OR a returned `.error`, attempt it ONE
 *  more time; otherwise give up silently (§4: "fire-and-forget with one
 *  retry" — no persistent queue). Returns null on total failure. Takes
 *  `PromiseLike` (not `Promise`) so supabase-js's thenable query builders —
 *  which implement `.then()` but aren't literal Promise instances — pass
 *  through without a cast. */
async function withOneRetry<T extends SupabaseResult>(fn: () => PromiseLike<T>): Promise<T | null> {
  try {
    const result = await fn();
    if (!result.error) return result;
  } catch {
    // fall through to the retry
  }
  try {
    const result = await fn();
    return result.error ? null : result;
  } catch {
    return null;
  }
}

/** One `chat_messages` row for `message` — content clamped to the column's
 *  60,000-char check constraint; `meta.sources` uses the SAME field shape as
 *  web's SessionSource (title/url/description), so a thread written from the
 *  phone reads back identically on web with no translation layer. */
function cloudMessageRow(uid: string, threadId: string, message: ChatMsg & { id: string }) {
  return {
    content: message.content.slice(0, 60_000),
    created_at: message.at,
    id: message.id,
    meta: message.sources?.length ? { sources: message.sources } : null,
    role: message.role,
    thread_id: threadId,
    user_id: uid,
  };
}

function hasId(message: ChatMsg): message is ChatMsg & { id: string } {
  return typeof message.id === "string";
}

/** Write-through one thread's current state + any newly-added messages to the
 *  cloud. Fire-and-forget from the caller's perspective (never throws). */
async function syncThreadToCloud(uid: string, thread: ChatThread, newMessages: ChatMsg[]): Promise<void> {
  await withOneRetry(() =>
    supabase.from("chat_threads").upsert(
      {
        created_at: thread.createdAt,
        id: thread.id,
        pinned: thread.pinned === true,
        title: thread.title,
        updated_at: thread.updatedAt,
        user_id: uid,
      },
      { onConflict: "id" },
    ),
  );
  const rows = newMessages.filter(hasId).map((message) => cloudMessageRow(uid, thread.id, message));
  if (!rows.length) return;
  await withOneRetry(() => supabase.from("chat_messages").upsert(rows, { ignoreDuplicates: true, onConflict: "id" }));
}

const migratedUidsThisSession = new Set<string>();

async function isMigrated(uid: string): Promise<boolean> {
  if (migratedUidsThisSession.has(uid)) return true;
  const info = await FileSystem.getInfoAsync(migratedFlagPathFor(uid)).catch(() => null);
  return info?.exists === true;
}

async function markMigrated(uid: string): Promise<void> {
  migratedUidsThisSession.add(uid);
  await FileSystem.writeAsStringAsync(migratedFlagPathFor(uid), JSON.stringify({ migratedAt: new Date().toISOString() })).catch(() => {});
}

/** One-time upload of the existing local chat-threads-v2-<uid>.json into the
 *  cloud tables. Legacy (pre-cloud-build) thread ids aren't valid uuids, so
 *  those get remapped FIRST and persisted locally before any cloud write.
 *  Safe to re-run in full: every write is upsert/insert-ignore on a stable id,
 *  so a partial failure just means the next app open retries for free — the
 *  "migrated" flag is only set once every thread uploads cleanly. */
async function ensureMigrated(uid: string): Promise<void> {
  if (await isMigrated(uid)) return;
  let store = await readStore(uid);

  for (const thread of store.threads) {
    if (!isValidThreadId(thread.id)) store = remapThreadId(store, thread.id, newThreadId());
  }
  store = { threads: store.threads.map((thread) => ({ ...thread, messages: ensureMessageIds(thread.messages, newMessageId) })), v: 2 };
  await writeStore(uid, store);

  let ok = true;
  for (const thread of store.threads) {
    if (!thread.messages.length) continue;
    const threadResult = await withOneRetry(() =>
      supabase.from("chat_threads").upsert(
        {
          created_at: thread.createdAt,
          id: thread.id,
          pinned: thread.pinned === true,
          title: thread.title,
          updated_at: thread.updatedAt,
          user_id: uid,
        },
        { onConflict: "id" },
      ),
    );
    const rows = thread.messages.filter(hasId).map((message) => cloudMessageRow(uid, thread.id, message));
    const messagesResult = rows.length
      ? await withOneRetry(() => supabase.from("chat_messages").upsert(rows, { ignoreDuplicates: true, onConflict: "id" }))
      : ({ error: null } as SupabaseResult);
    if (threadResult === null || messagesResult === null) ok = false;
  }
  if (ok) await markMigrated(uid);
}

// ── public store API (used by the Chat screen + drawer) ─────────────────────

/** Sidebar rows (title + when), newest first. Merges the cloud thread list in
 *  (metadata only — no message bodies) on every call; the AppDrawer already
 *  re-calls this every time it opens, which is what gives the drawer its
 *  "list refresh on open" behavior for free. Falls back to the local cache
 *  untouched when offline/erroring. */
export async function listThreads(uid: string): Promise<ThreadSummary[]> {
  await ensureMigrated(uid);
  let store = await readStore(uid);
  try {
    const { data, error } = await supabase
      .from("chat_threads")
      .select("id,title,pinned,created_at,updated_at")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false })
      .limit(MAX_THREADS);
    if (!error && data) {
      const cloudMeta: CloudThreadMeta[] = data.map((row) => ({
        createdAt: row.created_at,
        id: row.id,
        pinned: row.pinned === true,
        title: row.title,
        updatedAt: row.updated_at,
      }));
      store = mergeCloudThreadList(store, cloudMeta);
      await writeStore(uid, store);
    }
  } catch {
    // offline/error — the local cache already has last-known-good summaries
  }
  return threadSummaries(store);
}

/** One thread's messages, merged with whatever the cloud has (so a message
 *  sent from web shows up here too). Falls back to the local cache alone when
 *  offline/erroring — reading a thread never requires a connection. */
export async function loadThreadMessages(uid: string, id: string): Promise<ChatMsg[]> {
  await ensureMigrated(uid);
  let store = await readStore(uid);
  const localMessages = getThread(store, id)?.messages ?? [];
  try {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id,role,content,meta,created_at")
      .eq("thread_id", id)
      .order("created_at", { ascending: true })
      .limit(MAX_MESSAGES_PER_THREAD);
    if (!error && data) {
      const cloudMessages = data.flatMap((row) => {
        const msg = chatMsgFromCloudRow(row);
        return msg ? [msg] : [];
      });
      const merged = mergeMessages(localMessages, cloudMessages);
      store = setThreadMessages(store, id, merged, new Date().toISOString());
      await writeStore(uid, store);
      return merged;
    }
  } catch {
    // offline/error — the local cache still reads fine
  }
  return localMessages;
}

/** Upsert a thread's messages (creates the thread on first save), write-
 *  through to the cloud in the background. Assigns ids to any message that
 *  doesn't have one yet (always true for new messages built by the Chat
 *  screen — see chat.tsx). */
export async function saveThreadMessages(uid: string, id: string, messages: ChatMsg[]): Promise<void> {
  const withIds = ensureMessageIds(messages, newMessageId);
  const before = await readStore(uid);
  const previousMessages = getThread(before, id)?.messages ?? [];
  const after = upsertThread(before, id, withIds, new Date().toISOString());
  await writeStore(uid, after);
  const thread = getThread(after, id);
  if (thread) void syncThreadToCloud(uid, thread, newMessagesSince(thread.messages, previousMessages));
}

export async function deleteThread(uid: string, id: string): Promise<void> {
  await writeStore(uid, removeThread(await readStore(uid), id));
  void withOneRetry(() => supabase.from("chat_threads").delete().eq("id", id).eq("user_id", uid));
}

/** Whether a thread is currently pinned (drives the "…" menu's Pin/Unpin label). */
export async function isThreadPinned(uid: string, id: string): Promise<boolean> {
  return getThread(await readStore(uid), id)?.pinned === true;
}

/** Pin (or unpin) a thread so it sorts above the rest in the sidebar. */
export async function pinThread(uid: string, id: string, pinned: boolean): Promise<void> {
  await writeStore(uid, setThreadPinned(await readStore(uid), id, pinned));
  void withOneRetry(() =>
    supabase.from("chat_threads").update({ pinned, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", uid),
  );
}
