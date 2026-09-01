-- Browsing a lecture's pictures must not require that somebody described them.
--
-- 🔴 THE DEFECT, FOUND BY DRIVING THE REAL APP 2026-09-01. A learner dropped a lecture, the picture
-- was decoded, stored and correctly joined to its figure — and "show me the picture from my Bending
-- stress lecture" returned nothing, because `search_figures` required a non-null description on
-- every row. Vision had looked at that figure and recorded `skipped: "examined-empty"`, so the
-- picture existed, was reachable, and was invisible to the only tool that can show it.
--
-- Requiring a description is right for a SEARCH: you cannot match words against a figure nobody
-- put words to. It is wrong for a BROWSE — "show me a picture from my X lecture" carries a source
-- and no search terms, so there is nothing to match and nothing to be missing. The two cases were
-- collapsed into one filter, and the browse case paid for the search case's requirement.
--
-- 🔴 DESCRIBED FIGURES STILL COME FIRST when browsing. An undescribed figure is more often a
-- decorative one — a rule, a crest, a gradient vision found nothing to say about — so it is worth
-- returning and not worth leading with. The caller renders whatever comes back; the ordering is
-- the only place this preference can live.
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
      nullif(b->'figure'->>'description', '') as description,
      b->'figure'->'asset'->>'path' as path,
      nullif(b->'figure'->'asset'->>'width', '')::int as width,
      nullif(b->'figure'->'asset'->>'height', '')::int as height
    from library_sources ls
    join parsed_documents pd on pd.id = ls.parsed_document_id
    cross join lateral jsonb_array_elements(pd.structure->'model'->'blocks') as b
    where ls.deleted is not true
      -- A figure with no stored pixels cannot be shown at all, which is the one absence that still
      -- makes a row useless here. A missing DESCRIPTION no longer does; see the header.
      and b->'figure'->'asset'->>'path' is not null
      and (p_source = '' or ls.file_name ilike '%' || p_source || '%')
  )
  select source_id, file_name, unit, description, path, width, height
  from figures
  where
    -- Browsing: everything with pixels. Searching: only what words can be matched against.
    trim(p_query) = ''
    or (description is not null
        and to_tsvector('english', description) @@ websearch_to_tsquery('english', p_query))
  order by
    case
      when trim(p_query) <> ''
        then -ts_rank(to_tsvector('english', description), websearch_to_tsquery('english', p_query))
      when description is not null then 0
      else 1
    end,
    created_at desc,
    unit nulls last
  limit greatest(1, least(coalesce(p_limit, 4), 12));
$$;

comment on function public.search_figures(text, text, int) is
  'Figures from the caller''s own lectures. A query matches descriptions; an empty query browses everything with stored pixels, described first. RLS-scoped by SECURITY INVOKER.';

grant execute on function public.search_figures(text, text, int) to authenticated;
