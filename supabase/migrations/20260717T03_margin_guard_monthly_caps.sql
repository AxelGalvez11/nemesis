-- Margin guard: monthly ceilings behind the daily caps (2026-07-17).
--
-- NOT YET APPLIED — applying this migration is owner-gated. Reconcile the filename to
-- the remote-recorded version when applied via the Supabase apply_migration path
-- (precedent: 20260615183052_add_openalex_provider.sql).
--
-- WHY: unit-economics review found that a user maxing the DAILY caps every day is
-- unprofitable, driven mostly by search (no cache discount → daily_cap × 30 cost).
-- The daily search caps were already cut (Move 1, data-only). This adds the MONTHLY
-- wall the functions now read (nemesis-llm 'nemesis_llm_monthly_tokens' +
-- 'nemesis_llm_tokens_month' counter; nemesis-search 'nemesis_search_monthly_units' +
-- 'nemesis_search_units_month' counter). With these, even a fully-maxed or adversarial
-- user stays break-even-or-better on every plan (worst-case ~19-22% floor margin);
-- typical students use ~3% of these and never notice.
--
-- Values (metered tokens / search units per calendar month). trial mirrors Agent Pro
-- (a 7-day trial can't exceed a pro month). professional == max. enterprise is the
-- internal/test tier, seeded high so the ceiling never blocks it. free matches the
-- function fallbacks (FALLBACK_MONTHLY_TOKENS 750k / FALLBACK_MONTHLY_UNITS 300).

INSERT INTO plan_entitlements (plan_code, entitlement_key, value_json) VALUES
  ('free',         'nemesis_llm_monthly_tokens',   '750000'::jsonb),
  ('plus',         'nemesis_llm_monthly_tokens',   '35000000'::jsonb),
  ('trial',        'nemesis_llm_monthly_tokens',   '70000000'::jsonb),
  ('pro',          'nemesis_llm_monthly_tokens',   '70000000'::jsonb),
  ('max',          'nemesis_llm_monthly_tokens',   '180000000'::jsonb),
  ('professional', 'nemesis_llm_monthly_tokens',   '180000000'::jsonb),
  ('enterprise',   'nemesis_llm_monthly_tokens',   '500000000'::jsonb),
  ('free',         'nemesis_search_monthly_units', '300'::jsonb),
  ('plus',         'nemesis_search_monthly_units', '350'::jsonb),
  ('trial',        'nemesis_search_monthly_units', '800'::jsonb),
  ('pro',          'nemesis_search_monthly_units', '800'::jsonb),
  ('max',          'nemesis_search_monthly_units', '2000'::jsonb),
  ('professional', 'nemesis_search_monthly_units', '2000'::jsonb),
  ('enterprise',   'nemesis_search_monthly_units', '30000'::jsonb)
ON CONFLICT (plan_code, entitlement_key) DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = now();
