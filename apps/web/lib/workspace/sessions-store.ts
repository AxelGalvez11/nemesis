"use client";

// Local sessions store for the desktop-parity workspace — localStorage-backed,
// single-tab-authoritative, with a tiny external-store subscription so every
// consumer (sidebar, sessions page, dev preview) re-renders from one source.
//
// Storage contract (versioned): localStorage["nemesis.web.sessions.v1"] =
//   { v: 1, sessions: [{ id, title, createdAt, updatedAt, pinned?, messages: [{ role, content, at }] }] }
//
// Phase C (sessions page) extends behavior ONLY through this API surface.

import { useCallback, useSyncExternalStore } from "react";

export interface SessionSource {
  title: string;
  url: string;
  description: string;
}

export interface SessionOutput {
  id: string;
  kind: "flashcards" | "slides" | "test" | "report" | "other";
  title: string;
  url?: string;
}

export interface SessionMessage {
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
}

interface SessionsFile {
  v: 1;
  sessions: WorkspaceSession[];
}

export const SESSIONS_STORAGE_KEY = "nemesis.web.sessions.v1";
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
  const outputs = Array.isArray(m.outputs) ? m.outputs.flatMap((rawOutput) => {
    if (!rawOutput || typeof rawOutput !== "object") return [];
    const output = rawOutput as Record<string, unknown>;
    const kinds = new Set(["flashcards", "slides", "test", "report", "other"]);
    return typeof output.id === "string" && typeof output.title === "string" && typeof output.kind === "string" && kinds.has(output.kind)
      ? [{ id: output.id, title: output.title, kind: output.kind as SessionOutput["kind"], ...(typeof output.url === "string" ? { url: output.url } : {}) }]
      : [];
  }).slice(0, 30) : [];
  return {
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
  return {
    id: s.id,
    title: typeof s.title === "string" && s.title.length > 0 ? s.title : "New session",
    createdAt: typeof s.createdAt === "string" ? s.createdAt : new Date(0).toISOString(),
    updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : new Date(0).toISOString(),
    ...(s.pinned === true ? { pinned: true } : {}),
    messages,
  };
}

function loadFromStorage(): WorkspaceSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SESSIONS_STORAGE_KEY);
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
    window.localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(file));
  } catch {
    // Quota/private mode — the in-memory copy stays authoritative for the tab.
  }
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  state = { ...state, sessions: loadFromStorage() };
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

// ── Actions (module-level so non-hook code can drive the store) ─────────────

export const sessionsStore = {
  getState(): StoreState {
    ensureHydrated();
    return state;
  },

  subscribe,

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
  },

  remove(id: string) {
    ensureHydrated();
    setState({
      ...state,
      sessions: state.sessions.filter((s) => s.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
      working: Object.fromEntries(Object.entries(state.working).filter(([key]) => key !== id)),
    });
  },

  togglePin(id: string) {
    ensureHydrated();
    setState({
      ...state,
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)),
    });
  },

  appendMessage(id: string, message: SessionMessage) {
    ensureHydrated();
    setState({
      ...state,
      sessions: state.sessions.map((s) =>
        s.id === id
          ? {
              ...s,
              messages: [...s.messages, message].slice(-MAX_MESSAGES_PER_SESSION),
              updatedAt: nowIso(),
            }
          : s,
      ),
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
