-- Live monitoring (WS-D) data model. NET-NEW; the existing corpus-tied
-- watchlist_items/updates/detect-updates spine stays separate and untouched.
--
-- NOT YET APPLIED — applying this migration is owner-gated. When applied via the
-- Supabase apply_migration path, reconcile this filename to the remote-recorded
-- version (precedent: 20260615183052_add_openalex_provider.sql).
--
-- Design (see docs/superpowers/specs/2026-06-17-live-monitoring-design.md): change is
-- detected by diffing DATED source-API results against the per-watch known-source set
-- (watch_known_sources), never the engine output. watch_events holds only SURFACED items
-- (post-baseline feed + loud alerts + the walled "In the news" list); the seen-set holds
-- everything ever fetched (incl. the silent cold-start baseline) so nothing is re-alerted.
-- RLS is owner-scoped; the internal seen-set is service-role-only.

-- ── evidence_watches : one row per watch (config + the date cursor) ───────────────────────
CREATE TABLE IF NOT EXISTS evidence_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('topic','saved_question')),
  title text NOT NULL,                                 -- display label (the topic or the question)
  topic text,                                          -- the topic/drug string (kind='topic')
  saved_report_id uuid REFERENCES saved_reports(id) ON DELETE CASCADE, -- (kind='saved_question')
  query_terms text NOT NULL,                           -- resolved search string used for the dated query
  mentions jsonb NOT NULL DEFAULT '[]'::jsonb,         -- drug names for field-scoped providers (openFDA)
  include_news boolean NOT NULL DEFAULT true,          -- the walled "In the news" channel (evidence always on)
  cadence text NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('weekly','daily')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  last_checked_at timestamptz,                         -- the date cursor (null until first check)
  baselined_at timestamptz,                            -- null until the silent cold-start baseline completes
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_watches_kind_ref CHECK (
    (kind = 'topic'          AND topic IS NOT NULL) OR
    (kind = 'saved_question' AND saved_report_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS evidence_watches_user_idx ON evidence_watches (user_id, created_at DESC);
-- the scheduler scans active watches by (cadence, last_checked_at) to find what's due
CREATE INDEX IF NOT EXISTS evidence_watches_due_idx ON evidence_watches (cadence, last_checked_at)
  WHERE status = 'active';

ALTER TABLE evidence_watches ENABLE ROW LEVEL SECURITY;
CREATE POLICY ew_owner ON evidence_watches FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── watch_known_sources : the accumulating seen-set (diff substrate; service-role only) ────
CREATE TABLE IF NOT EXISTS watch_known_sources (
  watch_id uuid NOT NULL REFERENCES evidence_watches(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('evidence','news')),
  source_key text NOT NULL,                            -- "provider:provider_id" | "news:url"
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (watch_id, channel, source_key)          -- idempotent upsert; the dedupe key
);
-- RLS ON, NO authenticated policy: this internal substrate is written/read only by the
-- service-role watch-check (which bypasses RLS). Clients never read it (deny-by-default).
ALTER TABLE watch_known_sources ENABLE ROW LEVEL SECURITY;

-- ── watch_events : user-facing (quiet "what's new" feed + loud alerts + the news list) ─────
CREATE TABLE IF NOT EXISTS watch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watch_id uuid NOT NULL REFERENCES evidence_watches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- denormalized for simple owner RLS
  channel text NOT NULL CHECK (channel IN ('evidence','news')),
  source_key text NOT NULL,
  is_alert boolean NOT NULL DEFAULT false,             -- true = loud conclusion-mover (evidence only)
  alert_reason text CHECK (alert_reason IN ('new_high_tier_study','retraction')),
  title text NOT NULL,
  url text,
  provider text,                                       -- evidence provider, or news outlet
  study_type text,                                     -- e.g. "Randomized controlled trial" (evidence)
  published_date date,
  summary text,                                        -- grounded change summary (alerts); NULL otherwise
  detected_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  -- THE WALL, enforced in the schema: news is feed-only and can never be a loud alert.
  CONSTRAINT watch_events_news_never_alerts CHECK (NOT (channel = 'news' AND is_alert)),
  CONSTRAINT watch_events_reason_only_when_alert CHECK (alert_reason IS NULL OR is_alert),
  UNIQUE (watch_id, channel, source_key)               -- surface each source at most once
);
CREATE INDEX IF NOT EXISTS watch_events_user_idx ON watch_events (user_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS watch_events_watch_idx ON watch_events (watch_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS watch_events_unread_alert_idx ON watch_events (user_id, detected_at DESC)
  WHERE is_alert AND read_at IS NULL;

ALTER TABLE watch_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY we_owner_read ON watch_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- owner UPDATE = marking read_at (same direct-RLS-write pattern as chat persistence). INSERT/DELETE
-- are service-role only: the watch-check writes events; no client insert policy exists.
CREATE POLICY we_owner_update ON watch_events FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── entitlements : the "more + faster + smarter" tier ladder for watches ───────────────────
-- Free = a taste (1 watch, weekly, in-app only); Plus = real monitoring (10, daily, email);
-- Pro = power (50, daily, email). professional/enterprise seeded defensively so the limit
-- trigger never blocks a higher tier (resolve_user_plan can return either).
INSERT INTO plan_entitlements (plan_code, entitlement_key, value_json) VALUES
  ('free',         'watch_limit',         '1'::jsonb),
  ('free',         'watch_daily_enabled', 'false'::jsonb),
  ('free',         'watch_email_enabled', 'false'::jsonb),
  ('plus',         'watch_limit',         '10'::jsonb),
  ('plus',         'watch_daily_enabled', 'true'::jsonb),
  ('plus',         'watch_email_enabled', 'true'::jsonb),
  ('pro',          'watch_limit',         '50'::jsonb),
  ('pro',          'watch_daily_enabled', 'true'::jsonb),
  ('pro',          'watch_email_enabled', 'true'::jsonb),
  ('professional', 'watch_limit',         '200'::jsonb),
  ('professional', 'watch_daily_enabled', 'true'::jsonb),
  ('professional', 'watch_email_enabled', 'true'::jsonb),
  ('enterprise',   'watch_limit',         '1000'::jsonb),
  ('enterprise',   'watch_daily_enabled', 'true'::jsonb),
  ('enterprise',   'watch_email_enabled', 'true'::jsonb)
ON CONFLICT (plan_code, entitlement_key) DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = now();

-- Enforce the per-plan watch_limit on insert (mirrors enforce_watchlist_limit in 0122).
CREATE OR REPLACE FUNCTION public.enforce_watch_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_plan text;
  v_limit int;
  v_count int;
BEGIN
  v_plan := public.resolve_user_plan(NEW.user_id);
  v_limit := public.plan_entitlement_int(v_plan, 'watch_limit');
  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'watch entitlement missing';
  END IF;

  SELECT count(*) INTO v_count
  FROM evidence_watches
  WHERE user_id = NEW.user_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'watch_limit_exceeded: plan %, used %, limit %', v_plan, v_count, v_limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS watch_limit_before_insert ON evidence_watches;
CREATE TRIGGER watch_limit_before_insert
  BEFORE INSERT ON evidence_watches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_watch_limit();

REVOKE EXECUTE ON FUNCTION public.enforce_watch_limit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_watch_limit() TO service_role;
