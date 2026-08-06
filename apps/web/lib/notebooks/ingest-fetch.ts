/**
 * Resolving an ingest reference to bytes — the only place a privileged read
 * happens on an uploader's behalf.
 *
 * 🔴 AUTHORISATION IS THE DATABASE PREDICATE ON LINE `.eq("user_id", userId)`.
 *
 * `adminClient()` is the service role: it bypasses row-level security entirely.
 * The client sends a row id and nothing else, and the lookup below matches that
 * id AGAINST THE CALLER'S OWN user_id — the id the device key resolved to, never
 * anything else in the request. A row that is not theirs simply does not come
 * back, and a missing row and a forbidden row are indistinguishable to the
 * caller by construction, because they are literally the same query result.
 *
 * The storage path is then read OUT of that row. It is a string we wrote, for an
 * object we created, for this user. No path from a request body is ever handed
 * to storage.
 */
import { serviceRoleKey, supabaseUrl } from "@/lib/env";
import { adminClient } from "@/lib/server";

import { declaredLength, readBounded } from "./bounded-fetch";
import { isIngestBucket, MAX_SOURCE_BYTES, type IngestBucket, type IngestRef } from "./ingest-ref";

export interface ResolvedSource {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string | null;
  bucket: IngestBucket;
  storagePath: string;
}

export type FetchedSource =
  | { ok: true; source: ResolvedSource }
  /** No such row FOR THIS USER — the two cases are deliberately merged. Also
   *  covers a row whose upload never finished, so its object is absent. */
  | { ok: false; reason: "missing" }
  /** Bigger than the product allows. The bucket has its own ceiling, but a
   *  bucket policy can change without anyone re-reading this file, so the limit
   *  is enforced where the bytes are actually used. */
  | { ok: false; reason: "too-large" }
  /** Storage or the database failed. NOT the caller's fault — the route answers
   *  503 so a blip reads as "try again", never as "your file is broken". */
  | { ok: false; reason: "unavailable" };

interface SourceRow {
  bucket: string;
  file_name: string;
  mime_type: string | null;
  storage_path: string | null;
}

/**
 * Look the row up as this user, then download the object it names.
 *
 * `userId` MUST be the id `verifyDeviceKey` resolved. Passing anything the
 * caller supplied would defeat the entire module.
 */
export async function fetchIngestSource(ref: IngestRef, userId: string): Promise<FetchedSource> {
  let admin: ReturnType<typeof adminClient>;
  try {
    admin = adminClient();
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  // 🔴 The same query twice, differing only in whether it asks for `bucket`.
  //
  // DEPLOY ORDER MUST NOT MATTER. Code reaches production before a migration is
  // applied, and a select naming a column that does not exist yet fails the whole
  // query — which would take every upload down until the migration ran. Every
  // row that predates the column is a document in `library-sources`, so falling
  // back to that default is not a guess, it is the historical truth.
  const columns = "id,file_name,mime_type,storage_path";
  const lookup = (withBucket: boolean) =>
    admin
      .from("library_sources")
      .select(withBucket ? `bucket,${columns}` : columns)
      .eq("id", ref.sourceId)
      // 🔴 The authorisation. Do not remove, do not move above the id filter in
      // a refactor that "simplifies" the query, and do not replace with a
      // post-fetch comparison — a row that is not this user's must never be
      // read out of the database at all.
      .eq("user_id", userId)
      .eq("deleted", false)
      .maybeSingle();

  let row: SourceRow;
  try {
    let { data, error } = await lookup(true);
    if (error) {
      const retry = await lookup(false);
      // An error on BOTH shapes is an OUTAGE, not a verdict. Telling the two
      // apart is the difference between "the database hiccuped" and "that file
      // isn't yours".
      if (retry.error) return { ok: false, reason: "unavailable" };
      data = retry.data;
    }
    if (!data) return { ok: false, reason: "missing" };
    row = { bucket: "library-sources", ...(data as Partial<SourceRow>) } as SourceRow;
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  // A row with no object is a half-finished upload, not a broken account.
  if (!row.storage_path) return { ok: false, reason: "missing" };
  // The bucket comes from the database, but it is still validated: a value that
  // slipped past the CHECK constraint (an older row, a manual edit) must not
  // become an arbitrary bucket name in a storage call.
  if (!isIngestBucket(row.bucket)) return { ok: false, reason: "unavailable" };

  // 🔴 NOT `.download()`. See ./bounded-fetch — supabase-js resolves that call
  // to a Blob, and a Blob cannot exist without its bytes, so every size check
  // written after it has already been paid for.
  const url = objectUrl(row.bucket, row.storage_path);
  const auth = { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` };

  // ASK FIRST. A HEAD has no body, so an object over the ceiling is refused
  // without a stream ever existing — which is what makes the refusal cheap. The
  // earlier version read `content-length` off a GET and cancelled the body;
  // that measured beautifully in isolation and timed out in production, because
  // cancelling a large undici body drains it rather than hanging up.
  let head: Response;
  try {
    head = await fetch(url, { cache: "no-store", headers: auth, method: "HEAD" });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (head.status === 404 || head.status === 400) return { ok: false, reason: "missing" };
  if (!head.ok) return { ok: false, reason: "unavailable" };

  const declared = declaredLength(head.headers);
  if (declared !== null && declared > MAX_SOURCE_BYTES) return { ok: false, reason: "too-large" };

  // Only now is the body worth asking for.
  //
  // `cache: "no-store"` because Next.js patches global fetch and will try to
  // put a cacheable GET through its Data Cache — a place a hundred megabytes of
  // someone's lecture has no business being.
  const controller = new AbortController();
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", headers: auth, signal: controller.signal });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (response.status === 404 || response.status === 400) {
    controller.abort();
    return { ok: false, reason: "missing" };
  }
  if (!response.ok || !response.body) {
    controller.abort();
    return { ok: false, reason: "unavailable" };
  }

  // Belt and braces: an object with no content-length, one whose header
  // understates it, or one that changed between the HEAD and the GET is still
  // stopped mid-transfer by the per-chunk total — and the abort hangs up rather
  // than politely draining what we just refused.
  const read = await readBounded(
    response.body,
    MAX_SOURCE_BYTES,
    declaredLength(response.headers) ?? declared,
    () => controller.abort(),
  );
  if (!read.ok) return { ok: false, reason: read.reason };

  return {
    ok: true,
    source: {
      bucket: row.bucket,
      bytes: read.bytes,
      fileName: row.file_name,
      mimeType: row.mime_type,
      storagePath: row.storage_path,
    },
  };
}

/**
 * The storage REST URL for an object we already own.
 *
 * Each path segment is encoded, and the separators are not: a storage key is
 * `<uid>/<uuid>.<ext>`, and collapsing that to one encoded blob would address a
 * file that does not exist. Both halves come out of OUR row, never a request.
 */
function objectUrl(bucket: IngestBucket, storagePath: string): string {
  const encoded = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl}/storage/v1/object/${bucket}/${encoded}`;
}
