-- 0122 — MVP web beta entitlements, usage, and Stripe Plus.
--
-- Public beta defaults:
--   Free: 10 Ask/day, 3 watchlist follows
--   Plus: 100 Ask/day, 50 watchlist follows
--
-- Security boundary:
--   * /ask consumes usage through consume_usage() before LLM work.
--   * watchlist_items is still a direct PostgREST write path, so a trigger enforces
--     the per-plan follow cap even if a caller bypasses the client.
--   * Stripe writes subscriptions through service-role API routes/webhooks only.

-- ---------------------------------------------------------------------------
-- 1. Subscription shape: keep RevenueCat columns, add Stripe mirror columns.
-- ---------------------------------------------------------------------------

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_check CHECK (
    plan IN ('free','plus','pro','student','professional','enterprise')
  );

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS stripe_status text;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_customer_uidx
  ON subscriptions (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_subscription_uidx
  ON subscriptions (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Plan catalog + entitlement matrix.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS plans (
  code text PRIMARY KEY,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_entitlements (
  plan_code text NOT NULL REFERENCES plans(code) ON DELETE CASCADE,
  entitlement_key text NOT NULL,
  value_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_code, entitlement_key)
);

INSERT INTO plans (code, name, active, sort_order)
VALUES
  ('free', 'Free', true, 10),
  ('plus', 'Plus', true, 20),
  ('pro', 'Pro', true, 30),
  ('professional', 'Professional', true, 40),
  ('enterprise', 'Enterprise', true, 50)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    active = EXCLUDED.active,
    sort_order = EXCLUDED.sort_order;

INSERT INTO plan_entitlements (plan_code, entitlement_key, value_json)
VALUES
  ('free', 'ask_daily_limit', '10'::jsonb),
  ('free', 'watchlist_limit', '3'::jsonb),
  ('free', 'stripe_plus_enabled', 'false'::jsonb),
  ('plus', 'ask_daily_limit', '100'::jsonb),
  ('plus', 'watchlist_limit', '50'::jsonb),
  ('plus', 'stripe_plus_enabled', 'true'::jsonb),
  ('pro', 'ask_daily_limit', '250'::jsonb),
  ('pro', 'watchlist_limit', '100'::jsonb),
  ('pro', 'stripe_plus_enabled', 'true'::jsonb),
  ('professional', 'ask_daily_limit', '500'::jsonb),
  ('professional', 'watchlist_limit', '250'::jsonb),
  ('professional', 'stripe_plus_enabled', 'true'::jsonb),
  ('enterprise', 'ask_daily_limit', '1000'::jsonb),
  ('enterprise', 'watchlist_limit', '500'::jsonb),
  ('enterprise', 'stripe_plus_enabled', 'true'::jsonb)
ON CONFLICT (plan_code, entitlement_key) DO UPDATE
SET value_json = EXCLUDED.value_json,
    updated_at = now();

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_read_authenticated ON plans;
CREATE POLICY plans_read_authenticated ON plans FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS plan_entitlements_read_authenticated ON plan_entitlements;
CREATE POLICY plan_entitlements_read_authenticated ON plan_entitlements FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 3. Usage counters + audit rows.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  counter_key text NOT NULL,
  cost_credits int NOT NULL DEFAULT 1 CHECK (cost_credits > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  period_start date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_events_user_created_idx ON usage_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS usage_counters (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  counter_key text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  used int NOT NULL DEFAULT 0 CHECK (used >= 0),
  limit_snapshot int,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, counter_key, period_start)
);

CREATE TABLE IF NOT EXISTS entitlement_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entitlement_key text NOT NULL,
  allowed boolean NOT NULL,
  reason text NOT NULL,
  plan text NOT NULL,
  used int,
  limit_value int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entitlement_checks_user_created_idx
  ON entitlement_checks (user_id, created_at DESC);

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlement_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usage_events_read_own ON usage_events;
CREATE POLICY usage_events_read_own ON usage_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS usage_counters_read_own ON usage_counters;
CREATE POLICY usage_counters_read_own ON usage_counters FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS entitlement_checks_read_own ON entitlement_checks;
CREATE POLICY entitlement_checks_read_own ON entitlement_checks FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Entitlement helpers.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_user_plan(p_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(
    (
      SELECT s.plan
      FROM subscriptions s
      WHERE s.user_id = p_user_id
        AND s.status IN ('active','trialing')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
      LIMIT 1
    ),
    'free'
  );
$$;

CREATE OR REPLACE FUNCTION public.plan_entitlement_int(p_plan text, p_key text)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT NULLIF(pe.value_json #>> '{}', '')::int
  FROM plan_entitlements pe
  WHERE pe.plan_code = p_plan
    AND pe.entitlement_key = p_key
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_entitlements()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_plan text;
  v_entitlements jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_plan := public.resolve_user_plan(v_uid);

  SELECT COALESCE(jsonb_object_agg(entitlement_key, value_json), '{}'::jsonb)
    INTO v_entitlements
  FROM plan_entitlements
  WHERE plan_code = v_plan;

  RETURN jsonb_build_object(
    'plan', v_plan,
    'entitlements', COALESCE(v_entitlements, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_usage()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_plan text;
  v_today date := current_date;
  v_ask_limit int;
  v_ask_used int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_plan := public.resolve_user_plan(v_uid);
  v_ask_limit := public.plan_entitlement_int(v_plan, 'ask_daily_limit');

  SELECT COALESCE(used, 0)
    INTO v_ask_used
  FROM usage_counters
  WHERE user_id = v_uid
    AND counter_key = 'ask_daily'
    AND period_start = v_today;

  RETURN jsonb_build_object(
    'plan', v_plan,
    'counters', jsonb_build_object(
      'ask_daily', jsonb_build_object(
        'used', COALESCE(v_ask_used, 0),
        'limit', v_ask_limit,
        'period_start', v_today,
        'period_end', v_today + 1
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_usage(
  p_user_id uuid,
  p_counter_key text,
  p_cost int DEFAULT 1,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cost int := GREATEST(COALESCE(p_cost, 1), 1);
  v_today date := current_date;
  v_period_end date := current_date + 1;
  v_plan text;
  v_limit int;
  v_used int;
  v_entitlement_key text;
  v_reason text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required';
  END IF;
  IF p_counter_key IS NULL OR btrim(p_counter_key) = '' THEN
    RAISE EXCEPTION 'p_counter_key required';
  END IF;

  v_entitlement_key := p_counter_key || '_limit';
  v_plan := public.resolve_user_plan(p_user_id);
  v_limit := public.plan_entitlement_int(v_plan, v_entitlement_key);

  IF v_limit IS NULL THEN
    v_reason := 'missing_entitlement';
    INSERT INTO entitlement_checks (user_id, entitlement_key, allowed, reason, plan)
    VALUES (p_user_id, v_entitlement_key, false, v_reason, v_plan);
    RETURN jsonb_build_object(
      'allowed', false, 'reason', v_reason, 'plan', v_plan,
      'counter_key', p_counter_key, 'used', 0, 'limit', null
    );
  END IF;

  INSERT INTO usage_counters (user_id, counter_key, period_start, period_end, used, limit_snapshot)
  VALUES (p_user_id, p_counter_key, v_today, v_period_end, v_cost, v_limit)
  ON CONFLICT (user_id, counter_key, period_start) DO UPDATE
    SET used = usage_counters.used + EXCLUDED.used,
        limit_snapshot = EXCLUDED.limit_snapshot,
        period_end = EXCLUDED.period_end,
        updated_at = now()
    WHERE usage_counters.used + EXCLUDED.used <= EXCLUDED.limit_snapshot
  RETURNING used INTO v_used;

  IF v_used IS NULL THEN
    SELECT used INTO v_used
    FROM usage_counters
    WHERE user_id = p_user_id
      AND counter_key = p_counter_key
      AND period_start = v_today;

    v_reason := 'quota_exceeded';
    INSERT INTO entitlement_checks (user_id, entitlement_key, allowed, reason, plan, used, limit_value)
    VALUES (p_user_id, v_entitlement_key, false, v_reason, v_plan, COALESCE(v_used, 0), v_limit);

    RETURN jsonb_build_object(
      'allowed', false, 'reason', v_reason, 'plan', v_plan,
      'counter_key', p_counter_key, 'used', COALESCE(v_used, 0), 'limit', v_limit
    );
  END IF;

  INSERT INTO usage_events (user_id, event_type, counter_key, cost_credits, metadata, period_start)
  VALUES (p_user_id, p_counter_key, p_counter_key, v_cost, COALESCE(p_metadata, '{}'::jsonb), v_today);

  INSERT INTO entitlement_checks (user_id, entitlement_key, allowed, reason, plan, used, limit_value)
  VALUES (p_user_id, v_entitlement_key, true, 'allowed', v_plan, v_used, v_limit);

  RETURN jsonb_build_object(
    'allowed', true, 'reason', 'allowed', 'plan', v_plan,
    'counter_key', p_counter_key, 'used', v_used, 'limit', v_limit
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_user_plan(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_user_plan(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.plan_entitlement_int(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plan_entitlement_int(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.consume_usage(uuid, text, int, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_usage(uuid, text, int, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_my_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_entitlements() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_my_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_usage() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Direct watchlist-write enforcement.
-- ---------------------------------------------------------------------------

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, item_type, item_ref
           ORDER BY created_at ASC NULLS LAST, id ASC
         ) AS rn
  FROM watchlist_items
)
DELETE FROM watchlist_items w
USING ranked r
WHERE w.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS watchlist_items_user_item_uidx
  ON watchlist_items (user_id, item_type, item_ref);

CREATE OR REPLACE FUNCTION public.enforce_watchlist_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_plan text;
  v_limit int;
  v_count int;
BEGIN
  v_plan := public.resolve_user_plan(NEW.user_id);
  v_limit := public.plan_entitlement_int(v_plan, 'watchlist_limit');
  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'watchlist entitlement missing';
  END IF;

  SELECT count(*) INTO v_count
  FROM watchlist_items
  WHERE user_id = NEW.user_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'watchlist_limit_exceeded: plan %, used %, limit %', v_plan, v_count, v_limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS watchlist_limit_before_insert ON watchlist_items;
CREATE TRIGGER watchlist_limit_before_insert
  BEFORE INSERT ON watchlist_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_watchlist_limit();

REVOKE EXECUTE ON FUNCTION public.enforce_watchlist_limit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_watchlist_limit() TO service_role;

COMMENT ON FUNCTION public.consume_usage(uuid, text, int, jsonb) IS
  'Service-role usage consumer for MVP entitlements. /ask calls this before LLM work for ask_daily.';
COMMENT ON FUNCTION public.get_my_entitlements() IS
  'Authenticated user-facing plan + entitlement map for web/mobile clients.';
COMMENT ON FUNCTION public.get_my_usage() IS
  'Authenticated user-facing daily usage counters.';
