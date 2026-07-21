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
