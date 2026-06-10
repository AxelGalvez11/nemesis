-- 0127 — Fix consume_usage zero-limit leak (Pro-gate correctness).
--
-- BUG (introduced in 0122): the quota guard
--   WHERE usage_counters.used + EXCLUDED.used <= EXCLUDED.limit_snapshot
-- lives ONLY on the ON CONFLICT DO UPDATE branch. A user's FIRST call of the day
-- for a given counter has no existing row, so it takes the plain INSERT path, which
-- is unguarded: it inserts used=1 against limit=0 and RETURNING sets v_used=1, so the
-- function returns allowed:true. The SECOND call (now a conflict) is correctly denied.
--
-- Net effect: any zero-limit counter leaks exactly ONE allowed call per day. This is
-- invisible for ask_daily (limit 10) but breaks the Deep Research Pro gate: free/plus
-- have deep_research_daily_limit = 0, yet each gets 1 free (expensive) run/day instead
-- of 0. More generally, any first call whose cost already exceeds the limit leaks.
--
-- FIX: an early deterministic guard — if the requested cost alone exceeds the limit,
-- deny before any INSERT. Behavior-neutral for every real call (cost 1 <= ask 10 / pro 3);
-- it only fires when a single unit cannot fit (limit 0, or cost > limit). Idempotent
-- CREATE OR REPLACE; the body is 0122's verbatim plus the new guard. Grants unchanged.
--
-- Depends on 0122 (consume_usage, resolve_user_plan, plan_entitlement_int, the
-- usage_counters / usage_events / entitlement_checks tables) and 0123
-- (deep_research_daily_limit entitlements).

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

  -- Early guard: if the requested cost alone cannot fit under the limit, deny before
  -- any INSERT. Closes the first-call-of-day leak on the plain INSERT path below
  -- (the WHERE guard there only protects the ON CONFLICT DO UPDATE branch).
  IF v_cost > v_limit THEN
    v_reason := 'quota_exceeded';
    INSERT INTO entitlement_checks (user_id, entitlement_key, allowed, reason, plan, used, limit_value)
    VALUES (p_user_id, v_entitlement_key, false, v_reason, v_plan, 0, v_limit);
    RETURN jsonb_build_object(
      'allowed', false, 'reason', v_reason, 'plan', v_plan,
      'counter_key', p_counter_key, 'used', 0, 'limit', v_limit
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

REVOKE EXECUTE ON FUNCTION public.consume_usage(uuid, text, int, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_usage(uuid, text, int, jsonb) TO service_role;

COMMENT ON FUNCTION public.consume_usage(uuid, text, int, jsonb) IS
  'Atomically meter + gate a usage counter against the user''s plan entitlement. '
  'Returns {allowed, reason, plan, counter_key, used, limit}. Denies up front when the '
  'requested cost exceeds the limit (fixes the 0127 zero-limit first-call leak).';
