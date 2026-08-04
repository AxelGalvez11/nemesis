// Container pages list what lives inside them (owner 2026-08-04: "why doesnt
// the library home note automatically link to all the notes within it?" /
// "should folder notes be able to link to all the notes within it?").
//
// The index is DERIVED from the note list at render time — like backlinks and
// the Sources footer, it is never written into the note's markdown, so it can
// never drift: make a note anywhere and the folder page above it already
// links to it. Only container pages carry an index — the Home note (library
// root) and folder notes; ordinary notes return null.

import { folderKey, isFolderNote, parentFolderOf, segmentKey } from "./library-folder-note";
import { isHomeNote } from "./library-home";
import type { CloudLibraryNote } from "./library-tree";

export interface FolderIndexFolder {
  /** Display name of the subfolder (original casing of its first appearance). */
  name: string;
  /** Slash-joined folder path, ready for openFolderPage. */
  path: string;
}

export interface FolderIndex {
  folders: FolderIndexFolder[];
  notes: CloudLibraryNote[];
}

function cleanSegments(path: string): string[] {
  return path.split("/").map((segment) => segment.trim()).filter(Boolean);
}

/** Same hand-position-then-title order the sidebar tree uses (library-tree.ts). */
function byHandPositionThenTitle(a: CloudLibraryNote, b: CloudLibraryNote): number {
  const ap = typeof a.position === "number" ? a.position : null;
  const bp = typeof b.position === "number" ? b.position : null;
  if (ap === null && bp === null) return (a.title || "").localeCompare(b.title || "");
  if (ap === null) return 1;
  if (bp === null) return -1;
  return ap - bp || (a.title || "").localeCompare(b.title || "");
}

/**
 * Everything directly inside `folderPath` ("" = library root): child notes,
 * plus one entry per immediate subfolder (derived from deeper note paths —
 * folders have no rows of their own). `excludeId` drops the container page
 * itself so a folder note never lists itself.
 */
export function folderIndex(
  notes: readonly CloudLibraryNote[],
  folderPath: string,
  excludeId?: string,
): FolderIndex {
  const wanted = folderKey(folderPath);
  const prefix = wanted ? `${wanted}/` : "";
  const depth = wanted ? wanted.split("/").length : 0;
  const children: CloudLibraryNote[] = [];
  const subfolders = new Map<string, FolderIndexFolder>();

  for (const note of notes) {
    const parent = folderKey(parentFolderOf(note.path));
    if (parent === wanted) {
      if (excludeId && note.id === excludeId) continue;
      // The only folder note that can sit directly here is this folder's own
      // page — belt to excludeId's suspenders.
      if (isFolderNote(note)) continue;
      children.push(note);
      continue;
    }
    if (!parent.startsWith(prefix) || parent.length <= wanted.length) continue;
    const segments = cleanSegments(note.path);
    const name = segments[depth];
    if (!name) continue;
    const key = prefix + segmentKey(name);
    if (!subfolders.has(key)) {
      subfolders.set(key, { name: name.replace(/\.(md|markdown|txt)$/i, ""), path: segments.slice(0, depth + 1).join("/") });
    }
  }

  return {
    folders: [...subfolders.values()].sort((a, b) => a.name.localeCompare(b.name)),
    notes: children.sort(byHandPositionThenTitle),
  };
}

/** The index the open note should render, or null for an ordinary note. */
export function folderIndexFor(
  note: Pick<CloudLibraryNote, "id" | "path" | "title">,
  notes: readonly CloudLibraryNote[],
): FolderIndex | null {
  if (isFolderNote(note)) return folderIndex(notes, parentFolderOf(note.path), note.id);
  if (isHomeNote(note)) return folderIndex(notes, "", note.id);
  return null;
}
