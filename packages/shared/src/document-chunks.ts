/**
 * Cutting a document into retrievable pieces along its own seams.
 *
 * 🔴 THE RULE THIS REPLACES: "every 1,000 characters".
 *
 * A fixed character slice cuts wherever it lands — through a sentence, through
 * a table row, between a heading and the section it names. The damage is not
 * that a chunk reads badly; it is that the chunk stops being TRUE. Half a table
 * row is a set of values attached to the wrong column names. A section's third
 * paragraph retrieved without its heading is an instruction with no idea what it
 * is an instruction about. Both retrieve confidently and answer wrongly, which
 * is worse than not retrieving at all.
 *
 * So chunks are built from blocks, and:
 *
 *   * a table is never split — it is one chunk however large, because a grid
 *     with some of its rows is a different grid;
 *   * a heading never ends a chunk — it starts the next one, so the section's
 *     name always travels with its content;
 *   * every chunk carries its heading path, its unit, and the ids of the blocks
 *     it was built from, so what was retrieved can be pointed back at.
 *
 * PURE. No tokenizer, no embedding, no storage.
 */

import { findFurniture } from "./document-furniture.ts";
import {
  blockToText,
  type DocBlock,
  type DocumentModel,
  type DocUnitKind,
} from "./document-model.ts";

export interface DocumentChunk {
  /** Position in the document's chunk sequence. */
  index: number;
  text: string;
  /** The blocks this was built from, in order. Provenance, not decoration. */
  blockIds: string[];
  /** The section it sits in, outermost first. */
  headingPath: string[];
  /** First and last unit touched. Equal when the chunk sits on one. */
  unitStart: number;
  unitEnd: number;
  /** Carried so a consumer never has to guess whether to say "page". */
  unitKind: DocUnitKind;
  /**
   * True when a single block was larger than the target on its own.
   *
   * 🔴 IT IS NOT SPLIT AND IT IS NOT DROPPED. A table or a paragraph that
   * exceeds the size stays whole and says so, because both alternatives are
   * lies: splitting produces rows under the wrong headers, and dropping is
   * solving capacity by silently deleting content.
   */
  oversized: boolean;
}

/**
 * Roughly how much text a chunk should carry.
 *
 * A target, never a cap — see `oversized`. Chosen so a chunk holds a section or
 * two of ordinary prose: small enough that retrieval returns something specific,
 * large enough that a paragraph keeps the sentences around it.
 */
export const CHUNK_TARGET_CHARS = 1_800;

/**
 * Blocks that must not be broken across chunks, whatever the size.
 *
 * A table's rows only mean anything beside their headers; a figure's caption and
 * description only mean anything beside each other.
 */
const ATOMIC: ReadonlySet<DocBlock["kind"]> = new Set(["table", "figure"]);

export function chunkDocument(
  doc: DocumentModel,
  options: { targetChars?: number } = {},
): DocumentChunk[] {
  const target = options.targetChars ?? CHUNK_TARGET_CHARS;
  const chunks: DocumentChunk[] = [];
  let current: DocBlock[] = [];
  let length = 0;

  const flush = () => {
    if (current.length === 0) return;
    const parts = current.map(blockToText).filter((t) => t.trim().length > 0);
    if (parts.length === 0) { current = []; length = 0; return; }
    const units = current.map((b) => b.unit);
    chunks.push({
      blockIds: current.map((b) => b.id),
      // Where the chunk SITS. The first block's path, because taking the last
      // block's would file a chunk under a heading most of it precedes.
      //
      // 🔴 EXCEPT WHEN THE CHUNK OPENS WITH A HEADING, WHICH IS THE COMMON CASE.
      // A heading's own `headingPath` is the trail ABOVE it, so a chunk that
      // opens "Commerce power" and holds that whole section was being recorded
      // as sitting nowhere — an empty trail. Every retrieval result for a
      // well-formed section had no idea what section it was. Appending the
      // heading's own text is not a guess: the chunk demonstrably covers the
      // section that heading names, because the heading is inside it.
      headingPath: pathForChunk(current[0]!),
      index: chunks.length,
      // 🔴 ANY BLOCK OVER THE TARGET, NOT ONLY A LONE ONE. The earlier rule was
      // `current.length === 1`, so a 20,000-character paragraph that happened to
      // be preceded by its own heading — the ordinary case, since a heading
      // opens a chunk and never closes one — was carried whole and reported as
      // an ordinary chunk. The text was never at risk; the DISCLOSURE was. A
      // chunk that will not retrieve well has to say so, or it is discovered
      // later as "search is bad on this file".
      oversized: parts.some((part) => part.length > target),
      text: parts.join("\n\n"),
      unitEnd: Math.max(...units),
      unitKind: doc.units[current[0]!.unit]?.kind ?? "body",
      unitStart: Math.min(...units),
    });
    current = [];
    length = 0;
  };

  // 🔴 RUNNING FURNITURE IS NOT CHUNKED. A course name printed on thirty pages
  // becomes thirty near-identical chunks that compete with real content for
  // every retrieval slot, and "Page 3 of 30" answers no question anyone asks.
  // The blocks are NOT deleted — they stay in the model, addressable and
  // citable, and `documentFurniture()` hands them back to anyone who wants the
  // running title.
  const furniture = findFurniture(doc);

  for (const block of doc.blocks) {
    if (furniture.has(block.id) || block.kind === "pageHeader" || block.kind === "pageFooter") continue;
    const text = blockToText(block);
    if (text.trim().length === 0) continue;

    // 🔴 A HEADING OPENS A CHUNK, IT NEVER CLOSES ONE. Ending a chunk on a
    // heading strands the section's name one chunk away from its content, and
    // the content is then retrieved with no idea what it belongs to.
    if (block.kind === "heading" && current.length > 0) flush();

    // An atomic block that will not fit beside what is already gathered goes on
    // its own rather than forcing a break through itself.
    if (ATOMIC.has(block.kind) && current.length > 0 && length + text.length > target) flush();

    current.push(block);
    length += text.length + 2;

    // Atomic blocks are never merged forward either: a table followed by the
    // paragraph that discusses it should retrieve as two findable things.
    if (ATOMIC.has(block.kind) || length >= target) flush();
  }
  flush();
  return chunks;
}

/** Where a chunk sits, given the block it opens with. */
function pathForChunk(first: DocBlock): string[] {
  const above = [...(first.headingPath ?? [])];
  if (first.kind !== "heading") return above;
  const own = first.text.trim();
  return own ? [...above, own] : above;
}

/**
 * Every chunk's text, joined — the whole document, in chunk order.
 *
 * Exists so a test can assert the obvious property that must never stop holding:
 * chunking rearranges nothing and loses nothing. "Never solve capacity by
 * silently deleting content" is only checkable if something checks it.
 */
export function chunkedText(chunks: readonly DocumentChunk[]): string {
  return chunks.map((c) => c.text).join("\n\n");
}
