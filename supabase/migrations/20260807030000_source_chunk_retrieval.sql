-- Retrieval can reach the original document, not only the notes made from it.
--
-- 🔴 THE SHAPE OF THE PROBLEM. `library_chunks` has carried typed provenance
-- since 20260806190000 — origin_type, parsed_document_id, unit_kind, unit_index,
-- unit_label, heading_path, and three version columns. Production holds:
--
--     library_chunks                    158 rows, ALL origin_type='note'
--     library_chunks origin_type='source'  0 rows
--
-- and `match_library_chunks` does two things that make that permanent:
--
--     where c.origin_type = 'note'                       -- excludes sources
--     join readable_library_documents d on d.id = c.document_id   -- INNER JOIN
--
-- The join is the harder half. A source chunk has `document_id is null` by the
-- one-origin CHECK, so it cannot survive an inner join to the notes table no
-- matter what the filter says. Both have to go together.
--
-- Consequence today: "importing a lecture makes it available to Nemesis" is true
-- ONLY because the librarian turns it into notes. The original is stored, parsed,
-- and unreachable — which is why generation cannot simply be switched off.

-- ── The search a source chunk can be found by ────────────────────────────────

-- 🔴 DROPPED BEFORE CREATED, BECAUSE `create or replace` CANNOT CHANGE A RETURN
-- TYPE. All three functions are new in this migration, so nothing is being taken
-- away from a caller — but a migration that has been applied once and then has
-- its signature corrected fails with "cannot change return type of existing
-- function", and it fails at deploy time on whichever environment ran the
-- earlier version. Found exactly that way: the local round-trip harness had the
-- older `list_unchunked_parses` and refused the corrected one.
drop function if exists public.match_document_chunks(vector, int, float, text);
drop function if exists public.list_unchunked_parses(text, text, int);
drop function if exists public.replace_source_chunks(uuid, uuid, text, text, text, text, text, jsonb);

-- 🔴 A NEW NAME, NOT A REPLACEMENT. `match_library_chunks` keeps its exact
-- signature and behaviour: it is called by a shipped client, and a deployed app
-- that is one deploy behind must not start receiving rows in a shape it does not
-- understand. Callers move over deliberately.
-- 🔴 PLPGSQL, NOT SQL, AND set_config() NOT A DECLARATIVE SET CLAUSE.
-- Supabase's managed `postgres` role cannot SET the extension-defined
-- hnsw.ef_search / hnsw.iterative_scan parameters in a function's own SET
-- clause at CREATE FUNCTION time ("permission denied to set parameter",
-- confirmed applying this migration). set_config(..., true) sets them for the
-- current transaction at RUNTIME instead, under the CALLER's privileges
-- (security invoker), which is not subject to the same declaration-time check.
-- The query itself is unchanged from the SQL-language version this replaced.
create or replace function public.match_document_chunks(
  query_embedding vector,
  match_count int default 8,
  match_threshold float default 0.35,
  -- 'source' = originals only · 'note' = notes only · null = both.
  origin_filter text default null
)
returns table (
  chunk_id uuid,
  origin_type text,
  path text,
  title text,
  chunk_index int,
  content text,
  -- WHERE IN THE DOCUMENT. Returned as columns rather than parsed back out of
  -- the text, so a citation can be checked instead of believed.
  parsed_document_id uuid,
  unit_kind text,
  unit_index int,
  unit_label text,
  heading_path text[],
  similarity float
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
begin
  perform set_config('hnsw.ef_search', '100', true);
  perform set_config('hnsw.iterative_scan', 'strict_order', true);
  return query
  select
    c.id,
    c.origin_type,
    c.path,
    c.title,
    c.chunk_index,
    c.content,
    c.parsed_document_id,
    c.unit_kind,
    c.unit_index,
    c.unit_label,
    c.heading_path,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.library_chunks c
  -- 🔴 LEFT JOIN. A source chunk has no note by the one-origin CHECK, so an
  -- inner join silently returns zero source rows however the filter is written.
  left join public.readable_library_documents d on d.id = c.document_id
  where c.embedding is not null
    and (origin_filter is null or c.origin_type = origin_filter)
    -- A note must still be live; a source chunk has no note to be live.
    and (c.origin_type <> 'note' or (d.id is not null and d.deleted = false))
    and (1 - (c.embedding <=> query_embedding)) > match_threshold
  order by
    -- 🔴 A TIE-BREAK, NOT AN OVERRIDE, AND THE DIFFERENCE IS THE WHOLE POINT.
    --
    -- The first version of this sorted `origin_type = 'source'` first outright.
    -- Its own round-trip test then reported a source at similarity 0.000 ranked
    -- above a note at 1.000 — a perfect answer buried under an irrelevant one,
    -- which is worse than the notes-only search it replaces.
    --
    -- A small additive boost says what was actually meant: a generated note is a
    -- lossy restatement of a document we hold, so when the two match a question
    -- comparably the ORIGINAL is the better evidence and the one a citation can
    -- be verified against. When the note is genuinely a better answer, it wins.
    (1 - (c.embedding <=> query_embedding))
      + case when c.origin_type = 'source' then 0.05 else 0 end desc
  limit match_count;
end;
$$;

comment on function public.match_document_chunks is
  'Semantic search across BOTH original documents and notes. RLS on library_chunks is the tenancy boundary (security invoker). Sources outrank notes at equal similarity: the original is the evidence, a note is a restatement of it. hnsw params set via set_config() at runtime, not a function SET clause -- see the migration header for why.';

revoke execute on function public.match_document_chunks(vector, int, float, text) from public, anon;
grant execute on function public.match_document_chunks(vector, int, float, text) to authenticated, service_role;

-- ── Making the source half worth searching ──────────────────────────────────

-- The existing HNSW index covers the column, not the origin. A partial index
-- for sources keeps the source-only query from scanning note vectors.
create index if not exists library_chunks_source_embedding_idx
  on public.library_chunks using hnsw (embedding vector_cosine_ops)
  where origin_type = 'source' and embedding is not null;

-- "Which parses have no chunks yet" has to be cheap: it is the indexer's queue.
create index if not exists library_chunks_source_parse_idx
  on public.library_chunks (parsed_document_id, chunk_index)
  where origin_type = 'source';

-- ── Idempotency for the writer ──────────────────────────────────────────────

-- One row per (parse, chunker, embedding, index). Re-running the indexer cannot
-- duplicate embeddings, and a chunker or embedding upgrade writes a NEW
-- generation alongside the old rather than colliding with it.
create unique index if not exists library_chunks_source_identity
  on public.library_chunks (parsed_document_id, chunker_version, embedding_version, chunk_index)
  where origin_type = 'source';

-- ── The queue ───────────────────────────────────────────────────────────────

/**
 * Parses that have no chunks for this chunker/embedding generation.
 *
 * 🔴 THE LEFT JOIN AND THE LIMIT ARE IN ONE STATEMENT ON PURPOSE. Selecting
 * parses here and filtering in the caller would apply the limit BEFORE the
 * staleness test, so on a library bigger than one batch the newest document is
 * never reached and the indexer never converges. That exact bug is documented in
 * `supabase/functions/library-index/index.ts`; this is the same shape, and it
 * gets the same treatment.
 *
 * Only COMPLETE-ENOUGH parses are offered: a parse still being retried would be
 * chunked from a structure that is about to be replaced.
 */
create or replace function public.list_unchunked_parses(
  p_chunker_version text,
  p_embedding_version text,
  p_limit int default 20
)
returns table (parsed_document_id uuid, user_id uuid, doc_kind text, parser_version text, structure jsonb)
language sql
stable
security invoker
set search_path = public
as $$
  -- 🔴 `parser_version` IS RETURNED, NOT RECONSTRUCTED. The chunk column is
  -- documented as denormalised from the parse so a sweep can find stale chunks
  -- without joining; an indexer that substituted the document FORMAT for it
  -- would write 'pdf' where 'units-blocks-3' belongs, and every reprocess query
  -- keyed on a parser version would silently match nothing.
  select p.id, p.user_id, p.doc_kind, p.parser_version, p.structure
    from public.parsed_documents p
   where p.state in ('parsed', 'partially_parsed', 'chunked', 'ready')
     and p.unreferenced_at is null
     and not exists (
       select 1 from public.library_chunks c
        where c.parsed_document_id = p.id
          and c.origin_type = 'source'
          and c.chunker_version = p_chunker_version
          and c.embedding_version = p_embedding_version
     )
   order by p.created_at desc
   limit greatest(p_limit, 0);
$$;

comment on function public.list_unchunked_parses is
  'Parses with no chunks for the given chunker/embedding generation, newest first. The staleness test and the limit are one statement so a library larger than a batch still converges.';

revoke execute on function public.list_unchunked_parses(text, text, int) from public, anon, authenticated;
grant execute on function public.list_unchunked_parses(text, text, int) to service_role;

-- ── Replacing a generation atomically ───────────────────────────────────────

/**
 * Write one parse's chunks, replacing that generation's rows.
 *
 * 🔴 DELETE AND INSERT IN ONE TRANSACTION, SCOPED TO ONE GENERATION. Deleting
 * every chunk of the parse would throw away the previous embedding generation
 * that is still serving searches while the new one is being written — a
 * re-index would make a document unfindable for as long as it took to finish.
 *
 * `p_chunks` is an array of objects: {chunk_index, content, unit_kind,
 * unit_index, unit_label, heading_path, embedding}.
 */
create or replace function public.replace_source_chunks(
  p_parsed_document_id uuid,
  p_user_id uuid,
  p_path text,
  p_title text,
  p_parser_version text,
  p_chunker_version text,
  p_embedding_version text,
  p_chunks jsonb
)
returns int
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_written int;
begin
  delete from public.library_chunks
   where parsed_document_id = p_parsed_document_id
     and origin_type = 'source'
     and chunker_version = p_chunker_version
     and embedding_version = p_embedding_version;

  insert into public.library_chunks (
    user_id, document_id, parsed_document_id, origin_type,
    path, title, chunk_index, content,
    unit_kind, unit_index, unit_label, heading_path,
    parser_version, chunker_version, embedding_version, embedding
  )
  select
    p_user_id,
    null,                       -- the one-origin CHECK: a source chunk has no note
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
    -- 🔴 BOTH JSON SHAPES, BECAUSE BOTH ARRIVE. A caller that builds the
    -- payload in SQL sends an array; one that formats pgvector's own text form
    -- in the application sends a string. `jsonb_array_length` on a string
    -- ERRORS rather than returning null, so testing the type first is what
    -- keeps a whole document's write from failing on its first chunk.
    case jsonb_typeof(chunk->'embedding')
      when 'array'  then nullif(chunk->>'embedding', '[]')::vector
      when 'string' then nullif(chunk->>'embedding', '')::vector
      else null
    end
  from jsonb_array_elements(p_chunks) as chunk;

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

comment on function public.replace_source_chunks is
  'Replace one parse''s chunks FOR ONE chunker/embedding generation, atomically. Scoped to a generation so a re-index never makes a document unfindable while it runs.';

revoke execute on function public.replace_source_chunks(uuid, uuid, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_source_chunks(uuid, uuid, text, text, text, text, text, jsonb)
  to service_role;
