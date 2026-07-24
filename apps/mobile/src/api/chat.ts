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
  buildAttachmentContext,
  buildWireMessages,
  chatErrorKind,
  chatErrorMessage,
  forcedResearchDecision,
  formatWebSearchContext,
  type AttachedLibraryDoc,
  type BudgetResetKind,
  type ChatErrorKind,
  type ChatMsg,
  type ChatOutput,
  type ChatSource,
  type WireMsg,
} from "@/lib/chat-thread";
import { classifyChatRequest, type ChatRouteDecision } from "@/lib/chat-routing";
import { applyChatEffort, DEFAULT_CHAT_EFFORT, type ChatEffort } from "@/lib/chat-effort";
import {
  buildLiveNotesMessages,
  FINAL_NOTES_MAX_KEPT,
  FINAL_NOTES_MAX_WINDOWS,
  liveNotesText,
  mergeLiveNotes,
  parseLiveNotes,
  planFinalNotesWindows,
  shouldReplaceNotes,
} from "@/lib/live-notes";
import { mergeOutputsMeta, type RecordingDraft } from "@/lib/recording";
import { readCompletionStream, type CompletionDeltaHandler } from "@/lib/chat-stream";
import type { ThinkingPhase } from "@/lib/thinking-phase";
import {
  chatMsgFromCloudRow,
  deriveMessageId,
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
  outputsFromMeta,
  parseThreadStore,
  remapThreadId,
  removeThread,
  renameThreadTitle,
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
  onReasoning?: CompletionDeltaHandler,
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
    const text = await readCompletionStream(res.body, onDelta, onReasoning);
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

export interface SendChatOptions {
  onDelta?: CompletionDeltaHandler;
  /** Reports what this turn is ACTUALLY doing, so the screen can show a
   *  thinking line instead of anonymous dots. Every phase corresponds to a
   *  real step below — no phase is emitted for work that isn't happening. */
  onPhase?: (phase: ThinkingPhase) => void;
  /** The model's own working-out as it streams, for the live thinking preview.
   *  Fires many times a second on a deep turn, so the caller is expected to
   *  buffer rather than render every call. NEVER fires on an Instant turn (it
   *  runs with thinking disabled) — an empty preview is a normal outcome, not a
   *  failure, and the phase line covers it. */
  onReasoning?: CompletionDeltaHandler;
  /** Set when the composer's "Deep research" toggle was on for this turn —
   *  forces forcedResearchDecision() instead of classifyChatRequest's
   *  text-based inference. See that function's doc for why. */
  forceResearch?: boolean;
  /** A Library document attached via the composer's "+" menu for this turn —
   *  folded into the wire-only prompt (buildAttachmentContext) and NEVER
   *  passed back out; the caller is responsible for what (if anything) it
   *  records into the persisted ChatMsg it builds for its own history (see
   *  chat.tsx's send(), which uses withAttachmentNote for that). */
  attachedDoc?: AttachedLibraryDoc;
  /** The composer "+" menu's Instant/Medium/High choice for this turn. An
   *  explicit pick BEATS the route's own guess (see lib/chat-effort.ts);
   *  omitted means Medium, which is the classifier's untouched behaviour. */
  effort?: ChatEffort;
}

/** One routed completion turn for the signed-in user `uid`: classifies the
 *  request (model + whether it needs live search) — or, when the composer's
 *  Deep research toggle forced it, always research — optionally folds in an
 *  attached Library document's text, grounds with a nemesis-search call when
 *  the route calls for it, then streams the reply. `options.onDelta` is
 *  called with each chunk as it arrives so the screen can render into the
 *  assistant bubble live. Never throws. */
export async function sendChat(
  uid: string,
  history: ChatMsg[],
  userText: string,
  options: SendChatOptions = {},
): Promise<ChatReply> {
  const { attachedDoc, effort = DEFAULT_CHAT_EFFORT, forceResearch, onDelta, onPhase, onReasoning } = options;
  onPhase?.({ kind: "routing" });
  // Route first (what KIND of question is this), then let the student's own
  // dial override how hard to think about it — never the other way round.
  const decision = applyChatEffort(forceResearch ? forcedResearchDecision() : classifyChatRequest(userText), effort);
  const attachmentContext = attachedDoc ? buildAttachmentContext(attachedDoc) : "";
  let groundedText = attachmentContext ? `${userText}\n\n${attachmentContext}` : userText;
  let sources: ChatSource[] = [];
  if (decision.searchWeb) {
    const query = decision.route === "current" ? withFreshDateAnchor(userText) : userText;
    // The phase echoes the student's OWN words, not `query` — the "current"
    // route staples a freshness date onto the wire query, and showing that
    // back would read like the app invented part of the question.
    onPhase?.({ kind: "searching", query: userText });
    const result = await searchWebContext(uid, query);
    sources = result.sources;
    onPhase?.({ kind: "reading", sources: sources.length });
    groundedText = result.context
      ? `${groundedText}\n\n${result.context}`
      : `${groundedText}\n\nLive search was requested but returned no verifiable sources. Do not guess a current result; say clearly that it could not be verified.`;
  }
  onPhase?.({ kind: "thinking", deep: decision.model === "deepseek-reasoner" });
  // The preview's job ends the moment real words appear, so the first delta
  // flips it to "writing" and the screen drops the line.
  let announcedWriting = false;
  const relayDelta: CompletionDeltaHandler | undefined =
    onDelta || onPhase
      ? (delta, accumulated) => {
          if (!announcedWriting) {
            announcedWriting = true;
            onPhase?.({ kind: "writing" });
          }
          onDelta?.(delta, accumulated);
        }
      : undefined;
  const reply = await postChatCompletion(uid, buildWireMessages(history, groundedText, decision), decision, relayDelta, onReasoning);
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
// Thread ids are stable client-generated uuids (see newThreadId above);
// message ids are DERIVED deterministically from (threadId, role, at,
// content) — see deriveMessageId in lib/chat-threads.ts — rather than
// randomly minted, so re-deriving one for the same logical message (e.g. a
// save that re-runs before the screen's own object ever learns its id)
// converges on the same id instead of minting a new one. Combined with
// insert-with-conflict-ignore, that's what makes "fire-and-forget with one
// retry" safe — a dropped or repeated write simply gets re-attempted (in
// full, if needed) the next time this thread is saved, with no risk of
// duplicating a row.

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
 *  60,000-char check constraint; `meta.sources`/`meta.outputs` use the SAME
 *  field shapes as web's SessionSource/SessionOutput, so a thread written from
 *  the phone reads back identically on web with no translation layer. The
 *  phone Chat surface never constructs a message with `.outputs` itself today
 *  (no recording composer, no tool executor) — this only matters for keeping
 *  a message's outputs intact if some future local write path ever sets them;
 *  a message already synced from web keeps its outputs regardless (chat_messages
 *  has no UPDATE grant, so an existing row is never overwritten — see
 *  syncThreadToCloud's ignoreDuplicates upsert below). */
function cloudMessageRow(uid: string, threadId: string, message: ChatMsg & { id: string }) {
  const meta = message.sources?.length || message.outputs?.length
    ? { ...(message.sources?.length ? { sources: message.sources } : {}), ...(message.outputs?.length ? { outputs: message.outputs } : {}) }
    : null;
  return {
    content: message.content.slice(0, 60_000),
    created_at: message.at,
    id: message.id,
    meta,
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
  store = {
    threads: store.threads.map((thread) => ({
      ...thread,
      messages: ensureMessageIds(thread.messages, (message) => deriveMessageId(thread.id, message)),
    })),
    v: 2,
  };
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

/** Whether the on-device cache already has ANY record of this thread id — set the
 *  moment listThreads first merges a thread's metadata in, well before its row is
 *  tappable in the drawer. A local-only (no network) read, so chat.tsx can use it
 *  to tell an existing thread apart from a just-minted id (e.g. AppDrawer's "New
 *  chat" — see newThreadId) without waiting on a round trip: a fresh id can never
 *  have a cache entry yet, so there is nothing to wait for before landing on the
 *  empty state. */
export async function hasCachedThread(uid: string, id: string): Promise<boolean> {
  const store = await readStore(uid);
  return getThread(store, id) !== null;
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
  // deriveMessageId (not a random newMessageId()) so that calling this twice
  // for the SAME logical still-id-less message — chat.tsx sends once on the
  // user turn, again once the reply lands, both times off the same object —
  // converges on the same id instead of double-inserting it. See
  // deriveMessageId's doc in lib/chat-threads.ts.
  const withIds = ensureMessageIds(messages, (message) => deriveMessageId(id, message));
  const before = await readStore(uid);
  const previousMessages = getThread(before, id)?.messages ?? [];
  const after = upsertThread(before, id, withIds, new Date().toISOString());
  await writeStore(uid, after);
  const thread = getThread(after, id);
  if (thread) void syncThreadToCloud(uid, thread, newMessagesSince(thread.messages, previousMessages));
}

export async function deleteThread(uid: string, id: string): Promise<void> {
  await writeStore(uid, removeThread(await readStore(uid), id));
  // Awaited (not fire-and-forget) so a caller can know the cloud write finished
  // before it refreshes a thread list — otherwise a refresh landing first would
  // re-merge the still-present cloud row (drawer revert bug). Callers that don't
  // care still `void` it, unaffected.
  await withOneRetry(() => supabase.from("chat_threads").delete().eq("id", id).eq("user_id", uid));
}

/** Whether a thread is currently pinned (drives the "…" menu's Pin/Unpin label). */
export async function isThreadPinned(uid: string, id: string): Promise<boolean> {
  return getThread(await readStore(uid), id)?.pinned === true;
}

/** Pin (or unpin) a thread so it sorts above the rest in the sidebar. */
export async function pinThread(uid: string, id: string, pinned: boolean): Promise<void> {
  await writeStore(uid, setThreadPinned(await readStore(uid), id, pinned));
  // Awaited so the drawer's refresh-guard can hold until it lands (see deleteThread).
  await withOneRetry(() =>
    supabase.from("chat_threads").update({ pinned, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", uid),
  );
}

/** Rename a thread (owner 2026-07-23 sidebar long-press menu). Writes the new
 *  title to the local cache, then to the cloud `chat_threads.title` — the same
 *  column web reads, so the rename shows up there too. upsertThread now
 *  preserves a set title, so a following message no longer reverts it. Blank
 *  title / unknown id is a no-op. Best-effort cloud write, same posture as pin. */
export async function renameThread(uid: string, id: string, title: string): Promise<void> {
  const clean = title.trim().slice(0, 80);
  if (!clean) return;
  await writeStore(uid, renameThreadTitle(await readStore(uid), id, clean));
  // Awaited so the drawer's refresh-guard can hold until it lands (see deleteThread).
  await withOneRetry(() => supabase.from("chat_threads").update({ title: clean }).eq("id", id).eq("user_id", uid));
}

/** Session-level deliverables (e.g. recordings) attached to a thread's own
 *  `chat_threads.meta.outputs` — written by web's Record-mode composer (see
 *  apps/web/lib/workspace/sessions-cloud.ts's threadRow) and by the phone's
 *  own Record screen (saveRecordingArtifact below); the chip row at the top
 *  of an open thread (chat.tsx) is this call's only consumer.
 *  Best-effort/offline-safe, same posture as isThreadPinned — a fetch failure
 *  just means the chip row stays empty until the thread is reopened online. */
export async function loadThreadOutputs(uid: string, id: string): Promise<ChatOutput[]> {
  try {
    const { data, error } = await supabase.from("chat_threads").select("meta").eq("id", id).eq("user_id", uid).maybeSingle();
    if (error || !data) return [];
    return outputsFromMeta(data.meta);
  } catch {
    return [];
  }
}

/** Save a phone recording exactly the way web's Record mode does: a canonical
 *  row in `chat_recording_artifacts` (web's right-rail source) plus a mirror
 *  entry in the thread's `chat_threads.meta.outputs` (the chip row BOTH this
 *  chat surface and web render — see loadThreadOutputs above). Recording into
 *  a thread that never reached the cloud (no message sent yet) creates the
 *  thread row so the chips have somewhere to live. The artifact insert is the
 *  load-bearing write and throws on failure; the meta mirror is best-effort —
 *  if it fails, the recording still exists server-side and web's rail shows
 *  it, the chip just waits for the next successful meta write. */
export async function saveRecordingArtifact(uid: string, threadId: string, draft: RecordingDraft): Promise<ChatOutput> {
  const id = generateUuidV4();
  const title = draft.title.slice(0, 200);
  const entry: ChatOutput = {
    id,
    kind: "recording",
    title,
    transcript: draft.transcript,
    ...(draft.notes ? { notes: draft.notes } : {}),
    durationSeconds: draft.durationSeconds,
    createdAt: draft.createdAt,
  };
  const { error } = await supabase.from("chat_recording_artifacts").insert({
    id,
    user_id: uid,
    surface: "sessions",
    context_id: threadId,
    title,
    transcript: draft.transcript,
    notes: draft.notes,
    duration_seconds: draft.durationSeconds,
    created_at: draft.createdAt,
  });
  if (error) throw new Error(error.message);
  try {
    const { data } = await supabase.from("chat_threads").select("meta").eq("id", threadId).eq("user_id", uid).maybeSingle();
    if (data) {
      await supabase
        .from("chat_threads")
        .update({ meta: mergeOutputsMeta(data.meta, entry), updated_at: draft.createdAt })
        .eq("id", threadId)
        .eq("user_id", uid);
    } else {
      await supabase.from("chat_threads").insert({
        id: threadId,
        user_id: uid,
        title,
        pinned: false,
        meta: { outputs: [entry] },
        created_at: draft.createdAt,
        updated_at: draft.createdAt,
      });
    }
  } catch {
    // best-effort mirror — see the doc comment
  }
  return entry;
}

// Live notes ride the cheap conversational slot — never search, never the
// reasoner. Same decision web's recorder uses (live-audio-insights.ts).
const LIVE_NOTES_DECISION: ChatRouteDecision = { model: "deepseek-chat", route: "conversation", searchWeb: false };

/** One notes pass for the Record screen: the growing transcript (plus what's
 *  already on the board) in, up to six fresh bullets out. Metered like any
 *  chat turn through the same valve.
 *
 *  null means the CALL FAILED (offline, out of tokens, unparseable reply) —
 *  the recorder just tries again next interval. An empty array means the call
 *  succeeded and the model had nothing new to add, which is an ordinary
 *  outcome over a quiet stretch. The rebuild below depends on telling those
 *  two apart: a failure means it never saw that slice of the lecture, an empty
 *  pass means it saw it and there was nothing worth writing down. */
export async function requestLiveNotes(uid: string, transcript: string, previousNotes: string[]): Promise<string[] | null> {
  const reply = await postChatCompletion(uid, buildLiveNotesMessages(transcript, previousNotes), LIVE_NOTES_DECISION);
  if (!reply.text) return null;
  return parseLiveNotes(reply.text);
}

const APP_API_BASE = "https://app.enternemesis.com";

/** Rewrite one recording's chip entry on the thread (same merge the save path
 *  uses) — how the enhance pass below publishes its polish state and, at the
 *  end, the sharper transcript. Best-effort: the artifact row stays the
 *  durable source of truth. */
async function writeChipEntry(uid: string, threadId: string, entry: ChatOutput): Promise<void> {
  try {
    const { data } = await supabase.from("chat_threads").select("meta").eq("id", threadId).eq("user_id", uid).maybeSingle();
    if (!data) return;
    await supabase
      .from("chat_threads")
      .update({ meta: mergeOutputsMeta(data.meta, entry) })
      .eq("id", threadId)
      .eq("user_id", uid);
  } catch {
    // best-effort — a missed state write only affects the indicator
  }
}

/** Rebuild a finished recording's notes from the ENHANCED transcript (owner
 *  2026-07-23: "we need live notes to come from enhanced audio for better
 *  notes"). During the lecture the live pass could only summarize the phone's
 *  on-device text; once the server returns the sharper transcript, those
 *  bullets are the best notes we could write from the worse words. Walks the
 *  finished transcript in order — each window told what's already on the board
 *  and not to repeat it, the same contract the live pass runs on — and returns
 *  the joined result, or null when nothing came back so the existing notes
 *  stand. Never throws: requestLiveNotes already resolves null on failure, and
 *  a window that comes back empty just contributes nothing. */
async function rebuildNotesFromTranscript(
  uid: string,
  transcript: string,
  existingNotes: string | undefined,
): Promise<string | null> {
  const windows = planFinalNotesWindows(transcript);
  if (windows.length === 0) return null;
  if (windows.length === FINAL_NOTES_MAX_WINDOWS) {
    console.warn(`notes rebuild hit the ${FINAL_NOTES_MAX_WINDOWS}-window ceiling; the tail may not be summarized`);
  }
  let notes: string[] = [];
  for (const window of windows) {
    const fresh = await requestLiveNotes(uid, window, notes);
    // ALL OR NOTHING. A failed window means this pass never saw that slice of
    // the lecture, so finishing would hand back bullets covering only part of
    // it — strictly worse than the live pass's notes, which at least span the
    // whole recording. Bail and let the existing notes stand. (An empty-but-
    // successful window is fine and contributes nothing; see requestLiveNotes.)
    if (!fresh) return null;
    notes = mergeLiveNotes(notes, fresh, FINAL_NOTES_MAX_KEPT);
  }
  return shouldReplaceNotes(notes, existingNotes) ? liveNotesText(notes) : null;
}

/** Background "enhance transcript" pass (owner 2026-07-21): upload the kept
 *  on-device audio, run it through the server's batch transcription (top-
 *  accuracy engine, metered against the plan's monthly enhance allowance),
 *  and swap the sharper transcript into the saved artifact + the thread's
 *  chip entry. Fire-and-forget from the Record screen — any failure leaves
 *  the on-device transcript standing, so this can only improve things. The
 *  local audio files are deleted either way; the uploaded copy is deleted by
 *  the server once the transcript is back. */
export async function enhanceRecordingArtifact(
  uid: string,
  threadId: string,
  artifact: ChatOutput,
  audioUris: string[],
  elapsedSeconds: number,
): Promise<void> {
  const uris = audioUris.slice(0, 8);
  if (uris.length === 0) return;
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session || session.user.id !== uid) return;
    const token = session.access_token;
    // Flag the chip "polishing" for the duration of the pass; every exit from
    // this function rewrites the entry with the flag resolved (done) or
    // dropped (failed/empty), and lib/recording.ts's polishState treats a
    // stray pending flag as stale after 45 minutes.
    await writeChipEntry(uid, threadId, { ...artifact, polish: "pending" });
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
    const storageBase = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/recordings`;
    const perFileSeconds = Math.max(15, Math.round(Math.max(elapsedSeconds, 15) / uris.length));

    const pieces: string[] = [];
    for (const uri of uris) {
      const path = `${uid}/${generateUuidV4()}.wav`;
      // uploadAsync streams straight from disk — a 100MB lecture never has to
      // fit in JS memory the way a base64 round-trip would force.
      const upload = await FileSystem.uploadAsync(`${storageBase}/${path}`, uri, {
        headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "audio/wav" },
        httpMethod: "POST",
      });
      if (upload.status !== 200) throw new Error(`audio upload failed (${upload.status})`);
      const submitRes = await fetch(`${APP_API_BASE}/api/transcription/submit`, {
        body: JSON.stringify({ seconds: perFileSeconds, storagePath: path }),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        method: "POST",
      });
      const submitBody = (await submitRes.json().catch(() => null)) as { jobId?: string; error?: string } | null;
      if (!submitRes.ok || !submitBody?.jobId) throw new Error(submitBody?.error ?? `submit failed (${submitRes.status})`);
      const text = await pollTranscription(token, submitBody.jobId);
      if (text) pieces.push(text.trim());
    }
    const enhanced = pieces.filter(Boolean).join("\n\n").trim();
    if (!enhanced) {
      await writeChipEntry(uid, threadId, { ...artifact });
      return;
    }

    await supabase
      .from("chat_recording_artifacts")
      .update({ transcript: enhanced })
      .eq("id", artifact.id)
      .eq("user_id", uid);
    const polished: ChatOutput = { ...artifact, polish: "done", transcript: enhanced };
    await writeChipEntry(uid, threadId, polished);

    // The recording is fully in the cloud now, so free the phone's copy before
    // the rebuild rather than after it — a lecture is 100MB+ and the rebuild
    // below can run for minutes. The finally block still sweeps, idempotently.
    await deleteLocalAudio(uris);

    // Sharper transcript, sharper notes. Deliberately AFTER the transcript is
    // durable and inside its own try: this costs several model calls and can
    // fail on its own (offline, out of tokens), and losing better notes must
    // never cost the better transcript — or reset the chip out of "done".
    try {
      const notes = await rebuildNotesFromTranscript(uid, enhanced, artifact.notes);
      if (notes) {
        const { error: notesError } = await supabase
          .from("chat_recording_artifacts")
          .update({ notes })
          .eq("id", artifact.id)
          .eq("user_id", uid);
        // The artifact row is the source of truth web's rail reads. If it did
        // not take, do NOT publish the new notes to the chip — a chip showing
        // bullets the row does not have is a divergence that never resolves.
        if (notesError) throw new Error(notesError.message);
        await writeChipEntry(uid, threadId, { ...polished, notes });
      }
    } catch (cause) {
      console.warn("notes rebuild skipped:", cause instanceof Error ? cause.message : cause);
    }
  } catch (cause) {
    console.warn("transcript enhancement skipped:", cause instanceof Error ? cause.message : cause);
    // Clear the "polishing" flag — the on-device transcript is what stands.
    await writeChipEntry(uid, threadId, { ...artifact });
  } finally {
    await deleteLocalAudio(uris);
  }
}

/** Drop the phone's copies of a recording's audio. Idempotent and never
 *  throws, so it is safe to call the moment the audio stops being needed AND
 *  again from the enhance pass's finally block. */
async function deleteLocalAudio(uris: string[]): Promise<void> {
  for (const uri of uris) {
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // best effort — a stray temp file is harmless
    }
  }
}

async function pollTranscription(token: string, jobId: string): Promise<string | null> {
  // 5s cadence for up to 20 minutes — batch jobs run ~15-30% of audio length.
  for (let attempt = 0; attempt < 240; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const res = await fetch(`${APP_API_BASE}/api/transcription/status`, {
      body: JSON.stringify({ jobId }),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await res.json().catch(() => null)) as { status?: string; transcript?: string | null; error?: string } | null;
    if (!body) continue;
    if (body.status === "done") return typeof body.transcript === "string" ? body.transcript : null;
    if (body.status === "error") throw new Error(body.error ?? "transcription failed");
  }
  throw new Error("transcription timed out");
}
