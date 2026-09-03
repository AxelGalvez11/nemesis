// Asking the index instead of walking to a wall.
//
// 🔴🔴🔴 THIS IS THE PIECE THAT MAKES TWENTY DOCUMENTS WORK, AND EVERY PART OF IT ALREADY
// EXISTED EXCEPT THE ASKING. Every source a learner attaches is chunked and embedded into
// `library_chunks` the moment it is parsed — 4,909 chunks across 31 documents in production on the
// day this was written, every one of them embedded. The canvas never queried it once. Instead
// `groundingBlock` walked excerpts in reading order until it hit `MAX_GROUNDING_CHARS` and dropped
// the rest, which means a second lecture pushed the first one's ending out of the prompt and a
// tenth document was never seen at all.
//
// Owner, 2026-09-02: *"how does Notebook LM do it then? Because like, you can drop in like 50 to
// 100 documents, like it doesn't matter what it is."* It retrieves. So do we, everywhere except
// here.
//
// 🔴 THE CEILING WAS NEVER THE MODEL'S. 120,000 characters is about 30,000 tokens, and one
// two-hour lecture transcript is 98,000 characters of it. The fix is not a bigger wall — a bigger
// wall costs more on every turn and still falls over at document eleven. The fix is to send the
// twenty passages that answer the question instead of the first eighty pages of the pile.
//
// 🔴 AND RETRIEVAL FAILING MUST NEVER FAIL THE TURN. The index is written asynchronously after a
// parse, so a document attached ten seconds ago genuinely has no chunks yet. Every path here
// returns `null` on any problem — no rows, no embedding, an RPC that does not exist on an older
// database — and the caller falls back to reading the material in order, which is what it did
// before this file existed.

import { supabase } from "@/lib/supabase";

import type { CanvasSource, SourceExcerpt } from "./canvas-model";

/**
 * How many passages one retrieval brings back.
 *
 * 🔴 SIZED IN PASSAGES, NOT CHARACTERS, because that is what the question actually needs. A chunk
 * is roughly a screen of the document, so twenty-four of them is a generous answer to one question
 * and still an order of magnitude smaller than the whole pile. A deliverable that must cover a
 * document end to end asks for more; see `DELIVERABLE_CHUNKS`.
 */
export const TURN_CHUNKS = 24;

/**
 * A deliverable reads wider than a question does.
 *
 * 🔴 A STUDY GUIDE IS NOT A LOOKUP. "Make me a document of everything I need to know" has no narrow
 * answer — the honest retrieval for it is most of the material, ranked, so the writer spends its
 * budget on the parts that matter and still sees the shape of the whole. Sixty chunks is roughly
 * 90,000 characters at the chunker's target size, which is the same order as the old wall but
 * chosen by relevance rather than by reading order.
 */
export const DELIVERABLE_CHUNKS = 60;

/** Below this, a passage is not about the question. Lower than the Library search box uses,
 *  because the candidate set here is already narrowed to the learner's own attached documents. */
export const MATCH_THRESHOLD = 0.25;

export interface RetrievedChunk {
  chunkIndex: number;
  content: string;
  headingPath: string[] | null;
  parsedDocumentId: string;
  similarity: number;
  title: string;
  unitLabel: string | null;
}

/**
 * The parsed-document ids behind a canvas's attached sources.
 *
 * 🔴 TWO HOPS, AND BOTH ARE REAL COLUMNS RATHER THAN A GUESS. A canvas source carries
 * `librarySourceId`, which names a `library_sources` row, which carries `parsed_document_id`, which
 * is what `library_chunks` is keyed by. Sources attached before filing existed — or filed
 * best-effort and refused by the bucket — have no `librarySourceId` at all, and they are simply not
 * retrievable. That is not an error; it is the `ephemeral` durability the source already declares.
 */
export async function canvasDocumentIds(sources: readonly CanvasSource[]): Promise<string[]> {
  const libraryIds = sources.map((source) => source.librarySourceId).filter((id): id is string => Boolean(id));
  if (libraryIds.length === 0) return [];
  const { data, error } = await supabase.from("library_sources").select("parsed_document_id").in("id", libraryIds);
  if (error || !data) return [];
  return data
    .map((row) => (row as { parsed_document_id: string | null }).parsed_document_id)
    .filter((id): id is string => Boolean(id));
}

/**
 * The passages of this canvas's own material that bear on one question.
 *
 * Returns null whenever retrieval cannot answer — no attached documents, nothing indexed yet, the
 * embedding unavailable, an older database without the function. The caller reads the material in
 * order instead.
 */
export async function retrieveChunks(
  sources: readonly CanvasSource[],
  query: string,
  limit: number = TURN_CHUNKS,
): Promise<RetrievedChunk[] | null> {
  const asked = query.trim();
  if (!asked) return null;
  const documentIds = await canvasDocumentIds(sources);
  if (documentIds.length === 0) return null;

  // 🔴 THE SAME EMBEDDER THAT PRODUCED THE STORED VECTORS, reached the same way. Two clients drift,
  // and a mismatched vector space fails as bad results rather than as an error — the worst kind of
  // failure to own, because nothing looks broken.
  const embedded = await supabase.rpc("embed_teaching_query", { q: asked.slice(0, 2000) });
  const embedding = embedded.data;
  if (embedded.error || !embedding) return null;

  const matched = await supabase.rpc("match_canvas_chunks", {
    match_count: limit,
    match_threshold: MATCH_THRESHOLD,
    parsed_document_ids: documentIds,
    query_embedding: embedding,
  });
  if (matched.error || !Array.isArray(matched.data) || matched.data.length === 0) return null;

  return (matched.data as Record<string, unknown>[]).map((row) => ({
    chunkIndex: Number(row.chunk_index ?? 0),
    content: String(row.content ?? ""),
    headingPath: Array.isArray(row.heading_path) ? (row.heading_path as string[]) : null,
    parsedDocumentId: String(row.parsed_document_id ?? ""),
    similarity: Number(row.similarity ?? 0),
    title: String(row.title ?? ""),
    unitLabel: typeof row.unit_label === "string" ? row.unit_label : null,
  }));
}

/**
 * Retrieved passages, put back into reading order for a writer.
 *
 * 🔴 RANKED FOR SELECTION, ORDERED FOR READING. Retrieval returns passages best-first, and a
 * document written in that order jumps around: the conclusion, then a definition from chapter one,
 * then a table from the middle. Selection is the ranking's job and it has already been done by the
 * time we get here; what the writer needs is the surviving passages in the order the learner's
 * document actually says them.
 *
 * PURE. No I/O.
 */
export function chunksAsMaterial(chunks: readonly RetrievedChunk[]): string {
  if (chunks.length === 0) return "";
  const byDocument = new Map<string, RetrievedChunk[]>();
  for (const chunk of chunks) {
    const held = byDocument.get(chunk.parsedDocumentId);
    if (held) held.push(chunk);
    else byDocument.set(chunk.parsedDocumentId, [chunk]);
  }

  const parts: string[] = [];
  for (const group of byDocument.values()) {
    const ordered = [...group].sort((left, right) => left.chunkIndex - right.chunkIndex);
    const title = ordered[0]?.title ?? "";
    parts.push(`### ${title}`);
    for (const chunk of ordered) {
      const heading = chunk.unitLabel || chunk.headingPath?.at(-1) || "";
      parts.push(heading ? `${heading}\n${chunk.content}` : chunk.content);
    }
  }
  return parts.join("\n\n");
}

/**
 * The canvas excerpts that the retrieved passages contain, with their ids intact.
 *
 * 🔴🔴 THIS IS WHAT KEEPS RETRIEVAL FROM BREAKING CITATIONS. A chunk and an excerpt are two
 * different cuts of the same document made by two different pieces of code: the chunker packs
 * blocks up to a target size, `buildExcerpts` splits on paragraphs. Neither knows about the other,
 * and only excerpts carry the `[s1:e4]` ids that a rendered answer resolves into a pill.
 *
 * So retrieval chooses, and the excerpts keep their names: an excerpt whose text appears inside a
 * retrieved chunk is an excerpt the retrieval selected. Nothing about the citation contract
 * changes, and a model still cannot cite an id it was not shown.
 *
 * 🔴 WHITESPACE IS NORMALISED ON BOTH SIDES BEFORE COMPARING. The chunker keeps the document's own
 * blank lines and `buildExcerpts` trims them, so a raw `includes` misses nearly every excerpt in a
 * transcript — the failure is silent and looks exactly like "retrieval found nothing".
 *
 * PURE. No I/O.
 */
export function excerptsInChunks(
  sources: readonly CanvasSource[],
  chunks: readonly RetrievedChunk[],
): { sources: CanvasSource[]; omitted: number } {
  const haystack = chunks.map((chunk) => flatten(chunk.content)).join("\n");
  if (!haystack) return { omitted: 0, sources: [] };

  const kept: CanvasSource[] = [];
  let omitted = 0;
  for (const source of sources) {
    const excerpts: SourceExcerpt[] = [];
    for (const excerpt of source.excerpts) {
      const needle = flatten(excerpt.text);
      // A one-word excerpt matches everything; those come along with their neighbours or not at all.
      if (needle.length >= 12 && haystack.includes(needle)) excerpts.push(excerpt);
      else omitted += 1;
    }
    if (excerpts.length > 0) kept.push({ ...source, excerpts });
  }
  return { omitted, sources: kept };
}

function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Said above retrieved material, always.
 *
 * 🔴 THE OWNER'S REQUIREMENT IN ONE SENTENCE: *"It shouldn't, like, uh, hallucinate or say that it
 * has it when it really doesn't have it."* A model handed a subset and not told it is a subset is a
 * model set up to answer for the whole pile. `groundingBlock` has stated its own truncation since it
 * was written; this states a narrower and more useful version of the same fact, because here the
 * omission is deliberate rather than a budget running out.
 */
export function retrievalNote(documentCount: number, chunkCount: number): string {
  const documents = documentCount === 1 ? "the attached document" : `${documentCount} attached documents`;
  return (
    `The passages below were selected from ${documents} because they bear on what you were asked. ` +
    `They are ${chunkCount} passage${chunkCount === 1 ? "" : "s"} of a larger body of material, not all of it. ` +
    `Answer from what is here. If what you were asked needs something that is not in these passages, say ` +
    `plainly that it is not in the material you were given rather than filling the gap from general knowledge, ` +
    `and never claim to have covered a document end to end.`
  );
}
