-- 🔴🔴 A DOCUMENT RE-READ BETTER KEPT SERVING THE OLD TEXT, FOREVER.
--
-- `list_unchunked_parses` asked "does this parse have chunks at the current chunker/embedding
-- version". It had no notion of a parse having CHANGED, and a reparse rewrites `parsed_documents`
-- IN PLACE — same row, same id. So once a document was indexed it was never indexed again, and
-- every parser improvement was invisible to retrieval.
--
-- Measured 2026-09-03, on the reparse that proved #1080: the parse rewrote at 04:24 carrying the
-- insulin pharmacodynamics table, and `library_chunks` still held the caption it replaced, created
-- at 01:35. `run_source_indexing()` returned 0. The values were in the document and not in the
-- index, which is the same thing as not having them.
--
-- 🔴 IT NEARLY PASSED ITS OWN AUTHOR. The person who wrote that fix, checking that exact document
-- for that exact change, read the stale chunk and had to notice the timestamp. Anything that can do
-- that will do it silently to everyone else. Nine documents on production were already in this
-- state before this migration.
--
-- ── WHAT "OUTSTANDING" NOW MEANS, AND WHERE IT IS WRITTEN ────────────────────────────────────────
--
-- 🔴 ONCE, IN `outstanding_parses`. This is the third time this week that "what does the queue
-- consider outstanding" turned out to be subtly wrong, and it was previously spelled out THREE
-- times: in `list_unchunked_parses`, again in `count_unchunked_parses` (so the depth reading could
-- not disagree with the batch), and a third time implicitly in whatever a reader assumed. Two
-- copies that must agree are a defect waiting for the day they do not. There is now one definition
-- and two readers of it.
--
-- ── THE DIGEST, AND WHY IT IS NOT `updated_at` ───────────────────────────────────────────────────
--
-- 🔴🔴 TRIGGERING ON THE ROW BEING TOUCHED IS THE WAY THIS FIX GOES WRONG. If "outstanding" meant
-- `updated_at > newest chunk`, then every bookkeeping write to `parsed_documents` — a lease, a
-- counter, a coverage recompute, a column added by a future migration, a backfill — would re-embed
-- the whole document; and two such writers could chase each other and re-embed in a loop that
-- nobody notices until the bill.
--
-- So the trigger is the CONTENT: `md5` of the envelope's own flattened text, which is
-- `documentToText(model)` — precisely what the chunker consumes and precisely what gets embedded.
-- It is a different column from `state`, `coverage`, `attempts` and `updated_at`, so none of them
-- can move it. A parse that rewrites the model without changing a character of text produces the
-- same digest and no work, which is correct: the chunks would have been identical.
--
-- Verified on the real row before this shipped: `structure->>'text'` for 08-insulin.pdf contains
-- `30-90 min` and `Tresiba` — the figure transcriptions are in it, so it does track the model.

alter table public.library_chunks
  add column if not exists source_digest text;

comment on column public.library_chunks.source_digest is
  'The parse content digest these chunks were built from. NULL only on rows written before 2026-09-03 or by a caller that did not supply one.';

-- 🔴 ONE DEFINITION OF THE DIGEST, called by the lister and by the writer, so the value a chunk is
-- stamped with and the value it is later compared against cannot drift apart.
create or replace function public.parse_content_digest(p_structure jsonb)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select md5(coalesce(p_structure->>'text', ''));
$function$;

comment on function public.parse_content_digest is
  'Identity of a parse''s chunkable content. Moves only when the text the chunker consumes moves — never for a lease, a counter, a coverage recompute or any other bookkeeping write.';

-- 🔴 ONE DEFINITION OF OUTSTANDING. Both the lister and the counter read this; nothing else may
-- restate it. A row is outstanding when it is chunkable at all AND no chunk carries its current
-- identity, where identity is the triple (chunker version, embedding version, content digest).
create or replace function public.outstanding_parses(
  p_chunker_version text,
  p_embedding_version text
)
returns table(
  parsed_document_id uuid,
  user_id uuid,
  doc_kind text,
  parser_version text,
  structure jsonb,
  content_digest text,
  created_at timestamptz
)
language sql
stable
set search_path to 'public'
as $function$
  select p.id, p.user_id, p.doc_kind, p.parser_version, p.structure,
         public.parse_content_digest(p.structure), p.created_at
    from public.parsed_documents p
   where p.state in ('parsed', 'partially_parsed', 'chunked', 'ready')
     and p.unreferenced_at is null
     -- The chunker needs a units-blocks model. A v1 text-only envelope has none and never will;
     -- claiming it every tick is how the queue stopped draining (2026-09-03, six dead documents).
     and coalesce(p.structure->>'shape', '') = 'units-blocks'
     and not exists (
       select 1 from public.library_chunks c
        where c.parsed_document_id = p.id
          and c.origin_type = 'source'
          and c.chunker_version = p_chunker_version
          and c.embedding_version = p_embedding_version
          -- 🔴 `is not distinct from` so a NULL on both sides matches. Anything else would make
          -- every row written before this column existed outstanding at once, and re-embed the
          -- whole corpus as a side effect of a schema change.
          and c.source_digest is not distinct from public.parse_content_digest(p.structure)
     );
$function$;

comment on function public.outstanding_parses is
  'The single definition of an unindexed parse: chunkable, and holding no chunks stamped with its current (chunker, embedding, content digest). list_unchunked_parses and count_unchunked_parses both read this and must never restate it.';

-- 🔴 DROPPED, NOT REPLACED. This function gains a returned column (`content_digest`), and Postgres
-- refuses to change a function's return type in place. `run_source_indexing` re-resolves it at call
-- time, so nothing is left pointing at the old one.
drop function if exists public.list_unchunked_parses(text, text, int);

create or replace function public.list_unchunked_parses(
  p_chunker_version text,
  p_embedding_version text,
  p_limit integer default 20
)
returns table(
  parsed_document_id uuid,
  user_id uuid,
  doc_kind text,
  parser_version text,
  structure jsonb,
  content_digest text
)
language sql
stable
set search_path to 'public'
as $function$
  select o.parsed_document_id, o.user_id, o.doc_kind, o.parser_version, o.structure, o.content_digest
    from public.outstanding_parses(p_chunker_version, p_embedding_version) o
   order by o.created_at desc
   limit greatest(p_limit, 0);
$function$;

comment on function public.list_unchunked_parses is
  'A batch of outstanding parses, newest first, with the content digest the writer must stamp on their chunks. The definition of outstanding lives in outstanding_parses.';

create or replace function public.count_unchunked_parses(
  p_chunker_version text,
  p_embedding_version text
)
returns integer
language sql
stable
set search_path to 'public'
as $function$
  select count(*)::int from public.outstanding_parses(p_chunker_version, p_embedding_version);
$function$;

comment on function public.count_unchunked_parses is
  'Queue depth, from the same definition the lister uses. Counting rows the lister refuses to hand out is how a backlog that never moves gets reported as healthy.';

-- ── THE WRITER STAMPS WHAT IT BUILT FROM ─────────────────────────────────────────────────────────
--
-- 🔴 THE DIGEST COMES FROM THE CALLER, because the caller chunked a specific snapshot of the
-- structure. Recomputing it here would read whatever the row says NOW: if a reparse landed between
-- the indexer reading the structure and this insert, the chunks would be stamped with the new
-- digest while holding the old content — permanently stale, and silent, which is the exact defect
-- this migration exists to end.
--
-- 🔴 AND IT FALLS BACK RATHER THAN WRITING NULL, so the gap between this migration and the edge
-- function's deploy cannot produce rows that look outstanding forever and re-embed on every tick.
-- The fallback is a bridge, not the mechanism.
drop function if exists public.replace_source_chunks(uuid, uuid, text, text, text, text, text, jsonb);

create or replace function public.replace_source_chunks(
  p_parsed_document_id uuid,
  p_user_id uuid,
  p_path text,
  p_title text,
  p_parser_version text,
  p_chunker_version text,
  p_embedding_version text,
  p_chunks jsonb,
  p_source_digest text default null
)
returns integer
language plpgsql
set search_path to 'public', 'extensions'
as $function$
declare
  v_written int;
  v_digest text;
begin
  -- The biggest documents are the ones that need this: a 257-block drug chart timed out here on
  -- every attempt since it was uploaded, and nothing reported it.
  set local statement_timeout = '180s';

  v_digest := coalesce(
    p_source_digest,
    (select public.parse_content_digest(structure)
       from public.parsed_documents where id = p_parsed_document_id)
  );

  delete from public.library_chunks
   where parsed_document_id = p_parsed_document_id
     and origin_type = 'source'
     and chunker_version = p_chunker_version
     and embedding_version = p_embedding_version;

  insert into public.library_chunks (
    user_id, document_id, parsed_document_id, origin_type,
    path, title, chunk_index, content,
    unit_kind, unit_index, unit_label, heading_path,
    parser_version, chunker_version, embedding_version, source_digest, embedding
  )
  select
    p_user_id,
    null,
    p_parsed_document_id,
    'source',
    p_path,
    p_title,
    (chunk->>'chunk_index')::int,
    chunk->>'content',
    chunk->>'unit_kind',
    nullif(chunk->>'unit_index', '')::int,
    chunk->>'unit_label',
    case when chunk ? 'heading_path'
      then array(select jsonb_array_elements_text(chunk->'heading_path'))
      else null end,
    p_parser_version,
    p_chunker_version,
    p_embedding_version,
    v_digest,
    case jsonb_typeof(chunk->'embedding')
      when 'array'  then nullif(chunk->>'embedding', '[]')::vector
      when 'string' then nullif(chunk->>'embedding', '')::vector
      else null
    end
  from jsonb_array_elements(p_chunks) as chunk;

  get diagnostics v_written = row_count;
  return v_written;
end;
$function$;

comment on function public.replace_source_chunks is
  'Writes one document''s passages, replacing any for the same chunker/embedding generation, and stamps them with the content digest they were built from. Raises its own statement timeout: the work scales with document size.';

revoke execute on function public.replace_source_chunks(uuid, uuid, text, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.replace_source_chunks(uuid, uuid, text, text, text, text, text, jsonb, text) to service_role;
revoke execute on function public.list_unchunked_parses(text, text, int) from public, anon, authenticated;
grant execute on function public.list_unchunked_parses(text, text, int) to service_role;
revoke execute on function public.outstanding_parses(text, text) from public, anon, authenticated;
grant execute on function public.outstanding_parses(text, text) to service_role;

-- ── THE ONE-TIME BACKFILL ────────────────────────────────────────────────────────────────────────
--
-- Two steps, in this order, and the order matters.
--
-- 1. The documents that are ALREADY stale get their chunks deleted, so the queue rebuilds them from
--    the parse as it stands now. Measured before running: 9 documents, 489 chunks, 183,541
--    characters — roughly 46,000 tokens of re-embedding, well under a cent.
--
--    🔴 THIS IS THE ONE PLACE `updated_at` IS USED, AND IT IS USED ONCE. There is no digest on the
--    past to compare against, so the only available evidence that a parse outran its chunks is the
--    clock. The two-minute margin is for the ordinary case where a parse and its indexing straddle
--    a tick. Using it here cannot loop, because it runs exactly once; using it as the ongoing
--    predicate is the failure this migration is written to avoid.
--
-- 2. Everything else is stamped with its parse's current digest — an assertion that those chunks do
--    correspond to that text, which step 1 has just made true. Leaving them NULL instead would work
--    (NULL matches NULL) but would mean no document indexed before today ever notices a reparse
--    until something else re-indexes it, which is most of the corpus.

delete from public.library_chunks c
 using public.parsed_documents p
 where c.parsed_document_id = p.id
   and c.origin_type = 'source'
   and p.updated_at > (
     select max(c2.created_at) + interval '2 minutes'
       from public.library_chunks c2
      where c2.parsed_document_id = p.id and c2.origin_type = 'source'
   );

update public.library_chunks c
   set source_digest = public.parse_content_digest(p.structure)
  from public.parsed_documents p
 where c.parsed_document_id = p.id
   and c.origin_type = 'source'
   and c.source_digest is null;
