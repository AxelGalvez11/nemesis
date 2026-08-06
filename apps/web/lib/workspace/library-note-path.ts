// Naming a Library note, in one place two writers share.
//
// Extracted from library-write.ts on 2026-08-05 when the recording pipeline
// moved server-side: the API route that creates a recording's placeholder note
// runs on the server with the service role and cannot import the browser
// Supabase client, but it must carry the SAME two landmine fixes that file
// documents, or a recording note would be the one insert that trips them.
//
//   1. readable_library_documents.user_id is NOT NULL with NO auth.uid() default
//      (unlike study_*), so every insert must set user_id explicitly.
//   2. The (user_id, path) unique constraint also counts SOFT-deleted rows — a
//      path used once is occupied forever — so a collision must retry with a
//      suffix rather than surface a raw Postgres error or revive a deleted note.
//
// Folders are implicit: a note at "Recordings/My lecture.md" makes the folder
// appear on web and mobile with no folder row.

export const MAX_NOTE_BYTES = 100_000;

/** How many suffixed names to try before giving up. */
export const MAX_NOTE_NAME_ATTEMPTS = 999;

/** Note leaf name safe for a "/"-delimited path: drop separators and colons. */
export function safeLeaf(title: string): string {
  return title.trim().replace(/[\\/:]/g, "-").slice(0, 120) || "Untitled note";
}

export function safeFolder(folder: string): string {
  return folder.trim().replace(/^\/+|\/+$/g, "");
}

/** The nth candidate name and path for a note. `attempt` is 1-based, and the
 *  first attempt carries no suffix — "Lecture.md" before "Lecture 2.md". */
export function noteCandidate(folder: string, title: string, attempt: number): { name: string; path: string } {
  const leaf = safeLeaf(title);
  const dir = safeFolder(folder);
  const name = attempt <= 1 ? leaf : `${leaf} ${attempt}`;
  return { name, path: `${dir ? `${dir}/` : ""}${name}.md` };
}

export function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return error.code === "23505" || /duplicate|unique/i.test(error.message ?? "");
}
