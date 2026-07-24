// Phone Library + Graph (cloud-first pivot, docs/design/nemesis-cloud-first-phone-2026-07.md
// §7): reads the SAME cloud table the web app writes to — public.readable_library_documents —
// instead of the old Mac-paired, end-to-end-encrypted mirror (api/librarySync.ts, deleted
// in this same cloud-first pass along with pairing and the vault screens).
// No pairing, no vault key, no decryption: RLS scopes every row to the signed-in user, the
// same posture the web store (apps/web/lib/workspace/library-cloud-store.ts) already relies
// on — this module mirrors that store's query shape.
//
// One query fetches every non-deleted note AND folder row (kind in note|folder), content
// included — same as the web's loadDocuments(), and deliberately NOT split into a lean
// "list" (no content) plus a per-note fetch: the Graph screen needs every note's content to
// extract [[wikilink]] edges, so a single round trip that both screens share (Library just
// ignores the content field) is simpler than two cloud queries to keep in sync.
//
// Self-contained offline cache: a small per-signed-in-user JSON file (same
// FileSystem.writeAsStringAsync/readAsStringAsync + try/catch-best-effort pattern as
// api/chat.ts's thread store) holds the last full list PLUS any individually-fetched note,
// so a note reached without a fresh list pull (e.g. Graph opened before Library ever loaded)
// still renders offline next time. The filename is keyed by uid, so a stale cache from a
// previous account can never leak into a new one on the same device.
import * as FileSystem from "expo-file-system/legacy";
import {
  folderOf,
  isAtOrUnder,
  movedFolderPath,
  normalizeLibraryFolder,
  recordingLibraryPath,
  recordingNoteBaseName,
  remapUnder,
  renamedFolderPath,
  safeLibraryTitle,
  uniqueNotePath,
} from "@/lib/library-paths";
import { supabase } from "./supabase";

/** One library document as the phone consumes it — same shape as the web's
 *  CloudLibraryNote (apps/web/lib/workspace/library-tree.ts), content included. */
export interface CloudLibraryNote {
  id: string;
  path: string;
  title: string;
  content: string;
  updatedAt: string;
  createdAt: string;
}

export interface CloudLibrarySnapshot {
  notes: CloudLibraryNote[];
  /** Normalized folder paths from kind:"folder" rows — kept for parity with the web
   *  model. The phone's tree (lib/library-sync.ts buildLibraryRows) derives folders
   *  from note paths alone, so screens are free to ignore this today. */
  folders: string[];
}

const EMPTY_SNAPSHOT: CloudLibrarySnapshot = { folders: [], notes: [] };

function isObj(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Last path segment, note extensions stripped — the fallback title when a row's
 *  `title` column is blank (mirrors the web's titleFromPath in library-tree.ts). */
function titleFromPath(path: string): string {
  const segment = path.split("/").filter(Boolean).pop() ?? path;
  return segment.replace(/\.(md|markdown|txt)$/i, "");
}

function normalizeFolderPath(path: string): string {
  return path.split("/").map((part) => part.trim()).filter(Boolean).join("/");
}

function toNote(raw: unknown): CloudLibraryNote | null {
  if (!isObj(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  const path = typeof raw.path === "string" ? raw.path : "";
  if (!id || !path) return null;
  const rawTitle = typeof raw.title === "string" ? raw.title.trim() : "";
  const updatedAt = typeof raw.updated_at === "string" ? raw.updated_at : "";
  return {
    content: typeof raw.content === "string" ? raw.content : "",
    createdAt: typeof raw.created_at === "string" ? raw.created_at : updatedAt,
    id,
    path,
    title: rawTitle || titleFromPath(path),
    updatedAt,
  };
}

// --- offline cache: one JSON file per signed-in user ------------------------------

interface DiskCache {
  v: 1;
  listUpdatedAt: string;
  folders: string[];
  notes: Record<string, CloudLibraryNote>;
}

const EMPTY_DISK_CACHE: DiskCache = { folders: [], listUpdatedAt: "", notes: {}, v: 1 };

const cachePathFor = (uid: string) => `${FileSystem.documentDirectory ?? ""}cloud-library-cache-v1-${uid}.json`;

async function readDiskCache(uid: string): Promise<DiskCache> {
  try {
    const path = cachePathFor(uid);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return EMPTY_DISK_CACHE;
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(path)) as Partial<DiskCache> | null;
    if (!parsed || parsed.v !== 1 || !isObj(parsed.notes)) return EMPTY_DISK_CACHE;
    return {
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      listUpdatedAt: typeof parsed.listUpdatedAt === "string" ? parsed.listUpdatedAt : "",
      notes: parsed.notes as Record<string, CloudLibraryNote>,
      v: 1,
    };
  } catch {
    return EMPTY_DISK_CACHE;
  }
}

async function writeDiskCache(uid: string, cache: DiskCache): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(cachePathFor(uid), JSON.stringify(cache));
  } catch {
    // best-effort: worst case the next open re-fetches from the cloud
  }
}

function snapshotOf(cache: DiskCache): CloudLibrarySnapshot {
  return { folders: cache.folders, notes: Object.values(cache.notes) };
}

/** Cache-only read — never throws, never touches the network. Powers instant open
 *  (render the last-known list immediately) and offline reading. */
export async function loadCachedLibrary(uid: string): Promise<CloudLibrarySnapshot> {
  if (!uid) return EMPTY_SNAPSHOT;
  return snapshotOf(await readDiskCache(uid));
}

/** Cache-only single-note lookup, checked before (or instead of) a network round
 *  trip — id wins when both are given. */
export function findCachedNote(
  snapshot: CloudLibrarySnapshot,
  key: { id?: string | null; path?: string | null },
): CloudLibraryNote | null {
  if (key.id) {
    const byId = snapshot.notes.find((note) => note.id === key.id);
    if (byId) return byId;
  }
  if (key.path) {
    const byPath = snapshot.notes.find((note) => note.path === key.path);
    if (byPath) return byPath;
  }
  return null;
}

// --- network -----------------------------------------------------------------------

/** Full library fetch — same query shape as the web's loadDocuments(): every
 *  non-deleted note + folder row for `uid`, content included. Throws on failure (a
 *  student-readable message) so the caller can fall back to loadCachedLibrary();
 *  on success, replaces the cached list wholesale — the right behavior for a fresh
 *  pull, since it must also reflect deletions/renames made on the web app. */
export async function fetchLibrary(uid: string): Promise<CloudLibrarySnapshot> {
  const { data, error } = await supabase
    .from("readable_library_documents")
    .select("id,path,kind,title,content,created_at,updated_at")
    .eq("user_id", uid)
    .eq("deleted", false)
    .in("kind", ["note", "folder"])
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = Array.isArray(data) ? data : [];
  const notes: CloudLibraryNote[] = [];
  const folders: string[] = [];
  for (const row of rows) {
    if (!isObj(row)) continue;
    if (row.kind === "note") {
      const note = toNote(row);
      if (note) notes.push(note);
    } else if (row.kind === "folder" && typeof row.path === "string") {
      folders.push(normalizeFolderPath(row.path));
    }
  }

  const notesById: Record<string, CloudLibraryNote> = {};
  for (const note of notes) notesById[note.id] = note;
  await writeDiskCache(uid, { folders, listUpdatedAt: new Date().toISOString(), notes: notesById, v: 1 });
  return { folders, notes };
}

/** Fetch one note's latest content by id or path. Throws on a network failure so
 *  the caller can fall back to the cache; returns null when the row genuinely
 *  isn't there (deleted, wrong id, or a folder/other kind). On success, upserts
 *  just this note into the cache without disturbing the rest of it — the "opened
 *  docs" half of the offline cache, for a note reached before any full list pull
 *  ever succeeded. */
export async function fetchNote(
  uid: string,
  key: { id?: string | null; path?: string | null },
): Promise<CloudLibraryNote | null> {
  if (!key.id && !key.path) return null;
  let query = supabase
    .from("readable_library_documents")
    .select("id,path,kind,title,content,created_at,updated_at")
    .eq("user_id", uid)
    .eq("deleted", false)
    .eq("kind", "note");
  query = key.id ? query.eq("id", key.id) : query.eq("path", key.path as string);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  const note = toNote(data);
  if (!note) return null;

  const cache = await readDiskCache(uid);
  await writeDiskCache(uid, { ...cache, notes: { ...cache.notes, [note.id]: note } });
  return note;
}

/** True when an insert bounced off the (user_id, path) unique constraint —
 *  same detection the web store uses, so both clients retry with a suffix
 *  instead of surfacing a raw Postgres error. */
function isUniquePathViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "23505" || /readable_library_documents_user_id_path_key|duplicate key value/i.test(error.message ?? "");
}

/** Create a fresh "Untitled note" at the library root — the phone's second
 *  library write (owner 2026-07-21: the note screen's pill bar grows a "+").
 *  Same `Title.md` path convention as the web store (library-links.ts
 *  notePathFor) and the same suffix retry ("Untitled note 2", 3, …) when the
 *  (user_id, path) constraint objects — which also covers soft-deleted rows
 *  still holding a path. Returns the server row and upserts it into the offline
 *  cache like every other write here.
 *
 *  DELIBERATE DIVERGENCE FROM WEB (owner 2026-07-23: "creating new notes should
 *  not print 'untitled note' twice"): the starter content is EMPTY, where web
 *  writes `# Title`. The phone renders the note's title as its own heading above
 *  the body (note.tsx), so a `# Untitled note` first line put the same words on
 *  screen a second time, and the student had to delete one of them before they
 *  could start writing. Web has a single editor pane with no separate title
 *  line, so the same starter content isn't duplicated there. */
export async function createNote(uid: string): Promise<CloudLibraryNote> {
  const now = new Date().toISOString();
  for (let suffix = 1; suffix <= 999; suffix += 1) {
    const title = suffix === 1 ? "Untitled note" : `Untitled note ${suffix}`;
    const { data, error } = await supabase
      .from("readable_library_documents")
      .insert({ user_id: uid, path: `${title}.md`, kind: "note", title, content: "", deleted: false, updated_at: now })
      .select("id,path,kind,title,content,created_at,updated_at")
      .single();
    if (isUniquePathViolation(error)) continue;
    if (error) throw new Error(error.message);
    const note = toNote(data);
    if (!note) throw new Error("The note was saved but came back unreadable.");
    const cache = await readDiskCache(uid);
    await writeDiskCache(uid, { ...cache, notes: { ...cache.notes, [note.id]: note } });
    return note;
  }
  throw new Error("Couldn't find an available name for a new note.");
}

/** Mirror a finished recording's notes into the Library as a note at
 *  "Recordings/<title>.md" (owner item 4). Called from api/chat.ts's
 *  saveRecordingArtifact at SAVE time, not from the enhance pass — enhance is
 *  detached and usually doesn't survive the student leaving the screen, so a
 *  note written only there would never appear (see the long note at its call
 *  site). This is a best-effort secondary write, so it throws on failure and
 *  the caller swallows it. Because it runs before the AI has named the
 *  recording, the title here is the on-device timestamp; renameRecordingNote
 *  below moves it once the enhance pass produces a real name.
 *  The Recordings/ folder needs no row of its own: the phone's tree is
 *  derived from note paths (lib/library-sync.ts), so writing this path is all it
 *  takes for the folder to appear on both surfaces.
 *
 *  Same suffix retry as createNote, and for the same reason — deletes are soft,
 *  so a title used (and deleted) before still owns its path forever and the
 *  first insert can bounce off the (user_id, path) unique constraint.
 *  `user_id` is set explicitly (the column is NOT NULL with no auth.uid()
 *  default). Returns the created note, or upserts it into the offline cache like
 *  every other write here. */
export async function saveRecordingNote(
  uid: string,
  input: { title: string; content: string; createdAt?: string },
): Promise<CloudLibraryNote> {
  // A recording made minutes ago; the enhance pass that calls this runs later,
  // so stamp the note with the recording's own time when we have it — that's the
  // date the student expects to see next to it in the Library.
  const updatedAt = input.createdAt ?? new Date().toISOString();
  for (let suffix = 1; suffix <= 999; suffix += 1) {
    // path and title step together so the Library list shows "…", "… 2", never
    // two identical rows (recordingNoteBaseName is the shared, sanitized base).
    const path = recordingLibraryPath(input.title, suffix);
    const title = recordingNoteBaseName(input.title, suffix);
    const { data, error } = await supabase
      .from("readable_library_documents")
      .insert({ user_id: uid, path, kind: "note", title, content: input.content, deleted: false, updated_at: updatedAt })
      .select("id,path,kind,title,content,created_at,updated_at")
      .single();
    if (isUniquePathViolation(error)) continue;
    if (error) throw new Error(error.message);
    const note = toNote(data);
    if (!note) throw new Error("The recording note was saved but came back unreadable.");
    const cache = await readDiskCache(uid);
    await writeDiskCache(uid, { ...cache, notes: { ...cache.notes, [note.id]: note } });
    return note;
  }
  throw new Error("Couldn't find an available name for the recording note.");
}

/** Move a recording's Library note onto the name the AI gave it.
 *
 *  The note is written at save time under the on-device timestamp ("Recording ·
 *  Jul 24, 3:14 PM") because that is the only moment guaranteed to run; the
 *  enhance pass names the recording minutes later. Without this the Library
 *  keeps a wall of identical-looking timestamps while the chat chip shows the
 *  real name — the same recording under two names.
 *
 *  Keyed by note ID, never by path: saveRecordingNote's suffix retry means the
 *  note may have landed at "… 2", so recomputing the old path would rename the
 *  wrong row (or nothing). The NEW name gets the same suffix retry for the same
 *  reason — an AI title can collide with an existing note, including a
 *  soft-deleted one that still owns its path.
 *
 *  Best-effort, like the write that created it: throws on failure for the caller
 *  to swallow, so a failed rename leaves a correctly-named recording with a
 *  timestamped note rather than costing anything. */
export async function renameRecordingNote(uid: string, noteId: string, title: string): Promise<CloudLibraryNote | null> {
  const wanted = title.trim();
  if (!noteId || !wanted) return null;
  for (let suffix = 1; suffix <= 999; suffix += 1) {
    // path and title step together, exactly as in saveRecordingNote.
    const path = recordingLibraryPath(wanted, suffix);
    const nextTitle = recordingNoteBaseName(wanted, suffix);
    const { data, error } = await supabase
      .from("readable_library_documents")
      .update({ path, title: nextTitle })
      .eq("id", noteId)
      .eq("user_id", uid)
      .select("id,path,kind,title,content,created_at,updated_at")
      .maybeSingle();
    if (isUniquePathViolation(error)) continue;
    if (error) throw new Error(error.message);
    const note = toNote(data);
    // No row came back: the note was deleted between save and enhance. Nothing
    // to rename and nothing wrong — the recording itself is untouched.
    if (!note) return null;
    const cache = await readDiskCache(uid);
    await writeDiskCache(uid, { ...cache, notes: { ...cache.notes, [note.id]: note } });
    return note;
  }
  throw new Error("Couldn't find an available name for the renamed recording note.");
}

/** Save one note's edited content — the phone's first library WRITE (owner
 *  2026-07-20: real on-phone editing). Mirrors the web store's saveNote UPDATE
 *  (apps/web/lib/workspace/library-cloud-store.ts) with two deliberate
 *  differences:
 *  - only `content` is written: the phone editor doesn't touch titles or paths,
 *    so it must never clobber a rename made on the web moments earlier (the web
 *    sends title too because its editor owns a title field);
 *  - the row is selected BACK: a DB trigger stamps updated_at with the server
 *    clock, so the returned row — not an optimistic client guess — is what goes
 *    in the cache (the web store has a known staleness quirk here).
 *  Throws a student-readable message on failure; on success upserts the fresh
 *  row into the offline cache (same pattern as fetchNote) and returns it. */
export async function updateNoteContent(uid: string, noteId: string, content: string): Promise<CloudLibraryNote> {
  const { data, error } = await supabase
    .from("readable_library_documents")
    .update({ content })
    .eq("id", noteId)
    .eq("user_id", uid)
    .eq("kind", "note")
    .eq("deleted", false)
    .select("id,path,kind,title,content,created_at,updated_at")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const note = toNote(data);
  if (!note) throw new Error("This note was deleted on another device.");

  const cache = await readDiskCache(uid);
  await writeDiskCache(uid, { ...cache, notes: { ...cache.notes, [note.id]: note } });
  return note;
}

// --- rename / move / delete ------------------------------------------------
//
// The phone's structural library writes (owner 2026-07-22: long-press a row for
// "rename, delete, or move"). Ported from the web store's useCloudLibrary so the
// two clients agree on naming and cascade rules — see lib/library-paths.ts for
// the pure half.
//
// Two things worth knowing about the shape of these:
//  - They take the CURRENT SNAPSHOT rather than owning state. The web store is a
//    hook holding the library in memory; on the phone the screens hold it, and
//    api/ modules stay stateless. A caller passes what it already has on screen.
//  - Deletes are SOFT (deleted: true), exactly as on the web — the row keeps its
//    path, which is why createNote's unique-suffix retry exists. Nothing here
//    destroys data; a deleted note can still be recovered on the web app.
//
// After any of these the caller should re-fetch (fetchLibrary), which rewrites
// the whole disk cache. Each one still patches the cache itself so the list is
// right even if that refresh can't reach the network.

/** Apply `remap` to every cached note's path, so an offline-only client doesn't
 *  keep showing the pre-rename tree until its next successful pull. */
async function remapCachedPaths(uid: string, remap: (path: string) => string): Promise<void> {
  const cache = await readDiskCache(uid);
  const notes: Record<string, CloudLibraryNote> = {};
  for (const [id, note] of Object.entries(cache.notes)) notes[id] = { ...note, path: remap(note.path) };
  await writeDiskCache(uid, { ...cache, folders: cache.folders.map(remap), notes });
}

/** Drop notes from the cache by id (used after a soft delete). */
async function forgetCachedNotes(uid: string, ids: ReadonlySet<string>): Promise<void> {
  const cache = await readDiskCache(uid);
  const notes: Record<string, CloudLibraryNote> = {};
  for (const [id, note] of Object.entries(cache.notes)) if (!ids.has(id)) notes[id] = note;
  await writeDiskCache(uid, { ...cache, notes });
}

/** Whether some OTHER folder already occupies `candidate`. Checks note paths as
 *  well as folder rows, since the phone's tree is derived from note paths and a
 *  folder can exist on screen without a row of its own. */
function folderExists(snapshot: CloudLibrarySnapshot, candidate: string, excludeSource: string): boolean {
  const needle = candidate.toLowerCase();
  if (needle === excludeSource.toLowerCase()) return false;
  if (snapshot.folders.some((folder) => folder.toLowerCase() === needle)) return true;
  return snapshot.notes.some((note) => isAtOrUnder(folderOf(note.path).toLowerCase(), needle));
}

/** Rename one note. The title is BOTH the `title` column and the filename in
 *  `path` (the web store does the same), staying in its current folder and
 *  stepping a "2"/"3" suffix if that name is already taken there. Returns the
 *  note's new path. */
export async function renameNote(
  uid: string,
  snapshot: CloudLibrarySnapshot,
  noteId: string,
  rawTitle: string,
): Promise<string> {
  const existing = snapshot.notes.find((note) => note.id === noteId);
  if (!existing) throw new Error("That note is no longer in your library.");
  const title = safeLibraryTitle(rawTitle);
  const path = uniqueNotePath(title, folderOf(existing.path), snapshot.notes, noteId);
  const { error } = await supabase
    .from("readable_library_documents")
    .update({ title, path, updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("user_id", uid);
  if (error) throw new Error(error.message);

  const cache = await readDiskCache(uid);
  const cached = cache.notes[noteId];
  if (cached) await writeDiskCache(uid, { ...cache, notes: { ...cache.notes, [noteId]: { ...cached, path, title } } });
  return path;
}

/** Move one note into `targetFolder` ("" = the library root), keeping its title
 *  and suffixing only if that name is taken at the destination. */
export async function moveNote(
  uid: string,
  snapshot: CloudLibrarySnapshot,
  noteId: string,
  targetFolder: string,
): Promise<string> {
  const existing = snapshot.notes.find((note) => note.id === noteId);
  if (!existing) throw new Error("That note is no longer in your library.");
  const path = uniqueNotePath(existing.title, normalizeLibraryFolder(targetFolder), snapshot.notes, noteId);
  if (path === existing.path) return path;
  const { error } = await supabase
    .from("readable_library_documents")
    .update({ path, updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("user_id", uid);
  if (error) throw new Error(error.message);

  const cache = await readDiskCache(uid);
  const cached = cache.notes[noteId];
  if (cached) await writeDiskCache(uid, { ...cache, notes: { ...cache.notes, [noteId]: { ...cached, path } } });
  return path;
}

/** Soft-delete one note — same `deleted: true` flag the web app sets, so the
 *  note leaves both clients' lists but its content is still recoverable. */
export async function deleteNote(uid: string, noteId: string): Promise<void> {
  const { error } = await supabase
    .from("readable_library_documents")
    .update({ deleted: true, updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("user_id", uid);
  if (error) throw new Error(error.message);
  await forgetCachedNotes(uid, new Set([noteId]));
}

/** Rewrite one folder prefix to another across every note and explicit folder
 *  row beneath it — the single cascade behind both renameFolder and moveFolder,
 *  which differ only in how they compute the destination.
 *
 *  Note the phone derives its folder TREE from note paths (lib/library-sync.ts),
 *  so a folder on screen may have no `kind:"folder"` row at all; updating the
 *  notes is what actually moves it, and the folder-row update is for parity with
 *  the web app, which does keep those rows. */
async function rewriteFolderPrefix(
  uid: string,
  snapshot: CloudLibrarySnapshot,
  source: string,
  destination: string,
): Promise<void> {
  const remap = (path: string) => remapUnder(path, source, destination);
  const movedNotes = snapshot.notes.filter((note) => note.path.startsWith(`${source}/`));
  const movedFolders = snapshot.folders.filter((folder) => isAtOrUnder(folder, source));
  const updatedAt = new Date().toISOString();
  const results = await Promise.all([
    ...movedNotes.map((note) =>
      supabase
        .from("readable_library_documents")
        .update({ path: remap(note.path), updated_at: updatedAt })
        .eq("id", note.id)
        .eq("user_id", uid),
    ),
    ...movedFolders.map((folder) =>
      supabase
        .from("readable_library_documents")
        .update({ path: remap(folder), title: remap(folder).split("/").pop(), updated_at: updatedAt })
        .eq("path", folder)
        .eq("kind", "folder")
        .eq("user_id", uid),
    ),
  ]);
  const failure = results.find((result) => result.error)?.error;
  if (failure) throw new Error(failure.message);
  await remapCachedPaths(uid, remap);
}

/** Rename a folder in place — same parent, new last segment. A slash typed into
 *  the name can't reparent the folder (renamedFolderPath keeps only the leaf). */
export async function renameFolder(
  uid: string,
  snapshot: CloudLibrarySnapshot,
  folderPath: string,
  nextLeaf: string,
): Promise<void> {
  const source = normalizeLibraryFolder(folderPath);
  const destination = renamedFolderPath(source, nextLeaf);
  if (!source || !destination) throw new Error("That folder name can't be used.");
  if (destination === source) return;
  if (folderExists(snapshot, destination, source)) throw new Error("A folder with that name already exists there.");
  await rewriteFolderPrefix(uid, snapshot, source, destination);
}

/** Move a folder (and everything under it) into `targetFolder`; "" = the root. */
export async function moveFolder(
  uid: string,
  snapshot: CloudLibrarySnapshot,
  folderPath: string,
  targetFolder: string,
): Promise<void> {
  const source = normalizeLibraryFolder(folderPath);
  const target = normalizeLibraryFolder(targetFolder);
  if (!source) throw new Error("That folder can't be moved.");
  // Reparenting a folder under itself would orphan the whole subtree.
  if (isAtOrUnder(target, source)) throw new Error("A folder can't be moved inside itself.");
  const destination = movedFolderPath(source, target);
  if (destination === source) return;
  if (folderExists(snapshot, destination, source)) throw new Error("A folder with that name already exists there.");
  await rewriteFolderPrefix(uid, snapshot, source, destination);
}

/** Soft-delete a folder: every note beneath it, plus any explicit folder rows.
 *  Same cascade the web app runs, and same recoverable `deleted: true`. */
export async function deleteFolder(uid: string, snapshot: CloudLibrarySnapshot, folderPath: string): Promise<void> {
  const path = normalizeLibraryFolder(folderPath);
  if (!path) return;
  const doomedNotes = snapshot.notes.filter((note) => note.path.startsWith(`${path}/`));
  const doomedFolders = snapshot.folders.filter((folder) => isAtOrUnder(folder, path));
  const updatedAt = new Date().toISOString();
  const results = await Promise.all([
    ...doomedNotes.map((note) =>
      supabase.from("readable_library_documents").update({ deleted: true, updated_at: updatedAt }).eq("id", note.id).eq("user_id", uid),
    ),
    ...doomedFolders.map((folder) =>
      supabase
        .from("readable_library_documents")
        .update({ deleted: true, updated_at: updatedAt })
        .eq("path", folder)
        .eq("kind", "folder")
        .eq("user_id", uid),
    ),
  ]);
  const failure = results.find((result) => result.error)?.error;
  if (failure) throw new Error(failure.message);
  await forgetCachedNotes(uid, new Set(doomedNotes.map((note) => note.id)));
}
