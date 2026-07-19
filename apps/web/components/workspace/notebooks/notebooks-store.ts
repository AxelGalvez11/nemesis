"use client";

// Notebooks store — one external store (useSyncExternalStore, mirroring library-cloud-store) shared
// by the landing list, the project home, and the chat view. Reads/writes the cloud notebooks /
// notebook_sources / notebook_chats tables via lib/notebooks/*. RLS scopes every row to the signed-in
// user, so there is no explicit user filter here. Selecting a notebook lazily loads its sources AND
// its chats (Recents). `activeChatId` drives home-vs-chat-view. The dev-preview harness seeds demo
// notebooks, sources, chats, and a canned transcript so the UI renders without a session.

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { isPreviewMode } from "@/lib/env";
import {
  addExtractedSource,
  addLibrarySource,
  addTextSource,
  createNotebook,
  deleteNotebook,
  deleteSource,
  listNotebooks,
  listSources,
  updateNotebook,
  type Notebook,
  type NotebookSource,
} from "@/lib/notebooks/api";
import { createChat, deleteChat, listChats, renameChat, type NotebookChat } from "@/lib/notebooks/chats-api";
import { notebookChatStore, type SessionMessage } from "@/lib/notebooks/chat";

export type LoadStatus = "idle" | "loading" | "loaded" | "error";

interface StoreState {
  status: LoadStatus;
  notebooks: Notebook[];
  error: string | null;
  selectedId: string | null;
  sources: NotebookSource[];
  sourcesStatus: LoadStatus;
  chats: NotebookChat[];
  chatsStatus: LoadStatus;
  activeChatId: string | null;
}

const EMPTY_STATE: StoreState = {
  status: "idle",
  notebooks: [],
  error: null,
  selectedId: null,
  sources: [],
  sourcesStatus: "idle",
  chats: [],
  chatsStatus: "idle",
  activeChatId: null,
};

const PREVIEW_NOTEBOOKS: Notebook[] = [
  { id: "preview-notebook", name: "Cardiovascular pharmacology", description: null, instructions: "You are my pharmacology tutor. Quiz me on mechanisms and keep answers exam-focused.", updatedAt: "2026-07-15T10:00:00.000Z" },
  { id: "preview-nb-2", name: "Renal system — NAPLEX prep", description: null, instructions: null, updatedAt: "2026-07-11T09:00:00.000Z" },
  { id: "preview-nb-3", name: "Antibiotics review", description: null, instructions: null, updatedAt: "2026-06-28T09:00:00.000Z" },
];

const PREVIEW_SOURCES: NotebookSource[] = [
  { id: "ps1", notebookId: "preview-notebook", kind: "library", name: "ACE inhibitors", content: null, sourceUrl: null, libraryPath: "Pharmacology/Cardiovascular/ACE inhibitors.md", bytes: null, createdAt: "" },
  { id: "ps2", notebookId: "preview-notebook", kind: "pdf", name: "2023 Hypertension guideline", content: null, sourceUrl: null, libraryPath: null, bytes: 428_000, createdAt: "" },
  { id: "ps3", notebookId: "preview-notebook", kind: "url", name: "MedlinePlus: Beta blockers", content: null, sourceUrl: "https://medlineplus.gov/betablockers.html", libraryPath: null, bytes: null, createdAt: "" },
];

const PREVIEW_SOURCES_BY_ID: Record<string, NotebookSource[]> = { "preview-notebook": PREVIEW_SOURCES };

const PREVIEW_CHATS: NotebookChat[] = [
  { id: "preview-chat-1", notebookId: "preview-notebook", title: "Beta-blocker contraindications", updatedAt: "2026-07-16T14:00:00.000Z" },
  { id: "preview-chat-2", notebookId: "preview-notebook", title: "ACE vs ARB — key differences", updatedAt: "2026-07-14T09:00:00.000Z" },
];

const PREVIEW_CHATS_BY_ID: Record<string, NotebookChat[]> = { "preview-notebook": PREVIEW_CHATS };

const PREVIEW_CHAT_MESSAGES: Record<string, SessionMessage[]> = {
  "preview-chat-1": [
    { role: "user", content: "From my sources, when are beta-blockers contraindicated?", at: "2026-07-16T14:00:00.000Z" },
    {
      role: "assistant",
      content:
        "Based on the sources you added:\n\n- **Severe bradycardia or high-degree AV block** — they slow conduction further.\n- **Decompensated heart failure** — start only once stable, low and slow.\n- **Asthma / severe reactive airway disease** — avoid non-selective agents.\n\nWant the exact lines from the Hypertension guideline for any of these?",
      at: "2026-07-16T14:00:05.000Z",
    },
  ],
};

let state: StoreState = EMPTY_STATE;
let loadedForUserId: string | null = null;
/** The notebook id the current `sources` reflect — guards a stale load landing after a switch. */
let sourcesForId: string | null = null;
/** The notebook id the current `chats` reflect — same stale-guard for the Recents load. */
let chatsForId: string | null = null;
/** True inside the dev-preview harness — sources/chats resolve from the seeded maps, not the network. */
let previewActive = false;
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

function setState(next: Partial<StoreState>) {
  state = { ...state, ...next };
  emit();
}

async function loadNotebooks(userId: string): Promise<void> {
  loadedForUserId = userId;
  setState({ ...EMPTY_STATE, status: "loading" });
  if (isPreviewMode) {
    setState({ status: "loaded", notebooks: [] });
    return;
  }
  try {
    const notebooks = await listNotebooks();
    if (loadedForUserId !== userId) return;
    setState({ status: "loaded", notebooks });
  } catch (e) {
    if (loadedForUserId !== userId) return;
    setState({ status: "error", error: e instanceof Error ? e.message : "Couldn't load your notebooks." });
  }
}

async function loadSources(notebookId: string): Promise<void> {
  sourcesForId = notebookId;
  if (previewActive) {
    setState({ sources: PREVIEW_SOURCES_BY_ID[notebookId] ?? [], sourcesStatus: "loaded" });
    return;
  }
  setState({ sources: [], sourcesStatus: "loading" });
  try {
    const sources = await listSources(notebookId);
    if (sourcesForId !== notebookId) return;
    setState({ sources, sourcesStatus: "loaded" });
  } catch {
    if (sourcesForId !== notebookId) return;
    setState({ sourcesStatus: "error" });
  }
}

async function loadChats(notebookId: string): Promise<void> {
  chatsForId = notebookId;
  if (previewActive) {
    setState({ chats: PREVIEW_CHATS_BY_ID[notebookId] ?? [], chatsStatus: "loaded" });
    return;
  }
  setState({ chats: [], chatsStatus: "loading" });
  try {
    const chats = await listChats(notebookId);
    if (chatsForId !== notebookId) return;
    setState({ chats, chatsStatus: "loaded" });
  } catch {
    if (chatsForId !== notebookId) return;
    setState({ chatsStatus: "error" });
  }
}

function reset() {
  loadedForUserId = null;
  sourcesForId = null;
  chatsForId = null;
  state = EMPTY_STATE;
  emit();
}

function getSnapshot(): StoreState {
  return state;
}

function getServerSnapshot(): StoreState {
  return EMPTY_STATE;
}

// ── Actions (module-level so the async CRUD can drive the store) ─────────────

async function selectNotebook(id: string | null): Promise<void> {
  if (state.selectedId === id) return;
  setState({
    selectedId: id,
    activeChatId: null,
    sources: [],
    sourcesStatus: id ? "loading" : "idle",
    chats: [],
    chatsStatus: id ? "loading" : "idle",
  });
  if (id) await Promise.all([loadSources(id), loadChats(id)]);
}

async function createAndSelect(name: string): Promise<void> {
  const created = await createNotebook(name);
  if (!created) return;
  sourcesForId = created.id;
  chatsForId = created.id;
  setState({
    notebooks: [created, ...state.notebooks],
    selectedId: created.id,
    activeChatId: null,
    sources: [],
    sourcesStatus: "loaded",
    chats: [],
    chatsStatus: "loaded",
  });
}

async function renameNotebook(id: string, name: string): Promise<void> {
  await updateNotebook(id, { name });
  setState({ notebooks: state.notebooks.map((n) => (n.id === id ? { ...n, name } : n)) });
}

async function removeNotebook(id: string): Promise<void> {
  await deleteNotebook(id);
  const notebooks = state.notebooks.filter((n) => n.id !== id);
  const clearing = state.selectedId === id;
  setState({
    notebooks,
    selectedId: clearing ? null : state.selectedId,
    activeChatId: clearing ? null : state.activeChatId,
    sources: clearing ? [] : state.sources,
    sourcesStatus: clearing ? "idle" : state.sourcesStatus,
    chats: clearing ? [] : state.chats,
    chatsStatus: clearing ? "idle" : state.chatsStatus,
  });
}

async function saveInstructions(id: string, instructions: string): Promise<void> {
  await updateNotebook(id, { instructions });
  setState({ notebooks: state.notebooks.map((n) => (n.id === id ? { ...n, instructions } : n)) });
}

function prependSource(source: NotebookSource | null) {
  if (source && sourcesForId === source.notebookId) {
    setState({ sources: [source, ...state.sources] });
  }
}

async function removeSourceById(id: string): Promise<void> {
  await deleteSource(id);
  setState({ sources: state.sources.filter((s) => s.id !== id) });
}

// ── Chat actions ─────────────────────────────────────────────────────────────

function openChat(chatId: string) {
  setState({ activeChatId: chatId });
}

function backToHome() {
  setState({ activeChatId: null });
}

/** Create a fresh chat, move it to the top of Recents, and open it. Marks the new chat as loaded in
 *  the transcript store so its first optimistic message isn't clobbered by a hydrate. Returns null on
 *  failure (offline / no session) — the caller must stay on home rather than open a blank chat. */
async function startChat(notebookId: string, title: string): Promise<NotebookChat | null> {
  const created = await createChat(notebookId, title);
  if (!created) return null;
  notebookChatStore.markLoaded(created.id);
  if (chatsForId === notebookId) {
    setState({ chats: [created, ...state.chats], activeChatId: created.id });
  } else {
    setState({ activeChatId: created.id });
  }
  return created;
}

async function renameChatById(id: string, title: string): Promise<void> {
  await renameChat(id, title);
  setState({ chats: state.chats.map((c) => (c.id === id ? { ...c, title } : c)) });
}

async function removeChatById(id: string): Promise<void> {
  await deleteChat(id);
  const chats = state.chats.filter((c) => c.id !== id);
  setState({ chats, activeChatId: state.activeChatId === id ? null : state.activeChatId });
}

export interface UseNotebooksApi {
  status: LoadStatus;
  notebooks: Notebook[];
  error: string | null;
  selectedId: string | null;
  selected: Notebook | null;
  sources: NotebookSource[];
  sourcesStatus: LoadStatus;
  chats: NotebookChat[];
  chatsStatus: LoadStatus;
  activeChatId: string | null;
  select: (id: string | null) => void;
  create: (name: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  saveInstructions: (id: string, instructions: string) => Promise<void>;
  addLibrary: (notebookId: string, input: { path: string; title: string; content: string }) => Promise<void>;
  addText: (notebookId: string, input: { name: string; content: string }) => Promise<void>;
  addExtracted: (
    notebookId: string,
    input: { kind: "url" | "pdf" | "docx" | "pptx" | "youtube"; name: string; content: string; sourceUrl?: string | null; bytes?: number | null },
  ) => Promise<void>;
  removeSource: (id: string) => Promise<void>;
  openChat: (chatId: string) => void;
  backToHome: () => void;
  startChat: (notebookId: string, title: string) => Promise<NotebookChat | null>;
  renameChat: (id: string, title: string) => Promise<void>;
  removeChat: (id: string) => Promise<void>;
  reload: () => void;
}

export function useNotebooks(): UseNotebooksApi {
  const { session } = useAuth();
  const preview = useWorkspacePreview();
  const userId = session?.user.id ?? null;
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (preview) {
      if (loadedForUserId !== "__preview__") {
        loadedForUserId = "__preview__";
        previewActive = true;
        sourcesForId = null;
        chatsForId = null;
        notebookChatStore.injectPreview(PREVIEW_CHAT_MESSAGES);
        state = { ...EMPTY_STATE, status: "loaded", notebooks: PREVIEW_NOTEBOOKS };
        emit();
      }
      return;
    }
    if (!userId) {
      if (loadedForUserId) reset();
      return;
    }
    if (loadedForUserId === userId) return;
    void loadNotebooks(userId);
  }, [preview, userId]);

  const selected = snap.selectedId ? (snap.notebooks.find((n) => n.id === snap.selectedId) ?? null) : null;

  return {
    status: snap.status,
    notebooks: snap.notebooks,
    error: snap.error,
    selectedId: snap.selectedId,
    selected,
    sources: snap.sources,
    sourcesStatus: snap.sourcesStatus,
    chats: snap.chats,
    chatsStatus: snap.chatsStatus,
    activeChatId: snap.activeChatId,
    select: useCallback((id: string | null) => void selectNotebook(id), []),
    create: useCallback((name: string) => createAndSelect(name), []),
    rename: useCallback((id: string, name: string) => renameNotebook(id, name), []),
    remove: useCallback((id: string) => removeNotebook(id), []),
    saveInstructions: useCallback((id: string, instructions: string) => saveInstructions(id, instructions), []),
    addLibrary: useCallback(async (notebookId, input) => {
      prependSource(await addLibrarySource(notebookId, input));
    }, []),
    addText: useCallback(async (notebookId, input) => {
      prependSource(await addTextSource(notebookId, input));
    }, []),
    addExtracted: useCallback(async (notebookId, input) => {
      prependSource(await addExtractedSource(notebookId, input));
    }, []),
    removeSource: useCallback((id: string) => removeSourceById(id), []),
    openChat: useCallback((chatId: string) => openChat(chatId), []),
    backToHome: useCallback(() => backToHome(), []),
    startChat: useCallback((notebookId: string, title: string) => startChat(notebookId, title), []),
    renameChat: useCallback((id: string, title: string) => renameChatById(id, title), []),
    removeChat: useCallback((id: string) => removeChatById(id), []),
    reload: useCallback(() => {
      if (userId) void loadNotebooks(userId);
    }, [userId]),
  };
}
