-- 🔴🔴 THE LONGEST LECTURES WERE THE ONES THAT NEVER BECAME SEARCHABLE.
--
-- `replace_source_chunks` writes a whole document's passages in one insert. Each row carries a
-- 1024-dimension embedding that arrives as JSON text and is cast to `vector`, and every row also
-- costs an HNSW index update. That work is proportional to the size of the document, so the biggest
-- files are exactly the ones that ran past PostgREST's statement timeout:
--
--   source-index: failed e11efe0d... canceling statement due to statement timeout
--   source-index: failed 22be43a6... canceling statement due to statement timeout
--   source-index: failed 4947a084... canceling statement due to statement timeout
--
-- Measured 2026-09-03 while proving thirty documents on one canvas: 28 of 30 became searchable, and
-- one of the two that did not was a 257-block, 67-page drug chart that timed out here on every
-- attempt since it was uploaded. Nothing reported it. The document is attached, parsed, complete,
-- and invisible to search. After this change it indexed on the next tick, 125 passages.
--
-- 🔴 A LONGER TIMEOUT IS THE RIGHT ANSWER HERE, WHICH IS NOT USUALLY TRUE. The default exists to
-- stop a user-facing request holding a connection; this is a background indexer called by pg_cron,
-- once per document, doing work genuinely proportional to the document and BOUNDED by
-- `MAX_CHUNKS_PER_PARSE = 4000` in the edge function. Retrying a doomed statement every five minutes
-- forever, which is what happened instead, costs strictly more than letting it finish once.
--
-- `set local` scopes this to the function's own transaction: nothing else in the session inherits
-- it, and a caller that is not this function is unaffected.
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
returns integer
language plpgsql
set search_path to 'public', 'extensions'
as $function$
declare
  v_written int;
begin
  -- See the note above this function: the biggest documents are the ones that need this.
  set local statement_timeout = '180s';

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
  'Writes one document''s passages, replacing any for the same chunker/embedding generation. Raises its own statement timeout: the work scales with document size and the largest lectures were timing out and retrying forever.';
