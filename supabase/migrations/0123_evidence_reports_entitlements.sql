-- 0123 — Evidence brief/deep research entitlements and saved-report scaffold.
--
-- Product split:
--   * evidence briefs: Plus-visible MVP deliverable generated from cited Ask traces.
--   * deep research: future Pro workflow with fresh multi-query retrieval/synthesis.
--
-- This migration intentionally extends the existing saved_reports table rather
-- than creating a parallel reports store for the MVP.

-- ---------------------------------------------------------------------------
-- 1. Plan entitlements for reports.
-- ---------------------------------------------------------------------------

INSERT INTO plan_entitlements (plan_code, entitlement_key, value_json)
VALUES
  ('free', 'evidence_brief_daily_limit', '1'::jsonb),
  ('free', 'deep_research_daily_limit', '0'::jsonb),
  ('free', 'report_export_enabled', 'false'::jsonb),
  ('free', 'ppt_export_enabled', 'false'::jsonb),

  ('plus', 'evidence_brief_daily_limit', '5'::jsonb),
  ('plus', 'deep_research_daily_limit', '0'::jsonb),
  ('plus', 'report_export_enabled', 'true'::jsonb),
  ('plus', 'ppt_export_enabled', 'false'::jsonb),

  ('pro', 'evidence_brief_daily_limit', '20'::jsonb),
  ('pro', 'deep_research_daily_limit', '3'::jsonb),
  ('pro', 'report_export_enabled', 'true'::jsonb),
  ('pro', 'ppt_export_enabled', 'true'::jsonb),

  ('professional', 'evidence_brief_daily_limit', '50'::jsonb),
  ('professional', 'deep_research_daily_limit', '10'::jsonb),
  ('professional', 'report_export_enabled', 'true'::jsonb),
  ('professional', 'ppt_export_enabled', 'true'::jsonb),

  ('enterprise', 'evidence_brief_daily_limit', '200'::jsonb),
  ('enterprise', 'deep_research_daily_limit', '50'::jsonb),
  ('enterprise', 'report_export_enabled', 'true'::jsonb),
  ('enterprise', 'ppt_export_enabled', 'true'::jsonb)
ON CONFLICT (plan_code, entitlement_key) DO UPDATE
SET value_json = EXCLUDED.value_json,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. Saved reports can now store evidence deliverables.
-- ---------------------------------------------------------------------------

ALTER TABLE saved_reports DROP CONSTRAINT IF EXISTS saved_reports_kind_check;
ALTER TABLE saved_reports
  ADD CONSTRAINT saved_reports_kind_check CHECK (
    kind IN (
      'answer',
      'drug',
      'comparison',
      'evidence_brief',
      'literature_overview',
      'deep_research',
      'slide_deck'
    )
  );

ALTER TABLE saved_reports
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('queued','running','completed','failed')),
  ADD COLUMN IF NOT EXISTS report_depth text
    CHECK (report_depth IN ('brief','deep')),
  ADD COLUMN IF NOT EXISTS generated_from_answer_id uuid REFERENCES generated_answers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS citation_count int NOT NULL DEFAULT 0 CHECK (citation_count >= 0),
  ADD COLUMN IF NOT EXISTS export_formats jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE INDEX IF NOT EXISTS saved_reports_user_kind_created_idx
  ON saved_reports (user_id, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS saved_reports_generated_answer_idx
  ON saved_reports (generated_from_answer_id)
  WHERE generated_from_answer_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Report run ledger for future async deep research jobs.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS research_report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  saved_report_id uuid REFERENCES saved_reports(id) ON DELETE SET NULL,
  report_kind text NOT NULL CHECK (report_kind IN ('evidence_brief','literature_overview','deep_research','slide_deck')),
  report_depth text NOT NULL CHECK (report_depth IN ('brief','deep')),
  question text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  plan text NOT NULL DEFAULT 'free',
  counter_key text,
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS research_report_runs_user_created_idx
  ON research_report_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS research_report_runs_status_idx
  ON research_report_runs (status, created_at)
  WHERE status IN ('queued','running');

ALTER TABLE research_report_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS research_report_runs_read_own ON research_report_runs;
CREATE POLICY research_report_runs_read_own
  ON research_report_runs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS research_report_runs_updated_at_trigger ON research_report_runs;
CREATE TRIGGER research_report_runs_updated_at_trigger
  BEFORE UPDATE ON research_report_runs
  FOR EACH ROW EXECUTE FUNCTION core_sources_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. get_my_usage now surfaces report counters too.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_usage()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_plan text;
  v_today date := current_date;
  v_counter text;
  v_limit int;
  v_used int;
  v_counters jsonb := '{}'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_plan := public.resolve_user_plan(v_uid);

  FOREACH v_counter IN ARRAY ARRAY[
    'ask_daily',
    'evidence_brief_daily',
    'deep_research_daily'
  ] LOOP
    v_limit := public.plan_entitlement_int(v_plan, v_counter || '_limit');

    SELECT COALESCE(used, 0)
      INTO v_used
    FROM usage_counters
    WHERE user_id = v_uid
      AND counter_key = v_counter
      AND period_start = v_today;

    v_counters := jsonb_set(
      v_counters,
      ARRAY[v_counter],
      jsonb_build_object(
        'used', COALESCE(v_used, 0),
        'limit', v_limit,
        'period_start', v_today,
        'period_end', v_today + 1
      ),
      true
    );
  END LOOP;

  RETURN jsonb_build_object(
    'plan', v_plan,
    'counters', v_counters
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_usage() TO authenticated, service_role;

COMMENT ON TABLE research_report_runs IS
  'Async/report execution ledger. MVP evidence briefs complete synchronously; future deep research jobs use this for audit and retries.';
COMMENT ON COLUMN saved_reports.generated_from_answer_id IS
  'Evidence briefs can be derived from an existing cited Ask trace without rerunning expensive retrieval.';
