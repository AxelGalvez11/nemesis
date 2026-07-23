// Pure row/selection math for the composer's "Library" attachment picker
// (owner 2026-07-23, alongside retiring the Notebooks page: school documents
// live in the Library, so the chat's "+" has to be able to reach into it).
//
// DOM-free and store-free on purpose, like library-selection.ts and
// library-tree.ts — the picker dialog only renders what these return.
//
// The selection is a set of NOTE ids and nothing else. A folder is not a
// selectable thing in its own right: ticking one means "every note underneath
// it", so a half-emptied folder degrades to "some" rather than going stale, and
// the caller never has to reconcile two kinds of key when it builds the files.

import type { LibraryTreeFolder } from "./library-tree";

export interface PickerFolderRow {
  kind: "folder";
  /** Render key AND expand key. Namespaced so a folder can never collide with a
   *  note whose id happens to equal a path. */
  key: string;
  path: string;
  name: string;
  depth: number;
  /** Every note under this folder, at any depth. */
  noteIds: string[];
}

export interface PickerNoteRow {
  kind: "note";
  key: string;
  id: string;
  path: string;
  title: string;
  depth: number;
}

export type PickerRow = PickerFolderRow | PickerNoteRow;

export type FolderCheckState = "none" | "some" | "all";

export function folderKey(path: string): string {
  return `folder:${path}`;
}

export function noteKey(id: string): string {
  return `note:${id}`;
}

/** Ids of every note under `folder`, including nested folders, in SCREEN order —
 *  sub-folders before loose notes, matching flattenPickerRows. Keeping the one
 *  definition of "tree order" here is what lets orderedSelection hand back files
 *  in the order the student read them. */
export function collectNoteIds(folder: LibraryTreeFolder): string[] {
  const ids: string[] = [];
  for (const child of folder.folders) ids.push(...collectNoteIds(child));
  ids.push(...folder.notes.map((note) => note.id));
  return ids;
}

/** The visible rows, in document order: every folder at an expanded depth, and
 *  the notes of expanded folders. The root's own children are depth 0 and the
 *  root itself is always treated as expanded (it has no row to click). */
export function flattenPickerRows(
  root: LibraryTreeFolder,
  expanded: ReadonlySet<string>,
): PickerRow[] {
  const rows: PickerRow[] = [];

  const walk = (folder: LibraryTreeFolder, depth: number) => {
    for (const child of folder.folders) {
      rows.push({
        kind: "folder",
        key: folderKey(child.path),
        path: child.path,
        name: child.name,
        depth,
        noteIds: collectNoteIds(child),
      });
      if (expanded.has(folderKey(child.path))) walk(child, depth + 1);
    }
    for (const note of folder.notes) {
      rows.push({ kind: "note", key: noteKey(note.id), id: note.id, path: note.path, title: note.title, depth });
    }
  };

  walk(root, 0);
  return rows;
}

/** Search collapses the tree: matching notes only, flat, so a hit three folders
 *  deep is one keystroke away rather than three disclosure clicks. Matches on
 *  the title or anywhere in the path, so "Pharm" finds a folder's contents. */
export function searchPickerRows(root: LibraryTreeFolder, query: string): PickerNoteRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const rows: PickerNoteRow[] = [];

  const walk = (folder: LibraryTreeFolder) => {
    for (const note of folder.notes) {
      if (note.title.toLowerCase().includes(needle) || note.path.toLowerCase().includes(needle)) {
        rows.push({ kind: "note", key: noteKey(note.id), id: note.id, path: note.path, title: note.title, depth: 0 });
      }
    }
    for (const child of folder.folders) walk(child);
  };

  walk(root);
  return rows;
}

/** An empty folder reads as "none": there is nothing in it to have selected, and
 *  claiming "all" would draw a ticked box that attaches zero files. */
export function folderCheckState(noteIds: readonly string[], selected: ReadonlySet<string>): FolderCheckState {
  if (noteIds.length === 0) return "none";
  let hits = 0;
  for (const id of noteIds) if (selected.has(id)) hits += 1;
  if (hits === 0) return "none";
  return hits === noteIds.length ? "all" : "some";
}

/** Ticking a folder adds everything under it; only a FULLY selected folder
 *  clears. "Some" therefore fills up rather than emptying — the click that
 *  follows a partial state is far more often "I want the rest of these". */
export function toggleFolderSelection(selected: ReadonlySet<string>, noteIds: readonly string[]): Set<string> {
  const next = new Set(selected);
  if (folderCheckState(noteIds, selected) === "all") {
    for (const id of noteIds) next.delete(id);
  } else {
    for (const id of noteIds) next.add(id);
  }
  return next;
}

/** Filename for the virtual .md attachment a chosen note becomes. Slashes and
 *  colons would read as a path (and break the chip label), and a blank title
 *  still has to produce a nameable file. */
export function attachmentFileName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, "-").trim();
  return `${cleaned || "Note"}.md`;
}

/** Selected ids back into tree order, so five ticked notes attach in the order
 *  they are read on screen rather than the order they happened to be clicked. */
export function orderedSelection(root: LibraryTreeFolder, selected: ReadonlySet<string>): string[] {
  return collectNoteIds(root).filter((id) => selected.has(id));
}
