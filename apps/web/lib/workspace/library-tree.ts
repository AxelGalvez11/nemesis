// Cloud library note -> folder-tree model. Pure path-splitting logic, no I/O — the web
// counterpart to the desktop Library sidebar's folder/note grouping (see also the phone's
// flatter top-level-only buildSections in apps/mobile/src/lib/library-sync.ts). Kept separate
// from library-cloud-store.ts so the tree math stays trivially readable/testable on its own.

export interface CloudLibraryNote {
  id: string;
  path: string;
  title: string;
  content: string;
  updatedAt: string;
}

export interface LibraryTreeNote {
  kind: "note";
  path: string;
  title: string;
}

export interface LibraryTreeFolder {
  kind: "folder";
  /** This folder's own name (e.g. "Unit 3"), not its full path. */
  name: string;
  /** Full slash-joined path from the vault root (e.g. "Pharmacology/Unit 3"). */
  path: string;
  folders: LibraryTreeFolder[];
  notes: LibraryTreeNote[];
}

/** Last path segment with a known note extension stripped — the filename-derived fallback
 *  title used when a row's `title` column is blank. */
export function titleFromPath(path: string): string {
  const segment = path.split("/").filter(Boolean).pop() ?? path;
  return segment.replace(/\.(md|markdown|txt)$/i, "");
}

/** Build a nested folder tree from flat `{path, title}` rows (split on '/'), the same shape
 *  the desktop Library sidebar groups into. Folders and notes are sorted alphabetically at
 *  every level; a blank/whitespace title falls back to `titleFromPath`. Rows with an empty
 *  path are skipped (defensive — should never happen for a well-formed row). */
export function buildLibraryTree(notes: { path: string; title: string }[], folderPaths: readonly string[] = []): LibraryTreeFolder {
  const root: LibraryTreeFolder = { kind: "folder", name: "", path: "", folders: [], notes: [] };

  const ensureFolder = (segments: readonly string[]): LibraryTreeFolder => {
    let cursor = root;
    let pathSoFar = "";
    for (const segment of segments) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment;
      const existing = cursor.folders.find((folder) => folder.name === segment);
      if (existing) {
        cursor = existing;
      } else {
        const created: LibraryTreeFolder = { kind: "folder", name: segment, path: pathSoFar, folders: [], notes: [] };
        cursor.folders.push(created);
        cursor = created;
      }
    }
    return cursor;
  };

  for (const folderPath of folderPaths) {
    ensureFolder(folderPath.split("/").map((segment) => segment.trim()).filter(Boolean));
  }

  for (const note of notes) {
    const segments = note.path.split("/").filter(Boolean);
    if (segments.length === 0) continue;

    const folderSegments = segments.slice(0, -1);
    const cursor = ensureFolder(folderSegments);

    const title = note.title.trim().length > 0 ? note.title.trim() : titleFromPath(note.path);
    cursor.notes.push({ kind: "note", path: note.path, title });
  }

  sortFolder(root);
  return root;
}

/** Total note count across every folder in the tree (the sidebar's "N notes" header). */
export function countLibraryNotes(folder: LibraryTreeFolder): number {
  return folder.notes.length + folder.folders.reduce((sum, child) => sum + countLibraryNotes(child), 0);
}

function sortFolder(folder: LibraryTreeFolder): void {
  folder.folders.sort((a, b) => a.name.localeCompare(b.name));
  folder.notes.sort((a, b) => a.title.localeCompare(b.title));
  for (const child of folder.folders) sortFolder(child);
}
