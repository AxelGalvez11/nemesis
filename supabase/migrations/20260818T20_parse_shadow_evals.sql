-- 20260818T20 — did the cheap route actually get away with it?
--
-- 🔴🔴 A CHEAP PARSER SAYING "GOOD ENOUGH" IS ONLY SAFE IF SOMETHING CHECKS.
-- `preflightPdf` and `preflightOffice` decide, from the file's own evidence, that
-- a vendor would add nothing. That decision is calibrated (see
-- `scripts/preflight-calibrate.mts` and `scripts/office-calibrate.mts`) and it is
-- still a decision made WITHOUT asking the vendor. The failure mode it can have is
-- the quietest one there is: the document parses, the coverage says complete, the
-- learner reads it, and a table nobody noticed is missing.
--
-- So a BOUNDED, SAMPLED fraction of the documents the cheap route passed also go
-- to the vendor, asynchronously, for evaluation only. The comparison is recorded
-- here. This is the owner's shadow evaluation, and every property they asked for
-- is a column or a constraint rather than a promise:
--
--   bounded          `parse_shadow_runs` counts per UTC day against a cap the
--                    worker reads from the environment; the sample rate is an
--                    environment variable that can be set to 0.
--   observable       every run writes a row here, including the ones that found
--                    nothing, because a false-pass RATE needs its denominator.
--   non-destructive  the learner's parse is already recorded and linked before a
--                    shadow run starts. `outcome` records what was found; only a
--                    `serious` finding may repoint the placement, and only at a
--                    parse the vendor actually produced.
--   not permanent    nothing reads these rows to make a routing decision. They
--                    exist to be counted by a person deciding whether to keep
--                    paying for them.
--
-- Additive. No existing column or row is touched.

create table if not exists public.parse_shadow_evals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references public.library_sources(id) on delete set null,

  -- The bytes the comparison is about, so a row survives the placement being
  -- deleted and can still be joined to a parse.
  content_hash text not null check (char_length(content_hash) = 64),
  doc_kind text not null,

  -- What the router decided, and why, in the vocabulary `preflightPdf` /
  -- `preflightOffice` already use. Recorded so a false pass can be attributed to
  -- the rule that produced it rather than to "the parser".
  route_reason text not null,

  -- 🔴 BOTH SIDES' TEACHING-RELEVANT COUNTS, NOT A SCORE. The owner's instruction
  -- is explicit that character count is not the measure: *"A 99% text match that
  -- loses the one contraindication table can be worse than a 90% match that
  -- preserves the important structure."* So each recoverable KIND is counted on
  -- both sides and stored separately; anything that wanted a single number can
  -- compute one, and nothing here has already thrown the structure away.
  native jsonb not null default '{}'::jsonb,
  vendor jsonb not null default '{}'::jsonb,

  -- 🔴 THREE OUTCOMES, AND `minor` IS NOT A FAILURE. The vendor phrasing a
  -- heading differently, splitting a paragraph in two, or finding one more list
  -- item is exactly the difference the quality gate has always accepted. Only a
  -- KIND the native read has none of, or a wholesale text shortfall, is a false
  -- pass. Collapsing the two would make the false-pass rate a measure of how
  -- differently two parsers write, which is not the question.
  outcome text not null check (outcome in ('safe', 'minor', 'serious', 'vendor-unavailable')),
  detail text,

  -- What was done about it. `none` is the ordinary answer and the safe one.
  action text not null default 'none' check (action in ('none', 'replaced')),

  vendor_ms int,
  vendor_units int,
  created_at timestamptz not null default now()
);

comment on table public.parse_shadow_evals is
  'One sampled comparison between the cheap route we shipped and the vendor we did not call. Written by the document worker; read by a person deciding whether the cheap route is safe.';

create index if not exists parse_shadow_evals_day_idx
  on public.parse_shadow_evals (created_at desc);
create index if not exists parse_shadow_evals_outcome_idx
  on public.parse_shadow_evals (outcome, created_at desc);

alter table public.parse_shadow_evals enable row level security;

-- 🔴 NOBODY BUT THE SERVICE ROLE. These rows are internal accounting about the
-- parser, not something a learner has any use for, and one of them names a
-- document. `revoke` rather than a permissive policy: an empty policy list on an
-- RLS-enabled table already denies everything, and this makes that explicit for
-- the next person reading it.
revoke all on public.parse_shadow_evals from anon, authenticated;

-- ── The per-day bound ──────────────────────────────────────────────────────
--
-- 🔴 CLAIMED IN SQL, NOT COUNTED IN THE WORKER, because two workers running at
-- once would otherwise each read the same remainder and each spend it — the same
-- race `reserve_vision_units` exists to prevent. Returns true when this run is
-- within the cap and has been counted, false when it is not.
create table if not exists public.parse_shadow_runs (
  day date not null default (now() at time zone 'utc')::date,
  runs int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day)
);

alter table public.parse_shadow_runs enable row level security;
revoke all on public.parse_shadow_runs from anon, authenticated;

create or replace function public.claim_parse_shadow_run(p_daily_cap int)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_runs int;
begin
  if p_daily_cap <= 0 then
    return false;
  end if;

  insert into public.parse_shadow_runs (day, runs)
       values ((now() at time zone 'utc')::date, 0)
  on conflict (day) do nothing;

  update public.parse_shadow_runs
     set runs = runs + 1, updated_at = now()
   where day = (now() at time zone 'utc')::date
     and runs < p_daily_cap
  returning runs into v_runs;

  return v_runs is not null;
end;
$$;

revoke execute on function public.claim_parse_shadow_run(int) from public, anon, authenticated;
grant execute on function public.claim_parse_shadow_run(int) to service_role;

comment on function public.claim_parse_shadow_run(int) is
  'Take one of today''s shadow-evaluation slots, or refuse. The bound is enforced here so two workers cannot both spend the last one.';
