-- Reconcile `parsed_documents` with what production actually has.
--
-- 🔴 THE REPOSITORY WAS NOT THE SOURCE OF TRUTH FOR THIS TABLE.
--
-- Three migrations were applied to production through the Supabase management
-- API, which stamps its OWN timestamp rather than a repository filename. So the
-- applied history reads:
--
--     20260805045941  source_indexing                 <- no such file anywhere
--     20260805052242  source_indexing_gc_and_partial  <- absent from main
--     20260805173112  origin_aware_retrieval          <- absent from main
--
-- while main carries `20260805040000_source_indexing.sql`, whose version number
-- has never been applied and whose CONTENT is an older draft of the first of
-- those three. The result, measured 2026-08-06:
--
--   * production has 7 columns main does not define (state, failed_stage, error,
--     attempts, updated_at, unreferenced_at, complete);
--   * production's doc_kind allows 'html' and main's does not;
--   * two indexes have different NAMES for the same definition;
--   * a database built from main alone is a different schema from production.
--
-- 🔴 AND MAIN'S UNAPPLIED FILE IS A LOADED GUN. Because 20260805040000 is not in
-- the applied history, `supabase db push` from main would run it against
-- production. Its `create table if not exists` is harmless, but it also does
-- `drop constraint if exists library_chunks_one_origin` followed by an ADD —
-- which would silently replace production's constraint with the older draft's.
--
-- This migration makes both paths converge on ONE definition:
--
--     fresh database from main + this file   ==   production + this file
--
-- FORWARD-ONLY AND ADDITIVE. Nothing here drops a table, drops a column that
-- holds data, or recreates anything. Every statement is safe to run twice and
-- safe to run against either starting point. It does not attempt to reconcile
-- `origin_aware_retrieval` — that is retrieval machinery, it belongs to the
-- source-indexing phase, and pretending to reconcile it here would be a bigger
-- lie than leaving it named as an open gap.

-- ── Columns production has and main does not ─────────────────────────────────
-- Every one of these already exists in production, so each `if not exists` is a
-- no-op there and does the real work on a fresh database.
alter table public.parsed_documents
  -- Where the row is in the PIPELINE. Distinct from what the parse achieved:
  -- a document can be fully read and still be waiting to be chunked.
  add column if not exists state text not null default 'pending',
  add column if not exists failed_stage text,
  add column if not exists error text,
  add column if not exists attempts integer not null default 0,
  add column if not exists updated_at timestamptz not null default now(),
  -- Stamped when no placement points at this parse any more; a separate sweep
  -- collects them later. Never a delete at discovery time.
  add column if not exists unreferenced_at timestamptz,
  add column if not exists complete boolean not null default false;

-- ── Constraints, reconciled by definition and not merely by existence ────────
-- `drop … if exists` then `add` is the only way to guarantee the DEFINITION
-- matches: an `add constraint if not exists` would leave production's older
-- version in place and report success.

alter table public.parsed_documents drop constraint if exists parsed_documents_doc_kind_check;
alter table public.parsed_documents add constraint parsed_documents_doc_kind_check
  check (doc_kind in ('pdf', 'pptx', 'docx', 'xlsx', 'image', 'text', 'html'));

-- 🔴 `partially_parsed` IS NOT A FAILURE STATE. It is the honest resting place
-- for a document that was read as far as it can be read — a 300-page scan with
-- 40 pages transcribed is parsed, and partially so, and both halves are true.
alter table public.parsed_documents drop constraint if exists parsed_documents_state_check;
alter table public.parsed_documents add constraint parsed_documents_state_check
  check (state in (
    'pending', 'parsing', 'parsed', 'partially_parsed',
    'chunking', 'chunked', 'embedding', 'ready', 'failed'
  ));

alter table public.parsed_documents drop constraint if exists parsed_documents_failed_stage_check;
alter table public.parsed_documents add constraint parsed_documents_failed_stage_check
  check (failed_stage is null or failed_stage in ('parse', 'chunk', 'embed'));

-- ── 🔴 `complete` CAN NO LONGER DISAGREE WITH `coverage` ─────────────────────
--
-- It shipped as an INDEPENDENT boolean, commented "independent of state". Two
-- fields that answer the same question and are written separately will disagree
-- eventually, and the one that disagrees in the flattering direction is the one
-- that gets believed — which is the entire defect this phase exists to close.
--
-- So it is now DERIVED, and the database refuses a row where it is not:
--
--     complete  ==  (coverage ->> 'state') = 'complete'
--
-- A CHECK rather than a GENERATED column on purpose. A generated column would
-- silently rewrite a writer that got it wrong; a check makes that writer fail
-- loudly, which is what we want while the writers are being built. It is also
-- non-destructive — converting to generated would mean dropping the column.
--
-- 🔴 THE DEFAULT MOVES FROM true TO false. A row with no coverage yet has
-- `coverage = '{}'`, so the expression is false, and a default of `true` would
-- make every freshly-claimed parse claim completeness before anything had been
-- read. UNKNOWN IS NOT COMPLETE.
alter table public.parsed_documents alter column complete set default false;

-- coalesce, not a bare comparison: `'{}'::jsonb ->> 'state'` is NULL, and a CHECK
-- whose expression is NULL PASSES. Without this the empty-coverage case — the
-- most common one — would be unconstrained, which is the opposite of the point.
alter table public.parsed_documents drop constraint if exists parsed_documents_complete_matches_coverage;
alter table public.parsed_documents add constraint parsed_documents_complete_matches_coverage
  check (complete = (coalesce(coverage ->> 'state', '') = 'complete'));

comment on column public.parsed_documents.complete is
  'DERIVED from coverage->>''state'' and constrained to match it. Never write it independently; it exists so a caller can filter without unpacking the jsonb.';
comment on column public.parsed_documents.state is
  'Where the row is in the PIPELINE (pending -> parsing -> parsed/partially_parsed -> ... -> ready). What the PARSE achieved is coverage->>''state''. The two are different questions.';

-- ── Backfill, before the constraint above can be violated by history ─────────
-- Production holds zero rows today, so this is defensive rather than corrective.
-- It is written anyway because "there were no rows when I checked" is not a
-- property of the migration, and a fresh database could be seeded before this.
update public.parsed_documents
   set complete = (coalesce(coverage ->> 'state', '') = 'complete')
 where complete is distinct from (coalesce(coverage ->> 'state', '') = 'complete');

-- ── Index names, converged ───────────────────────────────────────────────────
-- Same definitions, different names on the two paths. Left alone, a fresh
-- database would carry main's names and production would carry its own, and
-- every later `drop index` would work in one place and not the other.
drop index if exists public.parsed_documents_reprocess_idx;   -- main's name
drop index if exists public.library_chunks_source_idx;        -- main's name

create index if not exists parsed_documents_parser_idx
  on public.parsed_documents(parser_version, created_at desc);

-- Finding work: everything not yet finished, newest first.
create index if not exists parsed_documents_state_idx
  on public.parsed_documents(state, updated_at desc) where state <> 'ready';

create index if not exists parsed_documents_gc_idx
  on public.parsed_documents(unreferenced_at) where unreferenced_at is not null;

create index if not exists library_chunks_parse_idx
  on public.library_chunks(user_id, source_id) where origin_type = 'source';

-- "Which placements point at this parse" — the question the reference count and
-- every reload of a filed source asks.
create index if not exists library_sources_parse_idx
  on public.library_sources(parsed_document_id) where deleted = false;

-- ── Access, re-asserted rather than assumed ──────────────────────────────────
-- 🔴 THE CLIENT MAY READ ITS OWN PARSE AND MAY NOT WRITE ONE. Coverage is a
-- MEASUREMENT the server made; a client that could write it could tell itself
-- its own half-read lecture was complete, and every honesty guarantee above it
-- would be decoration. Writes are the service role's alone.
alter table public.parsed_documents enable row level security;

drop policy if exists parsed_documents_owner_select on public.parsed_documents;
create policy parsed_documents_owner_select
  on public.parsed_documents for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.parsed_documents from anon, authenticated;
grant select on public.parsed_documents to authenticated;

-- ── Writing a parse, exactly once, without ever losing a better one ──────────
--
-- 🔴 THE PRESERVATION RULE LIVES IN THE DATABASE, NOT IN THE CALLER.
--
-- Re-extracting the same bytes with the same parser must not create a second
-- row (the unique index sees to that) and must not REPLACE a complete parse
-- with a worse one. That second half cannot be done from application code with
-- an ordinary upsert: two requests for the same file race, and the loser
-- overwrites the winner. `on conflict … do update … where` decides it inside a
-- single statement, so the rule holds under concurrency by construction.
--
-- The rule, stated plainly: a parse that read the whole document is never
-- replaced by one that did not. A failed retry leaves the good parse standing
-- and only bumps the attempt count, which is the difference between "we tried
-- again and it did not work" and "we tried again and destroyed what we had".
create or replace function public.record_parsed_document(
  p_user_id uuid,
  p_content_hash text,
  p_doc_kind text,
  p_parser_version text,
  p_coverage jsonb,
  p_structure jsonb,
  p_unit_count integer,
  p_visual_count integer,
  p_state text,
  p_failed_stage text default null,
  p_error text default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  -- Derived here as well as in the CHECK, so a caller cannot pass a `complete`
  -- that disagrees with the coverage it is writing in the same statement.
  v_complete boolean := coalesce(p_coverage ->> 'state', '') = 'complete';
begin
  insert into public.parsed_documents as pd (
    user_id, content_hash, doc_kind, parser_version,
    coverage, structure, unit_count, visual_count,
    state, complete, failed_stage, error, attempts, updated_at
  ) values (
    p_user_id, p_content_hash, p_doc_kind, p_parser_version,
    p_coverage, p_structure, p_unit_count, p_visual_count,
    p_state, v_complete, p_failed_stage, p_error, 1, now()
  )
  on conflict (user_id, content_hash, parser_version) do update set
    coverage      = excluded.coverage,
    structure     = excluded.structure,
    unit_count    = excluded.unit_count,
    visual_count  = excluded.visual_count,
    state         = excluded.state,
    complete      = excluded.complete,
    failed_stage  = excluded.failed_stage,
    error         = excluded.error,
    attempts      = pd.attempts + 1,
    updated_at    = now(),
    -- Something is pointing at it again, so it is no longer collectable.
    unreferenced_at = null
  where pd.complete = false or excluded.complete = true
  returning pd.id into v_id;

  -- The WHERE suppressed the update: the stored parse is better than this one.
  -- The row still exists and is still the answer, and the attempt still happened.
  if v_id is null then
    update public.parsed_documents
       set attempts = attempts + 1, updated_at = now(), unreferenced_at = null
     where user_id = p_user_id
       and content_hash = p_content_hash
       and parser_version = p_parser_version
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- 🔴 SERVICE ROLE ONLY. A client that could call this could write its own
-- coverage — that is, it could tell itself a half-read lecture was complete.
revoke all on function public.record_parsed_document(uuid, text, text, text, jsonb, jsonb, integer, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.record_parsed_document(uuid, text, text, text, jsonb, jsonb, integer, integer, text, text, text) to service_role;
