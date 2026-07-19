"use client";

// Per-notebook chat: a localStorage-backed transcript store (one authority per tab, keyed by
// notebook id), the wire-message builder that injects the notebook's instructions + source titles,
// and a send orchestrator over the shared nemesis-llm transport (postChatCompletion). General mode
// only in Phase 1 — the model sees the instructions and the source list, but does not retrieve
// source *content* yet (that's grounded mode, Phase 2).

import { useCallback, useSyncExternalStore } from "react";

import { postChatCompletion, trimHistory, type WireMsg } from "@/lib/workspace/chat-api";
import type { SessionMessage } from "@/lib/workspace/sessions-store";

export type { SessionMessage } from "@/lib/workspace/sessions-store";

/** A notebook chat's own system prompt — unlike the main Sessions chat, it CAN read the student's
 *  sources (their extracted text is injected below), so it must not deflect file questions to the
 *  Mac app. General mode: use the text freely. (Grounded "answer only from sources + cite" = Phase 2.) */
export const NOTEBOOK_SYSTEM_PROMPT =
  "You are Nemesis, a study assistant for health-sciences students. Answer plainly and concisely. " +
  "Use markdown when structure helps (lists, tables). Never use emojis. The student attached sources " +
  "to this notebook (their notes, uploaded files, and links); the sources' text is included below — " +
  "use it to answer, and point to the relevant source when it helps. If the answer isn't in the " +
  "sources, say so briefly, then answer from general knowledge.";

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
  const parts = [NOTEBOOK_SYSTEM_PROMPT];
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
  sources: NotebookWireSource[];
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
        sources: opts.sources,
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
