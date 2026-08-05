// What a folder rename or move does to the rows underneath it — decided here,
// with no database in the way.
//
// This was inline inside agent-tools.ts, wrapped in Supabase calls, which meant
// the two properties the owner accepted Phase 1 on could only ever be checked by
// hand against production:
//
//   1. renaming a folder KEEPS its folder page and carries the page's title
//      along. A folder page is recognized BY NAME, so a rename that rewrote
//      paths and left the title alone silently orphaned the page and the app
//      grew a second, empty one on next open.
//   2. renaming the folder `test` does NOT touch a note called `test.md`
//      sitting at the top level. They share a name and nothing else.
//
// Pulling the decision out makes both permanent tests instead of screenshots.
// The database half (load the subtree, apply the patches in order, report how
// far it got) stays in agent-tools.ts.

/** The columns a relocation actually reasons about. */
export interface LibraryFolderRow {
  id: string;
  path: string;
  kind: string;
  title: string;
}

/** One row's new path, and its new title when the rename changes that too. */
export interface LibraryFolderPatch {
  id: string;
  path: string;
  title?: string;
}

/**
 * Is `path` the folder itself or something inside it?
 *
 * 🔴 The slash is the whole point. `test.md` is not inside `test`, and neither
 * is `testing/notes.md` — a `startsWith("test")` check would sweep up both and
 * a folder rename would quietly rename unrelated notes. The subtree loader
 * filters through this function so the SQL `LIKE` pattern and the rule the
 * tests pin can never mean two different things.
 */
export function isInLibrarySubtree(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

const nameKey = (value: string) => value.trim().toLowerCase().replace(/\.md$/, "");

/**
 * Is this row the folder's OWN page (the Notion model, where opening a folder
 * opens a note that belongs to it)? Same rule as library-folder-note.ts's
 * `isFolderNote`: it sits directly in the folder and either its filename or its
 * title matches the folder's name. Kept in sync by a shared test fixture rather
 * than by import, because agent-tools.ts must stay free of UI code.
 */
export function isFolderPageOf(
  row: Pick<LibraryFolderRow, "kind" | "path" | "title">,
  folder: string,
  folderLeaf: string,
): boolean {
  if (row.kind === "folder") return false;
  const parent = row.path.includes("/") ? row.path.slice(0, row.path.lastIndexOf("/")) : "";
  if (parent !== folder) return false;
  const leaf = nameKey(row.path.split("/").pop() ?? "");
  return leaf === nameKey(folderLeaf) || nameKey(row.title) === nameKey(folderLeaf);
}

/**
 * Every row's new path (and title, where it changes) for moving `source` to
 * `destination`. Rows outside the subtree are ignored rather than trusted —
 * the loader already filters, and a planner that quietly rewrote a stray row
 * would be the exact bug this module exists to prevent.
 *
 * A MOVE keeps every title as it is: the folder still has the same name, it
 * just lives somewhere else. A RENAME changes the folder's name, so the folder
 * page's title has to follow or the page stops being recognized as the page.
 */
export function planFolderRelocation(
  rows: readonly LibraryFolderRow[],
  source: string,
  destination: string,
  verb: "moved" | "renamed",
): LibraryFolderPatch[] {
  const sourceLeaf = source.split("/").pop() ?? source;
  const destinationLeaf = destination.split("/").pop() ?? destination;
  const patches: LibraryFolderPatch[] = [];
  for (const row of rows) {
    if (!isInLibrarySubtree(row.path, source)) continue;
    const path = row.path === source ? destination : `${destination}${row.path.slice(source.length)}`;
    if (row.kind === "folder") {
      patches.push({ id: row.id, path, title: path.split("/").pop() ?? path });
    } else if (verb === "renamed" && isFolderPageOf(row, source, sourceLeaf)) {
      patches.push({ id: row.id, path, title: destinationLeaf });
    } else {
      patches.push({ id: row.id, path });
    }
  }
  return patches;
}
