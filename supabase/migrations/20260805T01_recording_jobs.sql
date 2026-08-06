-- 20260805T01 — a recording finishes even when the page that made it is gone.
--
-- THE BUG THIS EXISTS TO FIX. Everything that happens after you stop recording
-- lived inside a React component: apps/web/components/workspace/sessions/
-- use-recording.ts polled the transcription provider in a `for` loop, and
-- session-chat.tsx then awaited the notes pass, the artifact write and the
-- Library write inside one async IIFE. Both are owned by the chat page. Open the
-- Library, refresh, or close the tab in that window and the poll's results are
-- discarded (`if (!mountedRef.current) return`) or the whole chain dies mid-way —
-- the audio was uploaded and metered, and the student has nothing.
--
-- So the work moves here: a row that outlives every page, and a worker
-- (supabase/functions/recording-worker) that advances it. The page becomes an
-- OBSERVER of this row and nothing more.
--
-- ── Shape, borrowed wholesale from the library indexer ─────────────────────
-- 20260723T02 + 20260725T01 already solved this exact problem for note
-- indexing: pg_cron + pg_net fire an edge function, a lease stops two ticks
-- doing the same work, and a failure backs off instead of spinning. The only
-- structural difference is that the lease is PER JOB rather than global — two
-- students' recordings have no reason to queue behind each other, and a lecture
-- is a much longer unit of work than an embedding batch.
--
-- DORMANT UNTIL THE OWNER ACTIVATES IT, exactly like the indexer. With the Vault
-- secrets unset the cron warns once and returns 0. The web app does not depend on
-- the cron for the normal path — it kicks the worker directly after creating a
-- job — so the cron is the SAFETY NET that recovers a job whose kick was lost.
--
-- ACTIVATION (owner runs these; keeps the service key out of migration text):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/recording-worker', 'recording_worker_url');
--   select vault.create_secret('<service-role-key>', 'recording_worker_service_role_key');
--
-- DEPLOY: owner-gated — `supabase db push`, and deploy the recording-worker
-- function FIRST (same ordering rule as 20260725T01: the table alone is inert,
-- but a cron firing at a function that does not exist is noise).

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

-- ── 1. The job ──────────────────────────────────────────────────────────────

-- STAGES, and why these and not the nine that were asked for.
--
-- Every stage here is a real state transition the worker actually makes, because
-- a progress list is only worth reading if a stage changing means something
-- changed. The original ask listed "cleaning transcript", "detecting learning
-- objectives", "extracting key concepts" and "building lecture notes" as four —
-- but they are ONE model call (the compose pass in recording-note.ts writes the
-- summary, the organisation, the exam flags and the title together). Showing
-- four labels for one call would be a progress bar animating against nothing,
-- which is the fabricated status the same ask rules out. They are one stage,
-- `composing`, and its detail line reports the sections that have actually been
-- written.
--
--   queued       row exists, worker has not picked it up yet
--   transcribing audio is with a provider (xAI, or AssemblyAI being polled)
--   composing    the single notes+title pass is running
--   filing       transcript/notes/title written to the artifact and the Library note
--   indexing     waiting for the library indexer to make the note searchable
--   ready        done
--
-- `uploading` is deliberately NOT here. It happens in the browser BEFORE this row
-- can exist — the audio only lives in a MediaRecorder buffer until it is pushed
-- to storage, so there is nothing durable to record a stage against yet. The web
-- app shows it as a stage because it is one; the server just cannot own it.
create table if not exists public.recording_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed')),
  stage text not null default 'queued'
    check (stage in ('queued', 'transcribing', 'composing', 'filing', 'indexing', 'ready')),
  -- WHERE it broke, kept separately from `stage` so a failed job still knows
  -- which step to resume from. Retrying resets `stage` to this value.
  failed_stage text,
  error text,

  -- Attempts SINCE THE CURRENT STAGE STARTED, not since the job began. Backoff
  -- is per stage: a job that polls AssemblyAI thirty times has not failed thirty
  -- times, and carrying that count into the compose stage would back it off to
  -- hours before it ever ran.
  stage_attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  -- '-infinity' reads as "free" without a nullable column and a three-state
  -- comparison in every caller (same trick as library_index_lease).
  leased_until timestamptz not null default '-infinity',

  -- ── Inputs, captured at creation ──
  storage_path text not null,
  -- Seconds of audio ACTUALLY CAPTURED — the silence gate's quiet is not in the
  -- file, the upload, or the bill. This is what the meter is charged.
  duration_seconds int not null default 0 check (duration_seconds >= 0),
  -- A ready-made line like "12 minutes of quiet skipped", when there was enough
  -- to be worth saying. Text rather than a number because it is copy, and the
  -- rule for when it is worth showing lives in silence-gate.ts.
  silence_skipped text,
  surface text not null default 'sessions' check (surface in ('sessions', 'notebook')),
  -- The chat conversation and the placeholder message inside it. Both are
  -- CLIENT-side ids (the sessions store is local-first and syncs up), so they are
  -- text and are not foreign keys — the worker never writes to them, it only
  -- hands them back so a returning page can find its own card again.
  context_id text,
  message_id text,

  -- ── Outputs, filled in as stages land ──
  -- This is what makes reconnecting work and what makes results appear
  -- progressively: a page that comes back mid-job reads these and shows whatever
  -- already exists instead of starting from nothing.
  transcription_job_id uuid,
  artifact_id uuid references public.chat_recording_artifacts(id) on delete set null,
  library_document_id uuid references public.readable_library_documents(id) on delete set null,
  -- Where the note ENDED UP. The placeholder is created in the unsorted folder
  -- because a recording's course is decided from what was actually said, which
  -- does not exist yet — the `filing` stage moves it into <Course>/Lectures once
  -- the notes are written. That move is the "organizing into the course" step,
  -- and this column is what the chat message quotes when it says where to find
  -- the notes.
  library_path text,
  title text,
  -- Real, countable detail for the progress line. No percentages: nothing here
  -- is a guess about how far along something is.
  transcript_words int,
  note_sections int,
  -- When the finished notes were written to the Library note. The `indexing`
  -- stage compares this against library_index_state.indexed_at, so it reports
  -- the REAL notes being searchable rather than the placeholder that preceded
  -- them.
  notes_written_at timestamptz,
  -- True when indexing was still behind after its cap. The job is `ready`
  -- either way — the notes are readable, search catches up on its own — but
  -- saying so beats silently claiming a state we did not observe.
  index_pending boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The two reads that happen constantly: "what is this student still waiting on"
-- (the global processing indicator, once per poll per open tab) and "what is due"
-- (the worker's claim). Partial on `processing` so finished jobs, which is
-- eventually all of them, cost nothing to skip.
create index if not exists recording_jobs_owner_active_idx
  on public.recording_jobs (user_id, created_at desc)
  where status = 'processing';
create index if not exists recording_jobs_due_idx
  on public.recording_jobs (next_attempt_at)
  where status = 'processing';

alter table public.recording_jobs enable row level security;

-- Supabase grants anon full DML on every new public table by default, so the
-- revoke is load-bearing here (memory: pharmabro-supabase-anon-default-grant).
revoke all on public.recording_jobs from public, anon, authenticated;
grant select on public.recording_jobs to authenticated;
grant select, insert, update, delete on public.recording_jobs to service_role;

-- SELECT ONLY for the student, and no insert/update policy on purpose. The
-- browser watches its own jobs directly through RLS — that is the cheap path and
-- it needs no server round trip — but it must never be able to invent a job,
-- move a stage, or mark one ready. Creation goes through the web server (which
-- also meters and kicks the worker) and every transition belongs to the worker.
drop policy if exists recording_jobs_select on public.recording_jobs;
create policy recording_jobs_select on public.recording_jobs
  for select to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.recording_jobs is
  'One finished recording being turned into a transcript, notes and a Library note. Owns the whole pipeline so no browser page does — a job survives navigation, refresh and closing the tab. Read-only to the student; written by the recording-worker edge function.';

-- ── 2. A Library note knows it is still being written ───────────────────────

-- Requirement: the note exists in the Library from the moment recording stops,
-- showing "Nemesis is processing this recording" rather than appearing minutes
-- later out of nowhere. The link is on the DOCUMENT so the Library can show that
-- status without a second query per row.
--
-- ON DELETE SET NULL, not cascade: deleting a job must never delete a student's
-- note. The note is theirs the moment it exists.
alter table public.readable_library_documents
  add column if not exists recording_job_id uuid
  references public.recording_jobs(id) on delete set null;

create index if not exists readable_library_documents_recording_job_idx
  on public.readable_library_documents (recording_job_id)
  where recording_job_id is not null;

comment on column public.readable_library_documents.recording_job_id is
  'The recording this note was written from. Set when the placeholder note is created and NEVER cleared — it is provenance, not a flag. Whether the note is still being written is the JOB row''s business: the app already watches unfinished jobs for its processing indicator, so the Library reads status from there rather than inferring it from this column.';

-- ── 3. Claiming work ────────────────────────────────────────────────────────

-- Atomic lease. Two ticks racing (the web app kicks the worker AND the cron
-- fires) both run this; `for update skip locked` means the second one sees the
-- first's rows locked and takes nothing rather than duplicating a paid model
-- call.
--
-- A per-job lease, not a global one: two students' recordings have no reason to
-- queue behind each other, and one AssemblyAI job waiting five minutes must not
-- hold up a lecture that would have finished in twelve seconds.
--
-- `stage_attempts` increments on CLAIM, not on failure. Polling a provider that
-- is not finished yet is not a failure, but it is an attempt, and it is what the
-- backoff below has to grow against — otherwise a job stuck on a provider that
-- never answers would be re-claimed every second forever.
create or replace function public.claim_recording_jobs(
  p_limit int default 5,
  p_lease_seconds int default 300,
  p_job_id uuid default null
)
returns setof public.recording_jobs
language sql
security definer
set search_path = public
as $$
  update public.recording_jobs j
     set leased_until = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 1800))),
         stage_attempts = j.stage_attempts + 1,
         updated_at = now()
   where j.id in (
     select c.id
       from public.recording_jobs c
      where c.status = 'processing'
        and c.leased_until < now()
        and c.next_attempt_at <= now()
        and (p_job_id is null or c.id = p_job_id)
      order by c.next_attempt_at
      limit greatest(1, least(p_limit, 20))
      for update skip locked
   )
  returning j.*;
$$;

comment on function public.claim_recording_jobs is
  'Lease up to p_limit due recording jobs (or one specific job) for the worker. Atomic — a second caller racing this one takes nothing rather than duplicating the work.';

revoke execute on function public.claim_recording_jobs(int, int, uuid) from public, anon, authenticated;
grant execute on function public.claim_recording_jobs(int, int, uuid) to service_role;

-- ── 4. Retrying a failed job, from the stage that failed ────────────────────

-- Callable by the STUDENT (a failed recording is theirs to retry), which is why
-- it re-checks ownership itself rather than trusting the caller: it is SECURITY
-- DEFINER, so RLS does not apply inside it.
--
-- Resumes from `failed_stage` rather than starting over. Everything before that
-- stage already produced something durable — a transcript that took four minutes
-- and cost real money is not re-run because the notes pass timed out.
create or replace function public.retry_recording_job(p_job_id uuid)
returns public.recording_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.recording_jobs;
begin
  select * into v_job from public.recording_jobs where id = p_job_id for update;
  if v_job.id is null or v_job.user_id <> auth.uid() then
    raise exception 'recording job not found';
  end if;
  if v_job.status <> 'failed' then
    return v_job;
  end if;

  update public.recording_jobs
     set status = 'processing',
         -- `failed_stage` is where to resume. A row that somehow lost it starts
         -- at the top, which is correct-but-slow rather than stuck.
         stage = coalesce(failed_stage, 'transcribing'),
         failed_stage = null,
         error = null,
         stage_attempts = 0,
         next_attempt_at = now(),
         leased_until = '-infinity',
         updated_at = now()
   where id = p_job_id
   returning * into v_job;
  return v_job;
end;
$$;

comment on function public.retry_recording_job is
  'Restart a failed recording job FROM THE STAGE THAT FAILED, so work already paid for is not repeated. Ownership is re-checked inside — this is SECURITY DEFINER, so RLS does not apply.';

revoke execute on function public.retry_recording_job(uuid) from public, anon;
grant execute on function public.retry_recording_job(uuid) to authenticated, service_role;

-- ── 5. Is there allowance left? ─────────────────────────────────────────────

-- A READ, not a reservation. reserve_transcription_seconds is still the only
-- thing that takes allowance, and it still runs inside the transcription lane
-- where it always has.
--
-- This exists so the web server can refuse a recording BEFORE it creates a
-- placeholder note, a chat card and a job row for something that is going to be
-- rejected seconds later. Without it, a student over their monthly cap gets an
-- empty note in their Library and a failed card in their chat every time they
-- record — noise generated by us, about a limit we already knew about.
--
-- It can disagree with the reservation by a few seconds under a race, and that
-- is fine: the reservation is authoritative and this is a courtesy.
create or replace function public.transcription_quota_state(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_plan text;
  v_limit integer;
  v_used integer := 0;
  v_month_start date := date_trunc('month', current_date)::date;
begin
  if p_user_id is null then
    raise exception 'user id is required';
  end if;

  v_plan := public.resolve_user_plan(p_user_id);
  v_limit := public.plan_entitlement_int(v_plan, 'transcription_seconds_month_limit');

  select coalesce(used, 0) into v_used
    from public.usage_counters
   where user_id = p_user_id
     and counter_key = 'transcription_seconds_month'
     and period_start = v_month_start;

  return jsonb_build_object(
    'plan', v_plan,
    'used', coalesce(v_used, 0),
    'limit', v_limit,
    -- Null limit means no entitlement row at all, which the transcription lane
    -- treats as "not available on this plan". Reported as 0 remaining rather
    -- than as unlimited — the safe direction when a row is missing.
    'remaining', greatest(0, coalesce(v_limit, 0) - coalesce(v_used, 0))
  );
end;
$$;

comment on function public.transcription_quota_state is
  'Read-only view of a user''s monthly transcription allowance. Used to refuse a recording before any rows are created for it; reserve_transcription_seconds remains the only thing that actually takes allowance.';

revoke execute on function public.transcription_quota_state(uuid) from public, anon, authenticated;
grant execute on function public.transcription_quota_state(uuid) to service_role;

-- ── 6. The safety net ───────────────────────────────────────────────────────

-- The web server kicks the worker the moment it creates a job, so this cron is
-- not the normal path — it is what catches a job whose kick was lost (the
-- serverless function died mid-request, the worker crashed holding a lease, the
-- provider took longer than one invocation). Every tick is a no-op when nothing
-- is due, which is almost always.
create or replace function public.run_recording_jobs()
returns integer
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url text;
  v_key text;
begin
  -- Cheap exit first, so an idle project makes no secret lookup, no HTTP call
  -- and no log noise. Same predicate the worker's claim uses.
  if not exists (
    select 1 from public.recording_jobs
     where status = 'processing' and leased_until < now() and next_attempt_at <= now()
     limit 1
  ) then
    return 0;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'recording_worker_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'recording_worker_service_role_key';
  if v_url is null or v_key is null then
    raise warning 'recording worker: jobs are due but Vault secrets (recording_worker_url / recording_worker_service_role_key) are unset — skipping';
    return 0;
  end if;

  -- ONE call per tick. The worker drains its own batch, so fanning out here
  -- would only multiply concurrent provider spend.
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb
  );
  return 1;
end;
$$;

revoke execute on function public.run_recording_jobs() from public, anon, authenticated;

-- Every minute. The kick from the web server is what makes a recording feel
-- immediate; this only has to be fast enough that a LOST kick is not noticed as
-- a hang, and slow enough that an idle project is silent.
select cron.schedule('recording-jobs-every-min', '* * * * *', $$ select public.run_recording_jobs(); $$);
