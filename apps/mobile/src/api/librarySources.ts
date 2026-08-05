// Filing an uploaded original as a Library source row, from the phone.
//
// 🔴 WHY THE PHONE NEEDS THIS AT ALL: the extract route used to take the file's
// BYTES as a multipart body, which Vercel refuses past ~4.5 MB before any of our
// code runs — a real lecture PDF or a high-resolution photo simply never arrived,
// and the student saw a generic "couldn't read that file". The route now takes a
// REFERENCE instead: the id of a `library_sources` row it looks up by
// (id, user_id) and resolves the storage path from. So the phone has to be able
// to create that row.
//
// The web app does this in lib/workspace/library-sources.ts, but that module is
// a "use client" React file importing the web Supabase client — it cannot be
// imported here. The shape below is deliberately kept identical to
// findOrCreateLibrarySourceRow so the two cannot drift: same dedupe key
// (user + file name + size, NOT storage path, which is a fresh uuid every time),
// same best-effort contract, same column set.
//
// Everything is written under the STUDENT'S OWN session, so row-level security
// applies exactly as it does in a browser. The server then re-checks ownership
// with its own query; neither check is load-bearing alone.

import { supabase } from "./supabase";

/** Buckets a phone upload may live in. Mirrors the CHECK constraint on
 *  `library_sources.bucket`. */
export type LibraryBucket = "library-sources" | "library-images";

export interface FileSourceInput {
  fileName: string;
  mime: string | null;
  sizeBytes: number;
  storagePath: string;
  bucket: LibraryBucket;
  /** Where it shows up in the Library. Empty string = the root. */
  folderPath?: string;
}

/**
 * Find or create the row that names an already-uploaded object.
 *
 * Returns the row id, or null when anything failed. Null is not fatal to the
 * caller: it means "this file has no reference", and the caller falls back to
 * posting the bytes directly, which still works for anything small.
 */
export async function fileLibrarySource(uid: string, input: FileSourceInput): Promise<string | null> {
  try {
    const fileName = input.fileName.slice(0, 512);
    const existing = await supabase
      .from("library_sources")
      .select("id")
      .eq("user_id", uid)
      .eq("file_name", fileName)
      .eq("size_bytes", input.sizeBytes)
      .eq("deleted", false)
      .limit(1);
    const found = existing.data?.[0]?.id;
    if (typeof found === "string") return found;

    const row = {
      file_name: fileName,
      folder_path: input.folderPath ?? "",
      mime_type: input.mime,
      size_bytes: input.sizeBytes,
      storage_path: input.storagePath,
      user_id: uid,
    };
    // 🔴 DEPLOY ORDER MUST NOT MATTER, and on a phone it REALLY must not: this
    // code ships over the air and can be running against a database that has not
    // had the `bucket` column added yet. An insert naming a missing column fails
    // the whole statement, so the write is retried without it. Every row written
    // before that column existed is a document in `library-sources`, which is
    // what the server assumes when the value is absent — so the fallback is
    // correct rather than merely survivable.
    const first = await supabase.from("library_sources").insert({ ...row, bucket: input.bucket }).select("id").single();
    if (!first.error && first.data) return (first.data as { id: string }).id;
    // A picture NEEDS the column to say so; a document does not.
    if (input.bucket !== "library-sources") return null;
    const retry = await supabase.from("library_sources").insert(row).select("id").single();
    if (retry.error || !retry.data) return null;
    return (retry.data as { id: string }).id;
  } catch {
    return null;
  }
}
