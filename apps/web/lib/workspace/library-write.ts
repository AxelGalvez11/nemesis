// The BROWSER's Library-note writer. The naming rules — and the two landmines
// they exist to dodge — live in library-note-path.ts, because the server route
// that creates a recording's placeholder note has to follow exactly the same
// ones and cannot import this file's Supabase client.

import { supabase } from "@/lib/supabase";
import {
  isUniqueViolation,
  MAX_NOTE_BYTES,
  MAX_NOTE_NAME_ATTEMPTS,
  noteCandidate,
} from "@/lib/workspace/library-note-path";

export interface LibraryNoteWrite {
  userId: string;
  title: string;
  /** Folder path to file the note under, e.g. "Recordings". Empty = top level. */
  folder?: string;
  /** Markdown body. */
  content: string;
  /**
   * Who wrote it. 🔴 THE REVISE DOOR IS BUILT ON THIS ONE FIELD. Nemesis offers to rewrite its
   * own work and never a learner's, so an unmarked note must read as the learner's: the default
   * here and the column's default in Postgres are both `learner` on purpose. Only a maker in
   * `canvas-deliverables.ts` passes `nemesis`, at the moment it writes what it just produced,
   * which is the only place that can know the answer for certain. Nothing infers it later — the
   * ledger keeps no pointer back to the note, and the folder a note sits in is the learner's to
   * change.
   */
  madeBy?: "learner" | "nemesis";
}

export interface LibraryNoteResult {
  path: string;
  title: string;
}

/** Insert a Library note, retrying the leaf name on a unique-path collision.
 *  Resolves to the saved path/title, or throws a message on any other error. */
export async function writeLibraryNote({ userId, title, folder = "", content, madeBy = "learner" }: LibraryNoteWrite): Promise<LibraryNoteResult> {
  const now = new Date().toISOString();
  for (let attempt = 1; attempt <= MAX_NOTE_NAME_ATTEMPTS; attempt += 1) {
    const { name, path } = noteCandidate(folder, title, attempt);
    const { error } = await supabase
      .from("readable_library_documents")
      .insert({ content: content.slice(0, MAX_NOTE_BYTES), deleted: false, kind: "note", made_by: madeBy, path, title: name, updated_at: now, user_id: userId });
    if (!error) return { path, title: name };
    if (!isUniqueViolation(error)) throw new Error(error.message);
  }
  throw new Error("Couldn't find a free note name — too many duplicates.");
}

/**
 * Replace a Library note's body, keyed by its row id.
 *
 * 🔴🔴 THIS EXISTS BECAUSE NOTHING ELSE COULD DO IT. `writeLibraryNote` is INSERT-ONLY and
 * deliberately so — the `(user_id, path)` unique constraint counts soft-deleted rows, so an
 * upsert there would silently revive a deleted note — and the store's `saveNote` throws unless
 * the note is already in `useCloudLibrary`'s memory, which the Library outputs page does not
 * mount. A revision needs neither of those things: the row exists, it is being read on screen,
 * and its id is in hand.
 *
 * 🔴 SCOPED BY `user_id` AS WELL AS `id`. RLS already refuses another account's row; matching
 * both means a wrong id updates NOTHING rather than trusting the policy to be the only guard.
 *
 * Returns an error sentence, or null when the row was written.
 */
export async function replaceLibraryNoteBody(
  { userId, id, content }: { userId: string; id: string; content: string },
): Promise<string | null> {
  const { error } = await supabase
    .from("readable_library_documents")
    .update({ content: content.slice(0, MAX_NOTE_BYTES), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  return error ? "The change could not be saved to your Library." : null;
}
