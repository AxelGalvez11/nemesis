-- 0120 — Answer human-review queue (Phase 7, §11). The doc-20 deterministic safety
-- layer + the Phase-3 guardrail suite stop unsafe TEMPLATES; this adds the human loop
-- for what slips through judgment: answers a USER flags, or that carry safety_flags.
--
-- Admin model (conventional, per 0114 + §8 "admin = service-role"): the review RPCs are
-- SERVICE-ROLE ONLY — the operator calls them with the service key (no end-user "admin"
-- role / allowlist is introduced; a full panel UI is post-launch). The USER-facing piece
-- is report_answer(), a SECURITY DEFINER RPC that lets a signed-in user flag their OWN
-- answer (auth.uid()-scoped; REVOKE anon — the default-grant trap, see 0111/0112/0119).

-- generated_answers gets a review state (it has user_reported + safety_flags already).
ALTER TABLE generated_answers
  ADD COLUMN IF NOT EXISTS reviewed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- The queue: flagged (user-reported OR safety-flagged) and not yet reviewed. The partial
-- predicate matches list_flagged_answers' WHERE exactly (jsonb_array_length is immutable,
-- so it is legal here) — otherwise safety-only-flagged rows would miss the index.
CREATE INDEX IF NOT EXISTS generated_answers_review_idx
  ON generated_answers (created_at)
  WHERE NOT reviewed AND (user_reported OR jsonb_array_length(safety_flags) > 0);

-- ---- USER-FACING: report your OWN answer ----
-- SECURITY DEFINER (generated_answers has no authenticated UPDATE policy — writes are
-- service-role), but the auth.uid() = user_id filter is the access control: a caller can
-- only flag a row they own. Returns whether a row was flagged.
CREATE OR REPLACE FUNCTION public.report_answer(p_answer_id uuid)
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH upd AS (
    UPDATE generated_answers SET user_reported = true
    WHERE id = p_answer_id AND user_id = auth.uid()
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM upd);
$$;

REVOKE EXECUTE ON FUNCTION public.report_answer(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.report_answer(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.report_answer(uuid) TO authenticated;

COMMENT ON FUNCTION public.report_answer IS
  '§11 user-facing report: flags the CALLER''S OWN generated_answer (auth.uid()-scoped). authenticated-only.';

-- ---- OPERATOR-FACING: the review queue (SERVICE-ROLE ONLY, mirrors 0114) ----
CREATE OR REPLACE FUNCTION public.list_flagged_answers(max_results int DEFAULT 100)
RETURNS TABLE (
  id uuid, user_id uuid, question text, intent text, evidence_grade text,
  safety_flags jsonb, user_reported boolean, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT id, user_id, question, intent, evidence_grade, safety_flags, user_reported, created_at
  FROM generated_answers
  WHERE NOT reviewed AND (user_reported OR jsonb_array_length(safety_flags) > 0)
  ORDER BY created_at DESC
  LIMIT greatest(1, least(max_results, 500));
$$;

CREATE OR REPLACE FUNCTION public.mark_answer_reviewed(p_id uuid)
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH upd AS (
    UPDATE generated_answers SET reviewed = true, reviewed_at = now()
    WHERE id = p_id
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM upd);
$$;

-- Lock the operator RPCs to service_role (an authenticated end-user is NOT an admin).
REVOKE EXECUTE ON FUNCTION public.list_flagged_answers(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_flagged_answers(int) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.list_flagged_answers(int) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mark_answer_reviewed(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_answer_reviewed(uuid) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_answer_reviewed(uuid) TO service_role;
