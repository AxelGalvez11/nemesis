// Pure decision logic for the web Library's LIVE refresh (owner ask 2026-07-21):
// when Supabase Realtime reports a change to readable_library_documents (a phone
// edit, another tab, an agent tool), these helpers decide what the event MEANS
// and how to fold fresh rows into the store's state — no I/O, no React, so the
// whole merge policy is node:test-able like the rest of lib/workspace.
//
// Policy notes the store relies on:
// - A note INSERT/UPDATE becomes "note-touch": the store re-fetches that row by
//   id instead of trusting the event payload (Realtime truncates rows over its
//   payload cap, and the fetch also returns the server-stamped updated_at).
// - Deletes in this product are SOFT (deleted=true updates); both those and
//   hard DELETEs map to "remove".
// - Anything malformed maps to "resync" — a full quiet reload — never a guess.
import { normalizeLibraryFolder } from "./library-links";
import { titleFromPath, type CloudLibraryNote } from "./library-tree";

function isObj(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Row → note, shared by the store's list/load queries and the live re-fetches.
 *  Blank titles fall back to the filename; a missing created_at borrows updated_at. */
export function libraryRowToNote(raw: unknown): CloudLibraryNote | null {
  if (!isObj(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  const path = typeof raw.path === "string" ? raw.path : "";
  if (!id || !path) return null;
  const rawTitle = typeof raw.title === "string" ? raw.title.trim() : "";
  const updatedAt = typeof raw.updated_at === "string" ? raw.updated_at : "";
  return {
    id,
    path,
    title: rawTitle || titleFromPath(path),
    content: typeof raw.content === "string" ? raw.content : "",
    updatedAt,
    createdAt: typeof raw.created_at === "string" ? raw.created_at : updatedAt,
  };
}

export type LiveAction =
  | { kind: "remove"; id: string }
  | { kind: "folder-upsert"; id: string; path: string }
  | { kind: "note-touch"; id: string }
  | { kind: "resync" }
  | { kind: "ignore" };

export interface LiveEventShape {
  eventType: string;
  newRow: unknown;
  oldRow: unknown;
}

/** Classify one realtime event into the store's vocabulary. */
export function classifyLiveEvent({ eventType, newRow, oldRow }: LiveEventShape): LiveAction {
  if (eventType === "DELETE") {
    const id = isObj(oldRow) && typeof oldRow.id === "string" ? oldRow.id : "";
    return id ? { kind: "remove", id } : { kind: "resync" };
  }
  if (eventType !== "INSERT" && eventType !== "UPDATE") return { kind: "resync" };
  if (!isObj(newRow) || typeof newRow.id !== "string" || !newRow.id) return { kind: "resync" };
  if (newRow.deleted === true) return { kind: "remove", id: newRow.id };
  if (newRow.kind === "folder") {
    const path = typeof newRow.path === "string" ? normalizeLibraryFolder(newRow.path) : "";
    return path ? { kind: "folder-upsert", id: newRow.id, path } : { kind: "resync" };
  }
  if (newRow.kind === "note") return { kind: "note-touch", id: newRow.id };
  return { kind: "ignore" };
}

// --- folder bookkeeping -------------------------------------------------------
// The store's public `folders` is a string[] of paths, but a folder RENAME event
// only carries the row's NEW path — so live refresh tracks folder rows by id in
// a map and derives the paths from it. Helpers return the SAME reference on a
// no-op so callers can skip re-rendering.

export function upsertLiveFolder(
  folders: ReadonlyMap<string, string>,
  id: string,
  path: string,
): ReadonlyMap<string, string> {
  if (folders.get(id) === path) return folders;
  const next = new Map(folders);
  next.set(id, path);
  return next;
}

export function removeLiveFolder(folders: ReadonlyMap<string, string>, id: string): ReadonlyMap<string, string> {
  if (!folders.has(id)) return folders;
  const next = new Map(folders);
  next.delete(id);
  return next;
}

export function folderPathsOf(folders: ReadonlyMap<string, string>): string[] {
  return [...new Set(folders.values())];
}

// --- note merging -------------------------------------------------------------

function sameNote(a: CloudLibraryNote, b: CloudLibraryNote): boolean {
  return (
    a.id === b.id &&
    a.path === b.path &&
    a.title === b.title &&
    a.content === b.content &&
    a.updatedAt === b.updatedAt &&
    a.createdAt === b.createdAt
  );
}

/** Selection repair shared by event merges and full quiet reloads: keep a
 *  still-valid path, follow the selected note's id through a rename, otherwise
 *  fall back to the first note (matching what a fresh load selects). */
export function repairSelection(
  previous: readonly CloudLibraryNote[],
  next: readonly CloudLibraryNote[],
  selectedPath: string | null,
): string | null {
  const first = next[0]?.path ?? null;
  if (!selectedPath) return first;
  if (next.some((note) => note.path === selectedPath)) return selectedPath;
  const previouslySelected = previous.find((note) => note.path === selectedPath);
  if (previouslySelected) {
    const renamed = next.find((note) => note.id === previouslySelected.id);
    if (renamed) return renamed.path;
  }
  return first;
}

export interface LiveNotesMerge {
  notes: CloudLibraryNote[];
  selectedPath: string | null;
  changed: boolean;
}

/**
 * Fold live changes into the note list: drop `removedIds`, upsert `fetched`
 * (fresh server rows win over a simultaneous removal), and keep the list in the
 * load query's updated_at-descending order. Returns the INPUT array unchanged
 * (`changed: false`) when the merge is a no-op, so echoes of this tab's own
 * saves don't trigger pointless re-renders.
 */
export function mergeLiveNotes(
  notes: readonly CloudLibraryNote[],
  selectedPath: string | null,
  fetched: readonly CloudLibraryNote[],
  removedIds: ReadonlySet<string>,
): LiveNotesMerge {
  const fetchedIds = new Set(fetched.map((note) => note.id));
  const kept = notes.filter((note) => !removedIds.has(note.id) || fetchedIds.has(note.id));
  const byId = new Map(kept.map((note) => [note.id, note]));
  for (const incoming of fetched) byId.set(incoming.id, incoming);

  const next = [...byId.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  const nextSelected = repairSelection(notes, next, selectedPath);

  const unchanged =
    next.length === notes.length &&
    next.every((note, index) => {
      const before = notes[index];
      return before !== undefined && sameNote(note, before);
    }) &&
    nextSelected === selectedPath;
  // Hand back the caller's own array (safe: it was built by the store and is
  // never mutated here) so an unchanged merge is reference-detectable.
  if (unchanged) return { notes: notes as CloudLibraryNote[], selectedPath, changed: false };

  return { notes: next, selectedPath: nextSelected, changed: true };
}
