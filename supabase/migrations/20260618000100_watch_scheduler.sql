-- Live monitoring (WS-D) — scheduler (increment 7). The one genuinely new primitive: pg_cron drives the
-- watch-check edge function for every DUE active watch, honoring each watch's cadence server-side (never
-- trusting a client to self-throttle, per the advisor carry-forward).
--
-- NOT YET APPLIED — applying is owner-gated (step 6 of go-live). It is SAFE to apply early: the cron job
-- no-ops when there are no due watches (empty prod → silent), and when there ARE due watches but the
-- Vault secrets below are unset it warns once and returns (never sends). So nothing runs until BOTH the
-- feature has users AND the owner has set the two Vault secrets.
--
-- ACTIVATION (owner, gated — keeps the service key OUT of this migration text and out of any GUC):
--   -- detection (in-app monitoring) — this is all that's needed for the in-app feature:
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/watch', 'watch_check_url');
--   select vault.create_secret('<service-role-key>', 'watch_service_role_key');
--   -- email digest (ONLY when also activating Resend: set RESEND_API_KEY + RESEND_FROM on the
--   -- watch-digest function, then add this third secret so the daily digest fan-out begins):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/watch-digest', 'watch_digest_url');

create extension if not exists pg_cron;
create extension if not exists pg_net;  -- Supabase installs into the `net` schema (matches net.http_post below)
create extension if not exists supabase_vault with schema vault;

-- Find every due active watch and fire watch-check at it (async, fire-and-forget via pg_net). Cadence is
-- enforced HERE: daily watches due after ~1 day, weekly after ~7 days, plus anything never checked.
create or replace function public.run_due_watch_checks()
returns integer
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url  text;
  v_key  text;
  w      record;
  n      integer := 0;
begin
  -- Cheap exit FIRST so an empty prod (no watches yet) ticks silently — no secret lookup, no log noise.
  if not exists (
    select 1 from evidence_watches
    where status = 'active'
      and ((cadence = 'daily'  and (last_checked_at is null or last_checked_at < now() - interval '1 day'))
        or (cadence = 'weekly' and (last_checked_at is null or last_checked_at < now() - interval '7 days')))
  ) then
    return 0;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'watch_check_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'watch_service_role_key';
  if v_url is null or v_key is null then
    raise warning 'watch scheduler: due watches exist but Vault secrets (watch_check_url / watch_service_role_key) are unset — skipping';
    return 0;
  end if;

  for w in
    select id from evidence_watches
    where status = 'active'
      and ((cadence = 'daily'  and (last_checked_at is null or last_checked_at < now() - interval '1 day'))
        or (cadence = 'weekly' and (last_checked_at is null or last_checked_at < now() - interval '7 days')))
    order by last_checked_at asc nulls first
    limit 200  -- per-tick cap (the per-cycle spend/rate guard); the next tick drains the remainder
  loop
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('watch_id', w.id)
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Internal only: the cron runs it; no client should ever call it (it holds the service key fan-out).
revoke execute on function public.run_due_watch_checks() from public, anon, authenticated;

-- Tick hourly; the function itself decides which watches are due (daily vs weekly). Idempotent: a watch
-- only advances its cursor on a successful check (watch-check write order), so a missed tick self-heals.
select cron.schedule('watch-check-due-hourly', '0 * * * *', $$ select public.run_due_watch_checks(); $$);

-- ── Email digest fan-out (DORMANT until the watch_digest_url Vault secret + Resend are configured) ──
-- Once a day, batch each user's UNDIGESTED loud alerts into one email by POSTing the watch-digest
-- function per user. Gated FIRST on the digest URL secret, so until email is activated this is a silent
-- no-op (no secret → returns 0, no POSTs, no log noise) even though undigested alerts exist. Opted-out
-- users are excluded here; the watch-digest function re-checks opt-out + dormancy defensively.
create or replace function public.run_due_digests()
returns integer
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url text;
  v_key text;
  u     record;
  n     integer := 0;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'watch_digest_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'watch_service_role_key';
  if v_url is null or v_key is null then
    return 0;  -- email not activated → do nothing, silently (keeps prod logs clean pre-activation)
  end if;

  for u in
    select distinct e.user_id
    from watch_events e
    left join watch_email_optout o on o.user_id = e.user_id
    where e.is_alert and e.digested_at is null and e.channel = 'evidence' and o.user_id is null
    limit 500  -- per-tick cap; the next day's tick drains any remainder
  loop
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('user_id', u.user_id)
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.run_due_digests() from public, anon, authenticated;

-- Daily at 13:00 UTC (mid-morning US). The "same-day digest" cadence; adjustable.
select cron.schedule('watch-digest-daily', '0 13 * * *', $$ select public.run_due_digests(); $$);
