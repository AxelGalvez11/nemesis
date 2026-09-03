// source-index — makes the ORIGINAL document searchable, not just notes made from it.
//
// 🔴 WHAT THIS CLOSES. `library_chunks` has carried typed provenance since
// 20260806190000 and holds zero rows with `origin_type = 'source'`. Every parse
// in `parsed_documents` is stored, structured, and unreachable by search. The
// consequence is not abstract: "importing a lecture makes it available to
// Nemesis" has been true only because the librarian turned it into notes, which
// is why note generation could not simply be switched off.
//
// Called by pg_cron, never by a client. Auth = the service-role key in the
// Authorization header; deploy with --no-verify-jwt so this custom check is the
// gate (see docs — the verify_jwt trap has caused a production outage before).
//
// Contract per tick:
//   1. Ask list_unchunked_parses for parses with no chunks for THIS
//      chunker/embedding generation. That RPC is the only definition of "stale",
//      and it does the staleness test and the LIMIT in one statement — selecting
//      here and filtering in JS applies the limit before the test, so on a
//      library bigger than a batch the newest document is never reached.
//   2. Read the v2 units-blocks envelope from `structure`. A parse written by an
//      older parser has no model, and is SKIPPED rather than chunked from its
//      flat text: a chunk with no unit cannot carry a locator, and a locator
//      invented here would be exactly the fabrication the model prevents.
//   3. Chunk, embed, and write through replace_source_chunks — one transaction,
//      scoped to one generation, so a re-index never makes a document
//      unfindable while it runs.
//   4. A parse that throws is left for the next tick. It is not marked failed:
//      the PARSE is fine, only its indexing did not happen.

import { createClient } from 'jsr:@supabase/supabase-js@2'
// 🔴 THE SOURCE FILE, NOT A COPY. `ask` and `compare` import `packages/shared`
// the same way. A Deno-side duplicate of the chunker would be two sets of
// chunking rules that agree only until one of them is edited — and the whole
// point of `chunker_version` is that a chunk's boundaries are knowable.
import { chunkDocument } from '../../../packages/shared/src/document-chunks.ts'
import { storedDocumentModel } from '../../../packages/shared/src/document-envelope.ts'
import { embedCoreTexts } from '../core-source-sync/embeddings.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Parses per tick. The spend guard, matching the note indexer's DOC_LIMIT. */
const PARSE_LIMIT = 10

/**
 * Chunks embedded per parse.
 *
 * 🔴 EXCEEDING IT IS A TRUNCATION AND IT IS REPORTED, NOT SWALLOWED. The note
 * indexer's equivalent cap (MAX_CHUNKS_PER_DOC = 60) silently stops at 60 and a
 * 500-page document is then searchable only in its first fifth, with nothing
 * saying so. This is deliberately much higher — a real 2,116-page PDF chunks to
 * a few thousand — and what it drops is logged and counted.
 */
const MAX_CHUNKS_PER_PARSE = 4_000

/** Embedding requests per batch. */
const EMBED_BATCH = 64

/** Bumped when chunk BOUNDARIES change. Must match the app's CHUNKER_VERSION. */
const CHUNKER_VERSION = 'units-blocks-1'
/** Bumped when the embedding SPACE changes. Two spaces are not comparable. */
const EMBEDDING_VERSION = 'voyage-3-large-1024'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

interface UnchunkedParse {
  parsed_document_id: string
  user_id: string
  doc_kind: string
  /** 🔴 THE PARSE'S OWN VERSION, not the document's format. */
  parser_version: string
  structure: unknown
  /**
   * Identity of the chunkable content in THIS snapshot of `structure`.
   *
   * 🔴 IT TRAVELS WITH THE STRUCTURE, from the same read, and is handed straight back to
   * `replace_source_chunks`. Recomputing it at write time would read whatever the row says then:
   * a reparse landing between the claim and the insert would stamp the new digest onto chunks
   * built from the old content, which is permanently stale and silent — the exact defect
   * `20260903T40_reindex_when_the_parse_changes.sql` exists to end.
   */
  content_digest: string | null
}

function unauthorized(req: Request): boolean {
  const header = req.headers.get('Authorization') ?? ''
  return header !== `Bearer ${SERVICE_ROLE}`
}

/**
 * 🔴 EVERY RUN REPORTS ITS OUTCOME, INCLUDING THE ONES THAT DID NOTHING.
 *
 * This function was dead from the day it shipped until 2026-08-10 and three
 * layers reported success throughout: pg_cron recorded 812 `succeeded` runs
 * (it records whether the STATEMENT ran), `run_source_indexing` returned 0
 * (which also means "nothing to do"), and the per-document skip reason read as
 * "old data". None of them was about a document becoming searchable.
 *
 * So the outcome is written where something can assert on it. A run that
 * claimed work and indexed none of it is now a fact in a table, and
 * `source_index_health()` turns consecutive such runs into `stalled`.
 *
 * Best-effort by design: a telemetry write that failed must never fail the
 * indexing that already succeeded. But it is LOGGED, because silent telemetry
 * is how you end up believing an empty table means an idle system.
 */
async function report(row: {
  pending: number
  claimed: number
  indexed: number
  skipped: number
  chunksEmbedded: number
  skipReasons: Record<string, number>
  error?: string | null
  durationMs: number
}) {
  const { error } = await admin.rpc('record_source_index_run', {
    p_chunks_embedded: row.chunksEmbedded,
    p_claimed: row.claimed,
    p_duration_ms: row.durationMs,
    p_error: row.error ?? null,
    p_indexed: row.indexed,
    p_pending: row.pending,
    p_skip_reasons: row.skipReasons,
    p_skipped: row.skipped,
  })
  if (error) console.error('source-index: run telemetry write failed', error.message)
}

/** Queue depth, unbounded by the batch limit. 0 when it cannot be read — the
 *  count is context for the outcome, never a reason to skip recording one. */
async function pendingCount(): Promise<number> {
  const { data, error } = await admin.rpc('count_unchunked_parses', {
    p_chunker_version: CHUNKER_VERSION,
    p_embedding_version: EMBEDDING_VERSION,
  })
  if (error) {
    console.error('source-index: pending count failed', error.message)
    return 0
  }
  return typeof data === 'number' ? data : 0
}

Deno.serve(async (req) => {
  if (unauthorized(req)) return new Response('unauthorized', { status: 401 })
  const startedAt = Date.now()

  const pending = await pendingCount()

  const { data, error } = await admin.rpc('list_unchunked_parses', {
    p_chunker_version: CHUNKER_VERSION,
    p_embedding_version: EMBEDDING_VERSION,
    p_limit: PARSE_LIMIT,
  })
  if (error) {
    console.error('source-index: queue read failed', error.message)
    // 🔴 A FAILED RUN IS STILL A RUN. Returning here without a row is how a
    // broken queue read becomes indistinguishable from an idle system.
    await report({
      chunksEmbedded: 0, claimed: 0, durationMs: Date.now() - startedAt,
      error: `queue read failed: ${error.message}`, indexed: 0, pending,
      skipReasons: {}, skipped: 0,
    })
    return Response.json({ error: 'queue read failed' }, { status: 500 })
  }

  const parses = (data ?? []) as UnchunkedParse[]
  // Zero is the healthy answer. Reporting it as an error makes the healthy case
  // indistinguishable from the broken one in whatever watches this function —
  // but it is still RECORDED, because "we ran and there was nothing to do" and
  // "we never ran" are different facts and only one of them is fine.
  if (parses.length === 0) {
    await report({
      chunksEmbedded: 0, claimed: 0, durationMs: Date.now() - startedAt,
      indexed: 0, pending, skipReasons: {}, skipped: 0,
    })
    return Response.json({ indexed: 0, pending, results: [] })
  }

  const results = []
  for (const parse of parses) results.push(await indexOne(parse))

  const indexed = results.filter((r) => r.ok).length
  const skipReasons: Record<string, number> = {}
  for (const result of results) {
    if (result.ok) continue
    const reason = result.reason ?? 'unknown'
    skipReasons[reason] = (skipReasons[reason] ?? 0) + 1
  }
  const chunksEmbedded = results.reduce((sum, r) => sum + (r.ok ? (r.chunks ?? 0) : 0), 0)

  await report({
    chunksEmbedded,
    claimed: parses.length,
    durationMs: Date.now() - startedAt,
    indexed,
    pending,
    skipReasons,
    skipped: results.length - indexed,
  })

  return Response.json({ chunksEmbedded, indexed, pending, results })
})

async function indexOne(parse: UnchunkedParse) {
  const id = parse.parsed_document_id
  try {
    // 🔴 THE MODEL, VALIDATED — NOT CAST. This is jsonb that has been through
    // the database and back. A structure written by an older parser, restored
    // from a backup, or hand-edited must fail to read rather than arrive as a
    // half-typed object whose missing blocks look like a document with no
    // content — which would then be written as a complete, empty index.
    // 🔴 `storedDocumentModel`, NOT `readDocumentModel`. `parsed_documents.structure`
    // holds an ENVELOPE (`{ v, shape, title, text, model }`), never a bare model.
    // `readDocumentModel` validates a MODEL, so it looked for `format` at the top of
    // an envelope, never found it, and would have returned null for every row —
    // skipping every document forever.
    //
    // 🔴 THREE INDEPENDENT BREAKS STOPPED SOURCE RETRIEVAL, AND THIS WAS ONLY THE
    // THIRD. Checked against production 2026-08-10: this function had NEVER been
    // deployed (it went live at version 1 that day), and the Vault secrets
    // `source_index_url` / `source_index_service_role_key` had never been created,
    // so `run_source_indexing` hit its "secrets unset" branch and returned 0
    // without ever dispatching. 812 cron runs all recorded `succeeded`, because
    // pg_cron records whether the STATEMENT ran, not whether anything happened.
    // Any one of the three alone would have produced the same silence.
    //
    // What would have hidden this one is the line below: null is reported as
    // "predates the canonical model", so a hard bug renders as an expected backlog
    // of old parses and `indexed: 0` looks like the healthy answer this function
    // documents. Proven by round-tripping a real envelope through both readers.
    const model = storedDocumentModel(parse.structure)
    if (!model) {
      // 🔴🔴 TWO DIFFERENT FACTS WERE WEARING ONE NAME, AND THAT IS HOW A LIVE PARSER BUG
      // HID FOR THREE WEEKS. `no-model` is documented as "this parse predates the canonical
      // model" — an expected backlog, nothing to do. But this branch is also reached when a
      // CURRENT v2 envelope fails validation, which is never expected and always a bug in
      // whatever wrote it.
      //
      // Measured 2026-09-03: the PDF structure builder emitted `headingPath: [null, ...]`
      // for any document whose first heading was an H2 (array holes from one-slot-per-level).
      // `readDocumentModel` rejects one such block and therefore the whole model, so five of
      // seven real lecture PDFs were skipped here — reported as old data, on a run whose log
      // line read `{"no-model": 5}` and looked like the healthy answer.
      //
      // A v1 envelope has no `shape` of 'units-blocks'; a v2 one does. Splitting on that is
      // enough to tell "nothing to do" from "someone broke the writer".
      const shape = (parse.structure as { shape?: unknown } | null)?.shape
      if (shape === 'units-blocks') {
        console.error(
          `source-index: ${id} carries a units-blocks envelope that failed validation. ` +
            `This is a bug in whatever wrote the model, not old data.`,
        )
        return { ok: false, parsedDocumentId: id, reason: 'unreadable-model' }
      }
      // Genuinely what it says: a v1 `text-only` envelope, written before the canonical model
      // existed. Re-parsing it is Phase 1's job.
      return { ok: false, parsedDocumentId: id, reason: 'no-model' }
    }

    const all = chunkDocument(model)
    const chunks = all.slice(0, MAX_CHUNKS_PER_PARSE)
    const dropped = all.length - chunks.length
    if (dropped > 0) {
      // Visible, because a silently shorter index is a document that answers
      // confidently about its first half and not at all about its second.
      console.warn(`source-index: ${id} truncated at ${MAX_CHUNKS_PER_PARSE} chunks, ${dropped} dropped`)
    }
    if (chunks.length === 0) return { ok: false, parsedDocumentId: id, reason: 'empty' }

    const embeddings: number[][] = []
    for (let start = 0; start < chunks.length; start += EMBED_BATCH) {
      const batch = chunks.slice(start, start + EMBED_BATCH).map((chunk) => chunk.text)
      embeddings.push(...(await embedCoreTexts(batch, 'document')))
    }
    if (embeddings.length !== chunks.length) {
      throw new Error(`embedding count ${embeddings.length} does not match ${chunks.length} chunks`)
    }

    const rows = chunks.map((chunk, index) => ({
      chunk_index: chunk.index,
      content: chunk.text,
      embedding: embeddings[index],
      heading_path: chunk.headingPath,
      // 🔴 'document' FOR A BODY UNIT, NEVER 'page'. Word paginates at layout
      // time, so a page number for a .docx is invented. The model refuses to
      // print one; this is the same refusal in the database's vocabulary.
      unit_index: chunk.unitKind === 'body' || chunk.unitKind === 'image' ? null : chunk.unitStart,
      unit_kind:
        chunk.unitKind === 'page' || chunk.unitKind === 'slide' || chunk.unitKind === 'sheet'
          ? chunk.unitKind
          : 'document',
      unit_label: model.units[chunk.unitStart]?.label ?? null,
    }))

    // The placement supplies the folder and title a result is shown under. A
    // parse can back several placements; the first is enough to name it, and the
    // chunk points at the PARSE, which is the identity that matters.
    const { data: placement } = await admin
      .from('library_sources')
      .select('folder_path,file_name')
      .eq('parsed_document_id', id)
      .limit(1)
      .maybeSingle()

    const { data: written, error: writeError } = await admin.rpc('replace_source_chunks', {
      p_chunker_version: CHUNKER_VERSION,
      p_chunks: rows,
      p_embedding_version: EMBEDDING_VERSION,
      p_parsed_document_id: id,
      p_parser_version: parse.parser_version,
      p_path: placement?.folder_path ?? '',
      p_source_digest: parse.content_digest ?? null,
      p_title: placement?.file_name ?? model.title ?? 'Untitled document',
      p_user_id: parse.user_id,
    })
    if (writeError) throw new Error(writeError.message)

    return { ok: true, chunks: written, dropped, parsedDocumentId: id }
  } catch (caught) {
    // Left for the next tick. NOT marked failed on the parse: the parse is fine,
    // only its indexing did not happen, and conflating the two would show a
    // student a broken document because an embedding provider was down.
    console.error('source-index: failed', id, (caught as Error)?.message)
    return { ok: false, parsedDocumentId: id, reason: 'error' }
  }
}
