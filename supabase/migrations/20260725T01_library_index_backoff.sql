-- 20260725T01 — a note that can never be indexed must stop blocking the ones that can,
-- and an ANN search must stop coming back short once there is more than one student.
--
-- ── BUG 1: HEAD-OF-LINE STALL (the severe one; live today) ──────────────────
--
-- list_dirty_library_docs orders `d.updated_at asc` and the indexer retries a
-- failed document forever by design ("a document that throws is left dirty on
-- purpose"). Those two facts together are a trap: a document that can NEVER be
-- indexed — content the embedding provider always rejects, a row that always
-- trips a constraint — has an OLD updated_at, so it sits at the FRONT of the
-- dirty list permanently.
--
-- The cost is not one wasted call. The cron ticks every 2 minutes, so one such
-- note burns ~720 embedding attempts a day, forever, and `failures` only ever
-- reaches console.warn — nothing persists, so nobody finds out. Accumulate
-- DOC_LIMIT (40) of them and the indexer never reaches a live edit again: the
-- Library silently stops updating while the cron reports work every tick.
--
-- Retrying is right. Retrying at full speed forever is not. This adds a failure
-- record with exponential backoff, and — the part that actually fixes the stall —
-- makes that record visible to the FEEDER, so a backed-off document is not
-- selected at all and does not consume one of the 40 slots.
--
-- WHY A SEPARATE TABLE, not columns on library_index_state. That row means "this
-- document IS indexed, at this hash, at this time" — its indexed_at is NOT NULL
-- and is exactly what the staleness predicate compares against. A failed document
-- has no such time, and inventing one (epoch, now()) either lies to the predicate
-- or marks a broken document clean. Failures are a different fact with a different
-- lifetime, so they get their own row, created on first failure and deleted on
-- first success.
--
-- ── BUG 2: TWO TICKS ON THE SAME BATCH ──────────────────────────────────────
--
-- pg_cron fires every 2 minutes and net.http_post is fire-and-forget, so nothing
-- stops tick N+1 starting while tick N is still running. Both then call
-- list_dirty_library_docs and get the SAME documents — the first tick has not
-- stamped them yet. UNIQUE (document_id, chunk_index) means this cannot corrupt
-- the index, but both ticks pay for the same embeddings, and the loser's INSERT
-- raises a unique violation.
--
-- Harmless before this file. NOT harmless with backoff: that spurious violation
-- would now be recorded as a real failure and delay a note that is perfectly
-- fine — and since both ticks share the whole batch, one slow tick could back
-- off up to 40 healthy documents at once. The stall fix needs this lease to be
-- correct, which is why they ship together.
--
-- A lease and not an advisory lock: a lock taken in run_library_indexing()
-- releases the instant net.http_post returns, so it would never cover the edge
-- function's actual runtime. A row with an expiry does. The conditional UPDATE
-- is atomic on its own, so two ticks racing cannot both win it.
--
-- Ten minutes, from measurement rather than from the cron period: library-index
-- runs observed in production 2026-07-25 took 1.7s to 3.1s, so ten minutes is
-- roughly 200x headroom for a batch far larger than any seen. It is released on
-- the success path, so that window only ever applies when the function actually
-- died mid-run — exactly when a long guard is what you want. The cost of a crash
-- is then at most ten minutes of indexing delay, picked up automatically by the
-- next tick; searches keep working on the chunks that already exist.
--
-- ── BUG 3: A SEARCH THAT COMES BACK SHORT (latent) ──────────────────────────
--
-- HNSW visits a fixed number of candidates and the WHERE clause is applied
-- AFTERWARDS. match_library_chunks has two hard filters — RLS scoping to one
-- student, and `d.deleted = false` (added yesterday in 20260724T01, so this got
-- one filter worse). With many students, the global candidate list can contain
-- few or none of the caller's own chunks, and a search for 8 passages returns 3.
-- Silently: a short list looks exactly like a small Library.
--
-- `hnsw.iterative_scan` makes the index keep pulling candidates until the LIMIT
-- is genuinely met. Verified on this database 2026-07-25: pgvector is 0.8.0 (the
-- feature exists), the parameter was `off`, and turning it on returns a
-- BYTE-IDENTICAL top-8 today — as expected at 454 chunks for a single user, where
-- the global candidate list IS that user's list. This buys nothing now and
-- prevents a silent wrong answer later, which is the only time it could be
-- cheaply added.
--
-- strict_order, not relaxed_order: these results are ranked and shown to a
-- student, and relaxed_order lets the index return rows slightly out of distance
-- order. hnsw.max_scan_tuples (20000, unchanged) stays the bound on total work,
-- so a pathological query cannot scan the whole table.
--
-- DEPLOY: owner-gated — against ref qyjmivntajbigjswhahb. Merging does not apply it.
--
-- ORDER: DEPLOY THE EDGE FUNCTION FIRST, THEN THIS MIGRATION. Same rule as
-- 20260724T01, and this time for a different reason.
--
-- The failure table on its own IS order-independent — the new indexer treats a
-- missing RPC as "no backoff" and behaves exactly as it does today. THE LEASE IS
-- NOT. This file rewrites run_library_indexing() to take a lease, but only the
-- new edge function knows to release one. Applied first, the cron would take a
-- 10-minute lease that today's deployed function never hands back, so indexing
-- would drop from once every 2 minutes to once every 10 until the deploy landed.
-- Not broken — every tick still converges, and the lease always expires — but
-- 5x slower for no reason, and it would look like this migration caused a stall.
--
-- Function first, and the window does not exist: releaseLease() is a no-op until
-- these objects are created.
--
-- PRIVILEGES: the grants below copy list_dirty_library_docs and
-- library_index_state exactly. Verified in production 2026-07-25 that the shape
-- works: both functions are owned by postgres and SECURITY DEFINER, execute is
-- true for postgres and service_role and FALSE for anon, and library_index_state
-- has RLS on with full DML for service_role and nothing for anon. Worth stating
-- because a fresh CREATE takes Supabase's defaults, which include anon.

-- ── 1. The failure record ───────────────────────────────────────────────────

create table if not exists public.library_index_failures (
  document_id uuid primary key
    references public.readable_library_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  failure_count int not null default 1,
  last_error text,
  last_failed_at timestamptz not null default now(),
  -- Stored rather than computed in the predicate so that "when will this be
  -- tried again" is readable with a plain SELECT. record_library_index_failure
  -- below is the ONLY writer, which keeps the backoff policy in one place.
  next_attempt_at timestamptz not null default now()
);

-- Supabase's defaults grant anon full DML on every new public table, so the
-- revoke is the load-bearing line here (memory: pharmabro-supabase-anon-default-grant).
-- RLS with no policies is the second lock: only roles that bypass RLS get in.
alter table public.library_index_failures enable row level security;
revoke all on public.library_index_failures from public, anon, authenticated;
grant select, insert, update, delete on public.library_index_failures to service_role;

comment on table public.library_index_failures is
  'Documents the indexer could not process, with exponential backoff. A row here removes a document from list_dirty_library_docs until next_attempt_at, so one permanently-broken note cannot consume the batch every tick. Deleted on the first success.';

-- No index beyond the primary key: the feeder joins on document_id, and this
-- table only ever holds the documents that are currently failing.

-- ── 2. Recording a failure ──────────────────────────────────────────────────

-- SECURITY DEFINER and atomic on purpose: the delay depends on the count being
-- incremented, and doing read-then-write from the edge function would race two
-- overlapping ticks into resetting each other's backoff.
create or replace function public.record_library_index_failure(
  p_document_id uuid,
  p_user_id uuid,
  p_error text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.library_index_failures as f
    (document_id, user_id, failure_count, last_error, last_failed_at, next_attempt_at)
  values
    (p_document_id, p_user_id, 1, left(coalesce(p_error, ''), 500), now(), now() + interval '2 minutes')
  on conflict (document_id) do update set
    failure_count  = f.failure_count + 1,
    last_error     = left(coalesce(p_error, ''), 500),
    last_failed_at = now(),
    -- Doubling from the cron's own 2-minute period, capped at 12 hours: a
    -- transient provider outage is retried within minutes, while a genuinely
    -- broken note settles at 2 attempts a day instead of 720. Capping rather
    -- than giving up permanently means it heals by itself when the cause is
    -- fixed, with no manual step nobody would remember to take.
    -- Verified 2026-07-25: 2m, 4m, 8m, 16m, 32m, 64m, 128m, 256m, 512m, 12h...
    next_attempt_at = now() + least(
      power(2, least(f.failure_count + 1, 20)) * interval '1 minute',
      interval '12 hours'
    )
  returning f.failure_count into v_count;
  return v_count;
end;
$$;

comment on function public.record_library_index_failure is
  'Record that indexing a document failed and push out its next attempt (exponential, capped at 12h). Returns the new failure count. Service-role only — it writes across all users by design.';

revoke execute on function public.record_library_index_failure(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_library_index_failure(uuid, uuid, text) to service_role;

-- ── 3. The feeder skips a document that is backing off ──────────────────────

-- Same return type as 20260724T01, so CREATE OR REPLACE holds and the grants
-- from that file survive untouched.
create or replace function public.list_dirty_library_docs(p_limit int default 40)
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
  left join public.library_index_failures f on f.document_id = d.id
  where d.kind = 'note'
    and (
      -- A live note never indexed, or edited since it was.
      (d.deleted = false and (s.document_id is null or s.indexed_at < d.updated_at))
      -- A deleted note that still has an index row, i.e. chunks to remove. Once
      -- the indexer purges it, s.document_id is null and it stops being selected.
      or (d.deleted = true and s.document_id is not null)
    )
    -- Backing off. The `is null` half is load-bearing: without it this clause
    -- would drop every document that has NEVER failed, which is all of them.
    and (f.document_id is null or f.next_attempt_at <= now())
  -- Purges first. They cost no embedding calls, so a backlog of edits must never
  -- be what keeps a deleted note's chunks alive for another tick.
  order by (d.deleted = false) asc, d.updated_at asc
  limit greatest(1, least(p_limit, 200));
$$;

comment on function public.list_dirty_library_docs is
  'Documents needing (re)indexing or PURGING: never indexed, touched since last index, or deleted-but-still-indexed — excluding any that are backing off after a failure. Service-role only — it reads across all users by design.';

-- run_library_indexing() (20260723T02) calls this same function as its cheap
-- exit guard, so the cron now also goes quiet when the only remaining work is a
-- document that is backing off. That shared definition is why this file does not
-- have to touch the scheduler at all.

-- ── 4. One indexing run at a time ───────────────────────────────────────────

-- Exactly one row, enforced by the type: `id` can only be true, and it is the
-- primary key. No sequence, no chance of a second lease appearing.
create table if not exists public.library_index_lease (
  id boolean primary key default true check (id),
  -- '-infinity' reads as "free" without a nullable column and a three-state
  -- comparison in every caller.
  leased_until timestamptz not null default '-infinity',
  leased_at timestamptz
);
insert into public.library_index_lease (id) values (true) on conflict (id) do nothing;

alter table public.library_index_lease enable row level security;
revoke all on public.library_index_lease from public, anon, authenticated;
grant select, update on public.library_index_lease to service_role;

comment on table public.library_index_lease is
  'Single-row mutex for the library indexer. Taken by run_library_indexing() before it fires the edge function, released by that function when it finishes, expires by itself if it dies.';

-- The whole mutex. `where leased_until < now()` inside the UPDATE is what makes
-- it atomic: two ticks racing both run this statement, and row locking means the
-- second one re-evaluates the condition against the first one's committed row
-- and matches nothing. Returns true to the winner, NULL (no rows) to the loser.
-- VOLATILE by default and must stay so — marking it stable would let the planner
-- reuse a result and hand the lease to both.
create or replace function public.take_library_index_lease(p_seconds int default 600)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.library_index_lease
     set leased_until = now() + make_interval(secs => greatest(60, least(p_seconds, 3600))),
         leased_at = now()
   where id = true
     and leased_until < now()
  returning true;
$$;

create or replace function public.release_library_index_lease()
returns void
language sql
security definer
set search_path = public
as $$
  update public.library_index_lease set leased_until = '-infinity' where id = true;
$$;

revoke execute on function public.take_library_index_lease(int) from public, anon, authenticated;
revoke execute on function public.release_library_index_lease() from public, anon, authenticated;
grant execute on function public.take_library_index_lease(int) to service_role;
grant execute on function public.release_library_index_lease() to service_role;

-- Rewritten from 20260723T02 to take the lease. The only change is the guard;
-- the Vault lookup deliberately stays ABOVE it, so a project whose secrets are
-- unset returns without holding a lease nobody will ever release.
create or replace function public.run_library_indexing()
returns integer
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url text;
  v_key text;
begin
  -- Cheap exit first: nothing to do when no live note is stale. Shares ONE
  -- definition of staleness with the indexer's batch selection, which is also
  -- why the cron now goes quiet when the only work left is backing off.
  if not exists (select 1 from public.list_dirty_library_docs(1)) then
    return 0;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'library_index_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'library_index_service_role_key';
  if v_url is null or v_key is null then
    raise warning 'library indexer: stale notes exist but Vault secrets (library_index_url / library_index_service_role_key) are unset — skipping';
    return 0;
  end if;

  -- A run is already in flight. Doing nothing is correct: the work is still
  -- dirty, and this tick would only pay twice for it.
  if not coalesce(public.take_library_index_lease(), false) then
    return 0;
  end if;

  -- ONE call per tick: the function drains its own batch internally (DOC_LIMIT),
  -- so fan-out here would just multiply concurrent embedding spend.
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb
  );
  return 1;
end;
$$;

revoke execute on function public.run_library_indexing() from public, anon, authenticated;

-- ── 5. An ANN search that cannot come back short ────────────────────────────

-- `hnsw.*` is only a RECOGNISED parameter once pgvector's library is loaded into
-- the session; in a connection that has never touched a vector it is an unknown
-- placeholder and attaching one to a function needs privileges `postgres` does
-- not have. The error reads "permission denied to set parameter", which looks
-- like a grant problem and is not one. One vector operation loads the library.
-- (Hit for real on 20260724T01 — see that file.)
select '[1,0]'::extensions.vector <=> '[0,1]'::extensions.vector;

-- ALTER rather than CREATE OR REPLACE: this changes only the function's settings,
-- so it does not restate the body and cannot collide with 20260724T01's
-- definition of it, whatever order the two land in.
alter function public.match_library_chunks(extensions.vector, int, float)
  set hnsw.iterative_scan = 'strict_order';
