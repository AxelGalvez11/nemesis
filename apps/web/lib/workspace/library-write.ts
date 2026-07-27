// One place that inserts a Library note the safe way, so every writer carries
// the same two landmines' fixes (owner item 6, 2026-07-24):
//
//   1. readable_library_documents.user_id is NOT NULL with NO auth.uid()
//      default (unlike study_*), so EVERY insert must set user_id explicitly or
//      it violates NOT NULL and nothing saves.
//   2. The (user_id, path) unique constraint also counts SOFT-deleted rows — a
//      path used once is occupied forever — so a name collision must retry with
//      a suffix across a wide range (library-cloud-store uses 999) rather than
//      surface a raw Postgres error or revive a deleted note.
//
// Folders are implicit: a note at "Recordings/My lecture.md" makes the folder
// appear on web and mobile with no folder row. This writer never creates one.

import { supabase } from "@/lib/supabase";

const MAX_NOTE_BYTES = 100_000;

export interface LibraryNoteWrite {
  userId: string;
  title: string;
  /** Folder path to file the note under, e.g. "Recordings". Empty = top level. */
  folder?: string;
  /** Markdown body. */
  content: string;
}

export interface LibraryNoteResult {
  path: string;
  title: string;
}

/** Note leaf name safe for a "/"-delimited path: drop separators and colons. */
function safeLeaf(title: string): string {
  return title.trim().replace(/[\\/:]/g, "-").slice(0, 120) || "Untitled note";
}

function safeFolder(folder: string): string {
  return folder.trim().replace(/^\/+|\/+$/g, "");
}

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return error.code === "23505" || /duplicate|unique/i.test(error.message ?? "");
}

/** Insert a Library note, retrying the leaf name on a unique-path collision.
 *  Resolves to the saved path/title, or throws a message on any other error. */
export async function writeLibraryNote({ userId, title, folder = "", content }: LibraryNoteWrite): Promise<LibraryNoteResult> {
  const leaf = safeLeaf(title);
  const dir = safeFolder(folder);
  const now = new Date().toISOString();
  for (let suffix = 1; suffix <= 999; suffix += 1) {
    const name = suffix === 1 ? leaf : `${leaf} ${suffix}`;
    const path = `${dir ? `${dir}/` : ""}${name}.md`;
    const { error } = await supabase
      .from("readable_library_documents")
      .insert({ content: content.slice(0, MAX_NOTE_BYTES), deleted: false, kind: "note", path, title: name, updated_at: now, user_id: userId });
    if (!error) return { path, title: name };
    if (!isUniqueViolation(error)) throw new Error(error.message);
  }
  throw new Error("Couldn't find a free note name — too many duplicates.");
}
