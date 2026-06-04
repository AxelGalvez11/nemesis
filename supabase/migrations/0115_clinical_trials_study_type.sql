-- 0115 — add study_type to the clinical_trials projection (Phase-4 signal).
--
-- The ClinicalTrials.gov provider captured designModule.studyType into
-- core_sources.metadata, but the Phase-2 projection table never had a column for
-- it, so the §9 engine cannot split INTERVENTIONAL (n_human_trials) from
-- OBSERVATIONAL (n_observational). scripts/backfill-evidence-signals.ts populates
-- it from the CT.gov v2 re-fetch.

ALTER TABLE clinical_trials ADD COLUMN IF NOT EXISTS study_type text;
CREATE INDEX IF NOT EXISTS clinical_trials_study_type_idx ON clinical_trials (study_type);
