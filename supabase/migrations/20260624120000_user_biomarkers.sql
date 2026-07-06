-- Score feature ("Percentile Engine") data model. NET-NEW; per-user biomarker readings that feed
-- the non-diagnostic percentile + health-score engine (packages/shared: percentile.ts, health-score.ts).
--
-- NOT YET APPLIED — applying this migration is owner-gated. When applied via the Supabase
-- apply_migration path, reconcile this filename to the remote-recorded version (precedent:
-- 20260615183052_add_openalex_provider.sql).
--
-- Design notes:
--   • One row per (user, metric, reading) — a HISTORY, not a singleton — so the Score page can draw a
--     trend ("your rank over time") and the engine always uses the latest value per metric.
--   • The demographic the percentile compares against (sex + age band) is NOT duplicated here; it is
--     read from the existing user_health_context row (sex, age_range, migration 0109).
--   • RLS is owner-scoped (auth.uid() = user_id); anon has no policy and is therefore denied.
--   • `metric` is validated against the MetricKey union the shared engine knows. Adding a metric means
--     extending both this CHECK and packages/shared/src/percentile.ts (kept deliberately in lockstep).
--   • `source` records HOW the value arrived so the UI can show provenance and a confirm step for the
--     lower-trust paths (lab_upload = VLM-extracted from a PDF/photo, must be user-confirmed).

CREATE TABLE IF NOT EXISTS user_biomarkers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric text NOT NULL CHECK (metric IN (
    'vo2max','hba1c','apob','hscrp','resting_hr','hrv',
    'grip_strength','lean_mass_index','sleep_efficiency'
  )),
  value numeric NOT NULL,
  unit text NOT NULL,                                  -- the unit the value was entered/normalized to
  measured_at date NOT NULL DEFAULT now(),             -- when the reading was taken (for the trend axis)
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','wearable','lab_upload')),
  confirmed boolean NOT NULL DEFAULT true,             -- lab_upload (VLM-extracted) starts false until user confirms
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Latest-value-per-metric and trend queries both scan by (user, metric, measured_at desc).
CREATE INDEX IF NOT EXISTS user_biomarkers_user_metric_idx
  ON user_biomarkers (user_id, metric, measured_at DESC);

ALTER TABLE user_biomarkers ENABLE ROW LEVEL SECURITY;
CREATE POLICY ub_owner ON user_biomarkers FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
