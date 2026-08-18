-- One paid plan (owner decision, 2026-08-17).
--
-- Nemesis sold Student ($9.99) and Agent Pro ($19.99) with Max ($99) retired above
-- them. There is now ONE paid product, Nemesis, at $19/month or $96/year, and the
-- billing period is not a capability.
--
-- ── WHAT THIS MIGRATION DOES AND DOES NOT DO ────────────────────────────────
--
-- DOES:   adds the `nemesis` row set to plan_entitlements
--         adds subscriptions.billing_interval so the period is stored separately
--         from the entitlement
--
-- DOES NOT: touch any existing subscription row, change anyone's plan, delete a
--         legacy plan's entitlement rows, or alter a billing amount. Legacy rows
--         are READ by packages/shared/src/plan.ts and mapped to `nemesis` in the
--         application; deleting them here would downgrade anyone still carrying
--         one the moment a webhook wrote it back.
--
-- ── WHERE THE NUMBERS COME FROM ─────────────────────────────────────────────
--
-- Read out of production plan_entitlements on 2026-08-17. Nemesis inherits Agent
-- Pro's tokens, search, exports and research allowances, because the owner's
-- instruction is that paid means "the whole product", not a middle rung.
--
-- 🔴 RECORDING IS THE ONE PLACE NEMESIS DOES **NOT** INHERIT PRO, AND THAT IS
-- DELIBERATE. Pro carried 252,000s (70 hours) at $19.99. Transcription is the
-- largest single variable cost in the product, and the owner's instruction was
-- explicit: do not hand the new $19 plan the 70-hour allowance merely because Pro
-- had it. Nemesis gets 108,000s — 30 hours, which is Student's allowance — and 30
-- included lecture hours at $19 is already well ahead of the market.
--
-- The live-audio copilot lane is held at Student's 72,000s (20 hours) rather than
-- Pro's 300,000s. It is a STREAMING lane and costs materially more per hour than
-- the batch transcription lane, so the two are set independently on purpose.
--
-- 🔴 THESE ARE ROWS, NOT CODE. Changing what a recording hour allowance is later
-- is an UPDATE against this table, not a billing rewrite — which is what makes a
-- future "+10 recording hours" add-on a data change plus a checkout line, rather
-- than a new tier.
--
-- FREE IS UNCHANGED. Verified in production the same day: 1,000,000 monthly
-- tokens and 3,600 transcription seconds. An earlier audit had found 2,000,000
-- tokens; that reduction has already landed. Nothing here re-touches it.

-- ── The Nemesis entitlement row set ─────────────────────────────────────────
INSERT INTO plan_entitlements (plan_code, entitlement_key, value_json) VALUES
  -- Reasoning. Matches Agent Pro exactly.
  ('nemesis', 'nemesis_llm_monthly_tokens',        '25000000'::jsonb),
  ('nemesis', 'nemesis_llm_daily_tokens',          '4000000'::jsonb),
  -- Web research through Brave. Matches Agent Pro.
  ('nemesis', 'nemesis_search_monthly_units',      '150'::jsonb),
  ('nemesis', 'nemesis_search_daily_units',        '50'::jsonb),
  -- Recording. Student's 30 hours, NOT Pro's 70. See the note above.
  ('nemesis', 'transcription_seconds_month_limit', '108000'::jsonb),
  ('nemesis', 'live_audio_seconds_month_limit',    '72000'::jsonb),
  -- Everything else is Agent Pro: the paid plan is the whole product.
  ('nemesis', 'ask_daily_limit',                   '250'::jsonb),
  ('nemesis', 'deep_research_daily_limit',         '5'::jsonb),
  ('nemesis', 'evidence_brief_daily_limit',        '20'::jsonb),
  ('nemesis', 'mission_limit',                     '5'::jsonb),
  ('nemesis', 'watch_limit',                       '50'::jsonb),
  ('nemesis', 'watchlist_limit',                   '100'::jsonb),
  ('nemesis', 'ppt_export_enabled',                'true'::jsonb),
  ('nemesis', 'report_export_enabled',             'true'::jsonb),
  ('nemesis', 'stripe_plus_enabled',               'true'::jsonb)
ON CONFLICT (plan_code, entitlement_key) DO UPDATE
  SET value_json = EXCLUDED.value_json;

-- ── Billing interval, stored apart from the entitlement ─────────────────────
--
-- 🔴 THE WHOLE POINT OF A SEPARATE COLUMN. Modelling annual as another plan code
-- is how "annual" quietly becomes a tier with its own entitlements and its own
-- drift. `plan` answers what they can do; `billing_interval` answers how often
-- they pay. Nothing may read this column to decide a capability.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS billing_interval text
    CHECK (billing_interval IN ('monthly', 'annual'));

COMMENT ON COLUMN subscriptions.billing_interval IS
  'monthly | annual. Billing period only -- NEVER read to decide entitlement. '
  'Monthly and annual Nemesis are the same product; see packages/shared/src/plan.ts.';

-- Backfill what we can infer. Existing rows are the owner's comps and one
-- canceled free, so this is hygiene rather than a data fix.
UPDATE subscriptions
   SET billing_interval = 'monthly'
 WHERE billing_interval IS NULL
   AND stripe_subscription_id IS NOT NULL;

-- ── Usage windows are CALENDAR months, and this migration must not change that ─
--
-- 🔴 THE ANNUAL TRAP, WRITTEN DOWN SO IT IS NOT REINTRODUCED. An annual
-- subscriber must NOT receive twelve months of tokens or recording hours up
-- front. Every monthly counter derives its window from
-- `date_trunc('month', current_date)` -- see 20260720101500 and 20260721113000 --
-- NOT from subscriptions.current_period_end, so a subscription whose period ends
-- in 2027 still rolls its counters on the first of each month. That is already
-- correct and is asserted by tests; nothing here couples a counter window to a
-- billing cycle, and nothing later may.
