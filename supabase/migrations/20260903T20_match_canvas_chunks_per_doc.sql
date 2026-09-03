-- Retrieval scoped to ONE canvas, with a fair share per document.
--
-- 🔴🔴🔴 A FLAT TOP-K LETS ONE DOCUMENT TAKE EVERY SEAT. The first version of this function
-- (20260902T10) ranked every chunk of every attached document together and returned the best 24.
-- Two documents: fine. Fifty: the one lecture that shares the question's vocabulary supplies all
-- 24 passages, and the other forty-nine are a title in the inventory above no text at all, so the
-- model answers "the pile" from one file. Owner, 2026-09-03: "even if I drop in 50 documents it
-- should be able to understand all of them."
--
-- 🔴 THE CAP IS A PARAMETER, AND ZERO MEANS EXACTLY WHAT SHIPPED BEFORE. `per_document` bounds how
-- many rows any one document may contribute BEFORE the global limit runs: rows are numbered within
-- their document by similarity, only the first `per_document` of each survive, and the global
-- order and limit apply to what is left. A caller passing 0 (the default) takes the same query the
-- previous version ran, plan and all, so nothing that calls the old shape changes behaviour and
-- the HNSW-ordered scan it relies on is untouched.
--
-- 🔴 THE OLD SIGNATURE IS DROPPED FIRST, ON PURPOSE. `create or replace` only replaces a function
-- with the SAME argument list; a new parameter makes a second overload, and PostgREST then refuses
-- every call as ambiguous ("could not choose the best candidate function"). Dropping the
-- four-argument version is what makes this a replacement rather than a duplicate.
--
-- Same return columns, same threshold logic, same SECURITY INVOKER shape as before: RLS on
-- library_chunks scopes rows to the caller, and this function never filters by user_id.

drop function if exists public.match_canvas_chunks(vector, uuid[], integer, double precision);

create or replace function public.match_canvas_chunks(
  query_embedding vector,
  parsed_document_ids uuid[],
  match_count integer default 24,
  match_threshold double precision default 0.25,
  per_document integer default 0
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

  -- No cap asked for: the query the previous version ran, unchanged.
  if per_document <= 0 then
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
    return;
  end if;

  -- Capped: rank inside each document first, so no document brings more than `per_document`
  -- rows to the global ordering. The threshold is applied before the ranking, exactly as above,
  -- so a passage that is not about the question never takes a document's seat.
  return query
  with scored as (
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
  ),
  ranked as (
    select
      s.*,
      row_number() over (partition by s.parsed_document_id order by s.similarity desc) as rank_in_document
    from scored s
  )
  select
    r.id,
    r.origin_type,
    r.path,
    r.title,
    r.chunk_index,
    r.content,
    r.parsed_document_id,
    r.unit_kind,
    r.unit_index,
    r.unit_label,
    r.heading_path,
    r.similarity
  from ranked r
  where r.rank_in_document <= per_document
  order by r.similarity desc
  limit match_count;
end;
$function$;

comment on function public.match_canvas_chunks is
  'Semantic retrieval over the parsed documents attached to one learning canvas. per_document > 0 caps how many rows any one document contributes before the global limit. SECURITY INVOKER: RLS on library_chunks scopes rows to the caller.';
