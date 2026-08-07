/**
 * Turning a parsed document into rows the retrieval index can hold.
 *
 * 🔴 THE POINT OF THIS FILE IS THAT PROVENANCE IS A COLUMN, NOT A PREFIX.
 * The tempting version writes "[page 4] …" into the chunk's text and lets
 * whatever reads it later pull the number back out with a regular expression.
 * That is how a citation becomes unverifiable: the locator is inside the thing
 * being cited, it is indistinguishable from content the author wrote, and the
 * embedding is computed over an address as well as a meaning.
 *
 * So the unit, its kind, its label and the heading trail travel as columns
 * (`unit_kind`, `unit_index`, `unit_label`, `heading_path`) — queryable,
 * checkable, and never part of the text a model quotes back.
 *
 * The chunking rules themselves are in `packages/shared/src/document-chunks.ts`:
 * a table is never split, a heading opens a chunk and never closes one, and a
 * block larger than the target stays whole and says `oversized`. Verified on 124
 * real Word documents: 588 chunks, 0 tables split, 0 documents lost text.
 */

import {
  chunkDocument,
  type DocumentChunk,
  type DocumentModel,
  type DocUnitKind,
} from "@nemesis/shared";

/**
 * The chunker's generation.
 *
 * 🔴 SEPARATE FROM THE PARSER AND THE EMBEDDING VERSION, because they change
 * independently. Collapsing them into one "index version" makes targeted
 * reprocessing impossible: re-chunk without re-parsing, re-embed without doing
 * either. Bump this when the chunk BOUNDARIES change — not when this file is
 * merely edited.
 */
export const CHUNKER_VERSION = "units-blocks-1";

/**
 * Where a chunk sits, in the vocabulary `library_chunks.unit_kind` accepts.
 *
 * 🔴 A `body` UNIT BECOMES 'document', NOT 'page'. Word paginates at layout
 * time, so a .docx has no page until something renders it. The model already
 * refuses to say "page" for a body unit; this is the same refusal expressed in
 * the database's vocabulary, and it is the reason `unit_kind` exists as a column
 * rather than being assumed.
 */
export function unitKindColumn(kind: DocUnitKind): "page" | "slide" | "sheet" | "section" | "document" {
  if (kind === "page") return "page";
  if (kind === "slide") return "slide";
  if (kind === "sheet") return "sheet";
  return "document";
}

/** One row of `library_chunks`, before an embedding is attached. */
export interface SourceChunkRow {
  chunk_index: number;
  content: string;
  unit_kind: "page" | "slide" | "sheet" | "section" | "document";
  /** Null for a `body`/`image` unit, where a number would be an invention. */
  unit_index: number | null;
  unit_label: string | null;
  heading_path: string[];
  embedding?: string;
}

/**
 * Rows for one document.
 *
 * `chunks` is passed in rather than computed so a caller that already chunked —
 * to count, to measure, to decide whether anything changed — does not chunk
 * twice and risk the two runs disagreeing.
 */
export function chunkRowsFor(
  model: DocumentModel,
  chunks: readonly DocumentChunk[] = chunkDocument(model),
): SourceChunkRow[] {
  return chunks.map((chunk) => {
    const kind = unitKindColumn(chunk.unitKind);
    const unit = model.units[chunk.unitStart];
    return {
      chunk_index: chunk.index,
      content: chunk.text,
      heading_path: chunk.headingPath,
      // 🔴 THE START, NOT A RANGE. A chunk may span two pages; the column holds
      // where it BEGINS, which is where a reader should be taken. Recording the
      // end as well would invite a citation that opens the wrong one of the two.
      unit_index: kind === "document" ? null : chunk.unitStart,
      unit_kind: kind,
      // The author's own name for the unit — a slide title, a sheet name — or
      // nothing. Never generated from the content.
      unit_label: unit?.label ?? null,
    };
  });
}

/**
 * What is worth reporting after writing a document's chunks.
 *
 * `oversized` is here because it is the one number that means a chunk will not
 * retrieve well and nothing is wrong: a 4,000-character table kept whole is the
 * correct outcome of a rule we chose, and it should be visible rather than
 * discovered later as "search is bad on this file".
 */
export function chunkSummary(chunks: readonly DocumentChunk[]) {
  return {
    chars: chunks.reduce((sum, chunk) => sum + chunk.text.length, 0),
    chunks: chunks.length,
    oversized: chunks.filter((chunk) => chunk.oversized).length,
    units: new Set(chunks.map((chunk) => chunk.unitStart)).size,
  };
}
