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
  createdAt: string;
  /** Hand-arranged slot within this note's folder, or null/absent if it has
   *  never been dragged. Written by the phone (apps/mobile/src/lib/library-order.ts);
   *  the web reads it so an arrangement made on one surface shows on the other.
   *  Optional because the column is nullable and most rows simply do not carry
   *  one — buildLibraryTree normalizes a missing value to null. */
  position?: number | null;
}

export interface LibraryTreeNote {
  kind: "note";
  id: string;
  path: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  addedOrder: number;
  position: number | null;
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
export type LibrarySortMode = "az" | "za" | "modified" | "added" | "manual";

export function buildLibraryTree(
  notes: { path: string; title: string; updatedAt?: string; createdAt?: string; position?: number | null }[],
  folderPaths: readonly string[] = [],
  sortMode: LibrarySortMode = "az",
): LibraryTreeFolder {
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

  notes.forEach((note, addedOrder) => {
    const segments = note.path.split("/").filter(Boolean);
    if (segments.length === 0) return;

    const folderSegments = segments.slice(0, -1);
    const cursor = ensureFolder(folderSegments);

    const title = note.title.trim().length > 0 ? note.title.trim() : titleFromPath(note.path);
    cursor.notes.push({
      kind: "note",
      id: "id" in note && typeof note.id === "string" ? note.id : note.path,
      path: note.path,
      title,
      updatedAt: note.updatedAt ?? "",
      createdAt: note.createdAt ?? note.updatedAt ?? "",
      addedOrder,
      position: typeof note.position === "number" ? note.position : null,
    });
  });

  sortFolder(root, sortMode);
  return root;
}

/** Total note count across every folder in the tree (the sidebar's "N notes" header). */
export function countLibraryNotes(folder: LibraryTreeFolder): number {
  return folder.notes.length + folder.folders.reduce((sum, child) => sum + countLibraryNotes(child), 0);
}

function latestModified(folder: LibraryTreeFolder): number {
  return Math.max(0, ...folder.notes.map((note) => Date.parse(note.updatedAt) || 0), ...folder.folders.map(latestModified));
}

function earliestAddedOrder(folder: LibraryTreeFolder): number {
  return Math.min(Number.MAX_SAFE_INTEGER, ...folder.notes.map((note) => note.addedOrder), ...folder.folders.map(earliestAddedOrder));
}

function latestCreated(folder: LibraryTreeFolder): number {
  return Math.max(0, ...folder.notes.map((note) => Date.parse(note.createdAt) || 0), ...folder.folders.map(latestCreated));
}

/**
 * Order two notes by the slot the student dragged them into.
 *
 * Ported line for line from the phone's compareManual (apps/mobile/src/lib/
 * library-order.ts) — the two surfaces read the SAME `position` column, so any
 * difference here shows up as the same library in two different orders.
 *
 * NULL SORTS LAST, tie-broken by title. Notes arrive from the web app, from
 * chat and from the recorder, none of which set a position, so most of a real
 * library is null. Sorting null first would bury the arrangement the student
 * made under every note they have ever created.
 *
 * Positions are only comparable WITHIN one folder, which is exactly the scope
 * this runs in — sortFolder sorts one folder's notes at a time.
 */
function compareManual(a: LibraryTreeNote, b: LibraryTreeNote): number {
  if (a.position === null && b.position === null) return a.title.localeCompare(b.title);
  if (a.position === null) return 1;
  if (b.position === null) return -1;
  return a.position - b.position || a.title.localeCompare(b.title);
}

function sortFolder(folder: LibraryTreeFolder, mode: LibrarySortMode): void {
  const direction = mode === "za" ? -1 : 1;
  folder.folders.sort((a, b) => {
    // Folders carry no position of their own, so "My order" falls back to
    // newest-modified-first for them — the same fall-through the phone's
    // compareFolders lands on for its "manual" key.
    if (mode === "modified" || mode === "manual") return latestModified(b) - latestModified(a) || a.name.localeCompare(b.name);
    if (mode === "added") return latestCreated(b) - latestCreated(a) || earliestAddedOrder(a) - earliestAddedOrder(b) || a.name.localeCompare(b.name);
    return direction * a.name.localeCompare(b.name);
  });
  folder.notes.sort((a, b) => {
    if (mode === "manual") return compareManual(a, b);
    if (mode === "modified") return (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) || a.title.localeCompare(b.title);
    if (mode === "added") return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || a.addedOrder - b.addedOrder || a.title.localeCompare(b.title);
    return direction * a.title.localeCompare(b.title);
  });
  for (const child of folder.folders) sortFolder(child, mode);
}
