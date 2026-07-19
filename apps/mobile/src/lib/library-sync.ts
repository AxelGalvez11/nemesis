// Pure logic for phone library sync (Phase 1): pairing-code parsing, ciphertext-row
// merging, and folder grouping. Deliberately dependency-free — no supabase client, no
// react-native, no crypto imports — so library-sync.test.ts loads clean under Deno
// (CI runs `deno test --no-check --allow-env apps/mobile/src/`), the same split as
// missions-helpers.ts. Decryption lives in library-crypto.ts, which is NOT Deno-tested;
// its byte-level interop with the Mac publisher is proven by a desktop-repo test.
// Wire format: docs/design/nemesis-phone-sync-format-v1.md.

export const PAIRING_PREFIX = "nemsync1.";
const VAULT_KEY_BYTES = 32;

/** base64url (no padding) → bytes. Hand-rolled because Hermes has no Buffer and
 * atob is not guaranteed; this also keeps the module Deno-loadable. */
export function bytesFromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of s) {
    buffer = (buffer << 6) | alphabet.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/** Parse a pairing code (QR content or manual paste) into the 32-byte vault key.
 * Returns null on anything malformed — callers show "that doesn't look like a
 * Nemesis pairing code", never a crash. */
export function parsePairingCode(raw: string): Uint8Array | null {
  const s = raw.trim();
  if (!s.startsWith(PAIRING_PREFIX)) return null;
  const key = bytesFromBase64Url(s.slice(PAIRING_PREFIX.length));
  return key && key.length === VAULT_KEY_BYTES ? key : null;
}

/** One row of public.library_documents as PostgREST returns it. */
export interface SyncRow {
  path_hash: string;
  payload: string | null;
  deleted: boolean;
  updated_at: string;
}

/** What the phone caches per document: the CIPHERTEXT row (encrypted at rest for
 * free); decryption happens on read. Tombstones stay cached so a stale older row
 * can never resurrect a deleted note. */
export interface CacheEntry {
  pathHash: string;
  payload: string | null;
  deleted: boolean;
  updatedAt: string;
}

export type SyncCache = Record<string, CacheEntry>;

/** Merge freshly pulled rows into the cache. Newer updated_at wins per path_hash
 * (ISO timestamps from one Postgres compare lexicographically). Returns a NEW
 * cache object; the input is never mutated. Idempotent, so the pull's 5s overlap
 * window is safe. */
export function mergeRows(cache: SyncCache, rows: SyncRow[]): SyncCache {
  const next: SyncCache = { ...cache };
  for (const row of rows) {
    const existing = next[row.path_hash];
    if (existing && existing.updatedAt >= row.updated_at) continue;
    next[row.path_hash] = {
      pathHash: row.path_hash,
      payload: row.payload,
      deleted: row.deleted,
      updatedAt: row.updated_at,
    };
  }
  return next;
}

/** The incremental-pull cursor: the newest updated_at seen, "" when empty. */
export function syncCursor(cache: SyncCache): string {
  let max = "";
  for (const entry of Object.values(cache)) {
    if (entry.updatedAt > max) max = entry.updatedAt;
  }
  return max;
}

/** The decrypted per-document JSON (format v1). */
export interface LibraryDoc {
  v: 1;
  path: string;
  title: string;
  kind: string;
  content: string;
  mtime?: string;
}

/** Validate decrypted plaintext into a LibraryDoc, null on any shape mismatch —
 * a wrong-version or truncated doc must render as an error state, not crash. */
export function parseDocJson(plaintext: string): LibraryDoc | null {
  let value: unknown;
  try {
    value = JSON.parse(plaintext);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const doc = value as Record<string, unknown>;
  if (doc.v !== 1) return null;
  if (typeof doc.path !== "string" || doc.path.length === 0) return null;
  if (typeof doc.title !== "string") return null;
  if (typeof doc.kind !== "string") return null;
  if (typeof doc.content !== "string") return null;
  if (doc.mtime !== undefined && typeof doc.mtime !== "string") return null;
  return {
    v: 1,
    path: doc.path,
    title: doc.title,
    kind: doc.kind,
    content: doc.content,
    ...(typeof doc.mtime === "string" ? { mtime: doc.mtime } : {}),
  };
}

/** Library list model: notes grouped by top-level folder. Root-level notes get
 * folder "" (the screen labels that bucket). Folders alphabetical, notes by title. */
export interface LibrarySection {
  folder: string;
  notes: { path: string; title: string }[];
}

export function buildSections(docs: { path: string; title: string }[]): LibrarySection[] {
  const byFolder = new Map<string, { path: string; title: string }[]>();
  for (const doc of docs) {
    const slash = doc.path.indexOf("/");
    const folder = slash === -1 ? "" : doc.path.slice(0, slash);
    const bucket = byFolder.get(folder) ?? [];
    byFolder.set(folder, [...bucket, { path: doc.path, title: doc.title }]);
  }
  return [...byFolder.entries()]
    .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
    .map(([folder, notes]) => ({
      folder,
      notes: [...notes].sort((a, b) => a.title.localeCompare(b.title)),
    }));
}

/** One row of the phone's NESTED library view: either a folder heading (tap to
 * expand/collapse; carries its own full path so nested folders each track
 * collapsed state independently — two folders can share a name at different
 * nesting depths without colliding) or a note leaf. `depth` is the indent
 * level (0 = top of the tree) so the screen can render tree structure without
 * doing any recursion in JSX. */
export type LibraryRow =
  | { type: "folder"; path: string; name: string; depth: number }
  | { type: "note"; path: string; title: string; depth: number };

interface FolderNode {
  name: string;
  path: string;
  notes: { path: string; title: string }[];
  subfolders: Map<string, FolderNode>;
}

function folderNode(name: string, path: string): FolderNode {
  return { name, notes: [], path, subfolders: new Map() };
}

/** Flatten `node`'s own notes + subfolders (both alphabetical, notes before
 * folders — the same convention the root bucket already used, sorting first)
 * into `depth`-tagged rows. A folder's subtree is omitted entirely when ITS
 * path is in `collapsed` — that's what makes nested folders collapse
 * independently: hiding a parent's children never touches the children's own
 * collapsed state, so re-expanding the parent reveals whatever state its
 * descendants were already in. */
function flattenFolder(node: FolderNode, depth: number, collapsed: ReadonlySet<string>): LibraryRow[] {
  const rows: LibraryRow[] = [];
  for (const note of [...node.notes].sort((a, b) => a.title.localeCompare(b.title))) {
    rows.push({ type: "note", path: note.path, title: note.title, depth });
  }
  const subfolders = [...node.subfolders.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const sub of subfolders) {
    rows.push({ type: "folder", path: sub.path, name: sub.name, depth });
    if (!collapsed.has(sub.path)) rows.push(...flattenFolder(sub, depth + 1, collapsed));
  }
  return rows;
}

/** Build the phone library's full nested-folder row list from flat doc paths
 * ("/"-separated, arbitrary depth) plus the set of currently-collapsed folder
 * paths (full path per folder, e.g. "PHCY 1205/Unit 1"). Root-level notes (no
 * "/" in their path) come first at depth 0 — the bucket the screen has always
 * labeled "Library" — followed by top-level folders alphabetically, each
 * one's subtree flattened in place. Pure and Deno-testable like the rest of
 * this module; the screen owns the `collapsed` Set as React state and
 * re-derives this list on every toggle. Additive alongside `buildSections`
 * (unchanged above) rather than replacing it. */
export function buildLibraryRows(docs: { path: string; title: string }[], collapsed: ReadonlySet<string>): LibraryRow[] {
  const root = folderNode("", "");
  for (const doc of docs) {
    const segments = doc.path.split("/").filter(Boolean);
    const fileName = segments.pop();
    if (fileName === undefined) continue; // defensive: a blank path shouldn't survive parseDocJson
    let node = root;
    let pathSoFar = "";
    for (const segment of segments) {
      pathSoFar = pathSoFar === "" ? segment : `${pathSoFar}/${segment}`;
      let child = node.subfolders.get(segment);
      if (!child) {
        child = folderNode(segment, pathSoFar);
        node.subfolders.set(segment, child);
      }
      node = child;
    }
    node.notes.push({ path: doc.path, title: doc.title });
  }
  return flattenFolder(root, 0, collapsed);
}
