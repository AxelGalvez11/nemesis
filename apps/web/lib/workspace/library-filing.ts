// Filing what Nemesis made into the folders the learner already has.
//
// Owner 2026-08-24: *"And the library, I don't know if you added the folders. Could you… yeah.
// Add the folders. Also make sure you add the flashcards, slides, or documents, selection, or
// filter in the library like in ChatGPT."*
//
// 🔴🔴 ONE FOLDER TREE, SHARED WITH THE SIDEBAR, AND THAT IS THE WHOLE POINT. `folders` was built
// generic on purpose — its migration says *"folders organise sessions, and Nemesis is not
// education-only"* — so the Library reuses `listFolders` / `createFolder` / `deleteFolder` from
// `canvas-store.ts` rather than growing a parallel set. A second tree would mean a learner types
// "Fall 2026 / Pharmacology" twice: once for the canvas, once for the deck that canvas produced.
//
// 🔴 THREE TABLES, ONE VERB, BECAUSE THE LIBRARY'S THREE SHELVES PREDATE EACH OTHER. Decks are
// `study_decks`, notes are `readable_library_documents`, slide decks are `assets`. There is no
// single output table, so the KIND has to be carried into the call — the alternative is three
// near-identical exported functions and a caller that picks between them, which is the same
// branch written twice.
//
// 🔴 THE DATABASE OWNS THE INVARIANT, NOT THIS FILE. `20260824T30_library_folders.sql` adds a
// trigger refusing a folder owned by another account, so a bad id fails at the write rather than
// being screened here and trusted everywhere else.

import { supabase } from "@/lib/supabase";

/** Which shelf a row sits on. The Library's filter is over exactly these. */
export type OutputKind = "deck" | "slides" | "note";

/** Table and key column per shelf. Kept here so a caller never names a table. */
const SHELF: Record<OutputKind, { table: string }> = {
  deck: { table: "study_decks" },
  note: { table: "readable_library_documents" },
  slides: { table: "assets" },
};

/**
 * Move one output into a folder, or out of every folder when `folderId` is null.
 *
 * Returns whether the write landed, so a caller can leave the row where it was rather than
 * showing a move that did not happen.
 */
export async function fileOutput(kind: OutputKind, id: string, folderId: string | null): Promise<boolean> {
  const shelf = SHELF[kind];
  const { error } = await supabase.from(shelf.table).update({ folder_id: folderId }).eq("id", id);
  if (error) {
    console.warn(`[library] filing a ${kind} failed`, error.message);
    return false;
  }
  return true;
}
