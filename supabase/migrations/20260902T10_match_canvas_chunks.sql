-- Retrieval scoped to the documents attached to ONE canvas.
--
-- 🔴 WHY A THIRD MATCH FUNCTION. match_library_chunks searches notes; match_document_chunks
-- searches the learner's whole library. Both are right for a Library search box and wrong for a
-- canvas: a question asked on a canvas must be answered out of the material attached to THAT
-- canvas, not out of a lecture read last month that happens to share vocabulary. Passing a
-- document-id filter is the only difference, and it is the difference between "the answer came
-- from my slides" and "the answer came from somewhere in my account".
--
-- 🔴 SECURITY SHAPE COPIED DELIBERATELY from match_document_chunks: SECURITY INVOKER (the default),
-- so RLS on library_chunks scopes rows to the caller. This function never filters by user_id and
-- cannot be tricked into a cross-account read by passing someone else's document ids -- RLS refuses
-- them before the similarity is ever computed.
--
-- 🔴 A LOWER THRESHOLD THAN THE LIBRARY BOX USES, ON PURPOSE. 0.35 is tuned for "find the one note
-- I am thinking of" across everything a learner owns. Here the candidate set is already narrowed to
-- the handful of documents on this canvas, so the risk is missing a relevant passage rather than
-- drowning in irrelevant ones, and a passage at 0.28 is worth showing a writer that is about to
-- claim it covered the material.

create or replace function public.match_canvas_chunks(
  query_embedding vector,
  parsed_document_ids uuid[],
  match_count integer default 24,
  match_threshold double precision default 0.25
)
returns table(
  chunk_id uuid,
  origin_type text,
  path text,
  title text,
  chunk_index integer,
  content text,
  parsed_document_id uuid,
  unit_kind text,
  unit_index integer,
  unit_label text,
  heading_path text[],
  similarity double precision
)
language plpgsql
stable
set search_path to 'public', 'extensions'
as $function$
begin
  perform set_config('hnsw.ef_search', '200', true);
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
  where c.embedding is not null
    and c.parsed_document_id = any(parsed_document_ids)
    and (1 - (c.embedding <=> query_embedding)) > match_threshold
  order by (1 - (c.embedding <=> query_embedding)) desc
  limit match_count;
end;
$function$;

comment on function public.match_canvas_chunks is
  'Semantic retrieval over the parsed documents attached to one learning canvas. SECURITY INVOKER: RLS on library_chunks scopes rows to the caller.';
