/**
 * Fetching an already-uploaded source out of private storage, server-side.
 *
 * The counterpart to ./ingest-ref: that module decides whether a reference is
 * SAFE, this one acts on it. Split so the ownership rule can be tested without
 * a Supabase client, and so there is exactly one place that touches the service
 * role on an uploader's behalf.
 *
 * 🔴 NEVER call this with a reference that has not been through `readIngestRef`.
 * `adminClient()` is the service role: it bypasses RLS, so the path's ownership
 * is checked in code or it is not checked at all.
 */
import { adminClient } from "@/lib/server";

import { MAX_SOURCE_BYTES, type IngestRef } from "./ingest-ref";

export type FetchedSource =
  | { ok: true; bytes: Uint8Array }
  /** The object is not there. Usually a race — the client posted the reference
   *  before its upload finished, or an earlier read already swept it. */
  | { ok: false; reason: "missing" }
  /** Bigger than the product allows. The bucket has its own ceiling, but a
   *  bucket policy can be changed without anyone re-reading this route, so the
   *  limit is enforced where the bytes are actually used. */
  | { ok: false; reason: "too-large" }
  /** Storage itself failed. NOT the caller's fault — the route answers 503 so a
   *  blip reads as "try again", never as "your file is broken". */
  | { ok: false; reason: "unavailable" };

/** Download the object a validated reference names. */
export async function fetchIngestSource(ref: IngestRef): Promise<FetchedSource> {
  let admin: ReturnType<typeof adminClient>;
  try {
    admin = adminClient();
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  let blob: Blob;
  try {
    const { data, error } = await admin.storage.from(ref.bucket).download(ref.path);
    if (error || !data) {
      // Supabase reports a missing object as an error, not as null data, and
      // does not give a stable code — so a download failure is treated as
      // "missing" only when the object genuinely is not listed. Anything else
      // is an outage. Getting this backwards would turn every storage hiccup
      // into "we couldn't find your file", which sends the student off to
      // re-upload something that was never lost.
      const probe = await admin.storage.from(ref.bucket).list(ref.path.split("/").slice(0, -1).join("/"), {
        limit: 1,
        search: ref.path.split("/").pop() ?? "",
      });
      if (!probe.error && (probe.data?.length ?? 0) === 0) return { ok: false, reason: "missing" };
      return { ok: false, reason: "unavailable" };
    }
    blob = data;
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  // Checked BEFORE materialising the bytes into an array: `size` is the blob's
  // own length, not a client claim, so an oversized object costs one rejected
  // header rather than fifty megabytes of heap.
  if (blob.size > MAX_SOURCE_BYTES) return { ok: false, reason: "too-large" };

  try {
    return { bytes: new Uint8Array(await blob.arrayBuffer()), ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * Remove a throwaway upload once it has been read.
 *
 * Best-effort and never thrown from: a scratch object that outlives its read
 * costs a little storage, while a failed delete that breaks the response costs
 * the student their import. Only ever called for keys `isScratchKey` recognises
 * — a Library original must survive its own extraction.
 */
export async function removeIngestScratch(ref: IngestRef): Promise<void> {
  try {
    await adminClient().storage.from(ref.bucket).remove([ref.path]);
  } catch {
    // Nothing to do and nothing to say: the sweep is not the student's problem.
  }
}
