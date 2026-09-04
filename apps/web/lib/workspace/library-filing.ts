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

/**
 * Table, name column and how each shelf disappears. Kept here so a caller never names a table.
 *
 * 🔴 THE NAME COLUMN DIFFERS AND THAT IS NOT TIDINESS TO FIX. A deck's is `name`, a note's and a
 * slide deck's are `title`, because the three tables were built years apart for different surfaces.
 * Renaming them to agree would touch every reader of all three.
 *
 * 🔴🔴 A DECK IS THE ONLY HARD DELETE, AND ITS CARDS GO WITH IT. `study_decks` has no
 * `deleted` column, and `study_cards` and `deck_shares` both cascade from it (checked against the
 * live schema 2026-09-04). Notes and slide decks carry `deleted`, so those are recoverable in the
 * database even though nothing yet offers a way back. The confirmation the learner reads must
 * follow this column, not the other way round: promising "recoverable" for a deck would be a lie.
 */
const SHELF: Record<OutputKind, { table: string; nameColumn: string; soft: boolean }> = {
  deck: { nameColumn: "name", soft: false, table: "study_decks" },
  note: { nameColumn: "title", soft: true, table: "readable_library_documents" },
  slides: { nameColumn: "title", soft: true, table: "assets" },
};

/** Whether deleting this kind can be undone in the database. Drives what the confirmation says. */
export function isSoftDeleted(kind: OutputKind): boolean {
  return SHELF[kind].soft;
}

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

/**
 * Give one output a new name.
 *
 * 🔴 THE TITLE ONLY, NEVER THE PATH. A note's identity is its `path`, whose leaf carries the
 * name it was created with, and that path is the address every reader opens it by. Re-pathing on a
 * rename would have to walk the shared naming rules in `library-note-path.ts` (which a server route
 * also obeys), race the `(user_id, path)` unique constraint that counts soft-deleted rows, and
 * break any link already held. The reference does exactly the same thing: their rename PATCHes
 * `{file_name}` and nothing else. What the learner reads changes; where it lives does not.
 */
export async function renameOutput(kind: OutputKind, id: string, name: string): Promise<boolean> {
  const shelf = SHELF[kind];
  const trimmed = name.trim().slice(0, 200);
  if (!trimmed) return false;
  const { error } = await supabase.from(shelf.table).update({ [shelf.nameColumn]: trimmed }).eq("id", id);
  if (error) {
    console.warn(`[library] renaming a ${kind} failed`, error.message);
    return false;
  }
  return true;
}

/**
 * Remove one output from the Library.
 *
 * 🔴 SOFT WHERE THE TABLE ALLOWS IT, HARD WHERE IT DOES NOT, and the caller is told which by
 * `isSoftDeleted` so the confirmation can say the true thing. Every read on this page already
 * filters `deleted = false`, so a soft delete leaves the shelf the moment this returns.
 */
export async function deleteOutput(kind: OutputKind, id: string): Promise<boolean> {
  const shelf = SHELF[kind];
  const { error } = shelf.soft
    ? await supabase.from(shelf.table).update({ deleted: true }).eq("id", id)
    : await supabase.from(shelf.table).delete().eq("id", id);
  if (error) {
    console.warn(`[library] deleting a ${kind} failed`, error.message);
    return false;
  }
  return true;
}
