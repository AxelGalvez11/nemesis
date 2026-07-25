// library-index — turns each student's Library notes into embedded chunks.
//
// Called by pg_cron (see 20260723T02_library_index_scheduler.sql), never by a
// client. Auth = the service-role key in the Authorization header; deploy with
// verify_jwt=false so this custom check is the gate.
//
// Contract per tick:
//   0. The caller already holds the run lease (20260725T01) — pg_cron takes it
//      before it fires this function, and this function hands it back when the
//      batch is done. Without it, a run longer than the 2-minute cron period let
//      the next tick pull the SAME documents and pay for the same embeddings
//      twice; with backoff in place that also meant charging a healthy note for
//      the loser's unique violation.
//   1. Ask list_dirty_library_docs for up to DOC_LIMIT stale notes. That RPC is
//      the ONLY definition of "stale" — it does the LEFT JOIN and the LIMIT in
//      one SQL statement. Selecting documents here and filtering in JS would
//      apply the limit before the staleness join, so on a library bigger than
//      the batch the newest edit is never reached and the cron never converges.
//   2. For each: purge it if the note was deleted; otherwise, if the content hash
//      is unchanged, only re-stamp the state row (a move/rename/sync echo bumped
//      updated_at but not the words — no embedding spend); otherwise chunk, embed,
//      and replace its chunks. docAction() decides, and its doc explains the order.
//   3. EVERY document handled leaves the dirty set, whether it was re-embedded,
//      merely re-stamped, or purged. Skipping that is what turns this into a loop.
//   4. A document that throws is left dirty on purpose — the next tick retries it,
//      but only after a backoff (20260725T01). Retrying forever at full speed is
//      what let ONE unindexable note burn ~720 embedding attempts a day and sit at
//      the head of the queue — it has the oldest updated_at — until 40 of them
//      stalled the indexer outright. The delay lives in the failure row, which
//      list_dirty_library_docs reads, so a backed-off document is not handed out
//      at all rather than being handed out and skipped.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { chunkNote } from './chunk-note.ts'
import { contentHash } from './content-hash.ts'
import { docAction } from './doc-action.ts'
import { embedCoreTexts } from '../core-source-sync/embeddings.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const DOC_LIMIT = 40          // documents per tick — the spend/rate guard
const MAX_CHUNKS_PER_DOC = 60 // a runaway 500-page paste cannot cost unbounded embeddings
const MAX_CONTENT_CHARS = 200_000
const MAX_QUERY_CHARS = 500

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

interface DirtyDoc {
  document_id: string
  user_id: string
  path: string
  title: string
  content: string
  known_hash: string | null
  /** Optional: supplied by list_dirty_library_docs only AFTER migration
   *  20260724T01. Absent means "this deploy is running one step ahead of the
   *  migration", which docAction() handles as today's behaviour. */
  deleted?: boolean | null
}

/** Mark a document current. Called on BOTH paths — re-embedded and unchanged. */
async function stampState(doc: DirtyDoc, hash: string, chunkCount: number): Promise<void> {
  const { error } = await admin.from('library_index_state').upsert({
    document_id: doc.document_id,
    user_id: doc.user_id,
    content_hash: hash,
    chunk_count: chunkCount,
    indexed_at: new Date().toISOString(),
  }, { onConflict: 'document_id' })
  if (error) throw new Error(`stamp state: ${error.message}`)
}

/**
 * Forget a deleted note completely: its chunks, then its index row. Throws on
 * failure, which leaves it dirty for the next tick.
 *
 * The state row goes LAST and on purpose. It is the only record that this
 * document was ever indexed, so while it exists the document keeps being
 * reported as needing a purge. Removing it first would drop the document out of
 * the dirty set with its chunks still in place — the exact leak this fixes,
 * reintroduced from the other side.
 */
async function purgeDocument(doc: DirtyDoc): Promise<void> {
  const { error: chunkErr } = await admin.from('library_chunks').delete().eq('document_id', doc.document_id)
  if (chunkErr) throw new Error(`purge chunks: ${chunkErr.message}`)
  const { error: stateErr } = await admin.from('library_index_state').delete().eq('document_id', doc.document_id)
  if (stateErr) throw new Error(`purge state: ${stateErr.message}`)
}

/**
 * Push a document's next attempt out, exponentially. Returns its new failure
 * count, or null when the record could not be written.
 *
 * NEVER throws. It runs inside the catch block, so throwing here would replace
 * the real reason a document failed with a bookkeeping error — the one message
 * that would have explained the outage. A document whose failure cannot be
 * recorded simply keeps today's behaviour: retried on the next tick.
 */
async function recordFailure(doc: DirtyDoc, reason: string): Promise<number | null> {
  try {
    const { data, error } = await admin.rpc('record_library_index_failure', {
      p_document_id: doc.document_id,
      p_user_id: doc.user_id,
      p_error: reason,
    })
    // Absent until migration 20260725T01 is applied. Until then this is a no-op
    // and the indexer behaves exactly as it does now, so the two can ship in
    // either order.
    if (error) return null
    return typeof data === 'number' ? data : null
  } catch {
    return null
  }
}

/**
 * Forget that a document ever failed. Called after EVERY success — a purge and a
 * re-stamp clear it just as an index does, because all three prove the document
 * can be processed.
 *
 * Unconditional, and cheap on purpose: the dirty list does not say whether a
 * failure row exists, and deleting nothing costs a primary-key probe. Asking
 * first would double the round trips to save nothing.
 */
async function clearFailure(doc: DirtyDoc): Promise<void> {
  try {
    await admin.from('library_index_failures').delete().eq('document_id', doc.document_id)
  } catch {
    // Same reasoning as recordFailure: bookkeeping must not fail a document that
    // was just processed successfully. A stale row only delays its next edit.
  }
}

/**
 * Hand back the run lease that run_library_indexing() took before calling us.
 *
 * Called only after the batch loop finishes — NOT from a `finally`. A finally
 * does not run when the platform kills the isolate, so it cannot be the thing
 * the design depends on; the lease's own expiry has to cover that case anyway.
 * Releasing here means the ten-minute window only ever applies to a run that
 * really died, while a normal 2-second run frees the lease immediately.
 */
async function releaseLease(): Promise<void> {
  try {
    await admin.rpc('release_library_index_lease')
  } catch {
    // Absent until 20260725T01 is applied, and harmless if it fails: the lease
    // expires on its own. Never worth failing a completed batch over.
  }
}

/** Replace one document's chunks, then stamp it. Throws on failure. */
async function indexDocument(doc: DirtyDoc, hash: string): Promise<number> {
  const chunks = chunkNote(doc.content.slice(0, MAX_CONTENT_CHARS)).slice(0, MAX_CHUNKS_PER_DOC)

  // An emptied note still needs its stale chunks gone.
  const { error: delErr } = await admin.from('library_chunks').delete().eq('document_id', doc.document_id)
  if (delErr) throw new Error(`delete chunks: ${delErr.message}`)

  if (chunks.length > 0) {
    // strict: never write a fallback provider's vectors into this index.
    const vectors = await embedCoreTexts(chunks.map((c) => c.content), 'document', { strict: true })
    if (vectors.length !== chunks.length) throw new Error(`embed count ${vectors.length} != ${chunks.length}`)
    const rows = chunks.map((c, i) => ({
      user_id: doc.user_id,
      document_id: doc.document_id,
      path: doc.path,
      title: doc.title,
      chunk_index: c.index,
      content: c.content,
      embedding: vectors[i],
    }))
    const { error: insErr } = await admin.from('library_chunks').insert(rows)
    if (insErr) throw new Error(`insert chunks: ${insErr.message}`)
  }

  await stampState(doc, hash, chunks.length)
  return chunks.length
}

/** Embed one question. Same code path + same strict rule as the documents. */
async function embedQuery(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({})) as { query?: unknown }
  const query = typeof body.query === 'string' ? body.query.trim().slice(0, MAX_QUERY_CHARS) : ''
  if (!query) return Response.json({ error: 'empty query' }, { status: 400 })
  try {
    const [embedding] = await embedCoreTexts([query], 'query', { strict: true })
    if (!embedding) return Response.json({ error: 'embed failed' }, { status: 503 })
    return Response.json({ embedding })
  } catch (e) {
    console.warn('embed-query failed:', (e as Error).message)
    return Response.json({ error: 'embed failed' }, { status: 503 })
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if ((req.headers.get('Authorization') ?? '') !== `Bearer ${SERVICE_ROLE}`) {
    return new Response('forbidden', { status: 403 })
  }

  if (new URL(req.url).pathname.endsWith('/embed-query')) return await embedQuery(req)

  const { data, error } = await admin.rpc('list_dirty_library_docs', { p_limit: DOC_LIMIT })
  if (error) {
    // Nothing was touched, so holding the lease for ten more minutes would only
    // delay the tick that might succeed.
    await releaseLease()
    return Response.json({ error: error.message }, { status: 500 })
  }

  const docs = (data ?? []) as DirtyDoc[]
  let indexed = 0
  let restamped = 0
  let purged = 0
  let chunks = 0
  let backedOff = 0
  const failures: string[] = []

  for (const doc of docs) {
    try {
      const hash = await contentHash(doc.title, doc.content)
      switch (docAction(doc, doc.known_hash, hash)) {
        case 'purge':
          // The student deleted this note. Its chunks must stop being searchable.
          await purgeDocument(doc)
          purged += 1
          break
        case 'restamp':
          // Touched but not edited. Re-stamp so it leaves the dirty set — WITHOUT
          // this the cron re-selects it every two minutes forever.
          await stampState(doc, hash, -1)
          restamped += 1
          break
        case 'reindex':
          chunks += await indexDocument(doc, hash)
          indexed += 1
          break
      }
      // Processed, by whichever route. Any earlier failure is history.
      await clearFailure(doc)
    } catch (e) {
      const reason = (e as Error).message
      const count = await recordFailure(doc, reason)
      if (count !== null) backedOff += 1
      // The attempt number is the part worth having in the log: "3rd failure"
      // separates a provider having a bad minute from a note that will never
      // work, which the message alone never told anyone.
      failures.push(`${doc.document_id}${count === null ? '' : ` (attempt ${count})`}: ${reason}`)
    }
  }

  await releaseLease()

  if (failures.length) console.warn('library-index failures:', failures.join(' | '))
  return Response.json({
    dirty: docs.length,
    indexed,
    restamped,
    purged,
    chunks,
    failures: failures.length,
    // How many of those failures now carry a backoff. Below `failures` means the
    // failure table is unreachable — worth seeing, because that is the state in
    // which the old stall can still happen.
    backedOff,
  })
})
