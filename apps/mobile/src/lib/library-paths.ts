// Path arithmetic for library renames, moves and deletes — the pure half of the
// phone's new library write paths (owner 2026-07-22: "allow users to … long hold
// to open up minimenu for rename, delete, or move").
//
// Ported from the web store so BOTH clients name files the same way: web's
// lib/workspace/library-links.ts (normalizeLibraryFolder / safeLibraryTitle /
// notePathFor) plus the uniqueNotePath + prefix-remap logic that lives inline in
// library-cloud-store.ts. A phone rename that produced a different path shape
// from the web's would show up as a duplicate-looking note on the other client,
// so these rules are copied deliberately rather than reinvented.
//
// Everything here is pure and synchronous; api/cloudLibrary.ts does the I/O.

/** A note or folder as these helpers need to see it. */
export interface PathRow {
  id: string;
  path: string;
}

/** Strip the characters a path segment can't carry, drop empty segments, and
 *  normalize separators. Matches web's normalizeLibraryFolder exactly. */
export function normalizeLibraryFolder(value: string): string {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim().replace(/[<>:"|?*]/g, ""))
    .filter(Boolean)
    .join("/");
}

/** A title safe to use as a filename. Matches web's safeLibraryTitle: illegal
 *  characters become "-", runs of whitespace collapse, 120 chars max, and an
 *  empty result falls back rather than producing a nameless file. */
export function safeLibraryTitle(value: string): string {
  return value.trim().replace(/[\\/:<>"|?*]/g, "-").replace(/\s+/g, " ").slice(0, 120) || "Untitled note";
}

/** The `Folder/Sub/Title.md` path a note with this title in this folder gets. */
export function notePathFor(title: string, folder = ""): string {
  const filename = `${safeLibraryTitle(title)}.md`;
  const normalizedFolder = normalizeLibraryFolder(folder);
  return normalizedFolder ? `${normalizedFolder}/${filename}` : filename;
}

/** The folder a path sits in ("" for a root-level item). */
export function folderOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

/** The last segment of a folder path. */
export function folderLeaf(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

/** notePathFor, but stepping "Title 2", "Title 3", … until nothing else in
 *  `taken` claims it. Comparison is case-insensitive because the (user_id, path)
 *  unique constraint treats "Notes/A.md" and "notes/a.md" as collidable on some
 *  collations, and because two notes differing only in case would be
 *  indistinguishable in the list anyway. `excludeId` is the row being renamed —
 *  it must not collide with itself. */
export function uniqueNotePath(title: string, folder: string, taken: readonly PathRow[], excludeId?: string): string {
  const claimed = (candidate: string) =>
    taken.some((row) => row.id !== excludeId && row.path.toLowerCase() === candidate.toLowerCase());
  const first = notePathFor(title, folder);
  if (!claimed(first)) return first;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = notePathFor(`${title} ${suffix}`, folder);
    if (!claimed(candidate)) return candidate;
  }
  // 998 same-named notes in one folder is not a real case; still, never loop
  // forever and never return a path we know is taken.
  return notePathFor(`${title} ${Date.now()}`, folder);
}

/** True when `path` is `folder` itself or anything nested under it. Used to keep
 *  a folder from being moved inside its own subtree, and to collect the rows a
 *  folder rename/move/delete has to carry with it. */
export function isAtOrUnder(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

/** Rewrite `path`'s `source` prefix to `destination`, leaving unrelated paths
 *  alone. This is what makes a folder rename/move cascade: every note and
 *  subfolder beneath it comes along, keeping its position within the subtree. */
export function remapUnder(path: string, source: string, destination: string): string {
  if (path === source) return destination;
  if (path.startsWith(`${source}/`)) return `${destination}${path.slice(source.length)}`;
  return path;
}

/** Where a folder lands when moved into `targetFolder` — its own leaf name,
 *  reparented. "" as the target means the library root. */
export function movedFolderPath(sourcePath: string, targetFolder: string): string {
  const leaf = folderLeaf(sourcePath);
  return targetFolder ? `${targetFolder}/${leaf}` : leaf;
}

/** Where a folder lands when renamed to `nextLeaf` — same parent, new last
 *  segment. Returns "" when the new name normalizes away to nothing. */
export function renamedFolderPath(sourcePath: string, nextLeaf: string): string {
  const parent = folderOf(sourcePath);
  const leaf = folderLeaf(normalizeLibraryFolder(nextLeaf));
  if (!leaf) return "";
  return parent ? `${parent}/${leaf}` : leaf;
}

/** The Library folder every auto-generated recording note lands in (owner item
 *  4 + item 6: recordings get their own folder). Implicit — writing a note at
 *  "Recordings/…" is all it takes; the folder appears on both surfaces because
 *  the tree is derived from note paths (lib/library-sync.ts), never from folder
 *  rows. */
export const RECORDINGS_LIBRARY_FOLDER = "Recordings";

/** The sanitized, suffix-stepped filename base for a recording note — the SAME
 *  string is used for both the `path` and the `title` column so the Library list
 *  and the file on disk agree (mirrors createNote). `suffix` starts at 1 (no
 *  suffix) and steps 2, 3, … for the soft-delete collision retry in
 *  api/cloudLibrary.ts: a title deleted last week keeps its path forever, so the
 *  first candidate can bounce off the (user_id, path) unique constraint.
 *
 *  The suffix is appended to the ALREADY-sanitized base rather than routed back
 *  through safeLibraryTitle — that function caps at 120 chars, and re-running it
 *  on "<120-char title> 2" would trim the " 2" straight back off and hand the
 *  retry the exact path that just collided. */
export function recordingNoteBaseName(title: string, suffix = 1): string {
  const safe = safeLibraryTitle(title);
  return suffix <= 1 ? safe : `${safe} ${suffix}`;
}

/** The "Recordings/<title>.md" Library path a recording note is written at. The
 *  title (the AI name when the enhance pass produced one, else the timestamp) is
 *  sanitized into a safe filename first — a title carrying a "/" or other path
 *  character must never nest the note into a bogus subfolder. */
export function recordingLibraryPath(title: string, suffix = 1): string {
  return `${RECORDINGS_LIBRARY_FOLDER}/${recordingNoteBaseName(title, suffix)}.md`;
}

/** Every folder path implied by a set of note paths, plus any explicit folder
 *  rows — the candidate list a "move to…" picker offers. Sorted for a stable,
 *  alphabetical picker. */
export function allFolderPaths(notePaths: readonly string[], folderRows: readonly string[] = []): string[] {
  const out = new Set<string>();
  for (const raw of notePaths) {
    const segments = folderOf(raw).split("/").filter(Boolean);
    for (let i = 1; i <= segments.length; i += 1) out.add(segments.slice(0, i).join("/"));
  }
  for (const raw of folderRows) {
    const normalized = normalizeLibraryFolder(raw);
    if (normalized) out.add(normalized);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}
