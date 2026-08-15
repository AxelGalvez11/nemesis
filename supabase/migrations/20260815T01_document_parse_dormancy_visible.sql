-- 20260815T01 — a cron that returns 0 for three different reasons cannot be
-- watched, and this one was not.
--
-- Measured against production before this migration: `run_document_parse_jobs`
-- has fired every minute since 20260806210000 applied — 08-06 21:00 UTC — and
-- `vault.decrypted_secrets` has never once held a row named
-- `document_worker_url` or `document_worker_service_role_key`. Every one of
-- those ~12,900 runs hit the `v_url is null or v_key is null` branch, raised a
-- WARNING (which does not fail a transaction), and returned 0.
-- `cron.job_run_details.status` says `succeeded` on every single one, because
-- from Postgres's point of view it did: the function ran to completion and
-- returned a value. Across the SAME window, `claim_document_parses` was called
-- zero times — every `library_sources` row in production still reads
-- `parse_attempts = 0`.
--
-- 🔴 A ROW-LEVEL FACT PROVES THIS WAS NOT "NOTHING WAS EVER DUE". Source
-- 1c9e47ce-dfaa-4448-9724-4dae9db4e365 was enqueued 2026-08-11 02:56:07 UTC —
-- the only `library_sources` row ever enqueued in this table's history — and
-- did not receive `parsed_document_id` until 2026-08-13 15:28:00, 2.5 days and
-- roughly 3,600 cron ticks later, read by the synchronous upload lane instead.
-- It matched every predicate `run_document_parse_jobs` counts as due for the
-- entire gap and was silently skipped on all of them.
--
-- 🔴 BUG #2, FOUND WHILE FIXING BUG #1: `run_document_parse_jobs`'s own due
-- count is WIDER than what `claim_document_parses` will actually claim — it
-- never carried the `parse_enqueued_at is not null` predicate the claim
-- function has always had. Measured right now: 14 `library_sources` rows are
-- unparsed, off-lease and under the attempt ceiling — the count this function
-- computes — but exactly 0 of those 14 were ever asked for. Those 14 are
-- sources nobody has clicked "Read this document" on; per the ownership
-- contract in 20260806210000 ("an unparsed source is not a queued source —
-- something has to ASK"), they are not due at all. Left uncorrected, the fix
-- below would make this job report `failed` on its very next tick for 14
-- documents nobody requested, which is exactly the noisy-alarm failure mode
-- that makes a real signal easy to ignore. Adding the same predicate
-- `claim_document_parses` already enforces brings today's true due count to 0.
--
-- 🔴 `v_due = 0` (genuinely nothing asked for) AND `v_due > 0` with secrets
-- unset (real, requested work silently dropped) produced the IDENTICAL signal
-- before this migration: return 0, no row anywhere `cron.job_run_details`
-- surfaces, status `succeeded`. Nothing that watches this job — today, that is
-- nobody, which is how nine days passed unnoticed — could tell them apart.
--
-- The fix is narrow and two-part:
--   1. Match the due count to what would actually be claimed, so "due" means
--      what the rest of this system already means by it.
--   2. Keep the true-zero case silent, and make the other case LOUD: `raise
--      exception` inside a function pg_cron calls marks that run's `status` as
--      `failed` in `cron.job_run_details` — real, queryable, alertable —
--      instead of a warning nothing subscribes to.
--
-- This changes observability only. It does not set the missing secrets, does
-- not touch the worker route, and does not make the queue start draining.
-- Measured against production data as of this migration: today's true due
-- count is 0, so applying this does NOT flip the cron to `failed` on its next
-- tick — it will do so only the next time a source is genuinely enqueued while
-- the deployment stays unconfigured, which is exactly the case this exists to
-- surface.
--
-- Arming the worker for real is a separate, deliberate act this migration does
-- NOT take: it needs `DOCUMENT_WORKER_SECRET` set in Vercel (Production AND
-- Preview), a redeploy so the running function actually resolves it, and only
-- THEN the matching value written to `document_worker_service_role_key` in
-- Vault — in that order, because a Vault secret set before the redeploy would
-- make the cron present a value the live route does not yet recognise, turning
-- silent dormancy into a silent 401 loop instead. See the accompanying report.

create or replace function public.run_document_parse_jobs()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_key text;
  v_due int;
begin
  select count(*) into v_due
    from public.library_sources
   where parsed_document_id is null
     and parse_failed_at is null
     and storage_path is not null
     and parse_next_attempt_at <= clock_timestamp()
     and parse_leased_until < clock_timestamp()
     and parse_attempts < public.document_parse_max_attempts()
     -- 🔴 THE SAME "SOMETHING HAS TO ASK" PREDICATE claim_document_parses HAS
     -- ALWAYS HAD. Without it this count includes every source nobody has ever
     -- requested a parse for, which is not due work by this system's own
     -- definition and would make the exception below fire for documents no
     -- student is waiting on.
     and parse_enqueued_at is not null;

  -- Still the ONLY silent path: nothing was ever asked for, so nothing was
  -- dropped.
  if v_due = 0 then
    return 0;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets
   where name = 'document_worker_url';
  select decrypted_secret into v_key from vault.decrypted_secrets
   where name = 'document_worker_service_role_key';

  if v_url is null or v_key is null then
    -- 🔴 EXCEPTION, NOT WARNING. A warning is invisible to anything that only
    -- checks whether the job succeeded — which, measured, is everything that
    -- has ever watched this job. Raising fails the pg_cron run and writes
    -- `status = 'failed'` to `cron.job_run_details`, so real requested work
    -- sitting behind an unconfigured deployment is a fact something can alert
    -- on, rather than a fact indistinguishable from a healthy empty queue.
    raise exception
      'run_document_parse_jobs: % requested source(s) due for parsing but document_worker_url/document_worker_service_role_key are unset in Vault',
      v_due;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object('trigger', 'cron'),
    timeout_milliseconds := 10000
  );
  return v_due;
end;
$$;

comment on function public.run_document_parse_jobs is
  'Recovery net for the document parse queue, run by pg_cron every minute. Due means the same thing claim_document_parses claims: unparsed, requested (parse_enqueued_at set), off-lease, under the attempt ceiling. Returns 0 and stays silent only when nothing due was ever requested. When requested work is due and the Vault secrets (document_worker_url, document_worker_service_role_key) are unset, raises so cron.job_run_details.status records the run as failed instead of a warning nothing watches.';
