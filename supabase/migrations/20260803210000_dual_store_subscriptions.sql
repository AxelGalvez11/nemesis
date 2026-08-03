-- Dual-store subscriptions (owner decision 2026-08-03: "the higher plan wins").
--
-- Build 27 adds Apple in-app purchases next to the existing Stripe billing, so
-- one student can hold subscriptions in BOTH stores. Each store now owns its
-- own column and `plan` — the only column the edge functions read — is always
-- computed as the best of the two (packages/shared/src/entitlements.ts
-- effectivePlan). Readers change nowhere; last-webhook-wins races die here.
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_plan text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS apple_plan text;

-- Every existing paid row came from Stripe (Apple selling starts with Build
-- 27), so Stripe inherits today's plan as its contribution.
UPDATE public.subscriptions SET stripe_plan = plan WHERE stripe_plan IS NULL;
