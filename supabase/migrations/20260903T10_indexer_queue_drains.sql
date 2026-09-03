-- 🔴🔴 SIX DEAD DOCUMENTS WERE EATING HALF OF EVERY INDEXING BATCH, FOREVER.
--
-- The source indexer claims 10 parses per tick and runs every 5 minutes. Parses written before the
-- canonical document model existed carry a v1 `text-only` envelope: no `model` key at all, so
-- `storedDocumentModel` returns null and the indexer skips them with reason 'no-model'. Nothing
-- recorded that skip, so the same ones were re-claimed on the next tick, and the next. Measured on
-- production 2026-09-03: 6,630 consecutive runs since 2026-08-11 reporting `{"no-model": N}`, and
-- for most of that period `indexed: 0` — the queue could not drain because the front of it was
-- permanently poisoned.
--
-- The user-visible cost is not an error. It is that dropping ten lecture PDFs into a canvas made
-- five of them searchable and left five silently unsearchable, at roughly one document per minute,
-- with nothing on screen saying so.
--
-- 🔴 EXCLUDED BY WHAT THEY ARE, NOT BY A DENYLIST OF IDS. A `text-only` envelope has no
-- units-blocks model and the chunker requires one; such a parse is not "not yet indexed", it is not
-- indexable by this chunker at all. Re-parsing is what fixes it, and re-parsing writes a v2 envelope
-- which this predicate then admits automatically. A list of ids would have to be maintained; this
-- cannot go stale.
create or replace function public.list_unchunked_parses(
  p_chunker_version text,
  p_embedding_version text,
  p_limit integer default 20
)
returns table(parsed_document_id uuid, user_id uuid, doc_kind text, parser_version text, structure jsonb)
language sql
stable
set search_path to 'public'
as $function$
  select p.id, p.user_id, p.doc_kind, p.parser_version, p.structure
    from public.parsed_documents p
   where p.state in ('parsed', 'partially_parsed', 'chunked', 'ready')
     and p.unreferenced_at is null
     -- 🔴 The chunker needs a units-blocks model. A v1 text-only envelope has none and never will;
     -- claiming it every tick is how the queue stopped draining.
     and coalesce(p.structure->>'shape', '') = 'units-blocks'
     and not exists (
       select 1 from public.library_chunks c
        where c.parsed_document_id = p.id
          and c.origin_type = 'source'
          and c.chunker_version = p_chunker_version
          and c.embedding_version = p_embedding_version
     )
   order by p.created_at desc
   limit greatest(p_limit, 0);
$function$;

-- 🔴 THE SAME PREDICATE, OR THE DEPTH READING LIES. `count_unchunked_parses` feeds the "pending"
-- number in `source_index_runs`; if it counted rows the lister refuses to hand out, the log would
-- show a backlog that never moves and no run that could move it.
create or replace function public.count_unchunked_parses(
  p_chunker_version text,
  p_embedding_version text
)
returns integer
language sql
stable
set search_path to 'public'
as $function$
  select count(*)::int
    from public.parsed_documents p
   where p.state in ('parsed', 'partially_parsed', 'chunked', 'ready')
     and p.unreferenced_at is null
     and coalesce(p.structure->>'shape', '') = 'units-blocks'
     and not exists (
       select 1 from public.library_chunks c
        where c.parsed_document_id = p.id
          and c.origin_type = 'source'
          and c.chunker_version = p_chunker_version
          and c.embedding_version = p_embedding_version
     );
$function$;

-- 🔴 SO A DROPPED FILE DOES NOT WAIT UP TO FIVE MINUTES TO BECOME SEARCHABLE. The indexer is driven
-- by pg_cron every 5 minutes and claims 10 parses a tick, so attaching ten lectures and asking a
-- question immediately searched whatever fraction happened to be indexed. This lets the app ask for
-- a tick the moment its uploads finish parsing.
--
-- 🔴 IT CANNOT BE ABUSED INTO SPEND. `run_source_indexing` returns 0 without dispatching when
-- nothing is unindexed, the edge function claims a lease, and the work is bounded by the caller's
-- own unindexed documents rather than by how often this is called. The cost ceiling is the corpus,
-- not the request rate.
grant execute on function public.run_source_indexing() to authenticated;

comment on function public.list_unchunked_parses is
  'Parses with no chunks for the given chunker/embedding version. Only units-blocks envelopes: a v1 text-only parse has no model for the chunker to read and would be re-claimed every tick forever.';
