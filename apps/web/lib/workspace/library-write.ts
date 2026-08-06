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
}

export interface LibraryNoteResult {
  path: string;
  title: string;
}

/** Insert a Library note, retrying the leaf name on a unique-path collision.
 *  Resolves to the saved path/title, or throws a message on any other error. */
export async function writeLibraryNote({ userId, title, folder = "", content }: LibraryNoteWrite): Promise<LibraryNoteResult> {
  const now = new Date().toISOString();
  for (let attempt = 1; attempt <= MAX_NOTE_NAME_ATTEMPTS; attempt += 1) {
    const { name, path } = noteCandidate(folder, title, attempt);
    const { error } = await supabase
      .from("readable_library_documents")
      .insert({ content: content.slice(0, MAX_NOTE_BYTES), deleted: false, kind: "note", path, title: name, updated_at: now, user_id: userId });
    if (!error) return { path, title: name };
    if (!isUniqueViolation(error)) throw new Error(error.message);
  }
  throw new Error("Couldn't find a free note name — too many duplicates.");
}
