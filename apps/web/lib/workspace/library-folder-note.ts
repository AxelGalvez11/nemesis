// A folder IS a page (owner 2026-08-04: "shouldnt folders automatically
// generate a note for them? so like in notion how a folder is like a note?").
//
// The page behind a folder is an ORDINARY NOTE that lives directly inside the
// folder and carries the folder's own name — Obsidian's "folder note"
// convention, Notion's page-with-children behavior. Nothing new is stored and
// no schema changes: resolving is pure path arithmetic, and the note is
// created lazily the first time the folder is opened, so folders that appear
// implicitly (imports, moves, the librarian) never spawn rows nobody asked
// for. The docs tree hides the folder note as a child row — the folder row
// itself is the way in, exactly like Notion never lists a page inside itself.

import type { CloudLibraryNote } from "./library-tree";

/** Case-insensitive, extension-blind comparison key for one path segment. */
export function segmentKey(segment: string): string {
  return segment.trim().replace(/\.(md|markdown|txt)$/i, "").toLocaleLowerCase();
}

/** Comparison key for a whole folder path ("A/B" === "a/b "). */
export function folderKey(path: string): string {
  return path.split("/").map((segment) => segment.trim()).filter(Boolean).map(segmentKey).join("/");
}

/** The folder's own name — the title its note is created with. */
export function folderNoteTitle(folderPath: string): string {
  return folderPath.split("/").map((segment) => segment.trim()).filter(Boolean).pop() ?? folderPath.trim();
}

/** Slash-joined parent of a note path ("" for a top-level note). */
export function parentFolderOf(notePath: string): string {
  return notePath.split("/").map((segment) => segment.trim()).filter(Boolean).slice(0, -1).join("/");
}

/**
 * Is this note a folder's page? True when it sits directly inside a folder
 * whose name matches the note's own name (by filename, or by the title the
 * row carries). Top-level notes never qualify — the Library root's page is
 * the Home note, which has its own rule (library-home.ts).
 */
export function isFolderNote(note: Pick<CloudLibraryNote, "path" | "title">): boolean {
  const segments = note.path.split("/").map((segment) => segment.trim()).filter(Boolean);
  if (segments.length < 2) return false;
  const folderName = segmentKey(segments[segments.length - 2]!);
  const leaf = segmentKey(segments[segments.length - 1]!);
  const title = segmentKey(note.title || "");
  return folderName.length > 0 && (leaf === folderName || title === folderName);
}

/**
 * The note that IS this folder's page, or null when it hasn't been created
 * yet (the caller creates it on first open — that is the "automatically").
 */
export function findFolderNote(notes: readonly CloudLibraryNote[], folderPath: string): CloudLibraryNote | null {
  const wantedFolder = folderKey(folderPath);
  const wantedName = segmentKey(folderNoteTitle(folderPath));
  if (!wantedName) return null;
  return (
    notes.find((note) => {
      if (folderKey(parentFolderOf(note.path)) !== wantedFolder) return false;
      const leaf = note.path.split("/").map((segment) => segment.trim()).filter(Boolean).pop() ?? "";
      return segmentKey(leaf) === wantedName || segmentKey(note.title || "") === wantedName;
    }) ?? null
  );
}
