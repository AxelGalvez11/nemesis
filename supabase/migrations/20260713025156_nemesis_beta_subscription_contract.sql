-- Stripe object IDs are scoped to test or live mode. Record the mode so a
-- later paid-beta cutover never sends a test customer ID to the live API.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_livemode boolean,
  ADD COLUMN IF NOT EXISTS trial_end timestamptz;

-- Production is verified to be on Stripe test mode before this migration.
UPDATE public.subscriptions
SET stripe_livemode = false
WHERE stripe_customer_id IS NOT NULL
  AND stripe_livemode IS NULL;

-- Canonicalize the one legacy alias that has no plan-catalog/entitlement row.
UPDATE public.subscriptions
SET plan = 'plus'
WHERE plan = 'student';

-- Keep internal plan codes stable while exposing Nemesis names in the catalog.
UPDATE public.plans
SET name = CASE code
  WHEN 'plus' THEN 'Nemesis Student'
  WHEN 'pro' THEN 'Nemesis Agent Pro'
  WHEN 'max' THEN 'Nemesis Max'
  ELSE name
END
WHERE code IN ('plus', 'pro', 'max');

-- Optional top tier: make sure a 'max' plan row exists so entitlement resolution
-- has a target when STRIPE_MAX_PRICE_ID is configured. No-op on reruns.
INSERT INTO public.plans (code, name, active, sort_order)
VALUES ('max', 'Nemesis Max', true, 3)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

-- A past-due subscription remains in its Stripe grace period only until the
-- recorded paid-through date. This helper remains service-role-only below.
CREATE OR REPLACE FUNCTION public.resolve_user_plan(p_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT s.plan
      FROM public.subscriptions s
      WHERE s.user_id = p_user_id
        AND s.stripe_livemode IS TRUE
        AND (
          (
            s.status IN ('active','trialing')
            AND s.current_period_end IS NOT NULL
            AND s.current_period_end > now()
          )
          OR (
            s.status = 'past_due'
            AND s.current_period_end IS NOT NULL
            AND s.current_period_end > now()
          )
        )
      LIMIT 1
    ),
    'free'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_user_plan(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_user_plan(uuid) TO service_role;

-- Serialize Checkout creation per user across serverless instances. The route
-- holds this short lease only while it reconciles/creates a Stripe session.
CREATE TABLE IF NOT EXISTS public.stripe_checkout_locks (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  lock_token uuid NOT NULL,
  locked_until timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_checkout_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stripe_checkout_locks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.stripe_checkout_locks TO service_role;

CREATE OR REPLACE FUNCTION public.claim_stripe_checkout_lock(
  p_user_id uuid,
  p_lock_token uuid,
  p_ttl_seconds integer DEFAULT 90
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claimed boolean;
BEGIN
  INSERT INTO public.stripe_checkout_locks (user_id, lock_token, locked_until, updated_at)
  VALUES (
    p_user_id,
    p_lock_token,
    now() + make_interval(secs => greatest(15, least(p_ttl_seconds, 300))),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET lock_token = EXCLUDED.lock_token,
        locked_until = EXCLUDED.locked_until,
        updated_at = now()
    WHERE public.stripe_checkout_locks.locked_until <= now()
       OR public.stripe_checkout_locks.lock_token = p_lock_token
  RETURNING true INTO v_claimed;

  RETURN COALESCE(v_claimed, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_stripe_checkout_lock(
  p_user_id uuid,
  p_lock_token uuid
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.stripe_checkout_locks
  WHERE user_id = p_user_id
    AND lock_token = p_lock_token;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_stripe_checkout_lock(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_stripe_checkout_lock(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_checkout_lock(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_stripe_checkout_lock(uuid, uuid) TO service_role;
