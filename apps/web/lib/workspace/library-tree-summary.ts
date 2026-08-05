// A deterministic, trustworthy view of the Library tree for the chat agent.
//
// The agent had NO way to look around: search_library requires a query, so
// "clean up my Library" started blind — the model could not enumerate folders
// or see where things sit. These helpers turn the flat path list into a
// summary that is complete BY CONSTRUCTION (every folder appears, every count
// is a real count) so the model never has to guess whether data was omitted.
// When a listing is clipped, the payload says so and says how to get the rest;
// silence is never truncation (owner 2026-08-05, tool-semantics rule).
//
// Pure functions over rows the caller fetched — testable without Supabase.

export interface LibraryTreeDoc {
  path: string;
  /** "note" | "folder" — anything else is treated as a note. */
  kind: string;
  title: string;
}

interface FolderStat {
  /** Notes sitting DIRECTLY in this folder. */
  notes: number;
  /** Notes anywhere at or beneath it. */
  totalNotes: number;
}

function parentOf(path: string): string {
  const at = path.lastIndexOf("/");
  return at === -1 ? "" : path.slice(0, at);
}

/** Every folder that exists — explicit folder rows plus every ancestor a note's
 *  path implies (a note at "A/B/c.md" proves folders "A" and "A/B" exist). */
function collectFolderStats(docs: readonly LibraryTreeDoc[]): Map<string, FolderStat> {
  const folders = new Map<string, FolderStat>();
  const ensure = (path: string) => {
    if (!path) return;
    if (!folders.has(path)) folders.set(path, { notes: 0, totalNotes: 0 });
  };
  for (const doc of docs) {
    if (doc.kind === "folder") {
      ensure(doc.path);
      for (let parent = parentOf(doc.path); parent; parent = parentOf(parent)) ensure(parent);
      continue;
    }
    const home = parentOf(doc.path);
    for (let ancestor = home; ancestor; ancestor = parentOf(ancestor)) ensure(ancestor);
    if (home) {
      const direct = folders.get(home);
      if (direct) direct.notes += 1;
    }
    for (let ancestor = home; ancestor; ancestor = parentOf(ancestor)) {
      const stat = folders.get(ancestor);
      if (stat) stat.totalNotes += 1;
    }
  }
  return folders;
}

export interface LibraryTreeSummary {
  total_notes: number;
  total_folders: number;
  /** Notes sitting at the Library root, outside any folder. */
  root_notes: number;
  /** Those root notes, named.
   *
   *  Owner 2026-08-05, acceptance test 6: the summary reported `root_notes: 3`
   *  and gave no way to see them — expanding "" fell through to this same
   *  summary and search_library rejects an empty query. The agent said so out
   *  loud ("the tree says root_notes: 3, but I haven't seen them"), guessed
   *  search terms, and burned its whole tool budget. A count you cannot resolve
   *  is worse than no count. */
  root_note_list: { title: string; path: string }[];
  /** Every folder, sorted by path: nothing is sampled or dropped. */
  folders: { path: string; notes: number; total_notes: number }[];
  complete: true;
}

/** The whole tree at folder granularity, plus the root notes by name.
 *  Complete: every folder is listed with real counts; note TITLES inside
 *  folders come from expandLibraryFolder per branch. */
export function summarizeLibraryTree(docs: readonly LibraryTreeDoc[]): LibraryTreeSummary {
  const stats = collectFolderStats(docs);
  const notes = docs.filter((doc) => doc.kind !== "folder");
  const root = notes.filter((doc) => !doc.path.includes("/")).sort((a, b) => a.path.localeCompare(b.path));
  return {
    complete: true,
    folders: [...stats.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, stat]) => ({ notes: stat.notes, path, total_notes: stat.totalNotes })),
    root_note_list: root.slice(0, FOLDER_EXPAND_NOTE_CAP).map((doc) => ({ path: doc.path, title: doc.title })),
    root_notes: root.length,
    total_folders: stats.size,
    total_notes: notes.length,
  };
}

/** How many note rows one branch expansion will list before clipping. High on
 *  purpose — a real course folder holds dozens of notes, not thousands. */
export const FOLDER_EXPAND_NOTE_CAP = 200;

export interface LibraryFolderListing {
  folder: string;
  subfolders: { path: string; notes: number; total_notes: number }[];
  notes: { title: string; path: string }[];
  /** The REAL number of direct notes, whether or not all were listed. */
  note_count: number;
  /** False only when note_count exceeded the cap — the payload says so. */
  complete: boolean;
  clipped_note?: string;
}

/** One folder, fully: its direct subfolders (with counts) and its direct notes
 *  (title + path). Pass "" for the Library root. */
export function expandLibraryFolder(docs: readonly LibraryTreeDoc[], folder: string): LibraryFolderListing {
  const clean = folder.trim().replace(/^\/+|\/+$/g, "");
  const stats = collectFolderStats(docs);
  const subfolders = [...stats.entries()]
    .filter(([path]) => parentOf(path) === clean && path !== clean)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, stat]) => ({ notes: stat.notes, path, total_notes: stat.totalNotes }));
  const direct = docs
    .filter((doc) => doc.kind !== "folder" && parentOf(doc.path) === clean)
    .sort((a, b) => a.path.localeCompare(b.path));
  const complete = direct.length <= FOLDER_EXPAND_NOTE_CAP;
  return {
    complete,
    folder: clean,
    note_count: direct.length,
    notes: direct.slice(0, FOLDER_EXPAND_NOTE_CAP).map((doc) => ({ path: doc.path, title: doc.title })),
    subfolders,
    ...(complete ? {} : {
      clipped_note: `Listing the first ${FOLDER_EXPAND_NOTE_CAP} of ${direct.length} notes — ask for a subfolder to narrow down.`,
    }),
  };
}
