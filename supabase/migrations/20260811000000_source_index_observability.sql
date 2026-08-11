-- Make the source indexer's WORK observable, not just its execution.
--
-- 🔴 WHY THIS EXISTS, IN ONE INCIDENT. Source retrieval was dead from the day it
-- shipped until 2026-08-10, and three separate layers reported success the whole
-- time:
--
--   1. `cron.job_run_details` recorded 812 runs, every one `succeeded` — because
--      pg_cron records whether the STATEMENT ran, not whether it did anything.
--   2. `run_source_indexing()` returned 0, which is also what it returns when
--      there is legitimately nothing to do. Indistinguishable from healthy.
--   3. The function's own skip reason was "predates the canonical model", which
--      reads as an expected backlog of old files rather than a bug.
--
-- Every green light was about a step's own exit, and not one was about a
-- document becoming searchable. **A pipeline is only observably alive if
-- something asserts the OUTCOME.** That is what this table is for.

create table if not exists public.source_index_runs (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  -- Queue depth at the moment the run started, UNBOUNDED by the batch limit.
  -- 🔴 The batch size is not the backlog: a run that claims its full limit every
  -- time and indexes nothing looks identical to an empty queue if you only
  -- record what was claimed.
  pending integer not null,
  -- Rows this run actually took, bounded by the function's PARSE_LIMIT.
  claimed integer not null,
  -- The only number that means the system did its job.
  indexed integer not null,
  skipped integer not null,
  chunks_embedded integer not null,
  -- { "no-model": 3, "empty": 1 } — never collapsed into one count, because each
  -- reason is a different fix and one bucket hides which.
  skip_reasons jsonb not null default '{}'::jsonb,
  -- Null on a clean run. A run that threw still writes a row: a failure that
  -- leaves no trace is the failure mode this whole table exists to end.
  error text,
  duration_ms integer
);

comment on table public.source_index_runs is
  'One row per source-index invocation. Records the OUTCOME (documents indexed, chunks embedded) rather than whether the call was made — see source_index_health().';

create index if not exists source_index_runs_ran_at_idx
  on public.source_index_runs (ran_at desc);

-- Only the service role writes or reads these; RLS on with no policy denies
-- everyone else, and the service role bypasses RLS.
alter table public.source_index_runs enable row level security;

-- 🔴 THE QUEUE DEPTH, SEPARATE FROM THE BATCH. `list_unchunked_parses` takes a
-- LIMIT because a run should not claim the world; this answers "how much is
-- left" without one. Health depends on the difference between the two.
create or replace function public.count_unchunked_parses(
  p_chunker_version text,
  p_embedding_version text
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.parsed_documents p
  where not exists (
    select 1 from public.library_chunks c
    where c.parsed_document_id = p.id
      and c.chunker_version = p_chunker_version
      and c.embedding_version = p_embedding_version
  );
$$;

revoke execute on function public.count_unchunked_parses(text, text) from public, anon, authenticated;

create or replace function public.record_source_index_run(
  p_pending integer,
  p_claimed integer,
  p_indexed integer,
  p_skipped integer,
  p_chunks_embedded integer,
  p_skip_reasons jsonb default '{}'::jsonb,
  p_error text default null,
  p_duration_ms integer default null
)
returns bigint
language sql
security definer
set search_path = public
as $$
  insert into public.source_index_runs
    (pending, claimed, indexed, skipped, chunks_embedded, skip_reasons, error, duration_ms)
  values
    (p_pending, p_claimed, p_indexed, p_skipped, p_chunks_embedded,
     coalesce(p_skip_reasons, '{}'::jsonb), p_error, p_duration_ms)
  returning id;
$$;

revoke execute on function public.record_source_index_run(integer, integer, integer, integer, integer, jsonb, text, integer)
  from public, anon, authenticated;

-- 🔴 THE ONE QUESTION THAT WOULD HAVE CAUGHT THE OUTAGE: is there work waiting
-- that nothing is completing?
--
-- `stalled` is deliberately NOT "the last run indexed nothing". A run that
-- indexes nothing because the queue is empty is perfectly healthy, and an alert
-- that fires on the healthy case is an alert nobody reads — which is the same
-- mistake as a coverage badge on every document. It requires BOTH: work was
-- available AND consecutive runs completed none of it.
create or replace function public.source_index_health(p_runs integer default 3)
returns table (
  pending integer,
  last_run_at timestamptz,
  last_successful_index_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  runs_considered integer,
  indexed_in_window integer,
  stalled boolean,
  -- Says WHY in words, so whatever reads this does not have to re-derive the
  -- rule and get it subtly different.
  verdict text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pending integer;
  v_window_runs integer;
  v_window_indexed integer;
  v_window_with_work integer;
  v_stalled boolean;
begin
  select public.count_unchunked_parses('units-blocks-1', 'voyage-3-large-1024') into v_pending;

  select count(*)::integer,
         coalesce(sum(r.indexed), 0)::integer,
         count(*) filter (where r.claimed > 0)::integer
    into v_window_runs, v_window_indexed, v_window_with_work
  from (
    select * from public.source_index_runs order by ran_at desc limit greatest(p_runs, 1)
  ) r;

  -- Never stalled on no evidence: with fewer runs than the window we do not yet
  -- know, and "unknown" must not render as "fine".
  v_stalled := v_window_runs >= greatest(p_runs, 1)
               and v_window_with_work = greatest(p_runs, 1)
               and v_window_indexed = 0;

  return query
  select
    v_pending,
    (select max(ran_at) from public.source_index_runs),
    (select max(ran_at) from public.source_index_runs where indexed > 0),
    (select r.error from public.source_index_runs r where r.error is not null order by r.ran_at desc limit 1),
    (select max(r.ran_at) from public.source_index_runs r where r.error is not null),
    v_window_runs,
    v_window_indexed,
    v_stalled,
    case
      when v_stalled then
        format('STALLED: %s parse(s) waiting and the last %s run(s) all claimed work and indexed nothing',
               v_pending, greatest(p_runs, 1))
      when v_window_runs = 0 then 'NO RUNS RECORDED — the indexer has never reported an outcome'
      when v_pending = 0 then 'healthy: nothing waiting'
      else format('working: %s waiting, %s indexed in the last %s run(s)',
                  v_pending, v_window_indexed, v_window_runs)
    end;
end;
$$;

revoke execute on function public.source_index_health(integer) from public, anon, authenticated;

comment on function public.source_index_health(integer) is
  'Is the source indexer doing WORK? stalled = work was available AND consecutive runs completed none of it. Deliberately not "indexed nothing", which is healthy on an empty queue.';
