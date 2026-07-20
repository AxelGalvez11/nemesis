-- Target ~80% AI gross margin at the entitlement ceiling (2026-07-20).
--
-- Conservative model: every metered token is priced as OUTPUT, every search
-- costs the Linkup primary's documented ~$0.005, and fixed hosting is allocated
-- separately. Because real traffic includes cheaper input/cache-hit tokens, the
-- expected margin is higher than this ceiling model.
--
-- Plan / price       Token ceiling exposure      Search exposure      Total
-- plus / $9.99       3.0M Flash * $0.28/M=$0.84  100 * $.005=$0.50    $1.34
-- pro / $19.99       3.2M Pro   * $0.87/M=$2.78  150 * $.005=$0.75    $3.53
-- max / $49.99       8.0M Pro   * $0.87/M=$6.96  300 * $.005=$1.50    $8.46
--
-- Free is a durable freemium tier, not an automatic seven-day Pro trial. The
-- valve code enforces that separately. 150k metered tokens is intended to cover
-- roughly 5-10 useful introductory turns, depending on answer/context length.

INSERT INTO plan_entitlements (plan_code, entitlement_key, value_json) VALUES
  ('free',         'nemesis_llm_daily_tokens',       '50000'::jsonb),
  ('free',         'nemesis_llm_monthly_tokens',    '150000'::jsonb),
  ('free',         'nemesis_search_daily_units',         '1'::jsonb),
  ('free',         'nemesis_search_monthly_units',       '2'::jsonb),
  ('plus',         'nemesis_llm_daily_tokens',      '500000'::jsonb),
  ('plus',         'nemesis_llm_monthly_tokens',   '3000000'::jsonb),
  ('plus',         'nemesis_search_daily_units',        '15'::jsonb),
  ('plus',         'nemesis_search_monthly_units',     '100'::jsonb),
  ('pro',          'nemesis_llm_daily_tokens',      '800000'::jsonb),
  ('pro',          'nemesis_llm_monthly_tokens',   '3200000'::jsonb),
  ('pro',          'nemesis_search_daily_units',        '20'::jsonb),
  ('pro',          'nemesis_search_monthly_units',     '150'::jsonb),
  ('max',          'nemesis_llm_daily_tokens',     '2000000'::jsonb),
  ('max',          'nemesis_llm_monthly_tokens',   '8000000'::jsonb),
  ('max',          'nemesis_search_daily_units',        '50'::jsonb),
  ('max',          'nemesis_search_monthly_units',     '300'::jsonb),
  ('professional', 'nemesis_llm_daily_tokens',     '2000000'::jsonb),
  ('professional', 'nemesis_llm_monthly_tokens',   '8000000'::jsonb),
  ('professional', 'nemesis_search_daily_units',        '50'::jsonb),
  ('professional', 'nemesis_search_monthly_units',     '300'::jsonb)
ON CONFLICT (plan_code, entitlement_key) DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = now();
