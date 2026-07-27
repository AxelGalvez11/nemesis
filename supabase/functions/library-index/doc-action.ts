/**
 * What this tick should do with one document from the dirty set.
 *
 * Three outcomes, and the order of the checks is the whole point:
 *
 *   purge    — the note was deleted. Its chunks and its index row go, and nothing
 *              is embedded. Checked FIRST: a deleted note still carries its text,
 *              so its hash still "changes", and any hash-led branch would happily
 *              re-embed a note the student threw away.
 *   restamp  — the words are unchanged; something else touched the row (a move, a
 *              rename, a sync echo). Stamp it so it leaves the dirty set without
 *              spending an embedding call.
 *   reindex  — the words changed. Chunk, embed, replace.
 *
 * `deleted` is optional on purpose. This function ships BEFORE the migration that
 * adds the column to list_dirty_library_docs, so for one deploy window the field
 * arrives undefined — which falls through to exactly the behaviour that is live
 * today. Deploying in the other order would hand the OLD indexer deleted notes
 * and it would re-embed them.
 *
 * PURE.
 */
export type DocAction = "purge" | "restamp" | "reindex";

export function docAction(
  doc: { deleted?: boolean | null },
  knownHash: string | null,
  freshHash: string,
): DocAction {
  if (doc.deleted === true) return "purge";
  if (knownHash !== null && knownHash === freshHash) return "restamp";
  return "reindex";
}
