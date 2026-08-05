/**
 * Naming a file that is ALREADY in storage, by the id of the row that owns it.
 *
 * 🔴 WHY THIS EXISTS: Vercel refuses a request body over ~4.5 MB at the edge,
 * before any of our code runs. Measured against production 2026-08-05:
 *
 *     4.4 MB -> our handler (401)      4.6 MB -> 413 FUNCTION_PAYLOAD_TOO_LARGE
 *
 * The route advertised 25 MB and the UI promised 25 MB, so every real lecture
 * deck and chapter PDF between those numbers died at the platform edge with a
 * plain-text error the client could not even parse — the student saw
 * "Couldn't read lecture.pdf." and nothing more. A bigger `MAX_BYTES` could
 * never have fixed it: the ceiling was not ours to raise.
 *
 * So the bytes stop travelling through the function:
 *
 *     browser/device  ->  private bucket  ->  server reads the object
 *
 * 🔴 THE REFERENCE IS A ROW ID, NOT A PATH — and that is the whole design.
 *
 * An earlier draft let the client send `{ bucket, path }` and validated that the
 * path's first segment matched the caller. That is sound, but it still lets a
 * caller name ANY object in their own folder and have the service role read it.
 * The stronger rule, and the one the owner asked for: the client names a ROW,
 * and the server derives the bucket and path FROM that row after matching it on
 * (id, user_id). The path is then something WE wrote, for an object we created,
 * for this user — never a string that arrived in a request.
 *
 * That leaves this module with one job: decide whether the body contains a
 * plausible row id. Authorisation is a database predicate (see ./ingest-fetch),
 * which is where it belongs, because only the database knows who owns what.
 *
 * PURE. No network, no Supabase client.
 */

/**
 * The product's upload ceiling — ours to choose, and now actually enforceable,
 * because it no longer has to fit through a function body.
 *
 * 🔴 THIS NUMBER IS A POLICY, NOT AN ARCHITECTURAL LIMIT. Raising it means
 * raising the bucket's `file_size_limit` and, past a few hundred megabytes,
 * moving the PARSE off a 300-second function — the transport already scales.
 * Nothing in the ingestion path re-reads this constant to decide HOW a file
 * travels, which is what makes the ceiling movable without another redesign.
 *
 * 50 MB today matches the `library-sources` bucket's own limit
 * (supabase/migrations/20260804010000_library_sources_files.sql:67), so the two
 * agree and a file that uploads can always be read.
 */
export const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

/** Buckets an uploaded original may live in. Mirrors the CHECK constraint on
 *  `library_sources.bucket`, so a value that passes here cannot fail there. */
export const INGEST_BUCKETS = ["library-sources", "library-images"] as const;
export type IngestBucket = (typeof INGEST_BUCKETS)[number];

/** A `library_sources` row id, shape-checked. Nothing more is claimed: whether
 *  the row exists, and whether it belongs to the caller, are questions only the
 *  database can answer. */
export interface IngestRef {
  sourceId: string;
}

export type IngestRefCheck =
  | { ok: true; ref: IngestRef }
  /** Not a reference at all — the caller should fall back to reading a
   *  multipart body, which is still supported for small files. */
  | { ok: false; reason: "absent" }
  /** Present but not a usable id. 400. */
  | { ok: false; reason: "malformed" };

/** Canonical v4-ish UUID, lowercased. Deliberately strict: a row id that does
 *  not look like one is a bug or a probe, and either way is not worth a
 *  database round trip. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isSourceId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value.toLowerCase());
}

export function isIngestBucket(value: unknown): value is IngestBucket {
  return typeof value === "string" && (INGEST_BUCKETS as readonly string[]).includes(value);
}

/** Read an ingest reference out of a parsed request body. */
export function readIngestRef(body: unknown): IngestRefCheck {
  if (typeof body !== "object" || body === null) return { ok: false, reason: "absent" };
  const row = body as Record<string, unknown>;
  if (row.sourceId === undefined) return { ok: false, reason: "absent" };
  if (!isSourceId(row.sourceId)) return { ok: false, reason: "malformed" };
  // Lowercased so a row id that differs only in case cannot miss its row and
  // read as "you don't own this".
  return { ok: true, ref: { sourceId: (row.sourceId as string).toLowerCase() } };
}

/** Where a newly uploaded original goes. The first segment is the owner's id,
 *  which is what the bucket's own RLS policy checks on the browser's insert —
 *  so the object is protected before any row exists to point at it. */
export function ingestObjectKey(userId: string, fileName: string): string {
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() ?? "" : "";
  const suffix = extension && /^[a-z0-9]{1,12}$/.test(extension) ? `.${extension}` : "";
  return `${userId}/${crypto.randomUUID()}${suffix}`;
}
