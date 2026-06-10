-- 0126 — Deep Research wiring: live progress on the run ledger.
--
-- The async deep-research job (research edge function) streams progress steps to the run row as it
-- works (planning → gathering → writing → checking → done); the web client polls the row to render a
-- live "thinking…" panel. The finished report itself lands in saved_reports.payload (kind
-- 'deep_research', owner RLS sr_owner from 0109); research_report_runs (0123) already links it via
-- saved_report_id. This migration only adds the progress column — everything else already exists.
--
-- Depends on 0123 (research_report_runs). Additive + idempotent.

ALTER TABLE research_report_runs
  ADD COLUMN IF NOT EXISTS progress jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN research_report_runs.progress IS
  'Ordered ResearchProgressStep[] streamed during the run; polled by the web client for live progress.';
