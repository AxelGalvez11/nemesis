-- 20260723T01 — per-user Library note chunks + their embeddings.
--
-- Mirrors the proven core_source_chunks design (0101/0107/0124) with one change:
-- these rows are PER USER, so RLS is the scoping mechanism and the match RPC is
-- SECURITY INVOKER (not DEFINER) — the caller's JWT decides what it can see, and
-- there is no filter_user_id argument that a client could spoof.
--
-- ANON GRANT (memory `pharmabro-supabase-anon-default-grant`): new function =>
-- Supabase's default privileges grant anon EXECUTE at creation. Revoked below.
--
-- DEPLOY: owner-gated — `supabase db push` against ref qyjmivntajbigjswhahb.
-- Merging this file does NOT apply it.

create table if not exists public.library_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.readable_library_documents(id) on delete cascade,
  path text not null,
  title text not null default '',
  chunk_index int not null,
  content text not null,
  embedding extensions.vector(1024),
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists library_chunks_user_idx
  on public.library_chunks(user_id);

-- Cosine HNSW, opclass schema-qualified (0124's lesson: an unqualified opclass
-- fails under db push because pgvector lives in `extensions`).
create index if not exists library_chunks_vec_idx
  on public.library_chunks
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

alter table public.library_chunks enable row level security;
drop policy if exists library_chunks_owner_all on public.library_chunks;
create policy library_chunks_owner_all
  on public.library_chunks for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.library_chunks from anon, authenticated;
grant select on public.library_chunks to authenticated;  -- writes are service-role only (the indexer)

-- Index bookkeeping. Deliberately NOT a column on readable_library_documents:
-- that table's touch trigger stamps updated_at on every write, so an indexed_at
-- column would re-dirty the row it just cleaned.
create table if not exists public.library_index_state (
  document_id uuid primary key references public.readable_library_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content_hash text not null,
  chunk_count int not null default 0,
  indexed_at timestamptz not null default now()
);

alter table public.library_index_state enable row level security;
-- No policy for `authenticated`: only the service-role indexer touches this table.
revoke all on public.library_index_state from anon, authenticated;

-- ANN over the caller's OWN chunks. SECURITY INVOKER => the RLS policy above is
-- what scopes rows; there is no user_id argument to forge.
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
  where c.embedding is not null
    and (1 - (c.embedding <=> query_embedding)) > match_threshold
  order by c.embedding <=> query_embedding asc
  limit match_count;
$$;

comment on function public.match_library_chunks is
  'ANN over the CALLER''S OWN Library note chunks (1024-dim). SECURITY INVOKER: RLS on library_chunks does the per-user scoping.';

revoke execute on function public.match_library_chunks(extensions.vector(1024), int, float) from public, anon;
grant execute on function public.match_library_chunks(extensions.vector(1024), int, float) to authenticated, service_role;

-- THE staleness predicate. Defined ONCE, here, and used by BOTH the cron guard
-- (20260723T02) and the indexer's batch selection — they must never drift.
--
-- Why an RPC instead of a PostgREST select: staleness is a LEFT JOIN condition,
-- and the LIMIT has to apply AFTER that join. Selecting "oldest N documents" and
-- filtering in the client applies the limit BEFORE the join, so on a library
-- larger than the window, already-indexed notes fill the batch and a freshly
-- edited note (newest updated_at, sorts last) is never reached — the indexer
-- spins forever without converging. Do not reintroduce a client-side filter.
create or replace function public.list_dirty_library_docs(p_limit int default 40)
returns table (
  document_id uuid,
  user_id uuid,
  path text,
  title text,
  content text,
  known_hash text
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
    s.content_hash
  from public.readable_library_documents d
  left join public.library_index_state s on s.document_id = d.id
  where d.deleted = false
    and d.kind = 'note'
    and (s.document_id is null or s.indexed_at < d.updated_at)
  order by d.updated_at asc
  limit greatest(1, least(p_limit, 200));
$$;

comment on function public.list_dirty_library_docs is
  'Documents needing (re)indexing: never indexed, or touched since last index. Service-role only — it reads across all users by design.';

-- Reads every user's notes: service-role only, never a client.
revoke execute on function public.list_dirty_library_docs(int) from public, anon, authenticated;
grant execute on function public.list_dirty_library_docs(int) to service_role;
