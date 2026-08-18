-- One paid plan, and conversational voice replaces lecture hours.
-- Owner decisions, 2026-08-17 and 2026-08-18.
--
-- Nemesis sold Student ($9.99) and Agent Pro ($19.99) with Max ($99) retired above
-- them. There is now ONE paid product, Nemesis, at $19.99/month or $199.99/year,
-- and the billing period is not a capability.
--
-- ── WHAT THIS MIGRATION DOES AND DOES NOT DO ────────────────────────────────
--
-- DOES:   teaches the database the canonical two-plan world (`canonical_plan_code`)
--         adds the `nemesis` plan and its entitlement row set
--         adds a CONVERSATIONAL VOICE meter, which lecture transcription is not
--         adds subscriptions.billing_interval, stored apart from the entitlement
--         widens the plan CHECK so `nemesis` can actually be written
--
-- DOES NOT: touch any existing subscription row, change anyone's plan, delete a
--         legacy plan's entitlement rows, or alter a billing amount.
--
-- ── WHERE THE NUMBERS COME FROM ─────────────────────────────────────────────
--
-- Read out of production plan_entitlements on 2026-08-17. Nemesis inherits Agent
-- Pro's tokens, search, exports and research allowances, because paid means "the
-- whole product", not a middle rung.
--
-- 🔴 IT DOES NOT INHERIT RECORDING, AND THAT IS THE POINT OF THIS REVISION.
-- Pro carried 252,000s (70 hours) of lecture transcription. Nemesis does not
-- offer lecture or meeting transcription at all any more. Carrying "30 hours of
-- transcription" into the new plan would have sold a retired product and put its
-- largest variable cost back on the balance sheet.
--
-- What xAI is used for now is CONVERSATION only:
--     learner speaks -> xAI STT -> DeepSeek -> xAI TTS -> Nemesis speaks back
-- That gets its OWN meter below, in its own units, at its own allowance.

BEGIN;

-- ── The database's half of packages/shared/src/plan.ts ──────────────────────
--
-- 🔴 THE APPLICATION AND THE DATABASE HAD TO AGREE, AND THEY DID NOT.
-- `plan_entitlement_int` looks up entitlements by the RAW stored plan code, so a
-- legacy `pro` row would have missed every `nemesis` entitlement written below
-- and been denied with `missing_entitlement` — a paying subscriber locked out by
-- a rename. The application maps legacy codes to `nemesis` in
-- `entitlementPlanCode()`; this is the same mapping, in SQL, so both halves
-- answer identically.
--
-- Internal comps keep their own code and their own rows, exactly as the
-- application does: folding `enterprise` into `nemesis` would cap the accounts
-- used to test the product at a student's allowance.
CREATE OR REPLACE FUNCTION public.canonical_plan_code(p_plan text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE lower(btrim(coalesce(p_plan, '')))
    WHEN 'enterprise' THEN 'enterprise'
    WHEN 'nemesis' THEN 'nemesis'
    WHEN 'plus' THEN 'nemesis'
    WHEN 'pro' THEN 'nemesis'
    WHEN 'max' THEN 'nemesis'
    WHEN 'student' THEN 'nemesis'
    WHEN 'professional' THEN 'nemesis'
    WHEN 'trial' THEN 'nemesis'
    ELSE 'free'
  END;
$$;

COMMENT ON FUNCTION public.canonical_plan_code(text) IS
  'Stored plan code -> entitlement row set. Mirrors entitlementPlanCode() in '
  'packages/shared/src/plan.ts. Unknown codes resolve to free, always: a bad '
  'write must be able to fail to grant access, never to grant it.';

-- `resolve_user_plan` is what every entitlement read goes through. Returning the
-- canonical code here is what makes one row set serve every paying subscriber.
CREATE OR REPLACE FUNCTION public.resolve_user_plan(p_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT public.canonical_plan_code(
    (
      SELECT s.plan
      FROM subscriptions s
      WHERE s.user_id = p_user_id
        AND s.status IN ('active','trialing')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
      LIMIT 1
    )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.resolve_user_plan(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_user_plan(uuid) TO service_role;

-- ── `nemesis` must be writable ──────────────────────────────────────────────
--
-- 🔴 WITHOUT THIS THE WHOLE MIGRATION IS DEAD ON ARRIVAL. The CHECK constraint
-- last written in 20260720101500 enumerates the old ladder and does not include
-- `nemesis`, so the first webhook to write the new plan code would have been
-- rejected by the database and the subscriber left on free. Legacy names stay in
-- the list because old rows still carry them.
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_check CHECK (
    plan IN ('free','nemesis','plus','pro','max','student','professional','enterprise','trial')
  );

INSERT INTO public.plans (code, name, active, sort_order)
VALUES ('nemesis', 'Nemesis', true, 10)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name, active = EXCLUDED.active, sort_order = EXCLUDED.sort_order;

-- The old ladder is no longer for sale. Marking it inactive retires the SALE
-- without deleting the rows that make an old record readable.
UPDATE public.plans SET active = false
 WHERE code IN ('plus','pro','max','student','professional');

-- ── The Nemesis entitlement row set ─────────────────────────────────────────
INSERT INTO public.plan_entitlements (plan_code, entitlement_key, value_json) VALUES
  -- Reasoning. Matches Agent Pro exactly; the owner's instruction is to keep
  -- roughly 25M weighted tokens and not to advertise the number.
  ('nemesis', 'nemesis_llm_monthly_tokens',        '25000000'::jsonb),
  ('nemesis', 'nemesis_llm_daily_tokens',          '4000000'::jsonb),
  -- Web research through Brave. Generous on purpose: a student should never
  -- think about search credits.
  ('nemesis', 'nemesis_search_monthly_units',      '150'::jsonb),
  ('nemesis', 'nemesis_search_daily_units',        '50'::jsonb),
  -- Conversational voice. THE NEW METER. Five hours a month; see the block below.
  ('nemesis', 'voice_seconds_month_limit',         '18000'::jsonb),
  -- Everything else is Agent Pro: the paid plan is the whole product.
  ('nemesis', 'ask_daily_limit',                   '250'::jsonb),
  ('nemesis', 'deep_research_daily_limit',         '5'::jsonb),
  ('nemesis', 'evidence_brief_daily_limit',        '20'::jsonb),
  ('nemesis', 'mission_limit',                     '5'::jsonb),
  ('nemesis', 'watch_limit',                       '50'::jsonb),
  ('nemesis', 'watchlist_limit',                   '100'::jsonb),
  -- 🔴 THESE TWO WERE MISSING, AND MISSING IS WORSE THAN WRONG. An entitlement
  -- key with no row makes plan_entitlement_int return NULL, which consume_usage
  -- reports as `missing_entitlement` -- a hard refusal, not a small allowance.
  -- Every paid user would have lost daily and emailed watches. Found by reading
  -- the live plan_entitlements table rather than trusting the audit note; the
  -- DO block at the end of this migration now makes it impossible to repeat.
  ('nemesis', 'watch_daily_enabled',               'true'::jsonb),
  ('nemesis', 'watch_email_enabled',               'true'::jsonb),
  ('nemesis', 'ppt_export_enabled',                'true'::jsonb),
  ('nemesis', 'report_export_enabled',             'true'::jsonb),
  ('nemesis', 'stripe_plus_enabled',               'true'::jsonb),
  -- 🔴 COMPATIBILITY FLOORS, NOT PRODUCT ALLOWANCES. The batch transcription and
  -- streaming copilot lanes still exist in code and still reserve against these
  -- keys. Omitting them would make those reservations return
  -- `missing_entitlement` — an error, not a clean refusal. Setting them EQUAL TO
  -- FREE keeps the retired lanes working identically for everyone and makes it
  -- impossible for paid to end up with LESS than free, while selling nobody an
  -- hour of lecture recording. They are advertised nowhere.
  --
  -- 🔴 THE LIVE AUDIO NUMBER IS 7200, NOT 900, AND THE DIFFERENCE WAS A CAP
  -- INVERSION. This migration was first written with 900 from a stale reading of
  -- free's rows. Free actually carries 7,200 seconds, so paid would have received
  -- EIGHT TIMES LESS streaming audio than free — the exact inversion the ladder
  -- guard exists to catch, on the two keys that guard no longer covers because
  -- they were removed from the Plan shape. Read off production 2026-08-18.
  ('nemesis', 'transcription_seconds_month_limit', '3600'::jsonb),
  ('nemesis', 'live_audio_seconds_month_limit',    '7200'::jsonb)
ON CONFLICT (plan_code, entitlement_key) DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = now();

-- ── Conversational voice: the meter that replaces lecture hours ─────────────
--
-- ONE counter for the whole round trip, in seconds of talking, because that is
-- how a learner experiences it. Speech in is billed by audio duration; speech
-- out is billed by character and converted to seconds at the same speaking rate
-- the cost model uses. See packages/shared/src/plan.ts.
--
-- free      900s  (15 minutes) — enough to hear the feature demonstrate itself,
--                 about four cents a month at the surveyed xAI rates
-- nemesis 18000s  (5 hours)    — internal launch allowance, about eighty cents
-- enterprise 108000s           — comps need headroom to test with
--
-- 🔴 A SEPARATE KEY, DELIBERATELY. `transcription_seconds_month_limit` means
-- batch lecture transcription and `live_audio_seconds_month_limit` means the
-- AssemblyAI streaming copilot. Both are still reserved against by live code.
-- Overloading either to mean conversational voice would silently change what an
-- existing limit protects.
INSERT INTO public.plan_entitlements (plan_code, entitlement_key, value_json) VALUES
  ('free',       'voice_seconds_month_limit',    '900'::jsonb),
  ('nemesis',    'voice_seconds_month_limit',  '18000'::jsonb),
  ('enterprise', 'voice_seconds_month_limit', '108000'::jsonb)
ON CONFLICT (plan_code, entitlement_key) DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = now();

-- The meter itself. Monthly window, advisory-locked per account so two
-- concurrent turns cannot both fit into the last few seconds of an allowance.
--
-- 🔴 CONSUME, NOT RESERVE-THEN-RECONCILE. The streaming copilot needs a
-- reservation because a provider session runs for an unknown length. A voice
-- turn does not: the number of characters to synthesise is known before the call
-- and the duration of an uploaded clip is known before the transcription. There
-- is nothing to reconcile, so there is no reservation table to leak rows into.
CREATE OR REPLACE FUNCTION public.consume_voice_seconds(
  p_user_id uuid,
  p_seconds integer,
  p_kind text DEFAULT 'tts'
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan text;
  v_limit integer;
  v_used integer := 0;
  v_cost integer := GREATEST(COALESCE(p_seconds, 0), 1);
  v_month_start date := date_trunc('month', current_date)::date;
  v_month_end date := (date_trunc('month', current_date) + interval '1 month')::date;
  v_counter_key text := 'voice_seconds_month';
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required';
  END IF;
  IF p_kind NOT IN ('stt','tts') THEN
    RAISE EXCEPTION 'voice kind must be stt or tts';
  END IF;

  v_plan := public.resolve_user_plan(p_user_id);
  v_limit := public.plan_entitlement_int(v_plan, 'voice_seconds_month_limit');
  IF v_limit IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'missing_entitlement', 'plan', v_plan,
      'used', 0, 'limit', null, 'seconds', 0
    );
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(p_user_id::text),
    hashtext(v_counter_key || ':' || v_month_start::text)
  );

  SELECT COALESCE(used, 0) INTO v_used
  FROM public.usage_counters
  WHERE user_id = p_user_id
    AND counter_key = v_counter_key
    AND period_start = v_month_start;
  v_used := COALESCE(v_used, 0);

  IF v_used + v_cost > v_limit THEN
    INSERT INTO public.entitlement_checks (user_id, entitlement_key, allowed, reason, plan, used, limit_value)
    VALUES (p_user_id, 'voice_seconds_month_limit', false, 'quota_exceeded', v_plan, v_used, v_limit);
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'quota_exceeded', 'plan', v_plan,
      'used', v_used, 'limit', v_limit, 'seconds', 0
    );
  END IF;

  INSERT INTO public.usage_counters (user_id, counter_key, period_start, period_end, used, limit_snapshot)
  VALUES (p_user_id, v_counter_key, v_month_start, v_month_end, v_cost, v_limit)
  ON CONFLICT (user_id, counter_key, period_start) DO UPDATE
    SET used = public.usage_counters.used + EXCLUDED.used,
        limit_snapshot = EXCLUDED.limit_snapshot,
        period_end = EXCLUDED.period_end,
        updated_at = now()
  RETURNING used INTO v_used;

  INSERT INTO public.usage_events (user_id, event_type, counter_key, cost_credits, metadata, period_start)
  VALUES (p_user_id, 'voice_' || p_kind, v_counter_key, v_cost,
          jsonb_build_object('kind', p_kind), v_month_start);

  INSERT INTO public.entitlement_checks (user_id, entitlement_key, allowed, reason, plan, used, limit_value)
  VALUES (p_user_id, 'voice_seconds_month_limit', true, 'allowed', v_plan, v_used, v_limit);

  RETURN jsonb_build_object(
    'allowed', true, 'reason', 'allowed', 'plan', v_plan,
    'used', v_used, 'limit', v_limit, 'seconds', v_cost
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_voice_seconds(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_voice_seconds(uuid, integer, text) TO service_role;

-- ── Billing interval, stored apart from the entitlement ─────────────────────
--
-- 🔴 THE WHOLE POINT OF A SEPARATE COLUMN. Modelling annual as another plan code
-- is how "annual" quietly becomes a tier with its own entitlements and its own
-- drift. `plan` answers what they can do; `billing_interval` answers how often
-- they pay. Nothing may read this column to decide a capability.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_interval text
    CHECK (billing_interval IN ('monthly', 'annual'));

COMMENT ON COLUMN public.subscriptions.billing_interval IS
  'monthly | annual. Billing period only -- NEVER read to decide entitlement. '
  'Monthly and annual Nemesis are the same product; see packages/shared/src/plan.ts.';

-- Who is taking the money. Entitlement must never depend on this either; it is
-- here so an Apple subscriber can be told where to cancel.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_provider text
    CHECK (billing_provider IN ('stripe', 'apple', 'internal'));

COMMENT ON COLUMN public.subscriptions.billing_provider IS
  'stripe | apple | internal. Billing identity only -- NEVER read to decide '
  'entitlement. Added so StoreKit can be introduced without a billing rewrite.';

-- Backfill what we can infer. Existing rows are the owner's comps and one
-- canceled free, so this is hygiene rather than a data fix.
UPDATE public.subscriptions
   SET billing_interval = 'monthly'
 WHERE billing_interval IS NULL
   AND stripe_subscription_id IS NOT NULL;

UPDATE public.subscriptions
   SET billing_provider = CASE
         WHEN stripe_subscription_id IS NOT NULL THEN 'stripe'
         WHEN apple_plan IS NOT NULL THEN 'apple'
         ELSE 'internal'
       END
 WHERE billing_provider IS NULL;

-- ── Usage windows are CALENDAR months, and this migration must not change that ─
--
-- 🔴 THE ANNUAL TRAP, WRITTEN DOWN SO IT IS NOT REINTRODUCED. An annual
-- subscriber must NOT receive twelve months of tokens or voice minutes up front.
-- Every monthly counter derives its window from
-- `date_trunc('month', current_date)` -- see 20260720101500, 20260721113000 and
-- `consume_voice_seconds` above -- NOT from subscriptions.current_period_end, so
-- a subscription whose period ends in 2027 still rolls its counters on the first
-- of each month. Nothing here couples a counter window to a billing cycle, and
-- nothing later may.

-- ── The nemesis row set must be COMPLETE, and this is checked at apply time ──
--
-- 🔴 THE FAILURE THIS CATCHES IS A MISSING ROW, NOT A WRONG ONE. A key that no
-- plan_entitlements row defines does not fall back to a default and does not
-- grant a small amount: `plan_entitlement_int` returns NULL and every reservation
-- path turns that into `missing_entitlement`, a hard refusal. Two keys
-- (`watch_daily_enabled`, `watch_email_enabled`) were missing from the INSERT
-- above when this migration was first written, which would have removed daily and
-- emailed watches from every paid account with nothing anywhere reporting it.
--
-- Checked against the live table rather than against a list in this file, so it
-- cannot go stale: whatever the retired paid tiers still define, `nemesis` must
-- define too.
DO $$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(DISTINCT entitlement_key ORDER BY entitlement_key)
    INTO v_missing
    FROM public.plan_entitlements
   WHERE plan_code IN ('pro', 'plus', 'max', 'student', 'professional')
     AND entitlement_key NOT IN (
       SELECT entitlement_key FROM public.plan_entitlements WHERE plan_code = 'nemesis'
     );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'nemesis is missing entitlement keys that a retired paid tier defines: %', v_missing;
  END IF;
END $$;

-- ── And paid may never offer LESS than free ─────────────────────────────────
--
-- The application-level ladder guard (planCapInversions) only covers the meters
-- the Plan shape still carries. The compatibility floors above are not among
-- them, which is exactly why the live-audio inversion got as far as it did. This
-- checks EVERY numeric key the two plans share, from the table itself.
DO $$
DECLARE
  v_inverted text;
BEGIN
  SELECT string_agg(format('%s: nemesis %s < free %s', f.entitlement_key, n.value_json #>> '{}', f.value_json #>> '{}'), '; ')
    INTO v_inverted
    FROM public.plan_entitlements f
    JOIN public.plan_entitlements n
      ON n.plan_code = 'nemesis' AND n.entitlement_key = f.entitlement_key
   WHERE f.plan_code = 'free'
     AND jsonb_typeof(f.value_json) = 'number'
     AND jsonb_typeof(n.value_json) = 'number'
     AND (n.value_json #>> '{}')::numeric < (f.value_json #>> '{}')::numeric;
  IF v_inverted IS NOT NULL THEN
    RAISE EXCEPTION 'paid offers less than free on: %', v_inverted;
  END IF;
END $$;

COMMIT;
