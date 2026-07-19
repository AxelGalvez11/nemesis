"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { supabase } from "@/lib/supabase";

import { normalizeLibraryFolder, notePathFor, safeLibraryTitle } from "./library-links";
import { titleFromPath, type CloudLibraryNote } from "./library-tree";

const PREVIEW_NOTES: CloudLibraryNote[] = [
  {
    id: "preview-ace",
    path: "Pharmacology/Cardiovascular/ACE inhibitors.md",
    title: "ACE inhibitors",
    updatedAt: "",
    content:
      "# ACE inhibitors\n\n**Mechanism:** block angiotensin-converting enzyme → less angiotensin II → vasodilation and less aldosterone.\n\n## Key points\n- First-line for hypertension and heart failure\n- Classic side effect: a dry cough (bradykinin-mediated)\n\n## Related\n- Contrasts with: [[ARBs]]\n- Applied in: [[Lisinopril case]]",
  },
  {
    id: "preview-beta",
    path: "Pharmacology/Cardiovascular/Beta blockers.md",
    title: "Beta blockers",
    updatedAt: "",
    content:
      "# Beta blockers\n\nReduce heart rate and contractility (beta-1 blockade).\n\n| Agent | Selectivity | NAPLEX weight |\n| --- | --- | --- |\n| Metoprolol | Beta-1 selective | High |\n| Propranolol | Non-selective | High |",
  },
  {
    id: "preview-immunology",
    path: "Immunology/01 Intro to Immunology.md",
    title: "01 Intro to Immunology",
    updatedAt: "",
    content: "# Introduction to Immunology\n\n- Innate vs. adaptive immunity — the two arms\n- Key cells: leukocytes, lymphocytes, phagocytes",
  },
];

export type { CloudLibraryNote } from "./library-tree";
export type LibraryLoadStatus = "idle" | "loading" | "loaded" | "error";

interface StoreState {
  status: LibraryLoadStatus;
  notes: CloudLibraryNote[];
  folders: string[];
  error: string | null;
  selectedPath: string | null;
}

const EMPTY_STATE: StoreState = { status: "idle", notes: [], folders: [], error: null, selectedPath: null };
let state: StoreState = EMPTY_STATE;
let loadedForUserId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(next: StoreState) {
  state = next;
  emit();
}

function getSnapshot(): StoreState {
  return state;
}

function getServerSnapshot(): StoreState {
  return EMPTY_STATE;
}

function isObj(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toNote(raw: unknown): CloudLibraryNote | null {
  if (!isObj(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  const path = typeof raw.path === "string" ? raw.path : "";
  if (!id || !path) return null;
  const rawTitle = typeof raw.title === "string" ? raw.title.trim() : "";
  return {
    id,
    path,
    title: rawTitle || titleFromPath(path),
    content: typeof raw.content === "string" ? raw.content : "",
    updatedAt: typeof raw.updated_at === "string" ? raw.updated_at : "",
  };
}

function uniqueNotePath(title: string, folder: string): string {
  const first = notePathFor(title, folder);
  if (!state.notes.some((note) => note.path.toLocaleLowerCase() === first.toLocaleLowerCase())) return first;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = notePathFor(`${title} ${suffix}`, folder);
    if (!state.notes.some((note) => note.path.toLocaleLowerCase() === candidate.toLocaleLowerCase())) return candidate;
  }
  return notePathFor(`${title} ${Date.now()}`, folder);
}

async function loadDocuments(userId: string): Promise<void> {
  loadedForUserId = userId;
  setState({ status: "loading", error: null, notes: [], folders: [], selectedPath: null });
  try {
    const { data, error } = await supabase
      .from("readable_library_documents")
      .select("id,user_id,path,kind,title,content,updated_at,deleted")
      .eq("user_id", userId)
      .eq("deleted", false)
      .in("kind", ["note", "folder"])
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = Array.isArray(data) ? data : [];
    const notes = rows.flatMap((row) => {
      if (!isObj(row) || row.kind !== "note") return [];
      const note = toNote(row);
      return note ? [note] : [];
    });
    const folders = rows.flatMap((row) =>
      isObj(row) && row.kind === "folder" && typeof row.path === "string" ? [normalizeLibraryFolder(row.path)] : [],
    );
    setState({ status: "loaded", error: null, notes, folders, selectedPath: notes[0]?.path ?? null });
  } catch (error) {
    setState({
      status: "error",
      error: error instanceof Error ? error.message : "Couldn't load your notes.",
      notes: [],
      folders: [],
      selectedPath: null,
    });
  }
}

function select(path: string | null) {
  setState({ ...state, selectedPath: path });
}

function reset() {
  loadedForUserId = null;
  setState(EMPTY_STATE);
}

export interface CreateNoteInput {
  title: string;
  folder?: string;
  content?: string;
}

export interface SaveNoteInput {
  id: string;
  title: string;
  content: string;
}

export interface UseCloudLibraryApi extends StoreState {
  select: (path: string | null) => void;
  reload: () => void;
  createNote: (input: CreateNoteInput) => Promise<CloudLibraryNote>;
  createFolder: (path: string) => Promise<string>;
  saveNote: (input: SaveNoteInput) => Promise<CloudLibraryNote>;
  deleteNote: (id: string) => Promise<void>;
}

export function useCloudLibrary(): UseCloudLibraryApi {
  const { session } = useAuth();
  const preview = useWorkspacePreview();
  const userId = session?.user.id ?? null;
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (preview) {
      if (loadedForUserId !== "__preview__" || state.status !== "loaded") {
        loadedForUserId = "__preview__";
        setState({ status: "loaded", error: null, notes: PREVIEW_NOTES, folders: [], selectedPath: PREVIEW_NOTES[0]?.path ?? null });
      }
      return;
    }
    if (!userId) {
      if (loadedForUserId) reset();
      return;
    }
    if (loadedForUserId !== userId) void loadDocuments(userId);
  }, [preview, userId]);

  const reload = useCallback(() => {
    if (preview) {
      loadedForUserId = null;
      setState(EMPTY_STATE);
      return;
    }
    if (userId) void loadDocuments(userId);
  }, [preview, userId]);

  const createNote = useCallback(async (input: CreateNoteInput): Promise<CloudLibraryNote> => {
    const title = safeLibraryTitle(input.title);
    const folder = normalizeLibraryFolder(input.folder ?? "");
    const path = uniqueNotePath(title, folder);
    const content = input.content ?? `# ${title}\n\n`;
    const now = new Date().toISOString();

    if (preview) {
      const note = { id: `preview-${crypto.randomUUID()}`, path, title, content, updatedAt: now };
      setState({ ...state, notes: [note, ...state.notes], selectedPath: path });
      return note;
    }
    if (!userId) throw new Error("Sign in to create a note.");

    const { data, error } = await supabase
      .from("readable_library_documents")
      .insert({ user_id: userId, path, kind: "note", title, content, deleted: false, updated_at: now })
      .select("id,path,title,content,updated_at")
      .single();
    if (error) throw new Error(error.message);
    const note = toNote(data);
    if (!note) throw new Error("The note was saved but returned an invalid response.");
    setState({ ...state, notes: [note, ...state.notes], selectedPath: note.path });
    return note;
  }, [preview, userId]);

  const createFolder = useCallback(async (rawPath: string): Promise<string> => {
    const path = normalizeLibraryFolder(rawPath);
    if (!path) throw new Error("Enter a folder name.");
    if (state.folders.some((folder) => folder.toLocaleLowerCase() === path.toLocaleLowerCase())) return path;
    if (preview) {
      setState({ ...state, folders: [...state.folders, path] });
      return path;
    }
    if (!userId) throw new Error("Sign in to create a folder.");
    const title = path.split("/").pop() ?? path;
    const { error } = await supabase.from("readable_library_documents").insert({
      user_id: userId,
      path,
      kind: "folder",
      title,
      content: null,
      deleted: false,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    setState({ ...state, folders: [...state.folders, path] });
    return path;
  }, [preview, userId]);

  const saveNote = useCallback(async (input: SaveNoteInput): Promise<CloudLibraryNote> => {
    const existing = state.notes.find((note) => note.id === input.id);
    if (!existing) throw new Error("That note is no longer in the Library.");
    const title = safeLibraryTitle(input.title);
    const updatedAt = new Date().toISOString();
    const note = { ...existing, title, content: input.content, updatedAt };
    if (!preview) {
      if (!userId) throw new Error("Sign in to save this note.");
      const { error } = await supabase
        .from("readable_library_documents")
        .update({ title, content: input.content, updated_at: updatedAt })
        .eq("id", input.id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    setState({ ...state, notes: state.notes.map((item) => (item.id === note.id ? note : item)) });
    return note;
  }, [preview, userId]);

  const deleteNote = useCallback(async (id: string): Promise<void> => {
    const existing = state.notes.find((note) => note.id === id);
    if (!existing) return;
    if (!preview) {
      if (!userId) throw new Error("Sign in to delete this note.");
      const { error } = await supabase
        .from("readable_library_documents")
        .update({ deleted: true, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    const notes = state.notes.filter((note) => note.id !== id);
    setState({ ...state, notes, selectedPath: state.selectedPath === existing.path ? (notes[0]?.path ?? null) : state.selectedPath });
  }, [preview, userId]);

  return {
    ...snap,
    select: useCallback((path: string | null) => select(path), []),
    reload,
    createNote,
    createFolder,
    saveNote,
    deleteNote,
  };
}
