-- past_due stays entitled.
--
-- WHAT THIS CHANGES: `resolve_user_plan` accepted only 'active' and 'trialing'.
-- A subscriber whose renewal charge bounced is 'past_due' while Stripe retries
-- the card (its dunning window, a few days). The app code already treats that
-- window as entitled (subscriptionGrantsAccess in apps/web/lib/billing-contract.ts
-- and the nemesis-llm edge function), so the database was the one store that
-- cut people off the moment a card failed, before they had any chance to fix it.
--
-- Decision (2026-09-05): past_due is ENTITLED. This replaces the function with
-- the body from 20260818120000_one_paid_plan_nemesis.sql and changes only the
-- status list. When Stripe gives up, the subscription moves to 'canceled' or
-- 'unpaid', and neither of those is in the list, so access ends then.

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
        AND s.status IN ('active','trialing','past_due')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
      LIMIT 1
    )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.resolve_user_plan(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_user_plan(uuid) TO service_role;
