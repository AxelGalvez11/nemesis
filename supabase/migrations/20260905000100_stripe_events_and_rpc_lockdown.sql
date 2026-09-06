-- 2026-09-05 launch audit.
--
-- 1. Stripe webhook idempotency. Stripe retries and occasionally double-delivers events; the
--    mirror is safe to repeat but the welcome email and analytics were not. The webhook claims
--    the event id here before doing anything else.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  livemode boolean not null default false,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
-- Service role only. No policies: nothing in the browser has any business here.
revoke all on public.stripe_events from anon, authenticated;

-- 2. Backfill jobs were callable by anyone holding the public anon key.
--    run_course_scaffold_sync / run_commons_figure_sync / run_textbook_shelf_sync are SECURITY
--    DEFINER, read the service-role key from Vault and fire it at an edge function. Their ACL
--    granted EXECUTE to anon and authenticated, so POST /rest/v1/rpc/run_course_scaffold_sync
--    with the public key started a service-authorised job. Same for the two definer helpers the
--    advisor flagged. Cron (pg_cron runs as postgres) and the service role keep their access.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.run_course_scaffold_sync()',
    'public.run_commons_figure_sync()',
    'public.run_textbook_shelf_sync()',
    'public.books_needing_scaffold(integer)'
  ] loop
    begin
      execute format('revoke execute on function %s from public, anon, authenticated', fn);
    exception when undefined_function then
      raise notice 'skipping %, not present', fn;
    end;
  end loop;
end $$;

-- match_textbook_figures is called by signed-in learners (figure shelf search, with their own
-- JWT), so it keeps `authenticated`; only the anonymous key loses it.
do $$
begin
  revoke execute on function public.match_textbook_figures(extensions.vector, integer, double precision, text) from public, anon;
exception when undefined_function then
  raise notice 'match_textbook_figures not present';
end $$;
