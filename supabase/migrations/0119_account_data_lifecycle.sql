-- 0119 — Account data lifecycle (Phase 7, AC10): the data-EXPORT RPC.
--
-- doc-18 must-have "data export": let a signed-in user pull a copy of THEIR OWN
-- data. SECURITY DEFINER (so it can read across the user-owned tables in one call)
-- but every sub-select is pinned to auth.uid() — the function bypasses RLS, so the
-- auth.uid() filter IS the access control. REVOKE anon (the default-grant trap, see
-- 0111/0112/0118); authenticated only — a user exports only their own rows.
--
-- Account DELETION is the sibling of this (the `account-delete` edge function): it
-- removes auth.users(id), and every user-owned table already cascades from there
-- (0109/0116 ON DELETE CASCADE), except generated_answers which is ON DELETE SET
-- NULL = anonymized (the row is kept for the corpus/audit, the user link is severed).
-- No schema change is needed for the cascade; this migration is only the export RPC.

CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT jsonb_build_object(
    'exported_at', now(),
    'user_id', auth.uid(),
    'profile',        (SELECT to_jsonb(p) FROM profiles p              WHERE p.user_id = auth.uid()),
    'health_context', (SELECT to_jsonb(h) FROM user_health_context h   WHERE h.user_id = auth.uid()),
    -- Subscription: only the user-facing plan/status, NOT the RevenueCat internal ids
    -- (rc_app_user_id/rc_entitlement) — those are billing-integration internals, not the
    -- user's data, and must not land in an exportable bundle.
    'subscription', (
      SELECT jsonb_build_object('plan', s.plan, 'status', s.status, 'current_period_end', s.current_period_end)
      FROM subscriptions s WHERE s.user_id = auth.uid()),
    'watchlist', (
      SELECT coalesce(jsonb_agg(to_jsonb(w) ORDER BY w.created_at), '[]'::jsonb)
      FROM watchlist_items w WHERE w.user_id = auth.uid()),
    'saved_reports', (
      SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at), '[]'::jsonb)
      FROM saved_reports r WHERE r.user_id = auth.uid()),
    -- Answers: only the user-facing fields (not retrieval_scores/model internals).
    'answers', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object('id', g.id, 'question', g.question, 'answer', g.answer,
                           'evidence_grade', g.evidence_grade, 'created_at', g.created_at)
        ORDER BY g.created_at), '[]'::jsonb)
      FROM generated_answers g WHERE g.user_id = auth.uid())
  );
$$;

-- Default-grant trap: revoke anon, grant only authenticated (a user exports THEIR
-- own data; auth.uid() inside the SECURITY DEFINER body scopes every row).
REVOKE EXECUTE ON FUNCTION public.export_my_data() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.export_my_data() FROM anon;
GRANT  EXECUTE ON FUNCTION public.export_my_data() TO authenticated;

COMMENT ON FUNCTION public.export_my_data IS
  '§8/doc-18 data export: the caller''s own rows (profile, health context, watchlist, saved reports, answers) as one jsonb doc. auth.uid()-scoped; authenticated-only.';
