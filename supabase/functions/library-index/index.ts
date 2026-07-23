// library-index — turns each student's Library notes into embedded chunks.
//
// Called by pg_cron (see 20260723T02_library_index_scheduler.sql), never by a
// client. Auth = the service-role key in the Authorization header; deploy with
// verify_jwt=false so this custom check is the gate.
//
// Contract per tick:
//   1. Ask list_dirty_library_docs for up to DOC_LIMIT stale notes. That RPC is
//      the ONLY definition of "stale" — it does the LEFT JOIN and the LIMIT in
//      one SQL statement. Selecting documents here and filtering in JS would
//      apply the limit before the staleness join, so on a library bigger than
//      the batch the newest edit is never reached and the cron never converges.
//   2. For each: if the content hash is unchanged, only re-stamp the state row
//      (a move/rename/sync echo bumped updated_at but not the words — no
//      embedding spend). Otherwise chunk, embed, and replace its chunks.
//   3. EVERY document handled leaves the dirty set, whether it was re-embedded
//      or merely re-stamped. Skipping the stamp is what turns this into a loop.
//   4. A document that throws is left dirty on purpose — the next tick retries it.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { chunkNote } from './chunk-note.ts'
import { contentHash } from './content-hash.ts'
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
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const docs = (data ?? []) as DirtyDoc[]
  let indexed = 0
  let restamped = 0
  let chunks = 0
  const failures: string[] = []

  for (const doc of docs) {
    try {
      const hash = await contentHash(doc.title, doc.content)
      if (doc.known_hash === hash) {
        // Touched but not edited. Re-stamp so it leaves the dirty set — WITHOUT
        // this the cron re-selects it every two minutes forever.
        await stampState(doc, hash, -1)
        restamped += 1
        continue
      }
      chunks += await indexDocument(doc, hash)
      indexed += 1
    } catch (e) {
      failures.push(`${doc.document_id}: ${(e as Error).message}`)
    }
  }

  if (failures.length) console.warn('library-index failures:', failures.join(' | '))
  return Response.json({ dirty: docs.length, indexed, restamped, chunks, failures: failures.length })
})
