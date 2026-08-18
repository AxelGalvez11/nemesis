-- 20260818T40 — the paid parsers get a ceiling, like every other expensive thing.
--
-- 🔴🔴 MISTRAL AND LLAMAPARSE HAVE NEVER HAD ONE. Vision has a per-document cap, a
-- per-user daily cap and a reserve-then-settle ledger (`20260815T10`). The model
-- valve has daily and monthly token budgets. Web search has daily and monthly
-- unit budgets. Transcription is metered against a plan allowance. The two
-- document parsers — billed per page, reached on every upload, and until this
-- week reached FIRST on every PDF — were counted nowhere and bounded by nothing.
--
-- The owner's rule: *"Do not allow a malformed document, retry loop, or model
-- failure to create uncapped spend."* Every other subsystem obeys it. This makes
-- the parsers obey it too.
--
-- 🔴 THE UNIT IS A DOCUMENT, NOT A PAGE, AND THAT IS DELIBERATE. A page cap would
-- have to be reserved before the page count is known — the count comes back WITH
-- the vendor's answer — so it could only ever be settled after the money was
-- spent. A document is the thing a person uploads, it is knowable before anything
-- is sent, and `MISTRAL_MAX_BYTES` already bounds how large one may be. Bounding
-- the count of them bounds the bill.
--
-- 🔴 AND THE FAIL-SAFE DIRECTION IS "READ IT OURSELVES". A learner past the cap
-- still gets their document — parsed by the local reader, with coverage saying
-- honestly what it could not recover. That is graceful degradation, which is what
-- the owner asked for, and it is the opposite of the usual cap behaviour of
-- refusing the work.
--
-- Additive. Nothing changes until a caller passes a cap.

create table if not exists public.vendor_parse_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- UTC day, matching `vision_usage`. A rolling window would need a row per
  -- document and a scan per parse; a day bucket answers the question the cap asks.
  day date not null default (now() at time zone 'utc')::date,
  documents int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

comment on table public.vendor_parse_usage is
  'Documents this user has sent to a paid document parser per UTC day. Written only by claim_vendor_parse.';

alter table public.vendor_parse_usage enable row level security;
revoke all on public.vendor_parse_usage from anon, authenticated;

-- ── Taking one of today's vendor parses ────────────────────────────────────
--
-- 🔴 CLAIMED IN SQL SO TWO WORKERS CANNOT BOTH SPEND THE LAST ONE, exactly as
-- `reserve_vision_units` and `claim_parse_shadow_run` are. Returns true when this
-- document may reach a vendor and has been counted.
create or replace function public.claim_vendor_parse(p_user_id uuid, p_daily_cap int)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_documents int;
begin
  if p_daily_cap <= 0 then
    return false;
  end if;

  insert into public.vendor_parse_usage (user_id, day, documents)
       values (p_user_id, (now() at time zone 'utc')::date, 0)
  on conflict (user_id, day) do nothing;

  update public.vendor_parse_usage
     set documents = documents + 1, updated_at = now()
   where user_id = p_user_id
     and day = (now() at time zone 'utc')::date
     and documents < p_daily_cap
  returning documents into v_documents;

  return v_documents is not null;
end;
$$;

revoke execute on function public.claim_vendor_parse(uuid, int) from public, anon, authenticated;
grant execute on function public.claim_vendor_parse(uuid, int) to service_role;

comment on function public.claim_vendor_parse(uuid, int) is
  'Take one of this user''s daily paid-parser slots, or refuse. Refusal means the local reader parses the document; it never means the document goes unread.';

-- ── Where the money went ───────────────────────────────────────────────────
--
-- 🔴 A VIEW OVER `usage_events`, NOT A SECOND LEDGER. Every row this reads is
-- already written by something: the model valve, web search, and now the parse
-- worker for Mistral, LlamaParse and Gemini vision. A parallel costs table would
-- mean two answers to "what did this month cost" and one of them would be wrong.
--
-- 🔴 UNPRICED ROWS ARE COUNTED, NEVER SUMMED AS ZERO. A provider missing from a
-- price list reads as free unless something insists otherwise, which is the single
-- most misleading thing a cost report can do.
create or replace view public.ai_spend_report as
select
  e.user_id,
  date_trunc('day', e.created_at)::date                as day,
  coalesce(e.metadata ->> 'provider', e.event_type)    as provider,
  e.metadata ->> 'operation'                           as operation,
  e.metadata ->> 'source_id'                           as source_id,
  e.metadata ->> 'canvas_id'                           as canvas_id,
  e.metadata ->> 'reason'                              as reason,
  count(*)                                             as calls,
  sum(coalesce((e.metadata ->> 'units')::numeric, 0))  as units,
  sum(coalesce((e.metadata ->> 'cost_usd')::numeric, 0)) as usd,
  count(*) filter (where e.metadata ->> 'cost_usd' is null) as unpriced_calls
from public.usage_events e
where e.metadata ? 'cost_usd' or e.metadata ? 'provider'
group by 1, 2, 3, 4, 5, 6, 7;

comment on view public.ai_spend_report is
  'Every metered AI call with a price on it, by learner, day, provider, operation and scope. Unpriced calls are counted separately and never summed as zero.';

revoke all on public.ai_spend_report from anon, authenticated;
