/**
 * The ingestion pipeline: store -> parse -> chunk -> embed -> index.
 *
 * 🔴 THIS PATH IS DETERMINISTIC INFRASTRUCTURE. Nothing here asks a model to
 * write anything. No librarian prose, no notes, no flashcards, no tests, no
 * edits to an existing note. A file becomes searchable because it was parsed,
 * split and embedded — full stop. Generation used to be load-bearing for
 * retrieval (the ONLY way an upload reached the index was by being turned into
 * notes first), and that is exactly the coupling this removes: after this runs,
 * the original itself is evidence, and generation is an optional convenience
 * that can be switched off without anything going dark.
 *
 * (Extraction that happens to use a vision model — reading a scanned page's
 * pixels — is not an artifact. It is measurement of what is already on the page,
 * carries `method: "vision"` in the block, and stays in the parser. The rule
 * above forbids INVENTED content, not reading hard-to-read content.)
 *
 * 🔴 THE PARSER LAYER IS UNIVERSAL. A contract, an invoice, a filing, a manual,
 * a resume, a scanned form and a lecture deck take exactly the same route
 * through this file. Nothing below branches on what a document is FOR, and no
 * threshold here would read strangely for a lease or a machine drawing.
 *
 * FOUR LAYERS, FOUR IDENTITIES (see 20260805040000_source_indexing.sql):
 *
 *     file      -> content_hash (sha256 of the bytes)
 *     parse     -> parsed_documents.id  (user_id, content_hash, parser_version)
 *     chunks    -> library_chunks       (chunker_version, embedding_version)
 *     placement -> library_sources.id   (folder, title, course)
 *
 * 🔴 CHUNKS HANG OFF THE PARSE, NEVER A PLACEMENT. The same file filed in two
 * folders is two placements, ONE parse, ONE chunk set. Moving or renaming a
 * placement rewrites one row in `library_sources` and triggers nothing here.
 *
 * WHAT THIS MODULE OWNS: claiming the parse, advancing its state, routing to a
 * parser, writing chunk rows with full structured provenance, linking the
 * placement, and driving the embedder. It owns no parser, no chunker and no
 * embedder — those are injected, so this file can be read, tested and reasoned
 * about without any of them.
 *
 * The DECISIONS this pipeline makes — which parser a file needs, what work a
 * parse still owes, what a chunk row must say about where its text came from —
 * are pure and live in `./ingest-plan`, where they can be tested without a
 * database. This file is the half with effects.
 */
import type { DocKind, DocumentParser, ParsedDocument } from "@nemesis/shared";

// TYPE-ONLY, and deliberately so: it is erased at runtime, so this module still
// starts no Supabase client of its own.
import type { adminClient } from "@/lib/server";

import {
  asParsedDocument,
  docKindFor,
  EMBEDDING_VERSION,
  MAX_CHUNKS_PER_PARSE,
  planWork,
  sha256Hex,
  sourceChunkRows,
  toParseRow,
  type ChunkGeneration,
  type DocumentChunker,
  type ParseRow,
  type ParseState,
  type PipelineStage,
  type PipelineVersions,
  type WorkPlan,
} from "./ingest-plan";

// ONE IMPORT PATH FOR CALLERS. The decisions live next door because they are
// pure and this file is not, but a route wiring up ingestion should not have to
// know that, and a reader following `ingest-pipeline` should still find the
// whole vocabulary.
export * from "./ingest-plan";

/** Rows per insert request, and texts per embed request. The embedder batches
 *  internally too; this bound is about OUR round trips and, more importantly,
 *  about DURABLE PROGRESS — every batch that lands is persisted, so a failure at
 *  batch 40 leaves 39 batches embedded and the retry starts from there. */
const INSERT_BATCH = 500;
const EMBED_BATCH = 128;
/** Concurrent per-row embedding writes. Postgres does not need more, and an
 *  unbounded Promise.all over a big document opens a connection storm. */
const UPDATE_CONCURRENCY = 16;

/** Longest error text kept on the row. Enough for a stack's first frames. */
const MAX_ERROR_CHARS = 2_000;

/**
 * Turn texts into vectors, in order, one per input.
 *
 * 🔴 THE IMPLEMENTATION MUST BE SINGLE-SPACE (STRICT). `embedCoreTexts` falls
 * back from Voyage to Cohere to OpenAI unless called with `{ strict: true }`,
 * and a Cohere 1024-vector is NOT comparable to a Voyage 1024-vector — equal
 * dimensions are not the same space. A lenient implementation would both poison
 * the index and write a false `embedding_version`, so any implementation wired
 * in here must fail rather than substitute a provider.
 *
 * 🔴 WHERE IT LIVES TODAY — AND WHY THIS IS A SEAM, NOT AN OMISSION. The only
 * embedder in this codebase is Deno code inside the edge functions
 * (`supabase/functions/core-source-sync/embeddings.ts`), reading `VOYAGE_API_KEY`
 * from `Deno.env`. It cannot be imported from Next.js, and re-implementing it
 * here would create a second thing to keep in step with the one that already
 * serves note indexing. So: when no embedder is supplied, this pipeline stops
 * cleanly at `chunked` and says so. The chunk rows are already written, already
 * carry `embedding_version`, and are invisible to search until a vector arrives
 * (every match RPC filters `embedding is not null`), so stopping there is a
 * correct partial state rather than a broken one — the edge function finishes
 * the job by embedding exactly the rows whose `embedding` is null.
 */
export type EmbedTexts = (texts: string[]) => Promise<number[][]>;

/** The Supabase client this pipeline writes through. MUST be the service role:
 *  `library_chunks` and `parsed_documents` revoke writes from `authenticated`,
 *  so a user-scoped client cannot run any of this. Typed as exactly what
 *  `adminClient()` returns, so the two can never drift apart.
 *
 *  🔴 SERVICE ROLE BYPASSES RLS, so every statement below carries its own
 *  `.eq("user_id", userId)`. That predicate is the authorisation — the same rule
 *  `ingest-fetch.ts` documents for reads applies to every write here. */
export type IngestDb = ReturnType<typeof adminClient>;

// ─────────────────────────────────────────────────────────────────────────────
// Claiming the parse
// ─────────────────────────────────────────────────────────────────────────────

export interface ParseIdentity {
  userId: string;
  contentHash: string;
  kind: DocKind;
  parserVersion: string;
}

const PARSE_COLUMNS = "id,state,parser_version,failed_stage,attempts";

/**
 * Claim the parse, or join the one already claimed. TWO STATEMENTS, ONE HELPER,
 * and the shape is the whole point.
 *
 * 🔴 CONCURRENCY SAFETY IS THE UNIQUE INDEX `parsed_documents_identity`
 * (user_id, content_hash, parser_version), NOT AN APPLICATION CHECK. Two
 * simultaneous uploads of the same file — the student double-clicks, or the LMS
 * extension and a manual drop land together — both run this. A "select, and
 * insert if absent" would have both selects miss and both inserts proceed, and
 * the account would parse and embed the same bytes twice.
 *
 * So the insert goes first and is allowed to lose: `upsert(..., ignoreDuplicates:
 * true)` sends `Prefer: resolution=ignore-duplicates`, which PostgREST compiles
 * to `ON CONFLICT DO NOTHING`. The winner's row is written; the loser's insert
 * affects nothing and raises no error. THEN both select by the identity triple
 * and get the SAME row. Whoever gets there first does the work; the other
 * observes it. The database decided, which is the only participant that can.
 *
 * Note what is NOT done: `.insert().select().single()` cannot be the join,
 * because on conflict it returns an ERROR rather than the existing row — the
 * loser would see a failure where it should see a colleague.
 */
export async function claimParse(db: IngestDb, identity: ParseIdentity): Promise<ParseRow | null> {
  const { error: claimError } = await db.from("parsed_documents").upsert(
    {
      user_id: identity.userId,
      content_hash: identity.contentHash,
      doc_kind: identity.kind,
      parser_version: identity.parserVersion,
      state: "pending",
    },
    { onConflict: "user_id,content_hash,parser_version", ignoreDuplicates: true },
  );
  // A losing insert is NOT an error here (DO NOTHING succeeds affecting zero
  // rows), so anything that does arrive is real — but the select below is still
  // worth trying: the row may exist from an earlier run even when this write
  // failed, and joining it is better than refusing to ingest.
  if (claimError) console.warn("claimParse insert:", claimError.message);

  const { data, error } = await db
    .from("parsed_documents")
    .select(PARSE_COLUMNS)
    // 🔴 The authorisation predicate, and simultaneously the identity lookup.
    // Service role sees every account; this is what confines it to one.
    .eq("user_id", identity.userId)
    .eq("content_hash", identity.contentHash)
    .eq("parser_version", identity.parserVersion)
    .maybeSingle();
  if (error || !data) return null;
  return toParseRow(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// State transitions and bookkeeping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Move the row to a state.
 *
 * `updated_at` is written by hand ON PURPOSE: `parsed_documents` has no touch
 * trigger, and `parsed_documents_state_idx` orders the work queue by
 * `updated_at desc`. Leaving it at the creation time would make every in-flight
 * parse look equally stale to a sweep.
 */
async function setState(
  db: IngestDb,
  row: ParseRow,
  userId: string,
  state: ParseState,
  patch: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db
    .from("parsed_documents")
    .update({ state, updated_at: new Date().toISOString(), ...patch })
    .eq("id", row.id)
    .eq("user_id", userId);
  if (error) throw new Error(`state ${state}: ${error.message}`);
}

/**
 * Record where a run died, and why.
 *
 * NEVER THROWS. It runs on the failure path, so throwing here would replace the
 * real reason with a bookkeeping error — the one message that would have
 * explained the outage. `attempts` is incremented from the value this run read;
 * two concurrent retries can therefore land on the same number, which is
 * acceptable for a retry counter and not worth an RPC to make exact.
 */
async function recordFailure(
  db: IngestDb,
  row: ParseRow,
  userId: string,
  stage: PipelineStage,
  message: string,
): Promise<void> {
  try {
    await db
      .from("parsed_documents")
      .update({
        state: "failed",
        failed_stage: stage,
        error: message.slice(0, MAX_ERROR_CHARS),
        attempts: row.attempts + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("user_id", userId);
  } catch {
    // The stage error is the one worth surfacing; it is returned to the caller
    // and logged regardless of whether this write landed.
  }
}

/**
 * Point the placement at its parse, and remember the bytes it holds.
 *
 * BEST-EFFORT, like every other write to `library_sources`. A file whose row did
 * not get linked is still parsed, still chunked and still searchable; failing a
 * completed parse over a metadata update would trade the expensive result for
 * the cheap one. The link is idempotent, so the next run repairs it.
 *
 * TRADEOFF, STATED: this is called as soon as the parse is claimed, BEFORE the
 * stages run, so the Library can show a file's progress while it is being read
 * rather than only afterwards. The cost is that a parser upgrade which then
 * fails at parse leaves the placement pointing at a `failed` row, while the
 * previous parser's chunks keep serving search — the right rows are still found,
 * but `parsed_document_id` names the newer, broken parse until it succeeds.
 */
async function linkPlacement(
  db: IngestDb,
  sourceId: string,
  userId: string,
  contentHash: string,
  parsedDocumentId: string,
): Promise<void> {
  try {
    await db
      .from("library_sources")
      .update({ content_hash: contentHash, parsed_document_id: parsedDocumentId })
      .eq("id", sourceId)
      // 🔴 Authorisation, again: service role could otherwise re-point another
      // account's placement at this account's parse.
      .eq("user_id", userId);
  } catch {
    // Deliberately silent — see above.
  }
}

/**
 * How much of the CURRENT generation exists, counted in the database.
 *
 * 🔴 `count: "exact", head: true` — NEVER `data.length`. A `.select()` without
 * paging silently truncates at 1,000 rows, so a 300-page PDF would report 1,000
 * of 1,000 embedded and `planWork` would call a half-embedded document ready.
 */
async function countChunkGeneration(
  db: IngestDb,
  parsedDocumentId: string,
  userId: string,
  versions: PipelineVersions,
): Promise<ChunkGeneration> {
  const scope = () =>
    db
      .from("library_chunks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("origin_type", "source")
      .eq("parsed_document_id", parsedDocumentId)
      .eq("chunker_version", versions.chunker)
      .eq("embedding_version", versions.embedding);

  const total = await scope();
  if (total.error) throw new Error(`count chunks: ${total.error.message}`);
  const embedded = await scope().not("embedding", "is", null);
  if (embedded.error) throw new Error(`count embedded: ${embedded.error.message}`);
  return { total: total.count ?? 0, embedded: embedded.count ?? 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// The stages
// ─────────────────────────────────────────────────────────────────────────────

async function runParse(
  db: IngestDb,
  row: ParseRow,
  userId: string,
  parser: DocumentParser,
  bytes: Uint8Array,
  fileName: string,
  contentHash: string,
): Promise<ParsedDocument> {
  await setState(db, row, userId, "parsing");
  const doc = await parser.parse(bytes, fileName);

  // The parser hashes the bytes too. A disagreement means one of us hashed
  // something other than the file, which is worth knowing about — but OUR hash
  // is the row's identity and the one the placement was linked with, so it wins.
  if (doc.contentHash && doc.contentHash !== contentHash) {
    console.warn(`parser hash ${doc.contentHash.slice(0, 12)} != ingest hash ${contentHash.slice(0, 12)}`);
  }

  await setState(db, row, userId, "parsed", {
    // The WHOLE parse: chunking reads it back from here, so it has to survive
    // the round trip intact.
    structure: doc,
    // Duplicated out of the parse on purpose — a coverage sweep ("which
    // documents have unread pages?") must not have to fetch every TOASTed
    // structure to answer.
    coverage: doc.coverage,
    unit_count: doc.units.length,
    visual_count: doc.visuals.length,
    table_count: doc.tables.length,
    // A previous failure is history the moment the stage succeeds.
    failed_stage: null,
    error: null,
  });
  return doc;
}

/** Read a parse back for re-chunking, so a chunker upgrade never re-reads the
 *  original bytes. */
async function loadParse(db: IngestDb, row: ParseRow, userId: string): Promise<ParsedDocument | null> {
  const { data, error } = await db
    .from("parsed_documents")
    .select("structure")
    .eq("id", row.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return asParsedDocument((data as { structure?: unknown }).structure);
}

interface ChunkOutcome {
  written: number;
  capped: boolean;
}

/**
 * Replace this generation's chunk rows.
 *
 * 🔴 RETRY SAFETY = DELETE-THEN-INSERT PER GENERATION, plus the unique index
 * `library_chunks_source_identity`. Re-running after a partial failure removes
 * whatever the dead run left and writes the set again; it cannot duplicate. The
 * delete is scoped to (parse, chunker, embedding) — a DIFFERENT generation's
 * rows are untouched, which is what lets the old vectors keep serving search
 * while a new chunker's rows are built beside them.
 *
 * Rows are inserted WITHOUT vectors. Every match RPC filters
 * `embedding is not null`, so a half-embedded generation is invisible rather
 * than wrong, and `chunked` becomes a durable checkpoint the embedder resumes
 * from instead of a claim that has to be taken on trust.
 *
 * WHAT THIS IS NOT: atomic. Delete and insert are separate statements, so two
 * runners re-chunking the SAME generation at the same time can still interleave.
 * The claim-then-count flow above serialises the common case (whoever claimed
 * first is already past this), and the unique index catches the collision when
 * it does not — but a transaction would be needed to make it impossible, and
 * that means an RPC, not PostgREST.
 */
async function runChunk(
  db: IngestDb,
  row: ParseRow,
  userId: string,
  doc: ParsedDocument,
  chunker: DocumentChunker,
  versions: PipelineVersions,
): Promise<ChunkOutcome> {
  await setState(db, row, userId, "chunking");

  const produced = chunker.chunk(doc);
  const capped = produced.length > MAX_CHUNKS_PER_PARSE;
  const rows = sourceChunkRows({
    userId,
    parsedDocumentId: row.id,
    title: doc.title ?? "",
    chunks: capped ? produced.slice(0, MAX_CHUNKS_PER_PARSE) : produced,
    versions,
  });

  const { error: deleteError } = await db
    .from("library_chunks")
    .delete()
    .eq("user_id", userId)
    .eq("origin_type", "source")
    .eq("parsed_document_id", row.id)
    .eq("chunker_version", versions.chunker)
    .eq("embedding_version", versions.embedding);
  if (deleteError) throw new Error(`delete chunks: ${deleteError.message}`);

  let raced = false;
  for (let start = 0; start < rows.length; start += INSERT_BATCH) {
    const { error } = await db.from("library_chunks").insert(rows.slice(start, start + INSERT_BATCH));
    if (error) {
      // 23505 = unique violation on (parse, chunker, embedding, chunk_index).
      // The likely cause is another runner writing this generation between our
      // delete and our insert — a race we LOST, and its rows are the same rows
      // because the chunker is deterministic over the same parse.
      //
      // 🔴 BUT NOT NECESSARILY. The same error would appear if a chunker handed
      // us two chunks with one `chunkIndex`, and in that case stopping here
      // leaves a SHORT set. So the count is re-read from the database below
      // rather than assumed from `rows.length`: a short generation then shows up
      // in the result instead of being asserted away.
      if (error.code === "23505") {
        console.warn(`chunk insert conflicted for parse ${row.id}; re-reading the generation`);
        raced = true;
        break;
      }
      throw new Error(`insert chunks: ${error.message}`);
    }
  }
  const written = raced ? (await countChunkGeneration(db, row.id, userId, versions)).total : rows.length;

  await setState(db, row, userId, "chunked", { failed_stage: null, error: null });
  return { written, capped };
}

/**
 * Embed the rows of this generation that still lack a vector.
 *
 * Resumable by construction: the work is defined by a QUERY ("rows with no
 * embedding"), not by a cursor a crashed run would take with it. Each batch is
 * written before the next is requested, so progress is durable at 128-row
 * granularity.
 */
async function runEmbed(
  db: IngestDb,
  row: ParseRow,
  userId: string,
  versions: PipelineVersions,
  embed: EmbedTexts,
  outstanding: number,
): Promise<number> {
  await setState(db, row, userId, "embedding");

  let embedded = 0;
  // A hard bound on iterations. If an update silently affects no rows, the same
  // batch would come back forever; this turns that into an error instead of an
  // infinite loop that looks like a hung upload.
  const maxRounds = Math.ceil(Math.max(outstanding, 1) / EMBED_BATCH) + 2;

  for (let round = 0; round < maxRounds; round += 1) {
    const { data, error } = await db
      .from("library_chunks")
      .select("id,content")
      .eq("user_id", userId)
      .eq("origin_type", "source")
      .eq("parsed_document_id", row.id)
      .eq("chunker_version", versions.chunker)
      .eq("embedding_version", versions.embedding)
      .is("embedding", null)
      .order("chunk_index", { ascending: true })
      .limit(EMBED_BATCH);
    if (error) throw new Error(`select unembedded: ${error.message}`);

    const batch = (data ?? []) as Array<{ id: string; content: string }>;
    if (batch.length === 0) {
      await setState(db, row, userId, "ready", { failed_stage: null, error: null });
      return embedded;
    }

    const vectors = await embed(batch.map((chunk) => chunk.content));
    // A short or long response would silently pair text with the wrong vector —
    // the kind of corruption that shows up months later as an inexplicable hit.
    if (vectors.length !== batch.length) {
      throw new Error(`embed returned ${vectors.length} vectors for ${batch.length} chunks`);
    }

    for (let start = 0; start < batch.length; start += UPDATE_CONCURRENCY) {
      const slice = batch.slice(start, start + UPDATE_CONCURRENCY);
      const results = await Promise.all(
        slice.map((chunk, offset) =>
          db
            .from("library_chunks")
            .update({ embedding: vectors[start + offset] })
            .eq("id", chunk.id)
            .eq("user_id", userId),
        ),
      );
      for (const result of results) {
        if (result.error) throw new Error(`write embedding: ${result.error.message}`);
      }
      embedded += slice.length;
    }
  }

  throw new Error("embedding made no progress");
}

// ─────────────────────────────────────────────────────────────────────────────
// The pipeline
// ─────────────────────────────────────────────────────────────────────────────

export interface IngestInput {
  /** 🔴 The id the caller's auth resolved, NEVER a value from a request body. */
  userId: string;
  bytes: Uint8Array;
  fileName: string;
  mimeType?: string | null;
  /** The `library_sources` row this upload is filed as. Optional: a parse can
   *  exist before anything points at it, and a file can be filed twice against
   *  one parse. */
  sourceId?: string | null;
}

export interface IngestDeps {
  db: IngestDb;
  /** One parser per kind. Absent kinds are refused rather than guessed at, so a
   *  half-wired deploy fails loudly on the formats it cannot read and keeps
   *  working for the ones it can. */
  parsers: Partial<Record<DocKind, DocumentParser>>;
  chunker: DocumentChunker;
  /** Omitted = stop at `chunked`. See EmbedTexts for why that is a seam. */
  embed?: EmbedTexts | null;
}

export type IngestFailure =
  /** No parser for this file. Nothing was claimed and nothing was written. */
  | "unsupported"
  /** The parse row could not be claimed or joined — the database is unreachable
   *  or the identity index is missing. Nothing downstream can be trusted. */
  | "claim-failed"
  /** A stage threw. `failedStage` names which; the row records it too. */
  | "stage-failed";

export interface IngestResult {
  ok: boolean;
  contentHash: string;
  kind: DocKind | null;
  parsedDocumentId: string | null;
  /** The state the row is in now — including on failure. */
  state: ParseState | null;
  plan: WorkPlan | null;
  chunkCount: number;
  embeddedCount: number;
  /** True when the chunker produced more than MAX_CHUNKS_PER_PARSE. Reported
   *  HERE rather than written into the parse's `coverage`: coverage is the
   *  parser's measured report of the document, and a spend ceiling of ours is
   *  not a fact about the document. */
  chunksCapped: boolean;
  failure: IngestFailure | null;
  failedStage: PipelineStage | null;
  error: string | null;
  /** Set when the run stopped short of `ready` WITHOUT failing. */
  note: string | null;
}

function result(partial: Partial<IngestResult> & { contentHash: string }): IngestResult {
  return {
    ok: false,
    kind: null,
    parsedDocumentId: null,
    state: null,
    plan: null,
    chunkCount: 0,
    embeddedCount: 0,
    chunksCapped: false,
    failure: null,
    failedStage: null,
    error: null,
    note: null,
    ...partial,
  };
}

/**
 * Run one file all the way to searchable, doing only the work that is missing.
 *
 * Safe to call repeatedly on the same bytes: the second call joins the first
 * call's parse, measures what exists, and either does nothing or resumes exactly
 * where the previous run stopped.
 */
export async function ingestSource(input: IngestInput, deps: IngestDeps): Promise<IngestResult> {
  // (a) Physical identity, from the bytes themselves.
  const contentHash = await sha256Hex(input.bytes);

  // (d) Route by kind. Done BEFORE the claim, because the parser's version is
  // part of the parse's identity — there is no such thing as claiming a parse
  // without knowing which parser will produce it.
  const kind = docKindFor(input.fileName, input.mimeType);
  const parser = kind ? deps.parsers[kind] : undefined;
  if (!kind || !parser) {
    return result({
      contentHash,
      kind,
      failure: "unsupported",
      error: kind ? `no parser wired for ${kind}` : `unsupported file: ${input.fileName}`,
    });
  }

  const versions: PipelineVersions = {
    parser: parser.version,
    chunker: deps.chunker.version,
    embedding: EMBEDDING_VERSION,
  };

  // (b) Claim or join.
  const row = await claimParse(deps.db, {
    userId: input.userId,
    contentHash,
    kind,
    parserVersion: versions.parser,
  });
  if (!row) {
    return result({ contentHash, kind, failure: "claim-failed", error: "could not claim or join the parse" });
  }

  // (f) Link the placement immediately, so the Library can show this file's
  // progress while the stages run rather than only after they finish.
  if (input.sourceId) {
    await linkPlacement(deps.db, input.sourceId, input.userId, contentHash, row.id);
  }

  let chunks: ChunkGeneration;
  try {
    chunks = await countChunkGeneration(deps.db, row.id, input.userId, versions);
  } catch (e) {
    return result({
      contentHash,
      kind,
      parsedDocumentId: row.id,
      state: row.state,
      failure: "stage-failed",
      error: (e as Error).message,
    });
  }

  const plan = planWork(row, versions, chunks);
  const base = {
    contentHash,
    kind,
    parsedDocumentId: row.id,
    plan,
    chunkCount: chunks.total,
    embeddedCount: chunks.embedded,
  };

  if (!plan.stage) {
    return result({ ...base, ok: true, state: "ready" });
  }

  // (c) Advance the state machine, one stage at a time, recording where a
  // failure happened so a source can never sit in the Library looking uploaded
  // while indexing died three stages ago.
  let stage: PipelineStage = plan.stage;
  try {
    let doc: ParsedDocument | null = null;
    if (plan.needsParse) {
      stage = "parse";
      doc = await runParse(deps.db, row, input.userId, parser, input.bytes, input.fileName, contentHash);
    }

    let written = chunks.total;
    let capped = false;
    if (plan.needsChunk) {
      stage = "chunk";
      // Only fetched when this run did not just produce it — a chunker upgrade
      // must never re-read the original bytes.
      doc = doc ?? (await loadParse(deps.db, row, input.userId));
      if (!doc) throw new Error("parse row has no readable structure");
      const outcome = await runChunk(deps.db, row, input.userId, doc, deps.chunker, versions);
      written = outcome.written;
      capped = outcome.capped;
    }

    // No `if (!plan.needsEmbed)` branch: the plan's stages are ordered, so
    // anything that needed chunking needs embedding, and a plan needing neither
    // returned above. Embedding when nothing is outstanding is harmless anyway —
    // the query for un-embedded rows comes back empty and the row goes ready.

    if (!deps.embed) {
      // (g) The seam. Not a failure: the rows exist, carry their versions, and
      // are simply not searchable until the edge function embeds them.
      return result({
        ...base,
        ok: true,
        state: "chunked",
        chunkCount: written,
        chunksCapped: capped,
        note: "no embedder wired; embedding is the edge function's half of the pipeline",
      });
    }

    stage = "embed";
    const outstanding = plan.needsChunk ? written : chunks.total - chunks.embedded;
    const embedded = await runEmbed(deps.db, row, input.userId, versions, deps.embed, outstanding);
    return result({
      ...base,
      ok: true,
      state: "ready",
      chunkCount: written,
      embeddedCount: chunks.embedded + embedded,
      chunksCapped: capped,
    });
  } catch (e) {
    const message = (e as Error).message;
    await recordFailure(deps.db, row, input.userId, stage, message);
    return result({ ...base, state: "failed", failure: "stage-failed", failedStage: stage, error: message });
  }
}
