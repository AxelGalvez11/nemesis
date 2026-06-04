-- 0114 — Phase 4 evidence-scoring: human-review queue columns + admin RPCs.
--
-- The deterministic engine (scripts/evidence-score.ts) writes evidence_scores;
-- §9 step 5 / doc-12 require a human-review queue for high-risk drug families,
-- research-use peptides, and AI↔source conflicts. evidence_scores already has
-- `reviewed boolean` (0109); this adds the queue metadata + a minimal admin API.
-- (Full admin panel = Phase 7.)

-- =============================================================================
-- 1. Review-queue columns + limitations as a jsonb array (doc-12 output shape)
-- =============================================================================

ALTER TABLE evidence_scores
  ADD COLUMN IF NOT EXISTS review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason text;

-- doc-12's `limitations` is an ARRAY; 0109 seeded it as text. evidence_scores is
-- empty before Phase 4, so retype in place (the USING expression never runs on
-- existing rows) — the get_drug RPC then surfaces a real JSON array to the app.
ALTER TABLE evidence_scores
  ALTER COLUMN limitations DROP DEFAULT,
  ALTER COLUMN limitations TYPE jsonb USING (
    CASE WHEN limitations IS NULL OR limitations = '' THEN '[]'::jsonb
         ELSE to_jsonb(limitations) END
  ),
  ALTER COLUMN limitations SET DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS evidence_scores_review_idx
  ON evidence_scores (review_required, reviewed) WHERE review_required;

COMMENT ON COLUMN evidence_scores.review_required IS
  'Auto-flagged by the engine (high-risk family, research-use peptide, AI↔source conflict). doc-12 §"Human review".';

-- =============================================================================
-- 2. Admin RPCs — SERVICE-ROLE ONLY
-- =============================================================================
-- New public functions are EXECUTE-granted to anon + authenticated by Supabase's
-- defaults (the documented default-grant trap — see migrations 0111/0112). These
-- are operator-only review actions, so REVOKE from PUBLIC + anon + authenticated
-- and GRANT only to service_role. An authenticated end-user is NOT an admin.

CREATE OR REPLACE FUNCTION public.list_unreviewed_scores(max_results int DEFAULT 100)
RETURNS TABLE (
  id uuid,
  entity_id uuid,
  entity_type text,
  canonical_name text,
  claim_text text,
  score text,
  review_reason text,
  rationale text,
  updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT s.id, s.entity_id, s.entity_type, e.canonical_name, s.claim_text,
         s.score, s.review_reason, s.rationale, s.updated_at
  FROM evidence_scores s
  LEFT JOIN drug_entities e ON e.id = s.entity_id
  WHERE s.review_required AND NOT s.reviewed
  ORDER BY s.updated_at DESC
  LIMIT greatest(1, least(max_results, 500));
$$;

CREATE OR REPLACE FUNCTION public.mark_score_reviewed(p_id uuid)
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH upd AS (
    UPDATE evidence_scores SET reviewed = true, updated_at = now()
    WHERE id = p_id
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM upd);
$$;

-- Lock down: revoke the implicit grants, then grant only service_role.
REVOKE EXECUTE ON FUNCTION public.list_unreviewed_scores(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_unreviewed_scores(int) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.list_unreviewed_scores(int) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mark_score_reviewed(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_score_reviewed(uuid) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_score_reviewed(uuid) TO service_role;
