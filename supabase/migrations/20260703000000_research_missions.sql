-- Missions (research-superapp-parity-audit §5): scheduled background deep-research runs that produce
-- report deliverables. A mission is "a robot pressing the button the user already presses": the cron
-- fires the research fn's service-role mission_run action per due mission; the run consumes the OWNER'S
-- deep_research_daily quota (never free) and lands in saved_reports like any manual run.
--
-- NOT YET APPLIED — applying is owner-gated. Safe to apply early: the cron no-ops with no due missions,
-- and with due missions but unset Vault secrets it warns once and returns (run_due_watch_checks posture).
--
-- ACTIVATION (owner, gated):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/research', 'mission_run_url');
--   -- reuses the existing service-role secret created for watches:
--   -- select vault.create_secret('<service-role-key>', 'watch_service_role_key');

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

-- ── research_missions : one row per scheduled research question ────────────────────────────
CREATE TABLE IF NOT EXISTS research_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 1000),
  report_mode text NOT NULL DEFAULT 'meta'
    CHECK (report_mode IN ('standard','structured_review','meta','lab_draft','discovery')),
  cadence text NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('daily','weekly','monthly')),
  deliver text NOT NULL DEFAULT 'in_app' CHECK (deliver IN ('in_app','email')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  next_run_at timestamptz NOT NULL DEFAULT now(),   -- due immediately on creation (first report right away)
  last_run_at timestamptz,
  last_run_status text CHECK (last_run_status IN ('completed','failed','skipped_quota')),
  last_saved_report_id uuid REFERENCES saved_reports(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS research_missions_user_idx ON research_missions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS research_missions_due_idx ON research_missions (next_run_at) WHERE status = 'active';
-- Idempotent "repeat this research": one mission per (user, question, mode). Case-folded so retyping
-- with different capitalization doesn't duplicate. Client maps the unique-violation to "already scheduled".
CREATE UNIQUE INDEX IF NOT EXISTS research_missions_user_question_uniq
  ON research_missions (user_id, lower(question), report_mode);

ALTER TABLE research_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY rm_owner ON research_missions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── entitlements: mission caps per plan (free/plus 0 — deep research is Pro-and-up anyway) ──
INSERT INTO plan_entitlements (plan_code, entitlement_key, value_json) VALUES
  ('free',         'mission_limit', '0'::jsonb),
  ('plus',         'mission_limit', '0'::jsonb),
  ('pro',          'mission_limit', '5'::jsonb),
  ('professional', 'mission_limit', '20'::jsonb),
  ('enterprise',   'mission_limit', '50'::jsonb)
ON CONFLICT (plan_code, entitlement_key) DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = now();

-- Enforce the per-plan mission_limit on insert (mirrors enforce_watch_limit).
CREATE OR REPLACE FUNCTION public.enforce_mission_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_plan text;
  v_limit int;
  v_count int;
BEGIN
  -- A re-schedule of the SAME (question, mode) is not a new slot: let it fall through to the unique
  -- index (client maps duplicate → "already scheduled") instead of a false "limit reached".
  IF EXISTS (
    SELECT 1 FROM research_missions
    WHERE user_id = NEW.user_id AND lower(question) = lower(NEW.question) AND report_mode = NEW.report_mode
  ) THEN
    RETURN NEW;
  END IF;

  v_plan := public.resolve_user_plan(NEW.user_id);
  v_limit := public.plan_entitlement_int(v_plan, 'mission_limit');
  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'mission entitlement missing';
  END IF;

  SELECT count(*) INTO v_count FROM research_missions WHERE user_id = NEW.user_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'mission_limit_exceeded: plan %, used %, limit %', v_plan, v_count, v_limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mission_limit_before_insert ON research_missions;
CREATE TRIGGER mission_limit_before_insert
  BEFORE INSERT ON research_missions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_mission_limit();

REVOKE EXECUTE ON FUNCTION public.enforce_mission_limit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_mission_limit() TO service_role;

-- ── scheduler: fire the research fn's mission_run action for every due active mission ───────
create or replace function public.run_due_missions()
returns integer
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url  text;
  v_key  text;
  m      record;
  n      integer := 0;
begin
  -- Cheap exit FIRST so an empty prod ticks silently.
  if not exists (
    select 1 from research_missions where status = 'active' and next_run_at <= now()
  ) then
    return 0;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'mission_run_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'watch_service_role_key';
  if v_url is null or v_key is null then
    raise warning 'mission scheduler: due missions exist but Vault secrets (mission_run_url / watch_service_role_key) are unset — skipping';
    return 0;
  end if;

  for m in
    select id from research_missions
    where status = 'active' and next_run_at <= now()
    order by next_run_at asc
    limit 50  -- per-tick cap (each fires a full deep-research run — keep the burst small)
  loop
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('action', 'mission_run', 'mission_id', m.id)
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.run_due_missions() from public, anon, authenticated;

-- Tick hourly at :30 (offset from the watch tick at :00 to spread load).
select cron.schedule('mission-run-due-hourly', '30 * * * *', $$ select public.run_due_missions(); $$);

-- ── report → run back-lookup for the report activity trail (Task 7b) ────────────────────────
CREATE INDEX IF NOT EXISTS research_report_runs_saved_report_idx
  ON research_report_runs (saved_report_id) WHERE saved_report_id IS NOT NULL;

-- Mission provenance on runs (nullable; manual runs leave it NULL). Enables the future
-- in-flight/idempotency guard and ops visibility without a second migration.
ALTER TABLE research_report_runs ADD COLUMN IF NOT EXISTS mission_id uuid REFERENCES research_missions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS research_report_runs_mission_idx ON research_report_runs (mission_id) WHERE mission_id IS NOT NULL;
