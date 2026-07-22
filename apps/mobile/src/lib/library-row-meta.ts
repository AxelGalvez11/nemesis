// Pure per-row presentation helpers for the phone Library list (library.tsx):
// which small glyph a note gets and how many notes sit under a folder.
// Dependency-free like library-sync.ts (no react-native, no supabase client)
// so it loads clean under Deno (`deno test --no-check src/`). Deliberately its
// OWN module rather than an addition to library-sync.ts — that file is shared
// with study-session.ts, note-graph.ts, and agenda.ts, and none of them need
// any of this. (firstContentLine, the old one-line row preview, was removed
// with the preview itself — owner 2026-07-21, title-only rows; git history.)

/** The three glyphs the owner asked for. Everything the cloud Library holds today
 * is kind:"note" with markdown/plain content (see api/cloudLibrary.ts's
 * fetchLibrary select) — "pdf"/"doc" only fire once the Library can hold an
 * uploaded, non-markdown source; until then every row reads as a plain "note". */
export type FileKind = "note" | "pdf" | "doc";

/** File-kind glyph selector, from the note's own path extension — the same
 * signal titleFromPath (api/cloudLibrary.ts) already strips off for the title. */
export function fileKindOf(path: string): FileKind {
  const segment = path.split("/").filter(Boolean).pop() ?? path;
  const match = /\.([a-z0-9]+)$/i.exec(segment);
  const ext = match ? match[1].toLowerCase() : "";
  if (ext === "pdf") return "pdf";
  if (ext === "doc" || ext === "docx") return "doc";
  return "note";
}

/** Recursive note count per folder path: every ancestor folder of every note
 * gets +1, so a top-level folder's count reflects everything nested inside it,
 * not just its direct children. Keyed by the SAME full folder path
 * buildLibraryRows (library-sync.ts) already puts on every folder row, so the
 * screen can look a row's count up by `item.path` directly.
 *
 * This also doubles as "every folder path known right now" (`.keys()`) — the
 * set the screen seeds as fully-collapsed on a fresh open, since a folder that
 * holds notes and a folder that should start collapsed are exactly the same
 * set. */
export function folderNoteCounts(paths: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const path of paths) {
    const segments = path.split("/").filter(Boolean);
    segments.pop(); // drop the filename — remaining segments are ancestor folders
    let acc = "";
    for (const segment of segments) {
      acc = acc === "" ? segment : `${acc}/${segment}`;
      counts.set(acc, (counts.get(acc) ?? 0) + 1);
    }
  }
  return counts;
}
