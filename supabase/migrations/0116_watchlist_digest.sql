-- 0116 — Phase 5 watchlist/digest: per-user digest snapshots, the matched-updates
-- read RPC (frozen §8 GET /watchlist/updates), and an idempotency key on `updates`.
--
-- The `updates` and `watchlist_items` tables already exist (0109). This migration
-- adds (1) a dedup unique index so detect-updates re-runs never double-emit, (2) a
-- `digests` table holding the weekly per-user ranked snapshot, and (3) the
-- get_watchlist_updates RPC that powers the in-app "what's new for things you
-- follow" feed. The join key is the LOCKED watchlist invariant
-- (item_type, item_ref) — a drug follow is item_type='drug', item_ref=<entity_id
-- uuid as text>; detect-updates emits that same key.

-- =============================================================================
-- 1. Idempotent emission — dedup key on `updates`
-- =============================================================================
-- `updates` had no unique constraint (0109), so an idempotent detect-updates run
-- needs a conflict target. Update identity = (what it is about, what kind, which
-- source). This key is exact for the APPEND-ONLY event signals Phase-5
-- detect-updates emits: a new PubMed article or trial is a brand-new core_sources
-- row (new provider_id → new id → new source_id), so (drug, item_ref, pubmed_new,
-- source_id) is unique per article and a re-run conflicts → DO NOTHING.
--
-- NOT sufficient (yet) for in-place-superseded sources: persist.ts updates a
-- changed label on the SAME core_sources row (same id; superseded_at stays null),
-- so a real label change would NOT change source_id and this key would suppress
-- it. Label-change→emit is therefore deferred WITH the supersede→emit freshness
-- pipeline (a future phase), which will add content_hash to this key. Phase 5
-- emits no label_update, so the key is correct for everything written today.
-- NULLS NOT DISTINCT (PG15+/PG17 here) so source-less updates also dedupe.
CREATE UNIQUE INDEX IF NOT EXISTS updates_dedup_idx
  ON updates (item_type, item_ref, update_type, source_id) NULLS NOT DISTINCT;

COMMENT ON INDEX updates_dedup_idx IS
  'Idempotency key for detect-updates (Phase 5): re-runs ON CONFLICT DO NOTHING. Exact for append-only signals (new article/trial = new source_id = new update). In-place-superseded sources (labels) need content_hash here — deferred with the supersede→emit freshness pipeline.';

-- =============================================================================
-- 2. digests — per-user weekly ranked snapshot
-- =============================================================================
-- Written by the weekly_digest job (service-role host script); read by the owner.
-- `items` is the doc-12-ranked, deduped update list captured at generation time
-- (a snapshot, so the feed the user was emailed is reproducible even as `updates`
-- grows). One row per (user, period) — the unique index makes generation idempotent.
CREATE TABLE IF NOT EXISTS digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  update_count int NOT NULL DEFAULT 0,
  generated_by_version text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS digests_user_idx ON digests (user_id, generated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS digests_user_period_idx
  ON digests (user_id, period_start, period_end);

COMMENT ON TABLE digests IS
  'Per-user weekly digest snapshot (Phase 5). items = doc-12-ranked deduped updates captured at generation; service-role write, owner read.';

-- RLS: owner-read; writes are service-role only (the digest job; service_role
-- bypasses RLS, so the absence of an authenticated write policy denies user writes).
ALTER TABLE digests ENABLE ROW LEVEL SECURITY;
CREATE POLICY digests_read_own ON digests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- =============================================================================
-- 3. get_watchlist_updates — frozen §8 GET /watchlist/updates ("matched updates[]")
-- =============================================================================
-- The live in-app feed: every update whose (item_type, item_ref) the CALLER
-- follows, newest first. SECURITY DEFINER so it can read the global `updates`
-- catalog and the caller's own watchlist_items, scoped to auth.uid(). DISTINCT
-- collapses the duplicate rows a double-follow of the same item would otherwise
-- produce. The full doc-12 ranked key (incl. evidence_quality) is applied by the
-- digest comparator (one source of truth for ranking); the live feed is recency.
CREATE OR REPLACE FUNCTION public.get_watchlist_updates(max_results int DEFAULT 100)
RETURNS TABLE (
  id uuid,
  item_type text,
  item_ref text,
  update_type text,
  title text,
  summary text,
  source_id uuid,
  source_url text,
  importance_score numeric,
  detected_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT DISTINCT u.id, u.item_type, u.item_ref, u.update_type, u.title, u.summary,
         u.source_id, u.source_url, u.importance_score, u.detected_at
  FROM updates u
  JOIN watchlist_items w
    ON w.item_type = u.item_type AND w.item_ref = u.item_ref
  WHERE w.user_id = auth.uid()
  ORDER BY u.detected_at DESC
  LIMIT greatest(1, least(max_results, 500));
$$;

-- Default-grant trap: new public functions are EXECUTE-granted to anon +
-- authenticated. This one IS user-facing (unlike the 0114 admin RPCs), so revoke
-- only anon and keep authenticated. service_role also granted (no-op under
-- auth.uid(), but explicit).
REVOKE EXECUTE ON FUNCTION public.get_watchlist_updates(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_watchlist_updates(int) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_watchlist_updates(int) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_watchlist_updates(int) TO service_role;
