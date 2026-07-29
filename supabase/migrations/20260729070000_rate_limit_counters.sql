-- A rate limit that survives scaling out.
--
-- Four routes counted requests in `let hits: number[] = []` at module scope.
-- That works on one server and INVERTS on many: serverless starts more instances
-- under load, each with its own private counter, so the effective ceiling is
-- limit x instances — the cap loosens exactly when traffic says it should
-- tighten. It is the one kind of limiter that is strictest when you least need
-- it and absent when you most do.
--
-- Fixed window, not sliding. A sliding window needs the timestamps kept; a fixed
-- window needs one integer and one upsert, and Postgres serializes contending
-- updates on the primary key for free. The cost is that a caller can spend two
-- windows' worth across a boundary — for a backstop behind real authentication,
-- that is the right trade against a second table of timestamps per request.
create table if not exists public.rate_limit_counters (
  bucket text not null,
  subject text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (bucket, subject, window_start)
);

alter table public.rate_limit_counters enable row level security;
-- No policies: only the service role reaches this, and the service role bypasses
-- RLS. A student has no business reading anyone's rate-limit state, including
-- their own — it would only tell them how close they are to a wall.

-- Old windows are dead weight the moment they close.
create index if not exists rate_limit_counters_window_idx
  on public.rate_limit_counters (window_start);

/**
 * Spend one unit against (bucket, subject) and say whether it was allowed.
 *
 * ATOMIC: the insert-on-conflict increments and returns the new count in one
 * statement, so two simultaneous requests cannot both read 19 and both write 20.
 * That is the same failure `record_nemesis_llm_usage` was written to fix, and it
 * matters more here — a limiter that loses increments under load is a limiter
 * that stops working precisely during an attack.
 *
 * Returns the count AFTER this request, so `allowed` is `count <= p_limit`.
 */
create or replace function public.consume_rate_limit(
  p_bucket text,
  p_subject text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if p_bucket is null or p_subject is null or p_limit is null or p_limit <= 0
     or p_window_seconds is null or p_window_seconds <= 0 then
    raise exception 'invalid rate limit request';
  end if;

  -- Floor now() onto the window grid, so every instance agrees on which window
  -- it is in without any of them having to coordinate.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_counters (bucket, subject, window_start, count, updated_at)
  values (p_bucket, p_subject, v_window_start, 1, now())
  on conflict (bucket, subject, window_start) do update
    set count = public.rate_limit_counters.count + 1,
        updated_at = now()
  returning count into v_count;

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'count', v_count,
    'limit', p_limit,
    'window_start', v_window_start
  );
end;
$$;

-- Service role only. A signed-in user calling this directly could burn their own
-- allowance or probe someone else's, and neither is a thing the app needs.
revoke all on function public.consume_rate_limit(text, text, integer, integer) from public;
revoke all on function public.consume_rate_limit(text, text, integer, integer) from anon;
revoke all on function public.consume_rate_limit(text, text, integer, integer) from authenticated;

/** Drop closed windows. Called by the existing cron lane; safe to run any time. */
create or replace function public.prune_rate_limit_counters()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limit_counters
    where window_start < now() - interval '1 day';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_rate_limit_counters() from public;
revoke all on function public.prune_rate_limit_counters() from anon;
revoke all on function public.prune_rate_limit_counters() from authenticated;
