"use client";

// Local sessions store for the desktop-parity workspace — localStorage-backed,
// single-tab-authoritative, with a tiny external-store subscription so every
// consumer (sidebar, sessions page, dev preview) re-renders from one source.
//
// Storage contract (versioned): localStorage["nemesis.web.sessions.v1:<uid>"] =
//   { v: 1, sessions: [{ id, title, createdAt, updatedAt, pinned?, messages: [{ role, content, at }] }] }
//
// Phase C (sessions page) extends behavior ONLY through this API surface.
//
// Cloud-first phone spec §4: the localStorage cache above stays the
// hydration source and the offline/signed-out fallback. When a real account
// is signed in (not previewMode), every mutation also write-throughs to
// `chat_threads`/`chat_messages` (fire-and-forget, one retry — see
// sessions-cloud.ts), and a background refresh (initial load + tab-focus)
// replaces local state with the cloud copy except for whichever session is
// currently open or mid-turn. previewMode and signed-out remain pure-local,
// exactly as before.
//
// Cache key is scoped PER-UID (nemesis.web.sessions.v1:<uid>), never a single
// shared key — a shared browser where account A signs out and account B
// signs in must never have B's one-time migration upload A's residual local
// sessions into B's cloud account. This does mean hydration can no longer
// happen before the signed-in uid is known (see hydrateForUser, called from
// setCloudUser once useSessions() resolves auth) — the first render shows the
// empty state for one tick, then the real per-uid cache paints. The OLD
// unscoped key (nemesis.web.sessions.v1, no suffix) is handled as a single
// GLOBAL one-time claim: whichever account hydrates first after this ships
// absorbs it into their own cache/cloud, then the key is deleted outright so
// no later account on the same browser can ever read it.

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";

import {
  appendMessageCloud,
  cloudFireAndForget,
  deleteThreadCloud,
  fetchCloudSessions,
  hasClaimedLegacyCache,
  hasMigratedSessions,
  markLegacyCacheClaimed,
  markSessionsMigrated,
  renameThreadCloud,
  togglePinThreadCloud,
  uploadLocalSessionsToCloud,
} from "./sessions-cloud";

export interface SessionSource {
  title: string;
  url: string;
  description: string;
}

export interface SessionOutput {
  id: string;
  kind: "flashcards" | "slides" | "test" | "report" | "recording" | "other";
  title: string;
  url?: string;
  transcript?: string;
  notes?: string;
  durationSeconds?: number;
  createdAt?: string;
}

export interface SessionMessage {
  /** Client-generated UUID — the chat_messages cloud row's primary key.
   *  Optional in the type for backward compatibility with anything already in
   *  localStorage or hand-built by callers (dev-preview seeds, notebooks'
   *  reuse of this type); the store backfills a fresh id wherever one is
   *  missing so every message it manages ends up with one. */
  id?: string;
  role: "user" | "assistant";
  content: string;
  /** ISO timestamp — display/persistence only. */
  at: string;
  sources?: SessionSource[];
  outputs?: SessionOutput[];
}

export interface WorkspaceSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
  messages: SessionMessage[];
  outputs?: SessionOutput[];
}

interface SessionsFile {
  v: 1;
  sessions: WorkspaceSession[];
}

/** Pre-scoping key. Read exactly once, globally (see hydrateForUser), then
 *  deleted outright — never written to again. */
const LEGACY_SESSIONS_STORAGE_KEY = "nemesis.web.sessions.v1";

function sessionsStorageKey(uid: string): string {
  return `nemesis.web.sessions.v1:${uid}`;
}

/** The key persist()/hydrateForUser() read and write right now. Falls back to
 *  the legacy unscoped key only in the (practically unreached — every real
 *  route gates on auth before this store's actions are reachable) window
 *  before setCloudUser() has ever run, rather than silently no-op'ing. */
function currentStorageKey(): string {
  return cloudUserId ? sessionsStorageKey(cloudUserId) : LEGACY_SESSIONS_STORAGE_KEY;
}

const MAX_MESSAGES_PER_SESSION = 200;

// ── Module state (one authority per tab) ────────────────────────────────────

interface StoreState {
  sessions: WorkspaceSession[];
  selectedId: string | null;
  /** Session ids with an in-flight assistant turn (drives sidebar dot/arc). */
  working: Record<string, boolean>;
}

let state: StoreState = { sessions: [], selectedId: null, working: {} };
let hydrated = false;
const listeners = new Set<() => void>();

// Preview injection: the dev-preview harness seeds sessions without touching
// localStorage (and the store stops persisting while injected).
let previewMode = false;

function emit() {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function inferSourcesFromContent(content: string): SessionSource[] {
  const sources = new Map<string, SessionSource>();
  for (const match of content.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi)) {
    const title = match[1]?.trim();
    const url = match[2]?.trim();
    if (url && !sources.has(url)) sources.set(url, { title: title || url, url, description: "" });
  }
  return Array.from(sources.values()).slice(0, 12);
}

function sanitizeOutput(rawOutput: unknown): SessionOutput | null {
  if (!rawOutput || typeof rawOutput !== "object") return null;
  const output = rawOutput as Record<string, unknown>;
  const kinds = new Set(["flashcards", "slides", "test", "report", "recording", "other"]);
  if (typeof output.id !== "string" || typeof output.title !== "string" || typeof output.kind !== "string" || !kinds.has(output.kind)) return null;
  return {
    id: output.id,
    title: output.title,
    kind: output.kind as SessionOutput["kind"],
    ...(typeof output.url === "string" ? { url: output.url } : {}),
    ...(typeof output.transcript === "string" ? { transcript: output.transcript } : {}),
    ...(typeof output.notes === "string" ? { notes: output.notes } : {}),
    ...(typeof output.durationSeconds === "number" ? { durationSeconds: output.durationSeconds } : {}),
    ...(typeof output.createdAt === "string" ? { createdAt: output.createdAt } : {}),
  };
}

function sanitizeMessage(raw: unknown): SessionMessage | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const role = m.role === "user" || m.role === "assistant" ? m.role : null;
  if (!role || typeof m.content !== "string") return null;
  const persistedSources = Array.isArray(m.sources) ? m.sources.flatMap((rawSource) => {
    if (!rawSource || typeof rawSource !== "object") return [];
    const source = rawSource as Record<string, unknown>;
    return typeof source.url === "string" && typeof source.title === "string"
      ? [{ title: source.title, url: source.url, description: typeof source.description === "string" ? source.description : "" }]
      : [];
  }).slice(0, 12) : [];
  // Compatibility for conversations created before source metadata was
  // persisted: recover Markdown citations so old searched answers also expose
  // the Sources pill after the next reload.
  const sources = persistedSources.length ? persistedSources : inferSourcesFromContent(m.content);
  const outputs = Array.isArray(m.outputs) ? m.outputs.map(sanitizeOutput).filter((output): output is SessionOutput => output !== null).slice(0, 30) : [];
  return {
    id: typeof m.id === "string" && m.id.length > 0 ? m.id : newId(),
    role,
    content: m.content,
    at: typeof m.at === "string" ? m.at : new Date(0).toISOString(),
    ...(sources.length ? { sources } : {}),
    ...(outputs.length ? { outputs } : {}),
  };
}

function sanitizeSession(raw: unknown): WorkspaceSession | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string" || s.id.length === 0) return null;
  const messages = Array.isArray(s.messages)
    ? s.messages.map(sanitizeMessage).filter((m): m is SessionMessage => m !== null)
    : [];
  const outputs = Array.isArray(s.outputs) ? s.outputs.map(sanitizeOutput).filter((output): output is SessionOutput => output !== null).slice(0, 50) : [];
  return {
    id: s.id,
    title: typeof s.title === "string" && s.title.length > 0 ? s.title : "New session",
    createdAt: typeof s.createdAt === "string" ? s.createdAt : new Date(0).toISOString(),
    updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : new Date(0).toISOString(),
    ...(s.pinned === true ? { pinned: true } : {}),
    messages,
    ...(outputs.length ? { outputs } : {}),
  };
}

function loadFromStorageKey(key: string): WorkspaceSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || (parsed as SessionsFile).v !== 1) return [];
    const sessions = (parsed as SessionsFile).sessions;
    if (!Array.isArray(sessions)) return [];
    return sessions.map(sanitizeSession).filter((s): s is WorkspaceSession => s !== null);
  } catch {
    return [];
  }
}

function persist() {
  if (previewMode || typeof window === "undefined") return;
  try {
    const file: SessionsFile = {
      v: 1,
      sessions: state.sessions.map((s) => ({ ...s, messages: s.messages.slice(-MAX_MESSAGES_PER_SESSION) })),
    };
    window.localStorage.setItem(currentStorageKey(), JSON.stringify(file));
  } catch {
    // Quota/private mode — the in-memory copy stays authoritative for the tab.
  }
}

// Real hydration is per-uid (see hydrateForUser, called from setCloudUser
// once useSessions() knows who's signed in) or via injectPreview() in the
// dev-preview harness. Neither has necessarily run the first time some path
// touches the store, so this is just a do-it-once latch, not a data load —
// there is no single key left to safely guess at reading from.
function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
}

function mergeSessionsById(base: WorkspaceSession[], extra: WorkspaceSession[]): WorkspaceSession[] {
  const seen = new Set(base.map((s) => s.id));
  return [...base, ...extra.filter((s) => !seen.has(s.id))];
}

/** Runs once per uid the moment setCloudUser() learns who's signed in: reads
 * that account's own per-uid cache, and — the FIRST time this runs for ANY
 * account on this browser, ever — also claims the old unscoped cache (if
 * anything is in it), merges it in, and deletes that legacy key outright so
 * no other account can ever read it again. Synchronous (localStorage only,
 * no network), so there's no staleness race to guard against here. */
function hydrateForUser(uid: string) {
  if (typeof window === "undefined") return;
  hydrated = true;
  const ownSessions = loadFromStorageKey(sessionsStorageKey(uid));
  if (hasClaimedLegacyCache()) {
    setState({ ...state, sessions: ownSessions });
    return;
  }
  const legacySessions = loadFromStorageKey(LEGACY_SESSIONS_STORAGE_KEY);
  try {
    window.localStorage.removeItem(LEGACY_SESSIONS_STORAGE_KEY);
  } catch {
    // Private mode — nothing further to protect once we stop reading it.
  }
  markLegacyCacheClaimed();
  setState({ ...state, sessions: mergeSessionsById(ownSessions, legacySessions) });
}

function setState(next: StoreState, persistNow = true) {
  state = next;
  if (persistNow) persist();
  emit();
}

const nowIso = () => new Date().toISOString();

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Sessions sorted newest-activity-first (the sidebar's flat recents order). */
function sortedSessions(list: WorkspaceSession[]): WorkspaceSession[] {
  return [...list].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

// ── Cloud sync (signed-in only — previewMode/no-uid stays pure local) ──────
// Module-global rather than hook state: rename/togglePin/remove/etc. are
// called directly on `sessionsStore` from event handlers outside any hook
// (chat-header.tsx, session-chat.tsx), so "which account am I" has to live at
// the same module scope those already read `state` from. useSessions() below
// (mounted persistently in the workspace shell) is the sole place that feeds
// it, via useAuth()/useWorkspacePreview().

let cloudUserId: string | null = null;
let cloudSyncInFlight = false;
let visibilityListenerAttached = false;

function ensureVisibilityListener() {
  if (visibilityListenerAttached || typeof document === "undefined") return;
  visibilityListenerAttached = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && cloudUserId) void syncCloudForUser(cloudUserId);
  });
}

/** One-time migration (if not already flagged) then a full refresh. Reused
 * for both the initial sign-in and every later visibilitychange trigger —
 * hasMigratedSessions() makes the migration step a no-op after the first
 * success. Guarded against overlap and against a mid-flight account switch. */
async function syncCloudForUser(uid: string) {
  if (cloudSyncInFlight) return;
  cloudSyncInFlight = true;
  try {
    if (!hasMigratedSessions(uid)) {
      await uploadLocalSessionsToCloud(uid, state.sessions);
      if (cloudUserId !== uid) return; // signed out / switched again mid-upload
      markSessionsMigrated(uid);
    }
    if (cloudUserId !== uid) return;
    const cloudSessions = await fetchCloudSessions(uid);
    if (cloudUserId !== uid) return;
    applyCloudRefresh(cloudSessions);
  } catch {
    // Cloud unreachable — local state stays authoritative; the next trigger retries.
  } finally {
    cloudSyncInFlight = false;
  }
}

/** Cloud-authoritative replace, except a session with an in-flight turn or
 * the one currently open — those keep their local copy so a background
 * refresh (tab-focus) can never clobber a streaming answer or a
 * not-yet-synced draft (the create() → appendMessage() window). */
function applyCloudRefresh(cloudSessions: WorkspaceSession[]) {
  const protectedIds = new Set(Object.keys(state.working));
  if (state.selectedId) protectedIds.add(state.selectedId);
  const preserved = state.sessions.filter((s) => protectedIds.has(s.id));
  const preservedIds = new Set(preserved.map((s) => s.id));
  const fromCloud = cloudSessions
    .filter((s) => !preservedIds.has(s.id))
    .map((s) => ({ ...s, messages: s.messages.slice(-MAX_MESSAGES_PER_SESSION) }));
  const sessions = [...preserved, ...fromCloud];
  const stillSelected = state.selectedId ? sessions.some((s) => s.id === state.selectedId) : true;
  setState({ ...state, sessions, selectedId: stillSelected ? state.selectedId : null });
}

function setCloudUser(uid: string | null) {
  if (uid === cloudUserId) return;
  const previousUid = cloudUserId;
  cloudUserId = uid;
  if (previousUid && uid) {
    // Switched to a different signed-in account without a full page reload
    // (sign out → sign in as someone else, same tab) — clear the in-memory
    // view so one student never glimpses another's thread titles while the
    // new account's cloud data loads. persistNow=false is load-bearing: this
    // must NOT write through currentStorageKey(), which already points at the
    // NEW uid's own key (cloudUserId was just reassigned above) — persisting
    // the blank here would wipe that account's real cache a moment before
    // hydrateForUser() reads it back.
    setState({ sessions: [], selectedId: null, working: {} }, false);
  }
  if (uid) {
    hydrateForUser(uid);
    ensureVisibilityListener();
    void syncCloudForUser(uid);
  }
}

// ── Actions (module-level so non-hook code can drive the store) ─────────────

export const sessionsStore = {
  getState(): StoreState {
    ensureHydrated();
    return state;
  },

  subscribe,

  /** Called from useSessions() only — wires which account's cloud data this
   *  tab syncs against. Not meant for direct use by other components. */
  setCloudUser,

  create(title = "New session"): WorkspaceSession {
    ensureHydrated();
    const session: WorkspaceSession = {
      id: newId(),
      title,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      messages: [],
    };
    setState({ ...state, sessions: [session, ...state.sessions], selectedId: session.id });
    return session;
  },

  select(id: string | null) {
    ensureHydrated();
    if (state.selectedId === id) return;
    setState({ ...state, selectedId: id });
  },

  rename(id: string, title: string) {
    ensureHydrated();
    setState({
      ...state,
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, title, updatedAt: nowIso() } : s)),
    });
    const uid = cloudUserId;
    const updated = state.sessions.find((s) => s.id === id);
    // Best-effort: if the thread doesn't exist in cloud yet (create() hasn't
    // sent a first message), this UPDATE just affects 0 rows.
    if (uid && updated) cloudFireAndForget(() => renameThreadCloud(uid, id, title, updated.updatedAt));
  },

  remove(id: string) {
    ensureHydrated();
    setState({
      ...state,
      sessions: state.sessions.filter((s) => s.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
      working: Object.fromEntries(Object.entries(state.working).filter(([key]) => key !== id)),
    });
    const uid = cloudUserId;
    if (uid) cloudFireAndForget(() => deleteThreadCloud(uid, id));
  },

  togglePin(id: string) {
    ensureHydrated();
    setState({
      ...state,
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)),
    });
    const uid = cloudUserId;
    const pinned = state.sessions.find((s) => s.id === id)?.pinned ?? false;
    if (uid) cloudFireAndForget(() => togglePinThreadCloud(uid, id, pinned));
  },

  appendMessage(id: string, message: SessionMessage) {
    ensureHydrated();
    const stored: SessionMessage = message.id ? message : { ...message, id: newId() };
    setState({
      ...state,
      sessions: state.sessions.map((s) =>
        s.id === id
          ? {
              ...s,
              messages: [...s.messages, stored].slice(-MAX_MESSAGES_PER_SESSION),
              updatedAt: nowIso(),
            }
          : s,
      ),
    });
    const uid = cloudUserId;
    const session = state.sessions.find((s) => s.id === id);
    if (uid && session) cloudFireAndForget(() => appendMessageCloud(uid, session, stored));
  },

  addOutput(id: string, output: SessionOutput) {
    ensureHydrated();
    setState({
      ...state,
      sessions: state.sessions.map((session) => session.id === id
        ? { ...session, outputs: [output, ...(session.outputs ?? []).filter((item) => item.id !== output.id)].slice(0, 50), updatedAt: nowIso() }
        : session),
    });
  },

  /** Insert or update the assistant message for an in-flight turn. Streaming
   * chunks update memory without rewriting localStorage; the final call
   * persists the completed message and its source metadata once. */
  upsertAssistantMessage(
    id: string,
    at: string,
    content: string,
    sources?: SessionSource[],
    persistNow = true,
  ) {
    ensureHydrated();
    setState({
      ...state,
      sessions: state.sessions.map((session) => {
        if (session.id !== id) return session;
        const index = session.messages.findIndex((message) => message.role === "assistant" && message.at === at);
        const message: SessionMessage = {
          at,
          content,
          role: "assistant",
          ...(index < 0 ? { id: newId() } : {}),
          ...(sources?.length ? { sources } : {}),
        };
        const messages = index >= 0
          ? session.messages.map((existing, messageIndex) => messageIndex === index
            ? { ...existing, ...message, ...(sources === undefined && existing.sources ? { sources: existing.sources } : {}) }
            : existing)
          : [...session.messages, message].slice(-MAX_MESSAGES_PER_SESSION);
        return { ...session, messages, updatedAt: nowIso() };
      }),
    }, persistNow);

    // Cloud write-through fires only on the final (non-streaming) call — the
    // spec is explicit that partial deltas never reach chat_messages.
    if (persistNow) {
      const uid = cloudUserId;
      const session = state.sessions.find((s) => s.id === id);
      const stored = session?.messages.find((m) => m.role === "assistant" && m.at === at);
      if (uid && session && stored) cloudFireAndForget(() => appendMessageCloud(uid, session, stored));
    }
  },

  updateMessage(id: string, at: string, content: string) {
    ensureHydrated();
    const nextContent = content.trim();
    if (!nextContent) return;
    setState({
      ...state,
      sessions: state.sessions.map((session) =>
        session.id === id
          ? {
              ...session,
              messages: session.messages.map((message) =>
                message.at === at && message.role === "user" ? { ...message, content: nextContent } : message,
              ),
              updatedAt: nowIso(),
            }
          : session,
      ),
    });
  },

  /** Replace a session's message list wholesale (retry/error cleanup paths). */
  setMessages(id: string, messages: SessionMessage[]) {
    ensureHydrated();
    setState({
      ...state,
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, messages: messages.slice(-MAX_MESSAGES_PER_SESSION), updatedAt: nowIso() } : s,
      ),
    });
  },

  setWorking(id: string, working: boolean) {
    ensureHydrated();
    const next = { ...state.working };
    if (working) next[id] = true;
    else delete next[id];
    setState({ ...state, working: next });
  },

  /** Dev-preview only: seed the store in-memory and stop persisting. */
  injectPreview(sessions: WorkspaceSession[], selectedId: string | null) {
    previewMode = true;
    hydrated = true;
    state = { sessions, selectedId, working: {} };
    emit();
  },
};

// ── React hooks ─────────────────────────────────────────────────────────────

const EMPTY_STATE: StoreState = { sessions: [], selectedId: null, working: {} };

function getSnapshot(): StoreState {
  ensureHydrated();
  return state;
}

// Server snapshot is a stable empty state (store hydrates client-side only).
function getServerSnapshot(): StoreState {
  return EMPTY_STATE;
}

export interface UseSessionsApi {
  sessions: WorkspaceSession[];
  pinned: WorkspaceSession[];
  recents: WorkspaceSession[];
  selectedId: string | null;
  working: Record<string, boolean>;
  create: (title?: string) => WorkspaceSession;
  select: (id: string | null) => void;
  rename: (id: string, title: string) => void;
  remove: (id: string) => void;
  togglePin: (id: string) => void;
  setWorking: (id: string, working: boolean) => void;
}

export function useSessions(): UseSessionsApi {
  const preview = useWorkspacePreview();
  const { session: authSession } = useAuth();
  // null throughout the dev-preview harness regardless of the developer's real
  // signed-in state, so that route never fires a cloud call (module comment).
  const uid = preview ? null : (authSession?.user.id ?? null);

  useEffect(() => {
    sessionsStore.setCloudUser(uid);
  }, [uid]);

  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const sessions = sortedSessions(snap.sessions);

  return {
    sessions,
    pinned: sessions.filter((s) => s.pinned),
    recents: sessions.filter((s) => !s.pinned),
    selectedId: snap.selectedId,
    working: snap.working,
    create: useCallback((title?: string) => sessionsStore.create(title), []),
    select: useCallback((id: string | null) => sessionsStore.select(id), []),
    rename: useCallback((id: string, title: string) => sessionsStore.rename(id, title), []),
    remove: useCallback((id: string) => sessionsStore.remove(id), []),
    togglePin: useCallback((id: string) => sessionsStore.togglePin(id), []),
    setWorking: useCallback((id: string, working: boolean) => sessionsStore.setWorking(id, working), []),
  };
}

export interface UseSessionMessagesApi {
  session: WorkspaceSession | null;
  messages: SessionMessage[];
  append: (message: SessionMessage) => void;
  setAll: (messages: SessionMessage[]) => void;
}

export function useSessionMessages(id: string | null): UseSessionMessagesApi {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const session = id ? (snap.sessions.find((s) => s.id === id) ?? null) : null;

  return {
    session,
    messages: session?.messages ?? [],
    append: useCallback(
      (message: SessionMessage) => {
        if (id) sessionsStore.appendMessage(id, message);
      },
      [id],
    ),
    setAll: useCallback(
      (messages: SessionMessage[]) => {
        if (id) sessionsStore.setMessages(id, messages);
      },
      [id],
    ),
  };
}
