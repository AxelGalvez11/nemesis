"use client";

// Notebooks store — one external store (useSyncExternalStore, mirroring library-cloud-store) shared
// by the sidebar (list + selection) and the main pane (sources + instructions + chat). Reads/writes
// the cloud notebooks / notebook_sources tables through lib/notebooks/api.ts; RLS scopes every row to
// the signed-in user, so there is no explicit user filter here. Selecting a notebook lazily loads
// its sources. The dev-preview harness seeds a demo notebook so the UI renders without a session.

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

export type LoadStatus = "idle" | "loading" | "loaded" | "error";

interface StoreState {
  status: LoadStatus;
  notebooks: Notebook[];
  error: string | null;
  selectedId: string | null;
  sources: NotebookSource[];
  sourcesStatus: LoadStatus;
}

const EMPTY_STATE: StoreState = {
  status: "idle",
  notebooks: [],
  error: null,
  selectedId: null,
  sources: [],
  sourcesStatus: "idle",
};

const PREVIEW_NOTEBOOK: Notebook = {
  id: "preview-notebook",
  name: "Cardiovascular pharmacology",
  description: null,
  instructions: "You are my pharmacology tutor. Quiz me on mechanisms and keep answers exam-focused.",
  updatedAt: "",
};

const PREVIEW_SOURCES: NotebookSource[] = [
  { id: "ps1", notebookId: "preview-notebook", kind: "library", name: "ACE inhibitors", content: null, sourceUrl: null, libraryPath: "Pharmacology/Cardiovascular/ACE inhibitors.md", bytes: null, createdAt: "" },
  { id: "ps2", notebookId: "preview-notebook", kind: "pdf", name: "2023 Hypertension guideline", content: null, sourceUrl: null, libraryPath: null, bytes: 428_000, createdAt: "" },
  { id: "ps3", notebookId: "preview-notebook", kind: "url", name: "MedlinePlus: Beta blockers", content: null, sourceUrl: "https://medlineplus.gov/betablockers.html", libraryPath: null, bytes: null, createdAt: "" },
];

let state: StoreState = EMPTY_STATE;
let loadedForUserId: string | null = null;
/** The notebook id whose sources the current `sources`/`sourcesStatus` reflect — guards against a
 *  stale load landing after the user has already switched notebooks. */
let sourcesForId: string | null = null;
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
  setState({ status: "loading", error: null, notebooks: [], selectedId: null, sources: [], sourcesStatus: "idle" });
  if (isPreviewMode) {
    setState({ status: "loaded", notebooks: [] });
    return;
  }
  try {
    const notebooks = await listNotebooks();
    // A newer load (account switch) already superseded this one — drop the stale result.
    if (loadedForUserId !== userId) return;
    setState({ status: "loaded", notebooks });
  } catch (e) {
    if (loadedForUserId !== userId) return;
    setState({ status: "error", error: e instanceof Error ? e.message : "Couldn't load your notebooks." });
  }
}

async function loadSources(notebookId: string): Promise<void> {
  sourcesForId = notebookId;
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

function reset() {
  loadedForUserId = null;
  sourcesForId = null;
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
  setState({ selectedId: id, sources: [], sourcesStatus: id ? "loading" : "idle" });
  if (id) await loadSources(id);
}

async function createAndSelect(name: string): Promise<void> {
  const created = await createNotebook(name);
  if (!created) return;
  setState({ notebooks: [created, ...state.notebooks], selectedId: created.id, sources: [], sourcesStatus: "loaded" });
  sourcesForId = created.id;
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
    sources: clearing ? [] : state.sources,
    sourcesStatus: clearing ? "idle" : state.sourcesStatus,
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

export interface UseNotebooksApi {
  status: LoadStatus;
  notebooks: Notebook[];
  error: string | null;
  selectedId: string | null;
  selected: Notebook | null;
  sources: NotebookSource[];
  sourcesStatus: LoadStatus;
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
        sourcesForId = PREVIEW_NOTEBOOK.id;
        state = {
          status: "loaded",
          notebooks: [PREVIEW_NOTEBOOK],
          error: null,
          selectedId: PREVIEW_NOTEBOOK.id,
          sources: PREVIEW_SOURCES,
          sourcesStatus: "loaded",
        };
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
    reload: useCallback(() => {
      if (userId) void loadNotebooks(userId);
    }, [userId]),
  };
}
