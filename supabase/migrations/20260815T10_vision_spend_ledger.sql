-- 20260815T10 — vision is the only paid primitive in this system with no
-- entitlement and no counter, and turning the document worker on is what makes
-- that matter.
--
-- Measured before this migration: `library_sources` has 31 rows and no column
-- anywhere records a vision call; `parsed_documents` records parse time, peak
-- memory and coverage but not spend. The unit-economics audit (2026-08-06) put a
-- single free user at $19.44/mo on this one path, and the only ceiling that
-- existed — `MAX_FIGURES_PER_DOC = 40` in figure-routing.ts — is short in three
-- ways: it is per LANE (the page lane, which is the expensive one, never saw
-- it), per ATTEMPT (document_parse_max_attempts() is 5, so a failing document is
-- worth 5x its cap), and it counts nothing, so "what did that lecture cost" had
-- no answer.
--
-- 🔴 RESERVE-THEN-SETTLE, NOT COUNT-AFTERWARDS, AND THE DIFFERENCE IS THE WHOLE
-- POINT. A worker that counted spend after parsing would record nothing when the
-- platform killed it mid-parse — which is precisely the case where an expensive
-- document is expensive. Reserving up front debits before a single image is sent;
-- settling refunds only what demonstrably went unused. A killed process therefore
-- stays charged for its full reservation. That is conservative in the one
-- direction that cannot leak a budget.
--
-- Two ceilings, because they bound two different failures:
--   * per DOCUMENT, accumulated across every attempt — bounds one malformed file.
--   * per USER per day — bounds one person, which is what "uncapped spend for all
--     users" actually means.
-- The grant is the smaller of the two remainders. Neither can be negative.
--
-- Additive only. No column is dropped, no row is rewritten, no existing behaviour
-- changes until a caller passes a cap.

-- ── Per-document lifetime spend ────────────────────────────────────────────
--
-- On `library_sources` rather than `parsed_documents` on purpose: a document that
-- failed has no parse artifact, and a document that failed expensively is exactly
-- the one whose spend must survive into the next attempt.
alter table public.library_sources
  add column if not exists vision_units_spent int not null default 0,
  add column if not exists vision_calls_made int not null default 0;

comment on column public.library_sources.vision_units_spent is
  'Images and PDF pages this source has ever paid Gemini to look at, across all parse attempts. Reserved before a parse and partially refunded after; a worker killed mid-parse stays charged for its whole reservation.';

-- ── Per-user daily spend ───────────────────────────────────────────────────
create table if not exists public.vision_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- UTC day. A rolling window would need a row per call and a scan per parse;
  -- a day bucket is one row per user per day and answers the question the cap
  -- asks. Deliberately coarse.
  day date not null default (now() at time zone 'utc')::date,
  units int not null default 0,
  calls int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

comment on table public.vision_usage is
  'What each user has spent on vision per UTC day. Written only by the reserve/settle functions, which the document worker calls with the service role.';

alter table public.vision_usage enable row level security;

-- A student may read their own spend. Nobody may write it from a browser: the
-- only writers are the security-definer functions below.
drop policy if exists vision_usage_select_own on public.vision_usage;
create policy vision_usage_select_own on public.vision_usage
  for select using (auth.uid() = user_id);

-- ── Reserve ────────────────────────────────────────────────────────────────
create or replace function public.reserve_vision_units(
  p_source_id uuid,
  p_user_id uuid,
  p_document_cap int,
  p_user_daily_cap int
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc_spent int;
  v_user_spent int;
  v_granted int;
  v_today date := (now() at time zone 'utc')::date;
begin
  -- 🔴 LOCKED FOR UPDATE, BECAUSE TWO WORKERS CAN HOLD DIFFERENT DOCUMENTS OF THE
  -- SAME USER AT ONCE. Reading, computing and writing without the lock is the
  -- classic read-then-write race: both read "2,900 spent", both grant 100, and
  -- the daily ceiling is quietly exceeded by exactly one grant.
  select vision_units_spent into v_doc_spent
    from public.library_sources
   where id = p_source_id
   for update;
  if v_doc_spent is null then
    -- No such source. Granting nothing is right: the caller has nothing to parse.
    return 0;
  end if;

  insert into public.vision_usage (user_id, day)
       values (p_user_id, v_today)
  on conflict (user_id, day) do nothing;

  select units into v_user_spent
    from public.vision_usage
   where user_id = p_user_id and day = v_today
   for update;

  v_granted := greatest(0, least(
    coalesce(p_document_cap, 0) - v_doc_spent,
    coalesce(p_user_daily_cap, 0) - coalesce(v_user_spent, 0)
  ));

  if v_granted = 0 then
    return 0;
  end if;

  update public.library_sources
     set vision_units_spent = vision_units_spent + v_granted
   where id = p_source_id;

  update public.vision_usage
     set units = units + v_granted, updated_at = now()
   where user_id = p_user_id and day = v_today;

  return v_granted;
end;
$$;

comment on function public.reserve_vision_units is
  'Debit the smaller of the per-document and per-user-daily remainders, and return it. Called before a parse begins so that a worker killed mid-parse remains charged.';

-- ── Settle ─────────────────────────────────────────────────────────────────
create or replace function public.settle_vision_units(
  p_source_id uuid,
  p_user_id uuid,
  p_granted int,
  p_used int,
  p_calls int default 0
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund int;
  v_today date := (now() at time zone 'utc')::date;
begin
  -- Only the demonstrably unused part comes back. `p_used` above `p_granted`
  -- would mean the ledger let a parse overspend, which `VisionLedger.take`
  -- cannot do — clamping here means a wrong number cannot become a CREDIT.
  v_refund := greatest(0, coalesce(p_granted, 0) - coalesce(p_used, 0));

  update public.library_sources
     set vision_units_spent = greatest(0, vision_units_spent - v_refund),
         vision_calls_made = vision_calls_made + greatest(0, coalesce(p_calls, 0))
   where id = p_source_id;

  update public.vision_usage
     set units = greatest(0, units - v_refund),
         calls = calls + greatest(0, coalesce(p_calls, 0)),
         updated_at = now()
   where user_id = p_user_id and day = v_today;
end;
$$;

comment on function public.settle_vision_units is
  'Refund the part of a reservation that went unspent, and record how many HTTP requests it took. Never credits more than was reserved.';

-- Only the service role calls these. A browser that could reserve could also
-- refund itself an unlimited allowance.
revoke all on function public.reserve_vision_units(uuid, uuid, int, int) from public, anon, authenticated;
revoke all on function public.settle_vision_units(uuid, uuid, int, int, int) from public, anon, authenticated;
