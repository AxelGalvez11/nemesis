-- 20260818T60 — a cost report must show which of its dollars are measured.
--
-- 🔴🔴 THE PRICE TABLE WAS WRONG BY ABOUT FOUR TIMES ON BOTH PAID PARSERS, AND NOTHING IN THE
-- REPORT COULD HAVE SHOWN THAT. Mistral was priced at the original OCR model's $1 per 1,000 pages
-- while we request `mistral-ocr-latest`, which resolves to the vendor's current generation; and
-- LlamaParse was priced at one credit a page while the tier we actually send costs three. Both
-- errors ran in the same direction — under-reporting — and both were invisible because every row
-- looked equally authoritative.
--
-- 🔴 SO THE VIEW NOW SEPARATES A MEASURED DOLLAR FROM A STOOD-IN ONE. `ai-spend.ts` stamps
-- `price_basis` on every row: `exact` when the model or tier that ran is known and priced,
-- `ceiling` when a dearest-plausible rate is standing in for a model the vendor would not name.
-- Every Mistral row is a ceiling today, and a report that cannot say so invites the same mistake
-- again in the other direction.
--
-- 🔴 HISTORY IS NOT REPRICED. Rows written before this carry `price_rev = '2026-08-18'` and the
-- prices of that revision; rows after carry `2026-08-18b`. Surfacing the revision is what lets a
-- reader see that a range spans two rate cards, rather than silently averaging them.
--
-- ADDITIVE AND REVERSIBLE: columns are appended, nothing is dropped or reordered, and every
-- existing query against this view keeps working unchanged.

create or replace view public.ai_spend_report as
select
  user_id,
  date_trunc('day', created_at)::date as day,
  coalesce(metadata ->> 'provider', event_type) as provider,
  metadata ->> 'operation' as operation,
  metadata ->> 'source_id' as source_id,
  metadata ->> 'canvas_id' as canvas_id,
  metadata ->> 'reason' as reason,
  count(*) as calls,
  sum(coalesce((metadata ->> 'units')::numeric, 0)) as units,
  sum(coalesce((metadata ->> 'cost_usd')::numeric, 0)) as usd,
  count(*) filter (where (metadata ->> 'cost_usd') is null) as unpriced_calls,

  -- How many of these dollars are an estimate standing in for a price we could not learn.
  count(*) filter (where metadata ->> 'price_basis' = 'ceiling') as estimated_calls,
  sum(coalesce((metadata ->> 'cost_usd')::numeric, 0))
    filter (where metadata ->> 'price_basis' = 'ceiling') as estimated_usd,

  -- Which rate cards this bucket spans. Two different values means a re-price happened inside it.
  min(metadata ->> 'price_rev') as price_rev_first,
  max(metadata ->> 'price_rev') as price_rev_last
from usage_events e
where metadata ? 'cost_usd' or metadata ? 'provider'
group by
  user_id,
  date_trunc('day', created_at)::date,
  coalesce(metadata ->> 'provider', event_type),
  metadata ->> 'operation',
  metadata ->> 'source_id',
  metadata ->> 'canvas_id',
  metadata ->> 'reason';

comment on view public.ai_spend_report is
  'Nemesis''s own AI bill, by learner, day, provider, operation and scope. `estimated_usd` is the part priced at a ceiling because the vendor would not say which model ran.';
