/**
 * Naming a file that is ALREADY in storage, instead of posting its bytes.
 *
 * 🔴 WHY THIS EXISTS: Vercel refuses a request body over ~4.5 MB at the edge,
 * before any of our code runs. Measured against production 2026-08-05:
 *
 *     4.4 MB -> our handler (401)      4.6 MB -> 413 FUNCTION_PAYLOAD_TOO_LARGE
 *
 * The route advertises 25 MB and the UI promises 25 MB, so every real lecture
 * deck and chapter PDF between those two numbers died at the platform edge with
 * a plain-text error our client could not even parse — the student saw
 * "Couldn't read lecture.pdf." and nothing else. A bigger `MAX_BYTES` could
 * never have fixed it: the ceiling is not ours.
 *
 * So the bytes stop travelling through the function. The browser uploads to the
 * private `library-sources` bucket under its OWN RLS session — which chat and
 * Library import already did — and then sends this route a REFERENCE. The route
 * fetches the object server-side, where no body limit applies.
 *
 * 🔴 THE REFERENCE IS ATTACKER-CONTROLLED. It arrives in a request body, so it
 * is a request to read an arbitrary object out of a private bucket using the
 * SERVICE ROLE, which bypasses RLS entirely. Everything in this module exists to
 * make that request safe:
 *
 *   - the bucket must be one we ingest from, never an arbitrary name;
 *   - the path's FIRST SEGMENT must equal the userId the device key resolved to,
 *     which is exactly the rule the bucket's own RLS policy enforces for
 *     browsers (`(storage.foldername(name))[1] = auth.uid()::text`) and which
 *     the service role would otherwise skip;
 *   - traversal, absolute paths and backslashes are refused outright rather than
 *     normalised, because a normaliser that is wrong once is wrong forever.
 *
 * PURE. No network, no Supabase client — so the ownership rule can be tested
 * exhaustively without standing anything up.
 */

/** Buckets an upload may be ingested from. Both are private, both are keyed
 *  `${uid}/…`, and both already hold exactly these files today:
 *  documents land in `library-sources`, photos in `library-images`. */
export const INGEST_BUCKETS = ["library-sources", "library-images"] as const;
export type IngestBucket = (typeof INGEST_BUCKETS)[number];

/**
 * The product's upload ceiling — ours to choose, and now actually enforceable
 * because it no longer has to fit through a function body.
 *
 * 50 MB matches the `library-sources` bucket's own `file_size_limit`
 * (supabase/migrations/20260804010000_library_sources_files.sql:67), so the two
 * limits agree and a file that uploads can always be read. Deliberately stated
 * ONCE and exported, because the old 25 MB lived in four places and none of them
 * was the real limit.
 */
export const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

/** A file already in storage, ready to be fetched server-side. */
export interface IngestRef {
  bucket: IngestBucket;
  /** Object key inside the bucket. Always begins `${userId}/`. */
  path: string;
  /** The name to show the student — the object key is a uuid. */
  fileName: string;
  /** What the browser said it was. Advisory only: the route still sniffs. */
  mimeType: string | null;
}

export type IngestRefCheck =
  | { ok: true; ref: IngestRef }
  /** Not a reference at all — the caller should fall back to reading a
   *  multipart body, which is still supported for small files. */
  | { ok: false; reason: "absent" }
  /** A reference, but not one this user may read. 403, never 404: saying
   *  "no such object" would answer a question we were not asked. */
  | { ok: false; reason: "forbidden" }
  /** Malformed. 400. */
  | { ok: false; reason: "malformed" };

function isIngestBucket(value: unknown): value is IngestBucket {
  return typeof value === "string" && (INGEST_BUCKETS as readonly string[]).includes(value);
}

/**
 * A storage key that is safe to hand to the service role on this user's behalf.
 *
 * Refused, in order: anything not a plain non-empty string; anything with a
 * backslash, a NUL, a leading slash, a `.` or `..` segment, or an empty segment
 * (`a//b`), since those are the shapes a path normaliser disagrees about; and
 * finally anything whose first segment is not this user's id.
 *
 * The first-segment rule is the whole security property. It is a string
 * comparison against the id the DEVICE KEY resolved to — never against anything
 * else in the request.
 */
function pathBelongsTo(path: unknown, userId: string): boolean {
  if (typeof path !== "string" || path.length === 0 || path.length > 1024) return false;
  if (/[\\\0]/.test(path)) return false;
  if (path.startsWith("/")) return false;
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return false;
  return segments[0] === userId && segments.length > 1;
}

/**
 * Read an ingest reference out of a parsed request body.
 *
 * `userId` MUST be the id `verifyDeviceKey` resolved — passing anything the
 * caller supplied would defeat the entire module.
 */
export function readIngestRef(body: unknown, userId: string): IngestRefCheck {
  if (typeof body !== "object" || body === null) return { ok: false, reason: "absent" };
  const row = body as Record<string, unknown>;
  // Nothing that looks like a reference at all — the caller posted something
  // else (a multipart form, an empty body) and should take its own path.
  if (row.bucket === undefined && row.path === undefined) return { ok: false, reason: "absent" };

  if (!isIngestBucket(row.bucket)) return { ok: false, reason: "malformed" };
  if (typeof row.path !== "string") return { ok: false, reason: "malformed" };
  // Shape first, ownership second, so a malformed path never reports as a
  // permission problem and vice versa.
  if (!pathBelongsTo(row.path, userId)) return { ok: false, reason: "forbidden" };

  const fileName = typeof row.fileName === "string" ? row.fileName.trim().slice(0, 512) : "";
  if (!fileName) return { ok: false, reason: "malformed" };

  const mimeType = typeof row.mimeType === "string" && row.mimeType.trim() ? row.mimeType.trim().slice(0, 255) : null;

  return { ok: true, ref: { bucket: row.bucket, fileName, mimeType, path: row.path } };
}

/**
 * Where a lane should put a file it does NOT otherwise keep.
 *
 * Syllabus reads and notebook sources want the text and nothing else, so their
 * uploads land under `${uid}/ingest/` and are removed once read. Keeping the
 * prefix distinct is what lets a sweep tell a throwaway from a Library original
 * without consulting a table.
 */
export function ingestScratchKey(userId: string, fileName: string): string {
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() ?? "" : "";
  const suffix = extension && /^[a-z0-9]{1,12}$/.test(extension) ? `.${extension}` : "";
  return `${userId}/ingest/${crypto.randomUUID()}${suffix}`;
}

/** True for a key this module created as a throwaway, so a caller knows it is
 *  safe to delete after reading. */
export function isScratchKey(path: string): boolean {
  return /^[^/]+\/ingest\//.test(path);
}
