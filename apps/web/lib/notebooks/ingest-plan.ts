/**
 * The ingestion pipeline's DECISIONS — pure, total, and testable on their own.
 *
 * Everything in this file is a function of its arguments: what kind of file this
 * is, what work a parse still needs, what a chunk row must say about where its
 * text came from. No I/O, no Supabase client, no parser and no embedder, so the
 * rules that decide how a document is ingested can be read and tested without
 * standing any of that up. `./ingest-pipeline` is the half that has effects.
 *
 * 🔴 UNIVERSAL, NOT ACADEMIC. A contract, an invoice, a filing, a manual, a
 * resume, a scanned form and a lecture deck take the same route through here.
 * Nothing below asks what a document is FOR — that question belongs to a layer
 * above — and no threshold here would read strangely for a lease, a machine
 * drawing, or a document in any language.
 *
 * 🔴 EVERY LOCATION IS MEASURED, NEVER INFERRED. The mapping from a `Locator`
 * onto chunk columns copies what a parser measured and writes null where it
 * measured nothing. Nothing here invents a page number.
 */
import type { DocKind, Locator, ParsedDocument } from "@nemesis/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Versions — the three axes of reprocessing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The embedding space these vectors live in.
 *
 * 🔴 DERIVED FROM THE ACTUAL MODEL, NOT INVENTED. Today's embedder is
 * `supabase/functions/core-source-sync/embeddings.ts`: Voyage `voyage-3-large`
 * at `output_dimension: 1024`, which is what `library_chunks.embedding`'s
 * `vector(1024)` was sized for. Model id and dimension BOTH belong in the
 * string: same model at a different dimension is a different space, and a
 * version that cannot express that would let two incomparable generations share
 * one identity.
 *
 * Change this string ONLY when the vectors really change. Because it is part of
 * `library_chunks_source_identity`, a new value writes a NEW generation
 * alongside the old one — the old rows keep serving search until the new ones
 * are embedded, which is what makes an embedder upgrade safe to run live.
 */
export const EMBEDDING_VERSION = "voyage-3-large@1024";

/** A runaway guard, not a judgement about what deserves indexing. A 500-page
 *  reference book chunks to well under this; a pathological file that would
 *  otherwise buy tens of thousands of embeddings stops here and says so in the
 *  result. Deliberately generous — silently indexing half a textbook would be
 *  worse than the spend. */
export const MAX_CHUNKS_PER_PARSE = 4_000;

// ─────────────────────────────────────────────────────────────────────────────
// The contracts the pipeline consumes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One retrieval chunk: text, and the measured place it came from.
 *
 * 🔴 TODO IMPORT — this is the MINIMUM of the real contract in
 * `packages/shared/src/doc-chunk.ts`, which also carries `blockIds` and
 * `tokensEstimate`. It is stated here rather than imported for one reason only:
 * `packages/shared/src/index.ts` does not export doc-chunk yet, and that file
 * belongs to the orchestrator. The moment it does, delete this interface and
 * import `DocChunk` from `@nemesis/shared` — nothing else changes, because
 * TypeScript is structural and the real chunk is a superset of this one.
 *
 * The `Locator` fields map one-for-one onto the chunk columns the migration
 * added (unit_kind, unit_index, unit_label, cell_range, heading_path), which is
 * why location can be queried rather than parsed back out of prose.
 */
export interface DocChunk {
  text: string;
  locator: Locator;
  /** DOCUMENT-GLOBAL and 0-based where the chunker declares one — it is part of
   *  `library_chunks_source_identity`, so the chunker owns it and this pipeline
   *  copies it rather than inventing its own numbering. Optional because a
   *  chunker that returns a plain ordered list is also legitimate; see
   *  `sourceChunkRows` for the fallback. */
  chunkIndex?: number;
}

/** A chunker, wrapped so its version travels with it — mirroring
 *  `DocumentParser` in doc-model.ts.
 *
 *  🔴 TODO IMPORT: `packages/shared/src/doc-chunk.ts` exports `chunkDocument`
 *  and `CHUNKER_VERSION`; a caller wraps those two in this adapter. Deliberately
 *  NOT a constant in this file — the chunker's version is the chunker's to
 *  declare, and a second copy here would drift the first time it changed. */
export interface DocumentChunker {
  readonly version: string;
  chunk(doc: ParsedDocument): DocChunk[];
}

// ─────────────────────────────────────────────────────────────────────────────
// The parse row, and what work it still needs (PURE)
// ─────────────────────────────────────────────────────────────────────────────

export type ParseState =
  | "pending"
  | "parsing"
  | "parsed"
  | "chunking"
  | "chunked"
  | "embedding"
  | "ready"
  | "failed";

/** The three stages, which are also the three legal values of `failed_stage`. */
export type PipelineStage = "parse" | "chunk" | "embed";

/** `parsed_documents`, in the fields the planner needs. Not the whole row: the
 *  parse itself (`structure`) is fetched only when it is about to be chunked. */
export interface ParseRow {
  id: string;
  state: ParseState;
  parserVersion: string;
  failedStage: PipelineStage | null;
  attempts: number;
}

/** How much of the CURRENT chunk generation exists, measured. */
export interface ChunkGeneration {
  total: number;
  embedded: number;
}

export interface PipelineVersions {
  parser: string;
  chunker: string;
  embedding: string;
}

export interface WorkPlan {
  needsParse: boolean;
  needsChunk: boolean;
  needsEmbed: boolean;
  /** The first stage that still has work, or null when the parse is complete.
   *  What a log line should say, and what a queue should sort on. */
  stage: PipelineStage | null;
  /** One short phrase naming WHY, for the same log line. */
  reason: string;
}

/** States that prove the bytes were successfully parsed at least once. */
const PARSE_SURVIVED: ReadonlySet<ParseState> = new Set<ParseState>([
  "parsed",
  "chunking",
  "chunked",
  "embedding",
  "ready",
]);

/**
 * What work does this parse still need? PURE, and the reason "re-parse",
 * "re-chunk only" and "re-embed only" are real rather than aspirational.
 *
 * Decided from MEASURED FACTS — the row's state and the number of chunk rows
 * that actually exist for the current generation — never from an assumption
 * that a previous run finished what it started. A process killed mid-flight
 * leaves `parsing` or `chunking` behind, and those must retry.
 *
 * 🔴 THE THREE AXES ARE ORDERED, NOT INDEPENDENT, and the honest statement of
 * that is: `embedding_version` is part of a chunk row's identity, so bumping the
 * embedder yields `total = 0` for the new generation and therefore
 * `needsChunk`. What you actually get is:
 *
 *     parser  changes -> a NEW parse row entirely (the version is in its
 *                        identity), so: parse + chunk + embed
 *     chunker changes -> parse PRESERVED, chunks rebuilt   (no re-extraction,
 *                        no vision spend, no second read of the bytes)
 *     embedder changes-> parse preserved, chunk rows rewritten (cheap, local,
 *                        deterministic) and re-embedded
 *     partial failure -> resume THIS generation: only the rows still missing a
 *                        vector are embedded
 *
 * Reading "re-embed skips chunking" into this would be reading a bug. Rebuilding
 * chunk rows costs no model call and no network — the expensive halves are
 * parsing and embedding, and those are the ones this actually protects.
 */
export function planWork(
  row: ParseRow | null,
  versions: PipelineVersions,
  chunks: ChunkGeneration,
): WorkPlan {
  const plan = (needsParse: boolean, needsChunk: boolean, needsEmbed: boolean, reason: string): WorkPlan => ({
    needsParse,
    needsChunk,
    needsEmbed,
    stage: needsParse ? "parse" : needsChunk ? "chunk" : needsEmbed ? "embed" : null,
    reason,
  });

  if (!row) return plan(true, true, true, "no parse claimed");

  // A different parser build is a different parse, with its own row under the
  // identity index. The caller must claim THAT row rather than mutate this one,
  // which is what keeps historical parses reproducible and comparable.
  if (row.parserVersion !== versions.parser) {
    return plan(true, true, true, `parser ${row.parserVersion} != ${versions.parser}`);
  }

  // `failed` is not one state. A parse that failed while EMBEDDING is a complete
  // parse; re-extracting it would pay for the expensive stage to fix the cheap
  // one. `failed_stage` is the only thing that distinguishes them.
  const parseSurvived = PARSE_SURVIVED.has(row.state) || (row.state === "failed" && row.failedStage !== "parse");
  if (!parseSurvived) {
    // Includes `parsing`: a row still claiming to be in flight is a crashed run,
    // because a live one holds no lease anyone here can see.
    const reason = row.state === "failed" ? "failed at parse" : `state ${row.state}`;
    return plan(true, true, true, reason);
  }

  if (chunks.total === 0) return plan(false, true, true, "no chunks for this generation");
  if (chunks.embedded < chunks.total) {
    return plan(false, false, true, `${chunks.embedded}/${chunks.total} embedded`);
  }
  return plan(false, false, false, "ready");
}

// ─────────────────────────────────────────────────────────────────────────────
// Identity (PURE)
// ─────────────────────────────────────────────────────────────────────────────

/** sha256 of the ORIGINAL bytes, lowercase hex — the file's physical identity.
 *  WebCrypto, so the same three lines work in the browser, in Node and in Deno
 *  and no two of them can disagree about what a file's hash is. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // A fresh ArrayBuffer copy: `bytes` may be a view onto a larger buffer (any
  // slice of a upload is), and digesting the whole buffer would hash the
  // neighbours too.
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Which parser this file needs — by extension first, MIME second.
 *
 * Both are CLAIMS BY THE UPLOADER, not measurements, and that is fine here: the
 * cost of being wrong is a parser that fails on the bytes and says so, never a
 * wrong answer presented as right. Extension leads because it survives every
 * transport we see (a browser drop, a phone share sheet, an LMS crawl) while
 * MIME is routinely `application/octet-stream`; MIME is the fallback for a file
 * with no extension at all.
 *
 * Returns null for anything with no parser — the caller refuses rather than
 * claiming a parse row for a format nothing can read. Formats deliberately
 * absent: legacy binary `.doc`/`.ppt`/`.xls` (a different container entirely),
 * and audio/video (transcription is its own pipeline, not this one).
 */
export function docKindFor(fileName: string, mimeType?: string | null): DocKind | null {
  const extension = fileName.includes(".") ? (fileName.split(".").pop() ?? "").toLowerCase().trim() : "";
  const byExtension = EXTENSION_KINDS[extension];
  if (byExtension) return byExtension;

  const mime = (mimeType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!mime) return null;
  const byMime = MIME_KINDS[mime];
  if (byMime) return byMime;
  // image/* is the one family broad enough to answer generically: every member
  // is pixels, and pixels are what the image parser reads.
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "text";
  return null;
}

const EXTENSION_KINDS: Readonly<Record<string, DocKind>> = {
  pdf: "pdf",
  pptx: "pptx",
  ppsx: "pptx",
  docx: "docx",
  xlsx: "xlsx",
  // Macro-enabled OOXML: the same zip container with a different manifest, which
  // the OOXML parsers read unchanged.
  xlsm: "xlsx",
  pptm: "pptx",
  docm: "docx",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  bmp: "image",
  tif: "image",
  tiff: "image",
  heic: "image",
  heif: "image",
  html: "html",
  htm: "html",
  txt: "text",
  md: "text",
  markdown: "text",
  // Comma/tab-separated files are text to this layer: they are not a workbook,
  // and pretending otherwise would send them to a parser that cannot open them.
  csv: "text",
  tsv: "text",
};

const MIME_KINDS: Readonly<Record<string, DocKind>> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/html": "html",
  "application/xhtml+xml": "html",
  "text/plain": "text",
  "text/markdown": "text",
  "text/csv": "text",
};

// ─────────────────────────────────────────────────────────────────────────────
// Chunk rows (PURE)
// ─────────────────────────────────────────────────────────────────────────────

/** A `library_chunks` row, in the database's own snake_case, ready to insert. */
export interface SourceChunkRow {
  user_id: string;
  origin_type: "source";
  parsed_document_id: string;
  /** 🔴 NULL, EXPLICITLY. `library_chunks_one_origin` requires a source chunk to
   *  have no note, and sending the column absent instead of null would let a
   *  future default fill it in. */
  document_id: null;
  /** A NOTE's path in the note tree. A parse has none: where a file APPEARS is
   *  the placement's business, and placements are many. Writing a folder path
   *  here would go stale the first time the student moved the file — the exact
   *  coupling the schema separates. Empty because the column is NOT NULL. */
  path: string;
  /** The document's OWN title where it has one — a property of the file, stable
   *  across every placement. Never the storage key, never the placement's name. */
  title: string;
  chunk_index: number;
  content: string;
  unit_kind: Locator["kind"];
  unit_index: number | null;
  unit_label: string | null;
  cell_range: string | null;
  heading_path: string[] | null;
  parser_version: string;
  chunker_version: string;
  embedding_version: string;
}

/**
 * Map chunks onto rows, carrying FULL STRUCTURED PROVENANCE.
 *
 * 🔴 LOCATION IS COLUMNS, NEVER PROSE. Every position lands in a queryable
 * column, so "which chunks came from slide 12" and "show me sheet B14:F21" are
 * SQL rather than a regex over chunk text. Nothing here infers a position: every
 * value is copied from a `Locator` the parser measured, and a locator that
 * carries no index simply writes null.
 *
 * 🔴 `chunk_index` IS THE CHUNKER'S OWN NUMBERING, never a number this file
 * makes up. It is part of `library_chunks_source_identity`, so whoever assigns
 * it decides what "the same chunk" means across a re-run — and that has to be
 * the chunker. Its declared `chunkIndex` wins; the position in the returned
 * array is only the fallback for a chunker that declares none. Empty chunks are
 * dropped WITHOUT renumbering either way, so an index always points back at the
 * same element and two runs of the same chunker over the same parse produce
 * byte-identical rows.
 *
 * Known lossy edge: `Locator.printedLabel` (a page's PRINTED number, "xii"
 * against ordinal 4) has no column on `library_chunks`. It survives in the
 * parse's `structure` and is reachable through `unit_index`; a citation renderer
 * that wants it reads it there rather than from the chunk.
 */
export function sourceChunkRows(params: {
  userId: string;
  parsedDocumentId: string;
  title: string;
  chunks: readonly DocChunk[];
  versions: PipelineVersions;
}): SourceChunkRow[] {
  const rows: SourceChunkRow[] = [];
  params.chunks.forEach((chunk, index) => {
    const content = chunk.text.trim();
    // An empty chunk embeds to noise and can only ever be a false hit.
    if (!content) return;
    const locator = chunk.locator;
    const headingPath = locator.headingPath?.filter((step) => step.trim().length > 0) ?? [];
    rows.push({
      user_id: params.userId,
      origin_type: "source",
      parsed_document_id: params.parsedDocumentId,
      document_id: null,
      path: "",
      title: params.title,
      chunk_index:
        typeof chunk.chunkIndex === "number" && Number.isInteger(chunk.chunkIndex) && chunk.chunkIndex >= 0
          ? chunk.chunkIndex
          : index,
      content,
      unit_kind: locator.kind,
      unit_index: typeof locator.index === "number" && Number.isFinite(locator.index) ? locator.index : null,
      unit_label: locator.label ?? null,
      cell_range: locator.range ?? null,
      heading_path: headingPath.length > 0 ? headingPath : null,
      parser_version: params.versions.parser,
      chunker_version: params.versions.chunker,
      embedding_version: params.versions.embedding,
    });
  });
  return rows;
}

/**
 * Re-validate a `structure` jsonb read back from the database.
 *
 * The Supabase client is untyped for these tables and jsonb round-trips through
 * the wire as `any`, so a parse fetched for re-chunking is re-checked exactly
 * the way `parse.ts` re-checks every row it reads. Shape only — this asks
 * whether the value can be walked, never whether the parse was any good.
 */
export function asParsedDocument(value: unknown): ParsedDocument | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const doc = value as Partial<ParsedDocument>;
  if (typeof doc.contentHash !== "string" || typeof doc.parserVersion !== "string") return null;
  if (!Array.isArray(doc.units) || !Array.isArray(doc.tables) || !Array.isArray(doc.visuals)) return null;
  if (typeof doc.coverage !== "object" || doc.coverage === null) return null;
  return value as ParsedDocument;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading a parse row back (PURE)
// ─────────────────────────────────────────────────────────────────────────────

interface ParseRowRaw {
  id?: unknown;
  state?: unknown;
  parser_version?: unknown;
  failed_stage?: unknown;
  attempts?: unknown;
}

const PARSE_STATES: ReadonlySet<string> = new Set<ParseState>([
  "pending",
  "parsing",
  "parsed",
  "chunking",
  "chunked",
  "embedding",
  "ready",
  "failed",
]);

/** Validate a `parsed_documents` row off the wire. The Supabase client is
 *  untyped for these tables, so a row is re-checked here exactly the way
 *  `parse.ts` re-checks every row it reads: shape only, never judgement. */
export function toParseRow(raw: unknown): ParseRow | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as ParseRowRaw;
  if (typeof row.id !== "string" || typeof row.parser_version !== "string") return null;
  const state = typeof row.state === "string" && PARSE_STATES.has(row.state) ? (row.state as ParseState) : null;
  if (!state) return null;
  const failedStage =
    row.failed_stage === "parse" || row.failed_stage === "chunk" || row.failed_stage === "embed"
      ? row.failed_stage
      : null;
  return {
    id: row.id,
    state,
    parserVersion: row.parser_version,
    failedStage,
    attempts: typeof row.attempts === "number" && Number.isFinite(row.attempts) ? row.attempts : 0,
  };
}
