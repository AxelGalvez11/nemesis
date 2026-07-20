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

function uniqueNotePath(title: string, folder: string, excludeId?: string): string {
  const first = notePathFor(title, folder);
  if (!state.notes.some((note) => note.id !== excludeId && note.path.toLocaleLowerCase() === first.toLocaleLowerCase())) return first;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = notePathFor(`${title} ${suffix}`, folder);
    if (!state.notes.some((note) => note.id !== excludeId && note.path.toLocaleLowerCase() === candidate.toLocaleLowerCase())) return candidate;
  }
  return notePathFor(`${title} ${Date.now()}`, folder);
}

function isUniquePathViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "23505" || /readable_library_documents_user_id_path_key|duplicate key value/i.test(error.message ?? "");
}

function noteCandidate(title: string, folder: string, suffix: number) {
  const candidateTitle = suffix === 1 ? title : `${title} ${suffix}`;
  return { title: candidateTitle, path: notePathFor(candidateTitle, folder) };
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
  deleteFolder: (path: string) => Promise<void>;
  renameNote: (id: string, title: string) => Promise<void>;
  renameFolder: (path: string, name: string) => Promise<void>;
  moveNote: (id: string, targetFolder: string) => Promise<void>;
  moveFolder: (sourcePath: string, targetFolder: string) => Promise<void>;
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
    const now = new Date().toISOString();

    if (preview) {
      const path = uniqueNotePath(title, folder);
      const candidateTitle = titleFromPath(path);
      const content = input.content ?? `# ${candidateTitle}\n\n`;
      const note = { id: `preview-${crypto.randomUUID()}`, path, title: candidateTitle, content, updatedAt: now };
      setState({ ...state, notes: [note, ...state.notes], selectedPath: path });
      return note;
    }
    if (!userId) throw new Error("Sign in to create a note.");

    // The database's (user_id, path) constraint also includes soft-deleted
    // documents, while the in-memory Library intentionally does not. Retry
    // with a readable suffix instead of exposing a raw Postgres error or
    // reviving/overwriting a deleted note via upsert.
    for (let suffix = 1; suffix <= 999; suffix += 1) {
      const candidate = noteCandidate(title, folder, suffix);
      if (state.notes.some((note) => note.path.toLocaleLowerCase() === candidate.path.toLocaleLowerCase())) continue;
      const content = input.content ?? `# ${candidate.title}\n\n`;
      const { data, error } = await supabase
        .from("readable_library_documents")
        .insert({ user_id: userId, path: candidate.path, kind: "note", title: candidate.title, content, deleted: false, updated_at: now })
        .select("id,path,title,content,updated_at")
        .single();
      if (isUniquePathViolation(error)) continue;
      if (error) throw new Error(error.message);
      const note = toNote(data);
      if (!note) throw new Error("The note was saved but returned an invalid response.");
      setState({ ...state, notes: [note, ...state.notes], selectedPath: note.path });
      return note;
    }
    throw new Error("Couldn't find an available name for this note.");
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
    const parent = path.split("/").slice(0, -1).join("/");
    const baseTitle = path.split("/").pop() ?? path;
    for (let suffix = 1; suffix <= 999; suffix += 1) {
      const title = suffix === 1 ? baseTitle : `${baseTitle} ${suffix}`;
      const candidate = parent ? `${parent}/${title}` : title;
      if (state.folders.some((folder) => folder.toLocaleLowerCase() === candidate.toLocaleLowerCase())) continue;
      const { error } = await supabase.from("readable_library_documents").insert({
        user_id: userId,
        path: candidate,
        kind: "folder",
        title,
        content: null,
        deleted: false,
        updated_at: new Date().toISOString(),
      });
      if (isUniquePathViolation(error)) continue;
      if (error) throw new Error(error.message);
      setState({ ...state, folders: [...state.folders, candidate] });
      return candidate;
    }
    throw new Error("Couldn't find an available name for this folder.");
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

  const deleteFolder = useCallback(async (rawPath: string): Promise<void> => {
    const path = normalizeLibraryFolder(rawPath);
    if (!path) return;
    const affectedNotes = state.notes.filter((note) => note.path.startsWith(`${path}/`));
    const affectedFolders = state.folders.filter((folder) => folder === path || folder.startsWith(`${path}/`));
    if (!preview) {
      if (!userId) throw new Error("Sign in to delete this folder.");
      const updatedAt = new Date().toISOString();
      const results = await Promise.all([
        ...affectedNotes.map((note) => supabase.from("readable_library_documents").update({ deleted: true, updated_at: updatedAt }).eq("id", note.id).eq("user_id", userId)),
        ...affectedFolders.map((folder) => supabase.from("readable_library_documents").update({ deleted: true, updated_at: updatedAt }).eq("path", folder).eq("kind", "folder").eq("user_id", userId)),
      ]);
      const failure = results.find((result) => result.error)?.error;
      if (failure) throw new Error(failure.message);
    }
    const deletedNoteIds = new Set(affectedNotes.map((note) => note.id));
    const notes = state.notes.filter((note) => !deletedNoteIds.has(note.id));
    const selectionDeleted = state.selectedPath?.startsWith(`${path}/`) ?? false;
    setState({
      ...state,
      notes,
      folders: state.folders.filter((folder) => !affectedFolders.includes(folder)),
      selectedPath: selectionDeleted ? (notes[0]?.path ?? null) : state.selectedPath,
    });
  }, [preview, userId]);

  const renameNote = useCallback(async (id: string, rawTitle: string): Promise<void> => {
    const existing = state.notes.find((note) => note.id === id);
    if (!existing) return;
    const title = safeLibraryTitle(rawTitle);
    const folder = existing.path.split("/").slice(0, -1).join("/");
    const path = uniqueNotePath(title, folder, id);
    if (!preview) {
      if (!userId) throw new Error("Sign in to rename this note.");
      const { error } = await supabase.from("readable_library_documents").update({ title, path, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    setState({
      ...state,
      notes: state.notes.map((note) => note.id === id ? { ...note, title, path } : note),
      selectedPath: state.selectedPath === existing.path ? path : state.selectedPath,
    });
  }, [preview, userId]);

  const moveNote = useCallback(async (id: string, rawTargetFolder: string): Promise<void> => {
    const existing = state.notes.find((note) => note.id === id);
    if (!existing) return;
    const targetFolder = normalizeLibraryFolder(rawTargetFolder);
    const candidate = notePathFor(existing.title, targetFolder);
    const path = state.notes.some((note) => note.id !== id && note.path.toLowerCase() === candidate.toLowerCase())
      ? uniqueNotePath(existing.title, targetFolder)
      : candidate;
    if (path === existing.path) return;
    if (!preview) {
      if (!userId) throw new Error("Sign in to move this note.");
      const { error } = await supabase.from("readable_library_documents").update({ path, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    setState({
      ...state,
      notes: state.notes.map((note) => note.id === id ? { ...note, path } : note),
      selectedPath: state.selectedPath === existing.path ? path : state.selectedPath,
    });
  }, [preview, userId]);

  const moveFolder = useCallback(async (rawSourcePath: string, rawTargetFolder: string): Promise<void> => {
    const sourcePath = normalizeLibraryFolder(rawSourcePath);
    const targetFolder = normalizeLibraryFolder(rawTargetFolder);
    if (!sourcePath) return;
    if (targetFolder === sourcePath || targetFolder.startsWith(`${sourcePath}/`)) throw new Error("A folder can't be moved inside itself.");
    const name = sourcePath.split("/").pop() ?? sourcePath;
    const destination = targetFolder ? `${targetFolder}/${name}` : name;
    if (destination === sourcePath) return;
    if (state.folders.some((folder) => folder !== sourcePath && folder.toLowerCase() === destination.toLowerCase())) {
      throw new Error("A folder with that name already exists there.");
    }
    const remap = (path: string) => path === sourcePath ? destination : path.startsWith(`${sourcePath}/`) ? `${destination}${path.slice(sourcePath.length)}` : path;
    const movedNotes = state.notes.filter((note) => note.path.startsWith(`${sourcePath}/`));
    const movedFolders = state.folders.filter((folder) => folder === sourcePath || folder.startsWith(`${sourcePath}/`));
    if (!preview) {
      if (!userId) throw new Error("Sign in to move this folder.");
      const updates = [
        ...movedNotes.map((note) => supabase.from("readable_library_documents").update({ path: remap(note.path), updated_at: new Date().toISOString() }).eq("id", note.id).eq("user_id", userId)),
        ...movedFolders.map((folder) => supabase.from("readable_library_documents").update({ path: remap(folder), updated_at: new Date().toISOString() }).eq("path", folder).eq("kind", "folder").eq("user_id", userId)),
      ];
      const results = await Promise.all(updates);
      const failure = results.find((result) => result.error)?.error;
      if (failure) throw new Error(failure.message);
    }
    setState({
      ...state,
      notes: state.notes.map((note) => note.path.startsWith(`${sourcePath}/`) ? { ...note, path: remap(note.path) } : note),
      folders: state.folders.map(remap),
      selectedPath: state.selectedPath?.startsWith(`${sourcePath}/`) ? remap(state.selectedPath) : state.selectedPath,
    });
  }, [preview, userId]);

  const renameFolder = useCallback(async (rawPath: string, rawName: string): Promise<void> => {
    const sourcePath = normalizeLibraryFolder(rawPath);
    const parent = sourcePath.split("/").slice(0, -1).join("/");
    const name = normalizeLibraryFolder(rawName).split("/").pop() ?? "";
    if (!sourcePath || !name) return;
    const destination = parent ? `${parent}/${name}` : name;
    if (destination === sourcePath) return;
    if (state.folders.some((folder) => folder !== sourcePath && folder.toLowerCase() === destination.toLowerCase())) {
      throw new Error("A folder with that name already exists there.");
    }
    const remap = (path: string) => path === sourcePath ? destination : path.startsWith(`${sourcePath}/`) ? `${destination}${path.slice(sourcePath.length)}` : path;
    const movedNotes = state.notes.filter((note) => note.path.startsWith(`${sourcePath}/`));
    const movedFolders = state.folders.filter((folder) => folder === sourcePath || folder.startsWith(`${sourcePath}/`));
    if (!preview) {
      if (!userId) throw new Error("Sign in to rename this folder.");
      const updatedAt = new Date().toISOString();
      const results = await Promise.all([
        ...movedNotes.map((note) => supabase.from("readable_library_documents").update({ path: remap(note.path), updated_at: updatedAt }).eq("id", note.id).eq("user_id", userId)),
        ...movedFolders.map((folder) => supabase.from("readable_library_documents").update({ path: remap(folder), title: remap(folder).split("/").pop(), updated_at: updatedAt }).eq("path", folder).eq("kind", "folder").eq("user_id", userId)),
      ]);
      const failure = results.find((result) => result.error)?.error;
      if (failure) throw new Error(failure.message);
    }
    setState({
      ...state,
      notes: state.notes.map((note) => note.path.startsWith(`${sourcePath}/`) ? { ...note, path: remap(note.path) } : note),
      folders: state.folders.map(remap),
      selectedPath: state.selectedPath?.startsWith(`${sourcePath}/`) ? remap(state.selectedPath) : state.selectedPath,
    });
  }, [preview, userId]);

  return {
    ...snap,
    select: useCallback((path: string | null) => select(path), []),
    reload,
    createNote,
    createFolder,
    saveNote,
    deleteNote,
    deleteFolder,
    renameNote,
    renameFolder,
    moveNote,
    moveFolder,
  };
}
