-- 20260806210000 — an upload finishes even when the page that made it is gone.
--
-- Phase 1 of document intelligence: parsing stops happening inside the HTTP
-- request that uploaded the file. See docs/document-intelligence.md §6.4 and
-- docs/document-worker-spike.md for the measurements that shaped this.
--
-- ── THE OWNERSHIP CONTRACT (owner, 2026-08-06) ─────────────────────────────
--
-- 🔴 `parsed_documents` CANNOT BE THE SOLE LIFECYCLE AUTHORITY BEFORE IT EXISTS.
-- That is the whole reason the lease lives elsewhere, and it is worth stating as
-- a correction rather than as a deviation: its identity is
-- (user_id, content_hash, parser_version), and `content_hash` is `not null` with
-- a 64-character CHECK. It is the sha256 of the bytes — not knowable until
-- something has READ them, and reading them IS the work being queued. A parse
-- row cannot exist before its own job runs, and a queue whose rows cannot be
-- created at enqueue time is not a queue.
--
-- So ownership splits by time, not by preference:
--
--   `library_sources`  owns enqueue · fetch and hash attempts · the lease ·
--                      retry timing · and every failure that happens BEFORE a
--                      parse artifact exists.
--
--   `parsed_documents` owns the canonical parse artifact · coverage · parser
--                      version · and the downstream parse/chunk/embed lifecycle,
--                      from the moment the content hash is known.
--
-- 🔴 `parsed_document_id IS NOT NULL` MEANS "AN ARTIFACT IS LINKED", NOT
-- "COMPLETE". A partial parse is a real, linked, useful artifact. Completion is
-- read from the parsed document's own `state` and `coverage` — never from the
-- presence of the link, which is merely the convenient column.
--
-- A SINGLE SHARED RESOLVER derives the user-facing status from both records:
-- `apps/web/lib/notebooks/document-status.ts`. There is no second opinion and no
-- stored status column anywhere.
--
-- The alternatives were considered and are worse:
--   * Client-supplied hash. Makes row identity depend on untrusted input, and
--     leaves the worker having to MOVE a row to a new identity when the real
--     hash disagrees. (It is not a security hole — user_id comes from auth, so
--     no cross-user link is possible — it is just a lie the schema then has to
--     carry.)
--   * A nullable content_hash. Breaks the natural key and the CHECK, and every
--     reader then has to handle a parse row that does not identify a parse.
--
-- So: the WORK ITEM is a placement (`library_sources`) — "this uploaded file
-- needs reading" — and the LIFECYCLE of a parse stays exactly where #447 put it.
-- They answer different questions and cannot disagree, because:
--
-- 🔴 THERE IS NO `parse_state` COLUMN ON library_sources, DELIBERATELY.
-- "Is this source parsed?" has exactly one answer in this schema:
-- `parsed_document_id is not null`. A status column beside the link is a second
-- fact about the same thing, and the flattering one gets believed — the precise
-- bug class #447 removed. Quality lives in parsed_documents.coverage; doneness
-- is the link; everything else here is retry bookkeeping.
--
-- Two sources holding the same bytes share ONE parse. The second one's job
-- resolves to the existing row and links, doing no parsing at all. That is the
-- dedup win falling out of the identity split rather than being bolted on.
--
-- ── LIFECYCLE SCOPE, set by the owner ──────────────────────────────────────
-- This phase advances only:  pending -> parsing -> parsed | partially_parsed | failed
-- `chunking`, `chunked`, `embedding` and `ready` belong to later indexing work and
-- are NOT reachable here. Nothing may call a merely-parsed source "ready": the
-- text exists, but nothing has indexed it, so it is not retrieval-ready.
--
-- DORMANT ON APPLY. The cron is created disabled and the worker URL/secret live
-- in Vault, unset. Applying this migration changes no behaviour by itself.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

-- ── 1. Retry bookkeeping on the work item ──────────────────────────────────

alter table public.library_sources
  -- Which worker holds it, for diagnosis only — never trusted for correctness.
  add column if not exists parse_lease_owner text,
  -- 🔴 THE TOKEN IS THE CORRECTNESS MECHANISM. Minted fresh on every claim. Every
  -- later write names it in its WHERE clause, so a worker whose lease expired and
  -- was reassigned updates ZERO rows and learns it lost, instead of overwriting a
  -- newer worker's result with its own stale one.
  add column if not exists parse_lease_token uuid,
  -- '-infinity' reads as "free" without a nullable column and a three-state
  -- comparison in every caller (same trick as recording_jobs.leased_until).
  add column if not exists parse_leased_until timestamptz not null default '-infinity',
  add column if not exists parse_next_attempt_at timestamptz not null default now(),
  add column if not exists parse_attempts int not null default 0,
  -- Sanitised, student-readable. The raw cause is logged server-side, never here.
  add column if not exists parse_error text,
  -- Set only when attempts are exhausted. A source with this set and no
  -- parsed_document_id is terminally failed and the cron will not pick it up.
  add column if not exists parse_failed_at timestamptz,
  -- Observability the owner asked for. Written by the worker on completion.
  add column if not exists parse_ms int,
  add column if not exists parse_peak_rss_mb int;

comment on column public.library_sources.parse_lease_token is
  'Minted per claim. Every heartbeat, completion and failure write must match it in its WHERE clause, so an expired worker cannot overwrite a newer one.';
comment on column public.library_sources.parse_failed_at is
  'Terminal parse failure. Set only when attempts are exhausted; the claim function skips these so a poisoned file cannot spin forever.';

-- The claim's exact predicate, so a queue scan stays cheap once most sources are
-- parsed (which is eventually all of them).
create index if not exists library_sources_parse_due_idx
  on public.library_sources (parse_next_attempt_at)
  where parsed_document_id is null and parse_failed_at is null;

-- ── 2. Claiming, atomically ────────────────────────────────────────────────

-- Attempts allowed before a parse is declared terminally failed. Named here
-- rather than in the worker because the claim predicate has to agree with it,
-- and two copies of a limit is one copy too many.
create or replace function public.document_parse_max_attempts()
returns int language sql immutable as $$ select 5 $$;

/**
 * Claim up to p_limit sources for parsing and return ONLY the rows this call
 * actually leased.
 *
 * `for update skip locked` is what makes two workers racing safe: the loser does
 * not block and does not see the row, it simply gets fewer rows back. The lease
 * token is minted here, inside the same statement that sets the expiry, so a
 * token can never belong to a lease that was not taken.
 */
create or replace function public.claim_document_parses(
  p_limit int,
  p_lease_seconds int,
  p_owner text
)
returns setof public.library_sources
language sql
security invoker
set search_path = public
as $$
  update public.library_sources s
     set parse_lease_owner     = p_owner,
         parse_lease_token     = gen_random_uuid(),
         -- 🔴 clock_timestamp(), NOT now(). `now()` is transaction_timestamp() and
         -- is FROZEN for a whole transaction: a worker claiming twice inside one
         -- transaction would write a lease from a stale clock and then compare a
         -- fresh lease against that same stale clock. A lease is a wall-clock fact.
         parse_leased_until    = clock_timestamp() + make_interval(secs => greatest(p_lease_seconds, 5)),
         parse_attempts        = s.parse_attempts + 1
   where s.id in (
     select c.id
       from public.library_sources c
      where c.parsed_document_id is null      -- not already parsed
        and c.parse_failed_at is null         -- not terminally failed
        and c.storage_path is not null        -- there are bytes to fetch
        and c.parse_next_attempt_at <= clock_timestamp()  -- backoff has elapsed
        and c.parse_leased_until < clock_timestamp()      -- nobody holds it
        and c.parse_attempts < public.document_parse_max_attempts()
      order by c.parse_next_attempt_at
      for update skip locked
      limit greatest(p_limit, 0)
   )
  returning s.*;
$$;

comment on function public.claim_document_parses is
  'Atomically lease due parse jobs. Returns only rows this caller won. skip locked makes concurrent workers safe; the attempt counter increments at claim so a worker that dies still burns an attempt.';

revoke execute on function public.claim_document_parses(int, int, text) from public, anon, authenticated;
grant execute on function public.claim_document_parses(int, int, text) to service_role;

-- ── 3. Holding the lease ───────────────────────────────────────────────────

/**
 * Renew a lease mid-parse. Returns false when the token no longer matches, which
 * is a worker's signal that it was reclaimed and must abandon its work.
 *
 * The spike measured why this exists: the parsers block the event loop for up to
 * 12 seconds, so the worker parses in a worker_thread and calls this from the
 * main thread. A lease it could not renew would be stolen by the recovery cron
 * that exists to help it.
 */
create or replace function public.renew_document_parse_lease(
  p_source_id uuid,
  p_token uuid,
  p_lease_seconds int
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rows int;
begin
  update public.library_sources
     set parse_leased_until = clock_timestamp() + make_interval(secs => greatest(p_lease_seconds, 5))
   where id = p_source_id
     and parse_lease_token = p_token;   -- 🔴 the token, in the WHERE clause
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke execute on function public.renew_document_parse_lease(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.renew_document_parse_lease(uuid, uuid, int) to service_role;

-- ── 4. Finishing ───────────────────────────────────────────────────────────

/**
 * Record a finished parse and link the placement to it, in one transaction, only
 * if the caller still holds the lease.
 *
 * 🔴 IT DELEGATES TO record_parsed_document RATHER THAN WRITING THE ROW. That
 * function derives `state`, `complete` and `failed_stage` from the coverage it is
 * handed, inside the statement that writes them, and preserves a complete parse
 * against a later partial one. Writing parsed_documents directly here would
 * reintroduce exactly the caller-supplies-a-contradictory-headline bug #447
 * removed, and would need the preservation rule implemented a second time.
 *
 * Returns the parsed_document id, or null if the lease was lost.
 */
create or replace function public.finish_document_parse(
  p_source_id uuid,
  p_token uuid,
  p_user_id uuid,
  p_content_hash text,
  p_doc_kind text,
  p_parser_version text,
  p_structure jsonb,
  p_coverage jsonb,
  p_unit_count int,
  p_visual_count int,
  p_parse_ms int,
  p_peak_rss_mb int
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_parsed uuid;
  v_rows int;
begin
  -- Prove the lease first. Everything after this is inside the same transaction,
  -- so losing the race here means nothing downstream happens either.
  perform 1 from public.library_sources
   where id = p_source_id and parse_lease_token = p_token and user_id = p_user_id
   for update;
  if not found then
    return null;
  end if;

  v_parsed := public.record_parsed_document(
    p_content_hash  => p_content_hash,
    p_coverage      => p_coverage,
    p_doc_kind      => p_doc_kind,
    p_error         => null,
    p_parser_version=> p_parser_version,
    p_structure     => p_structure,
    p_unit_count    => p_unit_count,
    p_user_id       => p_user_id,
    p_visual_count  => p_visual_count
  );

  update public.library_sources
     set parsed_document_id = v_parsed,
         content_hash       = p_content_hash,
         parse_error        = null,
         parse_ms           = p_parse_ms,
         parse_peak_rss_mb  = p_peak_rss_mb,
         parse_leased_until = '-infinity',   -- release, do not wait for expiry
         parse_lease_token  = null
   where id = p_source_id
     and parse_lease_token = p_token;        -- 🔴 the token again
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'lease lost for source % during finish', p_source_id;
  end if;

  return v_parsed;
end;
$$;

revoke execute on function public.finish_document_parse(uuid, uuid, uuid, text, text, text, jsonb, jsonb, int, int, int, int)
  from public, anon, authenticated;
grant execute on function public.finish_document_parse(uuid, uuid, uuid, text, text, text, jsonb, jsonb, int, int, int, int)
  to service_role;

/**
 * Record a failed attempt: back off, or give up if attempts are exhausted.
 *
 * Backoff is exponential with bounded jitter. The jitter is not decoration — a
 * cron that wakes every minute and finds ten jobs whose backoff expired at the
 * same instant will retry all ten together, forever, in a thundering herd. The
 * random component spreads them.
 */
create or replace function public.fail_document_parse(
  p_source_id uuid,
  p_token uuid,
  p_error text,
  p_retryable boolean default true
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_attempts int;
  v_backoff  interval;
  v_rows     int;
begin
  select parse_attempts into v_attempts
    from public.library_sources
   where id = p_source_id and parse_lease_token = p_token
   for update;
  if not found then
    return false;   -- lease lost; the newer worker owns the outcome
  end if;

  -- 30s, 60s, 120s, 240s … capped at 30 minutes, plus up to 20% jitter.
  v_backoff := make_interval(secs =>
    least(30 * power(2, greatest(v_attempts - 1, 0)), 1800)::double precision
    * (1 + random() * 0.2));

  update public.library_sources
     set parse_error           = left(coalesce(p_error, 'parse failed'), 500),
         parse_next_attempt_at = clock_timestamp() + v_backoff,
         parse_leased_until    = '-infinity',
         parse_lease_token     = null,
         parse_failed_at       = case
           when not p_retryable or v_attempts >= public.document_parse_max_attempts()
           then now() else null end
   where id = p_source_id
     and parse_lease_token = p_token;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke execute on function public.fail_document_parse(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.fail_document_parse(uuid, uuid, text, boolean) to service_role;

-- ── 5. Recovery ────────────────────────────────────────────────────────────

/**
 * The safety net. The web app kicks the worker directly after an upload, which is
 * the fast path — but correctness must not depend on that HTTP request surviving,
 * or on pg_net delivering. Anything still unparsed and off-lease gets picked up
 * here regardless of what happened to its kick.
 *
 * Dormant until the owner sets both Vault secrets: with them unset this warns
 * once and returns 0, exactly like the recording worker and the library indexer.
 */
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
     and parse_attempts < public.document_parse_max_attempts();

  if v_due = 0 then
    return 0;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets
   where name = 'document_worker_url';
  select decrypted_secret into v_key from vault.decrypted_secrets
   where name = 'document_worker_service_role_key';

  if v_url is null or v_key is null then
    raise warning 'run_document_parse_jobs: % due but worker secrets are unset; staying dormant', v_due;
    return 0;
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

revoke execute on function public.run_document_parse_jobs() from public, anon, authenticated;

-- Every minute. The function itself is cheap when nothing is due: one indexed
-- count against a partial index, and an early return before it touches Vault.
select cron.unschedule('document-parse-jobs-every-min')
 where exists (select 1 from cron.job where jobname = 'document-parse-jobs-every-min');
select cron.schedule('document-parse-jobs-every-min', '* * * * *',
  $$ select public.run_document_parse_jobs(); $$);
