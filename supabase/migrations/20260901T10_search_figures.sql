-- Finding a picture the learner's own lectures already hold.
--
-- WHY A FUNCTION RATHER THAN A QUERY FROM THE BROWSER. The figures live inside
-- `parsed_documents.structure`, a jsonb document that is tens to hundreds of kilobytes per file.
-- Answering "show me the nephron diagram" from the client means downloading EVERY parsed structure
-- the learner owns and walking them in JavaScript — the whole library across the wire to return one
-- picture. This does the walk where the data already is and returns only the matching rows.
--
-- 🔴 SECURITY INVOKER, DELIBERATELY, AND IT IS THE WHOLE ACCESS-CONTROL STORY. Both tables carry
-- row-level security keyed on the owner, so running as the CALLER means a learner can only ever
-- reach their own lectures — no ownership check is written here because none can be forgotten here.
-- A SECURITY DEFINER version would need `user_id = auth.uid()` spelled out in every branch, and the
-- one branch that missed it would serve one student another student's coursework.
--
-- 🔴 FULL TEXT, NOT `ilike '%query%'`. A learner asks "that diagram of the loop of Henle", and a
-- substring match on the whole phrase finds nothing while a match on any word finds everything.
-- `websearch_to_tsquery` handles the real shape of the ask — stemming, stop words, quoted phrases —
-- and `ts_rank` puts the best figure first instead of whichever row Postgres reached first.
--
-- 🔴 AN EMPTY QUERY IS A VALID ASK AND MUST NOT MATCH EVERYTHING AT RANDOM. "Show me a picture from
-- my diabetes lecture" carries a source and no search terms. In that case the filter falls away and
-- the order becomes newest document first, which is the sensible reading of "a picture from".
create or replace function public.search_figures(
  p_query text default '',
  p_source text default '',
  p_limit int default 4
)
returns table (
  source_id uuid,
  file_name text,
  unit int,
  description text,
  path text,
  width int,
  height int
)
language sql
stable
security invoker
set search_path = public
as $$
  with figures as (
    select
      ls.id as source_id,
      ls.file_name,
      ls.created_at,
      nullif(b->>'unit', '')::int as unit,
      b->'figure'->>'description' as description,
      b->'figure'->'asset'->>'path' as path,
      nullif(b->'figure'->'asset'->>'width', '')::int as width,
      nullif(b->'figure'->'asset'->>'height', '')::int as height
    from library_sources ls
    join parsed_documents pd on pd.id = ls.parsed_document_id
    cross join lateral jsonb_array_elements(pd.structure->'model'->'blocks') as b
    where ls.deleted is not true
      -- A figure with no stored pixels cannot be shown, and a figure nobody described cannot be
      -- searched for. Either absence makes the row useless to this function specifically.
      and b->'figure'->'asset'->>'path' is not null
      and nullif(b->'figure'->>'description', '') is not null
      and (p_source = '' or ls.file_name ilike '%' || p_source || '%')
  )
  select source_id, file_name, unit, description, path, width, height
  from figures
  where
    trim(p_query) = ''
    or to_tsvector('english', description) @@ websearch_to_tsquery('english', p_query)
  order by
    case
      when trim(p_query) = '' then 0
      else -ts_rank(to_tsvector('english', description), websearch_to_tsquery('english', p_query))
    end,
    created_at desc,
    unit nulls last
  limit greatest(1, least(coalesce(p_limit, 4), 12));
$$;

comment on function public.search_figures(text, text, int) is
  'Figures from the caller''s own lectures that match a query, newest first when the query is empty. RLS-scoped by SECURITY INVOKER.';

grant execute on function public.search_figures(text, text, int) to authenticated;
