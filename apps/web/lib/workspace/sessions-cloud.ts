// Cloud data layer for sessions-store.ts (cloud-first phone spec §4). Pure
// functions only — no module-level mutable state and no React; the store
// keeps ownership of `state`/`cloudUserId` and calls into this file for every
// network operation. Tables per spec §1 (supabase/migrations/20260720210000_
// cloud_chat_calendar.sql): chat_threads (one row per session) + chat_messages
// (one row per message, immutable — no UPDATE grant, hence no "edit" verb
// here). RLS is owner-only, so every query still filters by user_id for
// index-friendly queries and defense in depth.
//
// Row <-> model conversion is independent from sessions-store.ts's own
// localStorage sanitizers (sanitizeMessage/sanitizeSession) on purpose: cloud
// rows are already schema-validated by Postgres, so they need less defensive
// parsing than an arbitrary localStorage blob, and keeping the two parsers
// separate avoids a circular import between the store and this module.

import { supabase } from "@/lib/supabase";
import type { SessionMessage, SessionOutput, SessionSource, WorkspaceSession } from "./sessions-store";

const MIGRATION_FLAG_PREFIX = "nemesis.web.sessions.cloudmigrated.v1:";
const LEGACY_CLAIMED_FLAG = "nemesis.web.sessions.legacyclaimed.v1";
const THREAD_COLUMNS = "id,title,pinned,meta,created_at,updated_at";
const MESSAGE_COLUMNS = "id,thread_id,role,content,meta,created_at";

// ── One-time migration flag (per uid, localStorage) ─────────────────────────
// Guards uploading THIS uid's own (correctly per-uid-scoped) local cache to
// their cloud account exactly once. Separate from the legacy claim below,
// which is a one-time GLOBAL event, not a per-uid one.

export function hasMigratedSessions(uid: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MIGRATION_FLAG_PREFIX + uid) === "1";
  } catch {
    return false;
  }
}

export function markSessionsMigrated(uid: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MIGRATION_FLAG_PREFIX + uid, "1");
  } catch {
    // Quota/private mode — migration simply retries on the next sync trigger.
  }
}

// ── Legacy-cache claim flag (GLOBAL — no uid suffix) ────────────────────────
// Before the cache key was scoped per-uid, every account on a shared browser
// read/wrote the same unscoped key. A per-uid flag can't close that leak
// (every new uid would still see the old blob); only a single global flag can
// — the first signed-in account to hydrate after this ships claims whatever
// is in the old key, then the store deletes that key outright (see
// hydrateForUser in sessions-store.ts), so no later account can ever read it.

export function hasClaimedLegacyCache(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LEGACY_CLAIMED_FLAG) === "1";
  } catch {
    return false;
  }
}

export function markLegacyCacheClaimed(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LEGACY_CLAIMED_FLAG, "1");
  } catch {
    // Quota/private mode — worst case the claim is re-attempted next load,
    // which stays safe: the legacy key is either already gone (no-op) or
    // re-claimed once more (upsert-idempotent on the cloud side).
  }
}

// ── Fire-and-forget with one retry (write-through mutations) ────────────────

/** Runs `run` in the background; on failure, tries exactly once more, then
 * gives up silently. Local state is already correct either way — a write
 * that never lands just means the next cloud refresh won't see it yet. */
export function cloudFireAndForget(run: () => Promise<void>): void {
  void (async () => {
    try {
      await run();
    } catch {
      try {
        await run();
      } catch {
        // Failed twice — local stays authoritative; a later refresh reconciles.
      }
    }
  })();
}

// ── Row <-> model conversion ─────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toSessionSource(raw: unknown): SessionSource | null {
  if (!isRecord(raw)) return null;
  const { title, url, description } = raw;
  return typeof url === "string" && typeof title === "string"
    ? { title, url, description: typeof description === "string" ? description : "" }
    : null;
}

function toSessionOutput(raw: unknown): SessionOutput | null {
  if (!isRecord(raw)) return null;
  const { id, title, kind, url, transcript, notes, durationSeconds, createdAt } = raw;
  const kinds = new Set(["flashcards", "slides", "test", "mindmap", "note", "event", "report", "recording", "other"]);
  if (typeof id !== "string" || typeof title !== "string" || typeof kind !== "string" || !kinds.has(kind)) return null;
  return {
    id,
    title,
    kind: kind as SessionOutput["kind"],
    ...(typeof url === "string" ? { url } : {}),
    ...(typeof transcript === "string" ? { transcript } : {}),
    ...(typeof notes === "string" ? { notes } : {}),
    ...(typeof durationSeconds === "number" && Number.isFinite(durationSeconds) ? { durationSeconds } : {}),
    ...(typeof createdAt === "string" ? { createdAt } : {}),
  };
}

function rowToMessage(row: Record<string, unknown>): SessionMessage | null {
  const { id, role, content, created_at: createdAt, meta } = row;
  if (typeof id !== "string" || typeof content !== "string") return null;
  if (role !== "user" && role !== "assistant") return null; // 'system' rows never round-trip to the UI
  const sources = isRecord(meta) && Array.isArray(meta.sources)
    ? meta.sources.flatMap((raw) => { const s = toSessionSource(raw); return s ? [s] : []; })
    : [];
  const outputs = isRecord(meta) && Array.isArray(meta.outputs)
    ? meta.outputs.flatMap((raw) => { const o = toSessionOutput(raw); return o ? [o] : []; })
    : [];
  return {
    id,
    role,
    content,
    at: typeof createdAt === "string" ? createdAt : new Date(0).toISOString(),
    ...(sources.length ? { sources } : {}),
    ...(outputs.length ? { outputs } : {}),
  };
}

function rowToSession(row: Record<string, unknown>, messages: SessionMessage[]): WorkspaceSession | null {
  const { id, title, pinned, meta, created_at: createdAt, updated_at: updatedAt } = row;
  if (typeof id !== "string") return null;
  const outputs = isRecord(meta) && Array.isArray(meta.outputs)
    ? meta.outputs.flatMap((raw) => { const o = toSessionOutput(raw); return o ? [o] : []; })
    : [];
  return {
    id,
    title: typeof title === "string" && title.length > 0 ? title : "New chat",
    createdAt: typeof createdAt === "string" ? createdAt : new Date(0).toISOString(),
    updatedAt: typeof updatedAt === "string" ? updatedAt : new Date(0).toISOString(),
    ...(pinned === true ? { pinned: true } : {}),
    ...(outputs.length ? { outputs } : {}),
    messages,
  };
}

function threadRow(uid: string, session: WorkspaceSession) {
  return {
    id: session.id,
    user_id: uid,
    // Clamped to the column's `char_length(title) <= 200` check constraint —
    // titles here are normally short (titleFromPrompt caps at ~55), but a
    // manual rename (chat-header.tsx) has no client-side cap, and an
    // oversized value would otherwise fail the upsert silently (fire-and-
    // forget) and never reach the other device.
    title: session.title.slice(0, 200),
    pinned: Boolean(session.pinned),
    // Session-level artifacts (recordings etc.). Oversized meta fails the
    // row's size check server-side; the caller is fire-and-forget, so the
    // artifact simply stays local-only (applyCloudRefresh preserves it).
    meta: session.outputs?.length ? { outputs: session.outputs } : null,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
  };
}

function messageRow(uid: string, threadId: string, message: SessionMessage) {
  const meta = message.sources?.length || message.outputs?.length
    ? { ...(message.sources?.length ? { sources: message.sources } : {}), ...(message.outputs?.length ? { outputs: message.outputs } : {}) }
    : null;
  return {
    id: message.id,
    thread_id: threadId,
    user_id: uid,
    role: message.role,
    // Clamped to the column's `char_length(content) <= 60000` check
    // constraint, same as mobile's cloudMessageRow (api/chat.ts) — without
    // this an oversized message fails the insert outright (permission/
    // constraint errors look identical to the caller: a swallowed
    // fire-and-forget failure) and never reaches the other device.
    content: message.content.slice(0, 60_000),
    meta,
    created_at: message.at,
  };
}

// ── Write-through mutations (called fire-and-forget from the store) ────────

/** Upsert the thread row — used standalone for rename/pin-independent bumps
 * and as the first half of appendMessageCloud (creates the thread on the
 * session's first message; a harmless metadata refresh on every one after). */
export async function upsertThreadCloud(uid: string, session: WorkspaceSession): Promise<void> {
  const { error } = await supabase.from("chat_threads").upsert(threadRow(uid, session), { onConflict: "id" });
  if (error) throw new Error(error.message);
}

/** Thread upsert + message upsert, in order (the message row has an FK to the
 * thread row, so the thread must exist first). Used for every appended
 * message — user turns and the assistant's final (non-streaming) content.
 *
 * `ignoreDuplicates: true` is LOAD-BEARING, not an optimization: PostgREST's
 * default upsert (ignoreDuplicates unset/false) compiles to
 * `INSERT ... ON CONFLICT (id) DO UPDATE`, and Postgres requires UPDATE
 * privilege on the target columns to plan that statement AT ALL — even for
 * rows that never actually conflict. chat_messages intentionally has no
 * UPDATE grant (immutable rows — see the migration), so every write here
 * used to fail with a permission error on every single call, silently
 * swallowed by cloudFireAndForget's try/catch (confirmed against prod: web
 * threads had titles but zero rows in chat_messages). Message ids are always
 * fresh (never reused), so this only ever needs `ON CONFLICT DO NOTHING` —
 * matching mobile's cloudMessageRow upsert (api/chat.ts), which already uses
 * ignoreDuplicates and works. */
export async function appendMessageCloud(uid: string, session: WorkspaceSession, message: SessionMessage): Promise<void> {
  if (!message.id) return; // defensive — the store always assigns one before calling
  await upsertThreadCloud(uid, session);
  const { error } = await supabase.from("chat_messages").upsert(messageRow(uid, session.id, message), { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

export async function renameThreadCloud(uid: string, id: string, title: string, updatedAt: string): Promise<void> {
  const { error } = await supabase.from("chat_threads").update({ title: title.slice(0, 200), updated_at: updatedAt }).eq("id", id).eq("user_id", uid);
  if (error) throw new Error(error.message);
}

export async function togglePinThreadCloud(uid: string, id: string, pinned: boolean): Promise<void> {
  const { error } = await supabase.from("chat_threads").update({ pinned }).eq("id", id).eq("user_id", uid);
  if (error) throw new Error(error.message);
}

/** Cascades to the thread's messages server-side (chat_messages.thread_id
 * has ON DELETE CASCADE). */
export async function deleteThreadCloud(uid: string, id: string): Promise<void> {
  const { error } = await supabase.from("chat_threads").delete().eq("id", id).eq("user_id", uid);
  if (error) throw new Error(error.message);
}

// ── One-time migration upload ────────────────────────────────────────────────

async function uploadOneSessionToCloud(uid: string, session: WorkspaceSession): Promise<void> {
  await upsertThreadCloud(uid, session);
  const rows = session.messages.flatMap((message) => (message.id ? [messageRow(uid, session.id, message)] : []));
  if (rows.length === 0) return;
  // Same no-UPDATE-grant reasoning as appendMessageCloud above — without
  // ignoreDuplicates this throws on every migration, which — because
  // uploadLocalSessionsToCloud runs every session in parallel via
  // Promise.all — rejects the whole migration before markSessionsMigrated()
  // ever runs, so it silently retries in full on every later tab-focus.
  const { error } = await supabase.from("chat_messages").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

/** Uploads every local session (threads + messages, preserving ids and
 * timestamps) once. Sessions upload in parallel; each is internally
 * sequenced (thread row before its messages) to satisfy the FK. Idempotent
 * via upsert, so a failed/retried migration never double-writes. */
export async function uploadLocalSessionsToCloud(uid: string, sessions: WorkspaceSession[]): Promise<void> {
  if (sessions.length === 0) return;
  await Promise.all(sessions.map((session) => uploadOneSessionToCloud(uid, session)));
}

// ── Full refresh (initial load + visibilitychange→visible) ─────────────────

/** Fetches every thread + message the user owns and reassembles them into
 * WorkspaceSession shape. Unbounded (matches study-cloud-store's decks/cards
 * fetch) — pagination is a follow-up if history grows large enough to matter. */
export async function fetchCloudSessions(uid: string): Promise<WorkspaceSession[]> {
  const [threadsResult, messagesResult] = await Promise.all([
    supabase.from("chat_threads").select(THREAD_COLUMNS).eq("user_id", uid).order("updated_at", { ascending: false }),
    supabase.from("chat_messages").select(MESSAGE_COLUMNS).eq("user_id", uid).order("created_at", { ascending: true }),
  ]);
  if (threadsResult.error) throw new Error(threadsResult.error.message);
  if (messagesResult.error) throw new Error(messagesResult.error.message);

  const messagesByThread = new Map<string, SessionMessage[]>();
  for (const row of messagesResult.data ?? []) {
    if (!isRecord(row) || typeof row.thread_id !== "string") continue;
    const message = rowToMessage(row);
    if (!message) continue;
    const list = messagesByThread.get(row.thread_id);
    if (list) list.push(message);
    else messagesByThread.set(row.thread_id, [message]);
  }

  return (threadsResult.data ?? []).flatMap((row) => {
    if (!isRecord(row) || typeof row.id !== "string") return [];
    const session = rowToSession(row, messagesByThread.get(row.id) ?? []);
    return session ? [session] : [];
  });
}
