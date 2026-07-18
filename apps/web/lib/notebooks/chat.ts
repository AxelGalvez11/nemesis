"use client";

// Per-notebook chat: a localStorage-backed transcript store (one authority per tab, keyed by
// notebook id), the wire-message builder that injects the notebook's instructions + source titles,
// and a send orchestrator over the shared nemesis-llm transport (postChatCompletion). General mode
// only in Phase 1 — the model sees the instructions and the source list, but does not retrieve
// source *content* yet (that's grounded mode, Phase 2).

import { useCallback, useSyncExternalStore } from "react";

import { CHAT_SYSTEM_PROMPT, postChatCompletion, trimHistory, type WireMsg } from "@/lib/workspace/chat-api";
import type { SessionMessage } from "@/lib/workspace/sessions-store";

export type { SessionMessage } from "@/lib/workspace/sessions-store";

export interface BuildNotebookWireOpts {
  instructions: string | null;
  sourceNames: string[];
  history: SessionMessage[];
  userText: string;
}

/** The chat/completions message array for one notebook turn: the shared system prompt, then the
 *  notebook's instructions (if any), then its source titles (if any), then trimmed history + the new
 *  user message. PURE. */
export function buildNotebookWireMessages(opts: BuildNotebookWireOpts): WireMsg[] {
  const parts = [CHAT_SYSTEM_PROMPT];
  const instructions = opts.instructions?.trim();
  if (instructions) {
    parts.push(`This notebook's instructions from the student (follow them):\n${instructions}`);
  }
  const names = opts.sourceNames.map((n) => n.trim()).filter((n) => n.length > 0);
  if (names.length) {
    parts.push(
      "Sources the student added to this notebook (titles only — you can't read their contents yet, " +
        "so if a question needs the text inside one, say so plainly):\n" +
        names.map((n) => `- ${n}`).join("\n"),
    );
  }
  return [
    { content: parts.join("\n\n"), role: "system" },
    ...trimHistory(opts.history).map((m) => ({ content: m.content, role: m.role })),
    { content: opts.userText, role: "user" },
  ];
}

// ── Local transcript store (localStorage, keyed by notebook id) ──────────────

const STORAGE_KEY = "nemesis.web.notebook-chat.v1";
const MAX_MESSAGES = 200;

interface ChatFile {
  v: 1;
  byNotebook: Record<string, SessionMessage[]>;
}

interface StoreState {
  byNotebook: Record<string, SessionMessage[]>;
  working: Record<string, boolean>;
}

let state: StoreState = { byNotebook: {}, working: {} };
let hydrated = false;
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

function sanitizeMessage(raw: unknown): SessionMessage | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const role = m.role === "user" || m.role === "assistant" ? m.role : null;
  if (!role || typeof m.content !== "string") return null;
  return { role, content: m.content, at: typeof m.at === "string" ? m.at : new Date(0).toISOString() };
}

function loadFromStorage(): Record<string, SessionMessage[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || (parsed as ChatFile).v !== 1) return {};
    const byNotebook = (parsed as ChatFile).byNotebook;
    if (typeof byNotebook !== "object" || byNotebook === null) return {};
    const out: Record<string, SessionMessage[]> = {};
    for (const [id, list] of Object.entries(byNotebook)) {
      if (Array.isArray(list)) {
        out[id] = list.map(sanitizeMessage).filter((m): m is SessionMessage => m !== null);
      }
    }
    return out;
  } catch {
    return {};
  }
}

function persist() {
  if (previewMode || typeof window === "undefined") return;
  try {
    const file: ChatFile = {
      v: 1,
      byNotebook: Object.fromEntries(
        Object.entries(state.byNotebook).map(([id, list]) => [id, list.slice(-MAX_MESSAGES)]),
      ),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
  } catch {
    // Quota/private mode — the in-memory copy stays authoritative for the tab.
  }
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  state = { ...state, byNotebook: loadFromStorage() };
}

function setState(next: StoreState) {
  state = next;
  persist();
  emit();
}

const nowIso = () => new Date().toISOString();

export const notebookChatStore = {
  getState(): StoreState {
    ensureHydrated();
    return state;
  },
  subscribe,
  messages(notebookId: string): SessionMessage[] {
    ensureHydrated();
    return state.byNotebook[notebookId] ?? [];
  },
  append(notebookId: string, message: SessionMessage) {
    ensureHydrated();
    const list = [...(state.byNotebook[notebookId] ?? []), message].slice(-MAX_MESSAGES);
    setState({ ...state, byNotebook: { ...state.byNotebook, [notebookId]: list } });
  },
  clear(notebookId: string) {
    ensureHydrated();
    const next = { ...state.byNotebook };
    delete next[notebookId];
    setState({ ...state, byNotebook: next });
  },
  setWorking(notebookId: string, working: boolean) {
    ensureHydrated();
    const next = { ...state.working };
    if (working) next[notebookId] = true;
    else delete next[notebookId];
    setState({ ...state, working: next });
  },
  /** Dev-preview only: seed transcripts in-memory and stop persisting. */
  injectPreview(byNotebook: Record<string, SessionMessage[]>) {
    previewMode = true;
    hydrated = true;
    state = { byNotebook, working: {} };
    emit();
  },
};

// ── Send orchestrator ────────────────────────────────────────────────────────

export interface SendNotebookTurnOpts {
  uid: string;
  notebookId: string;
  instructions: string | null;
  sourceNames: string[];
  userText: string;
  signal?: AbortSignal;
}

/** Append the user's message, run one turn through the shared transport with the notebook's
 *  instructions + source titles injected, then append the assistant's reply (or a readable error
 *  line). Persists to the per-notebook local store. Rethrows only on abort. */
export async function sendNotebookTurn(opts: SendNotebookTurnOpts): Promise<void> {
  const userText = opts.userText.trim();
  if (!userText) return;
  const history = notebookChatStore.messages(opts.notebookId);
  notebookChatStore.append(opts.notebookId, { role: "user", content: userText, at: nowIso() });
  notebookChatStore.setWorking(opts.notebookId, true);
  try {
    const reply = await postChatCompletion(
      opts.uid,
      buildNotebookWireMessages({
        instructions: opts.instructions,
        sourceNames: opts.sourceNames,
        history,
        userText,
      }),
      opts.signal,
    );
    const text = reply.text ?? reply.errorText ?? "Something went wrong. Try again.";
    notebookChatStore.append(opts.notebookId, { role: "assistant", content: text, at: nowIso() });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    notebookChatStore.append(opts.notebookId, {
      role: "assistant",
      content: "You're offline — chat needs a connection. Try again in a moment.",
      at: nowIso(),
    });
  } finally {
    notebookChatStore.setWorking(opts.notebookId, false);
  }
}

// ── React hook ────────────────────────────────────────────────────────────────

const EMPTY: StoreState = { byNotebook: {}, working: {} };

function getSnapshot(): StoreState {
  ensureHydrated();
  return state;
}

// Server snapshot is a stable empty state (store hydrates client-side only).
function getServerSnapshot(): StoreState {
  return EMPTY;
}

export interface UseNotebookChatApi {
  messages: SessionMessage[];
  working: boolean;
  clear: () => void;
}

export function useNotebookChat(notebookId: string | null): UseNotebookChatApi {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    messages: notebookId ? (snap.byNotebook[notebookId] ?? []) : [],
    working: notebookId ? Boolean(snap.working[notebookId]) : false,
    clear: useCallback(() => {
      if (notebookId) notebookChatStore.clear(notebookId);
    }, [notebookId]),
  };
}
