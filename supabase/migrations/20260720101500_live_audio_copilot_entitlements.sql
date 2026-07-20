-- Live audio copilot: bounded monthly audio allowances, post-margin-guard
-- rebalancing, and short-lived
-- AssemblyAI streaming reservations.
--
-- Cost boundary:
--   free       15 minutes / month (product demo)
--   plus       30 minutes / month
--   pro        90 minutes / month
--   max     4,000 minutes / month at the current $99 price
--
-- The browser never receives the AssemblyAI API key. A signed-in user reserves
-- at most a 15-minute provider window through a service-role-only RPC, and the
-- provider calls the authenticated webhook when that window closes. The webhook
-- reconciles the reservation down to elapsed wall-clock seconds. This bounds
-- worst-case spend even if a modified client skips UI-side timers.

BEGIN;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_check CHECK (
    plan IN ('free','plus','pro','max','student','professional','enterprise')
  );

INSERT INTO public.plans (code, name, active, sort_order)
VALUES ('max', 'Nemesis Max', true, 40)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    active = EXCLUDED.active,
    sort_order = EXCLUDED.sort_order;

INSERT INTO public.plan_entitlements (plan_code, entitlement_key, value_json) VALUES
  ('free',         'live_audio_seconds_month_limit',      '900'::jsonb),
  ('plus',         'live_audio_seconds_month_limit',     '1800'::jsonb),
  ('pro',          'live_audio_seconds_month_limit',     '5400'::jsonb),
  ('max',          'live_audio_seconds_month_limit',   '240000'::jsonb),
  ('professional', 'live_audio_seconds_month_limit',   '240000'::jsonb),
  ('enterprise',   'live_audio_seconds_month_limit',   '108000'::jsonb)
ON CONFLICT (plan_code, entitlement_key) DO UPDATE
SET value_json = EXCLUDED.value_json,
    updated_at = now();

-- Rebalance the final monthly ceilings after the earlier margin-guard migration.
-- At 100 subscribers per tier these preserve an approximately 80% gross margin
-- even if every token is charged at the model's output rate, every search hits
-- the paid provider, every audio second is used, the full $45 shared base is
-- allocated to that tier, and standard Stripe Payments + Billing fees apply.
-- Live insight calls consume the existing LLM budget too.
INSERT INTO public.plan_entitlements (plan_code, entitlement_key, value_json) VALUES
  ('plus',         'nemesis_llm_monthly_tokens',    '1900000'::jsonb),
  ('plus',         'nemesis_search_monthly_units',       '50'::jsonb),
  ('pro',          'nemesis_llm_monthly_tokens',    '2100000'::jsonb),
  ('pro',          'nemesis_search_monthly_units',       '75'::jsonb),
  ('max',          'nemesis_llm_monthly_tokens',    '5500000'::jsonb),
  ('max',          'nemesis_search_monthly_units',      '100'::jsonb),
  ('professional', 'nemesis_llm_monthly_tokens',    '5500000'::jsonb),
  ('professional', 'nemesis_search_monthly_units',      '100'::jsonb)
ON CONFLICT (plan_code, entitlement_key) DO UPDATE
SET value_json = EXCLUDED.value_json,
    updated_at = now();

CREATE TABLE IF NOT EXISTS public.live_audio_reservations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  surface text NOT NULL CHECK (surface IN ('sessions','notebook')),
  context_id text,
  plan text NOT NULL,
  counter_key text NOT NULL DEFAULT 'live_audio_seconds_month',
  period_start date NOT NULL,
  reserved_seconds integer NOT NULL CHECK (reserved_seconds >= 60),
  actual_seconds integer CHECK (actual_seconds >= 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','completed')),
  webhook_secret_hash text NOT NULL,
  provider_session_id text,
  transcript_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS live_audio_reservations_user_created_idx
  ON public.live_audio_reservations (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS live_audio_reservations_provider_session_uidx
  ON public.live_audio_reservations (provider_session_id)
  WHERE provider_session_id IS NOT NULL;

ALTER TABLE public.live_audio_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.live_audio_reservations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.live_audio_reservations TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_live_audio_window(
  p_user_id uuid,
  p_reservation_id uuid,
  p_webhook_secret_hash text,
  p_requested_seconds integer DEFAULT 900,
  p_surface text DEFAULT 'sessions',
  p_context_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan text;
  v_limit integer;
  v_used integer := 0;
  v_available integer;
  v_reserved integer;
  v_month_start date := date_trunc('month', current_date)::date;
  v_month_end date := (date_trunc('month', current_date) + interval '1 month')::date;
  v_counter_key text := 'live_audio_seconds_month';
BEGIN
  IF p_user_id IS NULL OR p_reservation_id IS NULL THEN
    RAISE EXCEPTION 'user and reservation id are required';
  END IF;
  IF p_webhook_secret_hash IS NULL OR length(p_webhook_secret_hash) < 32 THEN
    RAISE EXCEPTION 'webhook secret hash is required';
  END IF;
  IF p_surface NOT IN ('sessions','notebook') THEN
    RAISE EXCEPTION 'invalid live audio surface';
  END IF;

  v_plan := public.resolve_user_plan(p_user_id);
  v_limit := public.plan_entitlement_int(v_plan, 'live_audio_seconds_month_limit');
  IF v_limit IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'missing_entitlement', 'plan', v_plan,
      'used', 0, 'limit', null, 'reserved_seconds', 0
    );
  END IF;

  -- Serialize reservations for one account/month across serverless instances.
  PERFORM pg_advisory_xact_lock(
    hashtext(p_user_id::text),
    hashtext(v_counter_key || ':' || v_month_start::text)
  );

  SELECT COALESCE(used, 0)
    INTO v_used
  FROM public.usage_counters
  WHERE user_id = p_user_id
    AND counter_key = v_counter_key
    AND period_start = v_month_start;

  v_available := GREATEST(v_limit - COALESCE(v_used, 0), 0);
  v_reserved := LEAST(GREATEST(COALESCE(p_requested_seconds, 900), 60), 900, v_available);

  IF v_reserved < 60 THEN
    INSERT INTO public.entitlement_checks (
      user_id, entitlement_key, allowed, reason, plan, used, limit_value
    ) VALUES (
      p_user_id, 'live_audio_seconds_month_limit', false, 'quota_exceeded',
      v_plan, COALESCE(v_used, 0), v_limit
    );
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'quota_exceeded', 'plan', v_plan,
      'used', COALESCE(v_used, 0), 'limit', v_limit, 'reserved_seconds', 0
    );
  END IF;

  INSERT INTO public.usage_counters (
    user_id, counter_key, period_start, period_end, used, limit_snapshot
  ) VALUES (
    p_user_id, v_counter_key, v_month_start, v_month_end, v_reserved, v_limit
  )
  ON CONFLICT (user_id, counter_key, period_start) DO UPDATE
  SET used = public.usage_counters.used + EXCLUDED.used,
      limit_snapshot = EXCLUDED.limit_snapshot,
      period_end = EXCLUDED.period_end,
      updated_at = now();

  INSERT INTO public.live_audio_reservations (
    id, user_id, surface, context_id, plan, period_start,
    reserved_seconds, webhook_secret_hash
  ) VALUES (
    p_reservation_id, p_user_id, p_surface, NULLIF(btrim(p_context_id), ''),
    v_plan, v_month_start, v_reserved, p_webhook_secret_hash
  );

  INSERT INTO public.entitlement_checks (
    user_id, entitlement_key, allowed, reason, plan, used, limit_value
  ) VALUES (
    p_user_id, 'live_audio_seconds_month_limit', true, 'reserved',
    v_plan, COALESCE(v_used, 0) + v_reserved, v_limit
  );

  RETURN jsonb_build_object(
    'allowed', true, 'reason', 'reserved', 'plan', v_plan,
    'used', COALESCE(v_used, 0) + v_reserved, 'limit', v_limit,
    'reserved_seconds', v_reserved, 'reservation_id', p_reservation_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_live_audio_window(
  p_reservation_id uuid,
  p_webhook_secret_hash text,
  p_provider_session_id text DEFAULT NULL,
  p_transcript_text text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.live_audio_reservations%ROWTYPE;
  v_actual integer;
  v_refund integer;
BEGIN
  SELECT * INTO v_row
  FROM public.live_audio_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND OR v_row.webhook_secret_hash <> p_webhook_secret_hash THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_webhook');
  END IF;

  IF v_row.status = 'completed' THEN
    RETURN jsonb_build_object(
      'ok', true, 'reason', 'already_completed',
      'actual_seconds', v_row.actual_seconds
    );
  END IF;

  -- AssemblyAI bills open WebSocket time. The authenticated provider webhook
  -- arrives when the socket terminates, so server wall-clock time is the secure
  -- reconciliation source (slightly conservative because it includes setup).
  v_actual := LEAST(
    v_row.reserved_seconds,
    GREATEST(1, CEIL(EXTRACT(epoch FROM (now() - v_row.created_at)))::integer)
  );
  v_refund := GREATEST(v_row.reserved_seconds - v_actual, 0);

  PERFORM pg_advisory_xact_lock(
    hashtext(v_row.user_id::text),
    hashtext(v_row.counter_key || ':' || v_row.period_start::text)
  );

  IF v_refund > 0 THEN
    UPDATE public.usage_counters
    SET used = GREATEST(used - v_refund, 0),
        updated_at = now()
    WHERE user_id = v_row.user_id
      AND counter_key = v_row.counter_key
      AND period_start = v_row.period_start;
  END IF;

  UPDATE public.live_audio_reservations
  SET actual_seconds = v_actual,
      status = 'completed',
      provider_session_id = NULLIF(btrim(p_provider_session_id), ''),
      transcript_text = left(NULLIF(btrim(p_transcript_text), ''), 200000),
      completed_at = now()
  WHERE id = p_reservation_id;

  INSERT INTO public.usage_events (
    user_id, event_type, counter_key, cost_credits, metadata, period_start
  ) VALUES (
    v_row.user_id,
    'live_audio_completed',
    v_row.counter_key,
    GREATEST(v_actual, 1),
    jsonb_build_object(
      'reservation_id', p_reservation_id,
      'reserved_seconds', v_row.reserved_seconds,
      'actual_seconds', v_actual,
      'surface', v_row.surface
    ),
    v_row.period_start
  );

  RETURN jsonb_build_object(
    'ok', true, 'reason', 'completed',
    'actual_seconds', v_actual, 'refunded_seconds', v_refund
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_live_audio_window(uuid, uuid, text, integer, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_live_audio_window(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_live_audio_window(uuid, uuid, text, integer, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_live_audio_window(uuid, text, text, text)
  TO service_role;

COMMENT ON TABLE public.live_audio_reservations IS
  'Short provider windows that bound and reconcile live transcription cost.';
COMMENT ON FUNCTION public.reserve_live_audio_window(uuid, uuid, text, integer, text, text) IS
  'Atomically reserves up to 15 minutes from the signed-in user monthly live-audio allowance.';
COMMENT ON FUNCTION public.finalize_live_audio_window(uuid, text, text, text) IS
  'Provider-webhook reconciliation for a live-audio reservation; idempotent and service-role-only.';

COMMIT;
