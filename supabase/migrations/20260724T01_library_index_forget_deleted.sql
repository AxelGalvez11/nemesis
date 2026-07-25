-- 20260724T01 — a deleted note must stop being searchable, and its chunks must go.
--
-- THE BUG, measured in production on 2026-07-24: 71 rows in library_index_state
-- against 68 live notes, and 3 chunks belonging to notes the student had deleted.
-- The agent could quote a note that no longer exists.
--
-- WHY IT HAPPENED. Library delete is SOFT (`deleted = true`, the row stays), but
-- 20260723T01's staleness predicate opens with `where d.deleted = false`. So the
-- moment a note is deleted it drops OUT of the dirty set, and the indexer — whose
-- only view of the world is that predicate — never hears about it again. Its
-- chunks are never revisited, never deleted, and keep matching queries forever.
-- The ON DELETE CASCADE on library_chunks.document_id only fires for a HARD
-- delete, which this product never does.
--
-- TWO FIXES, because they act on different timescales:
--   1. match_library_chunks joins the document and skips deleted ones. This takes
--      effect on the very next query, for chunks that already exist.
--   2. list_dirty_library_docs now also reports a deleted note that still has an
--      index-state row, so the indexer can purge it for good. Deleted documents
--      sort FIRST: a purge costs no embedding calls, so there is no reason to let
--      a backlog of live edits delay it.
-- The rows that already leaked need no special handling: fix 2 puts them in the
-- dirty set, and the indexer purges them on its next tick. A one-time DELETE here
-- would clean the same rows a few minutes sooner at the cost of a second, silent
-- mechanism doing the same job — and it would hide whether the first one works.
--
-- ORDER OF OPERATIONS — the edge function ships BEFORE this migration. The new
-- indexer reads `doc.deleted`; against today's RPC that field is simply absent
-- (undefined => falsy) and it behaves exactly as it does now. The reverse order
-- is NOT safe: this migration against today's indexer would hand it soft-deleted
-- notes, whose hash has changed, and it would dutifully RE-EMBED them.
--
-- DEPLOY: owner-gated — against ref qyjmivntajbigjswhahb. Merging does not apply it.

-- ── 1. Never match a chunk whose note is deleted ────────────────────────────
-- Still SECURITY INVOKER: RLS on BOTH tables does the per-user scoping, and the
-- caller owns both. The filter sits in WHERE, so the LIMIT applies after it and
-- a query cannot come back short because deleted rows ate its budget.
create or replace function public.match_library_chunks(
  query_embedding extensions.vector(1024),
  match_count int default 8,
  match_threshold float default 0.35
)
returns table (
  path text,
  title text,
  chunk_index int,
  content text,
  similarity float
)
language sql
stable
security invoker
set search_path = public, extensions
set hnsw.ef_search = 100
as $$
  select
    c.path,
    c.title,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.library_chunks c
  join public.readable_library_documents d on d.id = c.document_id
  where c.embedding is not null
    and d.deleted = false
    and (1 - (c.embedding <=> query_embedding)) > match_threshold
  order by c.embedding <=> query_embedding asc
  limit match_count;
$$;

comment on function public.match_library_chunks is
  'ANN over the CALLER''S OWN Library note chunks (1024-dim), excluding deleted notes. SECURITY INVOKER: RLS on library_chunks does the per-user scoping.';

-- CREATE OR REPLACE keeps existing grants, but re-stating them costs nothing and
-- makes this file readable on its own.
revoke execute on function public.match_library_chunks(extensions.vector(1024), int, float) from public, anon;
grant execute on function public.match_library_chunks(extensions.vector(1024), int, float) to authenticated, service_role;

-- ── 2. Report deleted notes that still hold chunks ──────────────────────────
-- The return type gains a column, and CREATE OR REPLACE cannot change a return
-- type — it errors. DROP first; the grants below are re-applied because a fresh
-- CREATE takes Supabase's default privileges, which include EXECUTE for anon
-- (memory: pharmabro-supabase-anon-default-grant).
drop function if exists public.list_dirty_library_docs(int);

create function public.list_dirty_library_docs(p_limit int default 40)
returns table (
  document_id uuid,
  user_id uuid,
  path text,
  title text,
  content text,
  known_hash text,
  deleted boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    d.user_id,
    d.path,
    coalesce(d.title, ''),
    coalesce(d.content, ''),
    s.content_hash,
    d.deleted
  from public.readable_library_documents d
  left join public.library_index_state s on s.document_id = d.id
  where d.kind = 'note'
    and (
      -- A live note never indexed, or edited since it was.
      (d.deleted = false and (s.document_id is null or s.indexed_at < d.updated_at))
      -- A deleted note that still has an index row, i.e. chunks to remove. Once
      -- the indexer purges it, s.document_id is null and it stops being selected.
      or (d.deleted = true and s.document_id is not null)
    )
  -- Purges first. They cost no embedding calls, so a backlog of edits must never
  -- be what keeps a deleted note's chunks alive for another tick.
  order by (d.deleted = false) asc, d.updated_at asc
  limit greatest(1, least(p_limit, 200));
$$;

comment on function public.list_dirty_library_docs is
  'Documents needing (re)indexing or PURGING: never indexed, touched since last index, or deleted-but-still-indexed. Service-role only — it reads across all users by design.';

revoke execute on function public.list_dirty_library_docs(int) from public, anon, authenticated;
grant execute on function public.list_dirty_library_docs(int) to service_role;

-- The cron guard in 20260723T02 calls this same function, which is why adding the
-- deleted case here is all it takes to wake the indexer for a purge. That shared
-- definition is deliberate — see the comment on run_library_indexing().
