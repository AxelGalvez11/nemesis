# Missions v1 + Agent Grammar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Manus-grammar agent loop on PharmaOrb's evidence engine: scheduled background research runs ("missions") that produce cited report deliverables with email notification, an activity trail on finished reports, an editable pre-run research plan, a playbook gallery, and batch mission creation.

**Architecture:** A `research_missions` table (RLS owner-scoped, plan-capped by trigger — the exact `evidence_watches` pattern) is driven by a `run_due_missions()` pg_cron function (the exact `run_due_watch_checks()` pattern) that POSTs a new service-role-gated `mission_run` action on the EXISTING `research` edge function. A mission run consumes the owner's normal deep-research quota, reuses the existing run→report pipeline verbatim, then advances the mission cursor and (optionally) emails "report ready" via the Resend pattern. Frontend: mission CRUD is direct RLS table access from `apps/web/lib/api.ts` (the watch pattern); creation happens from a clock icon on finished research cards/reports; missions list on the Monitoring page. The plan-preview and activity-trail features reuse the engine's existing `planResearch` step and the run row's existing `progress` column.

**Tech Stack:** Next.js App Router client components, Supabase (Postgres + RLS + pg_cron + pg_net + Vault, Deno edge functions), deno test for shared/pure modules, Resend for email (dormant without keys).

## Global Constraints

- **FROZEN files — do not modify:** `supabase/functions/ask/safety.ts`, `supabase/functions/ask/prompts.ts`, `supabase/functions/ask/routing.ts`, `supabase/functions/ask/classify.ts`. (Other `ask/research/*` files are NOT frozen.)
- **The migration is written to the repo but NOT applied; the research function is NOT deployed.** Both are owner-gated ship steps at the end. All code must degrade gracefully pre-apply: client CRUD maps a missing-table error to `reason: "not_enabled"` exactly like watches do.
- Mission runs consume the mission owner's `deep_research_daily` quota via the existing `consume_usage` RPC — a mission may be honestly SKIPPED (`last_run_status = 'skipped_quota'`), never run for free.
- Email sending must be DORMANT without `RESEND_API_KEY` + `RESEND_FROM` env on the research function (send skipped, run still succeeds) — the watch-digest posture.
- New user-facing copy is plain English, sentence case, no jargon (e.g. "Repeat this research", "Scheduled research", "Runs weekly · next run in 3h").
- Entitlement keys and caps (exact values): `mission_limit` — free `0`, plus `0`, pro `5`, professional `20`, enterprise `50`. (Free/plus have `deep_research_daily_limit` 0, so missions are Pro-and-up by construction; the cap makes that legible.)
- Cadences: `'daily' | 'weekly' | 'monthly'`. Delivery: `'in_app' | 'email'`. Statuses: `'active' | 'paused'`. Run statuses: `'completed' | 'failed' | 'skipped_quota'`.
- Monorepo layout: shared pure modules in `packages/shared/src/` with `deno test` colocated `.test.ts`; web client in `apps/web/`; edge functions in `supabase/functions/`.
- Run all shared tests with: `deno test packages/shared/src/` from repo root. Typecheck web with: `pnpm typecheck` in `apps/web` (run `pnpm install --prefer-offline` at worktree root once first). Typecheck edge fn with: `deno check supabase/functions/research/index.ts`.
- Commit after every green test cycle; conventional commits (`feat:`, `fix:`, `test:`, `docs:`); no Co-Authored-By line (attribution disabled globally).

## File Structure (what exists → what this plan adds)

```
supabase/migrations/20260703000000_research_missions.sql   [Task 1: table+RLS+trigger+cron]
packages/shared/src/missions.ts                            [Task 2: types + nextRunAt + entitlement + labels]
packages/shared/src/missions.test.ts                       [Task 2]
packages/shared/src/mission-email.ts                       [Task 3: pure email content builder]
packages/shared/src/mission-email.test.ts                  [Task 3]
supabase/functions/research/resend.ts                      [Task 4: thin Resend sender (copy of watch-digest's)]
supabase/functions/research/index.ts                       [Task 4: mission_run action; Task 7: plan action + sub_questions]
supabase/functions/ask/research/orchestrate.ts             [Task 7: cfg.subQuestions bypasses planResearch]
apps/web/lib/api.ts                                        [Task 5: mission CRUD + fetchRunForReport + planResearchPreview + startResearch subQuestions]
apps/web/components/MissionSheet.tsx                       [Task 6: create-mission sheet + batch field (Task 9)]
apps/web/app/app/ask/page.tsx                              [Task 6: clock on ResearchRunCard; Task 7: plan-editing in ScopeTurn; Task 8: playbook chips]
apps/web/components/ResearchReportView.tsx                 [Task 6: clock in header; Task 7b: activity trail]
apps/web/app/app/monitor/page.tsx                          [Task 6: "Scheduled research" section]
apps/web/lib/playbooks.ts                                  [Task 8: curated playbook list]
apps/web/app/styles/shell.css                              [Task 6: mission-sheet styles (only if needed — reuse watch-card/chip classes first)]
```

Key existing interfaces tasks consume (verified 2026-07-02 on main @ b3be99a):
- `startResearch(question: string, mode: ReportMode): Promise<string>` — POSTs `{question, mode}` to `functions/v1/research`, returns `run_id` (apps/web/lib/api.ts:742).
- Research fn: `consumeQuota(userId)` → `{allowed, reason, plan, used, limit}`; `insertRun(userId, question, plan)`; `executeRun(runId, userId, question, mode)` (never rejects); `patchRun(runId, userId, fields)`; `verifyUser(token)`; service key auth pattern per watch-digest: `token === SERVICE_KEY`.
- `runResearch(question, cfg)` in `supabase/functions/ask/research/orchestrate.ts`; `planResearch` in `supabase/functions/ask/research/plan.ts` (LLM decomposition into 3-6 sub-questions).
- Watch limit trigger pattern: `public.enforce_watch_limit()` in `supabase/migrations/20260617000000_live_monitoring_watches.sql:125-171`; scheduler pattern in `20260618000100_watch_scheduler.sql`.
- `watchEntitlement(snapshot)` pattern in `packages/shared/src/watch-entitlements.ts`; `EntitlementSnapshot` from `packages/shared/src/entitlements.ts` (`snapshot?.entitlements` is a `Record<string, unknown>`).
- Client CRUD pattern incl. `isMissingRelation(error)` and trigger-message matching: `createWatch` in apps/web/lib/api.ts:984-1017.
- `ResearchProgress({steps, done})` component renders a `ResearchProgressStep[]` checklist.
- `fetchEntitlements(): Promise<EntitlementSnapshot | null>` exists in apps/web/lib/api.ts.
- Resend sender to copy: `supabase/functions/watch-digest/resend.ts` (`sendEmail(args): Promise<SendEmailResult>`).

---

### Task 1: Migration — `research_missions` table, cap trigger, cron scheduler

**Files:**
- Create: `supabase/migrations/20260703000000_research_missions.sql`

**Interfaces:**
- Produces: table `research_missions` (columns below — Tasks 3-6 depend on these exact names); entitlement key `mission_limit`; trigger error string `mission_limit_exceeded` (Task 5 matches on it); Vault secret names `mission_run_url` and `watch_service_role_key` (reused); cron job `mission-run-due-hourly`; index `research_report_runs_saved_report_idx` (Task 7b's lookup).

- [ ] **Step 1: Write the migration** (there is no local Postgres harness in this repo — migrations are validated by review + the owner-gated apply; mirror the proven watch files exactly)

```sql
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
```

- [ ] **Step 2: Sanity-check the SQL statically** — Run: `grep -c "CHECK\|create policy\|CREATE POLICY" supabase/migrations/20260703000000_research_missions.sql` (expect ≥ 8) and visually confirm every referenced helper exists in earlier migrations: `resolve_user_plan` and `plan_entitlement_int` (both used by `enforce_watch_limit` in 20260617000000), `plan_entitlements` (0122), `saved_reports` (exists).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260703000000_research_missions.sql
git commit -m "feat(db): research_missions table + plan cap trigger + pg_cron mission scheduler (not applied; owner-gated)"
```

---

### Task 2: Shared missions module — types, `nextRunAt`, entitlement, labels

**Files:**
- Create: `packages/shared/src/missions.ts`
- Test: `packages/shared/src/missions.test.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from "./missions.ts";` alongside the existing exports — check the file's existing export style and match it)

**Interfaces:**
- Produces (consumed by Tasks 4, 5, 6):
  - `type MissionCadence = "daily" | "weekly" | "monthly"`
  - `type MissionDeliver = "in_app" | "email"`
  - `type MissionRunStatus = "completed" | "failed" | "skipped_quota"`
  - `interface MissionSummary { id: string; question: string; report_mode: string; cadence: MissionCadence; deliver: MissionDeliver; status: "active" | "paused"; next_run_at: string; last_run_at: string | null; last_run_status: MissionRunStatus | null; last_saved_report_id: string | null; }`
  - `nextRunAt(cadence: MissionCadence, from: Date): Date` — pure; daily +1 day, weekly +7 days, monthly +1 calendar month via `setUTCMonth` (clamping: Jan 31 + 1 month lands Mar 2/3 via JS date rollover — acceptable and DOCUMENTED in a comment; do NOT hand-roll clamping).
  - `missionEntitlement(snapshot: EntitlementSnapshot | null): { limit: number }` — reads `mission_limit`, defaulting to `0` (the free floor) when missing.
  - `missionUsageLabel(used: number, limit: number): string` — `"2 of 5 scheduled runs used"` (singular: `"1 of 1 scheduled run used"`).
  - `cadenceLabel(c: MissionCadence): string` — `"Runs daily" | "Runs weekly" | "Runs monthly"`.

- [ ] **Step 1: Write the failing tests** — `packages/shared/src/missions.test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cadenceLabel, missionEntitlement, missionUsageLabel, nextRunAt } from "./missions.ts";

Deno.test("nextRunAt daily adds exactly one day", () => {
  assertEquals(nextRunAt("daily", new Date("2026-07-02T13:30:00Z")).toISOString(), "2026-07-03T13:30:00.000Z");
});

Deno.test("nextRunAt weekly adds seven days across a month boundary", () => {
  assertEquals(nextRunAt("weekly", new Date("2026-07-28T09:00:00Z")).toISOString(), "2026-08-04T09:00:00.000Z");
});

Deno.test("nextRunAt monthly advances the calendar month", () => {
  assertEquals(nextRunAt("monthly", new Date("2026-07-15T09:00:00Z")).toISOString(), "2026-08-15T09:00:00.000Z");
});

Deno.test("nextRunAt monthly on Jan 31 rolls over (documented JS behavior, not a bug)", () => {
  const d = nextRunAt("monthly", new Date("2026-01-31T09:00:00Z"));
  assertEquals(d.getTime() > new Date("2026-02-27T09:00:00Z").getTime(), true);
});

Deno.test("missionEntitlement defaults to the free floor (0) when key missing", () => {
  assertEquals(missionEntitlement(null).limit, 0);
  assertEquals(missionEntitlement({ plan: "free", entitlements: {} } as never).limit, 0);
});

Deno.test("missionEntitlement reads mission_limit when present", () => {
  assertEquals(missionEntitlement({ plan: "pro", entitlements: { mission_limit: 5 } } as never).limit, 5);
});

Deno.test("labels", () => {
  assertEquals(missionUsageLabel(2, 5), "2 of 5 scheduled runs used");
  assertEquals(missionUsageLabel(1, 1), "1 of 1 scheduled run used");
  assertEquals(cadenceLabel("weekly"), "Runs weekly");
});
```

NOTE: before writing, open `packages/shared/src/entitlements.ts` and confirm the `EntitlementSnapshot` shape; if the test's `as never` casts don't fit its real shape, build the minimal real object instead of casting.

- [ ] **Step 2: Run to verify failure** — Run: `deno test packages/shared/src/missions.test.ts` — expect module-not-found.

- [ ] **Step 3: Implement** — `packages/shared/src/missions.ts`:

```ts
// Missions — scheduled background deep-research runs (research-superapp-parity-audit §5). PURE.
// The cadence math lives here (not in SQL, not in the fn) so the edge function and any future
// mobile client advance next_run_at identically, and so it is unit-tested.

import type { EntitlementSnapshot } from "./entitlements.ts";

export type MissionCadence = "daily" | "weekly" | "monthly";
export type MissionDeliver = "in_app" | "email";
export type MissionRunStatus = "completed" | "failed" | "skipped_quota";

export interface MissionSummary {
  id: string;
  question: string;
  report_mode: string;
  cadence: MissionCadence;
  deliver: MissionDeliver;
  status: "active" | "paused";
  next_run_at: string;
  last_run_at: string | null;
  last_run_status: MissionRunStatus | null;
  last_saved_report_id: string | null;
}

/** Advance a mission's cursor. Monthly uses calendar-month arithmetic; JS Date rolls a short month
 *  over (Jan 31 + 1 month → Mar 2/3) — accepted, since "monthly on the 31st" has no universal answer. */
export function nextRunAt(cadence: MissionCadence, from: Date): Date {
  const d = new Date(from.getTime());
  if (cadence === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (cadence === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

export interface MissionEntitlement {
  /** Max scheduled missions the plan allows. Free floor is 0 (deep research is Pro-and-up). */
  limit: number;
}

export function missionEntitlement(snapshot: EntitlementSnapshot | null): MissionEntitlement {
  const e = snapshot?.entitlements ?? {};
  const v = (e as Record<string, unknown>).mission_limit;
  return { limit: typeof v === "number" && Number.isFinite(v) ? v : 0 };
}

/** "2 of 5 scheduled runs used" — the usage line on the Monitoring page. */
export function missionUsageLabel(used: number, limit: number): string {
  return `${used} of ${limit} scheduled ${limit === 1 ? "run" : "runs"} used`;
}

export function cadenceLabel(c: MissionCadence): string {
  return c === "daily" ? "Runs daily" : c === "weekly" ? "Runs weekly" : "Runs monthly";
}
```

- [ ] **Step 4: Run tests to verify pass** — Run: `deno test packages/shared/src/missions.test.ts` — expect all pass. Then run the whole shared suite: `deno test packages/shared/src/` — expect no regressions.

- [ ] **Step 5: Export from the shared index and commit**

Check `packages/shared/src/index.ts` for the existing export list style and add `missions.ts` the same way, then:

```bash
git add packages/shared/src/missions.ts packages/shared/src/missions.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): mission types, cadence math, entitlement + labels"
```

---

### Task 3: Shared mission-email content builder (pure)

**Files:**
- Create: `packages/shared/src/mission-email.ts`
- Test: `packages/shared/src/mission-email.test.ts`
- Modify: `packages/shared/src/index.ts` (export)

**Interfaces:**
- Produces (consumed by Task 4):
  - `buildMissionEmail(args: { question: string; cadence: MissionCadence; reportTitle: string; sources: number; reportUrl: string; manageUrl: string }): { subject: string; html: string; text: string }`
- Consumes: `MissionCadence` from Task 2.

- [ ] **Step 1: Write the failing tests** — `packages/shared/src/mission-email.test.ts`:

```ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildMissionEmail } from "./mission-email.ts";

const args = {
  question: "How effective is tirzepatide for weight loss?",
  cadence: "weekly" as const,
  reportTitle: "How effective is tirzepatide for weight loss?",
  sources: 44,
  reportUrl: "https://app.pharmaorb.app/app/reports/abc-123",
  manageUrl: "https://app.pharmaorb.app/app/monitor",
};

Deno.test("subject names the cadence and the topic", () => {
  const m = buildMissionEmail(args);
  assertEquals(m.subject, "Your weekly research report is ready: How effective is tirzepatide for weight loss?");
});

Deno.test("html and text both carry the report link, source count, and manage link", () => {
  const m = buildMissionEmail(args);
  for (const bodyText of [m.html, m.text]) {
    assertStringIncludes(bodyText, "44 sources");
    assertStringIncludes(bodyText, args.reportUrl);
    assertStringIncludes(bodyText, args.manageUrl);
  }
});

Deno.test("html escapes a question containing markup", () => {
  const m = buildMissionEmail({ ...args, question: "a<b>&c", reportTitle: "a<b>&c" });
  assertStringIncludes(m.html, "a&lt;b&gt;&amp;c");
});

Deno.test("long subject is trimmed to 140 chars", () => {
  const long = "x".repeat(300);
  const m = buildMissionEmail({ ...args, question: long, reportTitle: long });
  assertEquals(m.subject.length <= 140, true);
});
```

- [ ] **Step 2: Run to verify failure** — `deno test packages/shared/src/mission-email.test.ts` — module not found.

- [ ] **Step 3: Implement** — `packages/shared/src/mission-email.ts`:

```ts
// Mission "report ready" email — PURE content builder (the send I/O lives in the research fn).
// Same discipline as watch-digest.ts: everything user-visible is built and tested here.

import type { MissionCadence } from "./missions.ts";

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface MissionEmailArgs {
  question: string;
  cadence: MissionCadence;
  reportTitle: string;
  sources: number;
  reportUrl: string;
  manageUrl: string;
}

export function buildMissionEmail(a: MissionEmailArgs): { subject: string; html: string; text: string } {
  const subjectFull = `Your ${a.cadence} research report is ready: ${a.question}`;
  const subject = subjectFull.length > 140 ? `${subjectFull.slice(0, 139)}…` : subjectFull;
  const srcLine = `${a.sources} sources reviewed and cited`;

  const text = [
    `Your ${a.cadence} research report is ready.`,
    ``,
    a.reportTitle,
    srcLine,
    ``,
    `Read it: ${a.reportUrl}`,
    ``,
    `Manage your scheduled research: ${a.manageUrl}`,
  ].join("\n");

  const html = [
    `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">`,
    `<p style="color:#666;font-size:13px">Your ${esc(a.cadence)} research report is ready</p>`,
    `<h2 style="font-size:18px;margin:8px 0">${esc(a.reportTitle)}</h2>`,
    `<p style="font-size:14px;color:#444">${esc(srcLine)}.</p>`,
    `<p><a href="${esc(a.reportUrl)}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px">Open the report</a></p>`,
    `<p style="font-size:12px;color:#888">You scheduled this research to repeat. <a href="${esc(a.manageUrl)}" style="color:#888">Pause or manage it here</a>.</p>`,
    `</div>`,
  ].join("");

  return { subject, html, text };
}
```

- [ ] **Step 4: Run tests** — `deno test packages/shared/src/mission-email.test.ts` then `deno test packages/shared/src/` — all pass.

- [ ] **Step 5: Export + commit**

```bash
git add packages/shared/src/mission-email.ts packages/shared/src/mission-email.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): pure mission report-ready email builder"
```

---

### Task 4: Research fn — service-role `mission_run` action + dormant email

**Files:**
- Create: `supabase/functions/research/resend.ts` (verbatim copy of `supabase/functions/watch-digest/resend.ts`, with the two `console.warn` prefixes changed from `watch-digest` to `research mission`)
- Modify: `supabase/functions/research/index.ts`

**Interfaces:**
- Consumes: `nextRunAt`, `MissionCadence` (`../../../packages/shared/src/missions.ts`), `buildMissionEmail` (`.../mission-email.ts`), `sendEmail` (`./resend.ts`); existing helpers `consumeQuota`, `insertRun`, `executeRun`, `patchRun`, `json`.
- Produces: POST `{action:"mission_run", mission_id}` with `Authorization: Bearer <service-role-key>` → runs the mission; responses `{ok:true, run_id}` | `{ok:true, skipped:"quota"|"inactive"}` | 4xx. The cron (Task 1) is the only intended caller.
- New env consumed (all optional): `RESEND_API_KEY`, `RESEND_FROM`, `APP_URL` (default `https://app.pharmaorb.app`).

- [ ] **Step 1: Understand the existing flow** — read `supabase/functions/research/index.ts` fully (≈330 lines). The user path is: verify user → optional `action:"scope"` → `consumeQuota` → `insertRun` → `EdgeRuntime.waitUntil(executeRun(...))` → 202 `{run_id}`.

- [ ] **Step 2: Add the service-role gate + mission handler.** In `serve`, IMMEDIATELY after the JSON body is parsed and before the user-path question validation, insert the mission branch (service-role calls carry the service key, not a user JWT, so this must run before `verifyUser` rejects them). Restructure the top of `serve` minimally so body parsing happens before user verification:

```ts
  // Parse the body FIRST: the mission_run action authenticates with the service key (cron caller),
  // not a user JWT, so it must branch before user verification.
  let body: { question?: string; mode?: string; action?: string; mission_id?: string; sub_questions?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400, req);
  }
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");

  // ---- Mission run (service-role only; fired by pg_cron run_due_missions) ----
  if (body.action === "mission_run") {
    if (!token || token !== SERVICE_KEY) return json({ error: "service role required" }, 401, req);
    const missionId = typeof body.mission_id === "string" ? body.mission_id : "";
    if (!missionId) return json({ error: "mission_id required" }, 400, req);
    return await handleMissionRun(missionId, req);
  }

  const userId = await verifyUser(token);
  if (!userId) return json({ error: "authentication required" }, 401, req);
```

(Delete the now-duplicated original `token`/`body` parsing lines so each happens exactly once; the rest of the user path is unchanged.)

- [ ] **Step 3: Implement `handleMissionRun` + helpers** (new section next to the other DB helpers):

```ts
// ---------------------------------------------------------------------------
// Missions (service-role): load the due mission, bill the owner's quota, run the normal pipeline,
// advance the cursor, optionally email. The mission cursor ALWAYS advances (even on skip/failure)
// so a broken mission can't hot-loop the scheduler.
// ---------------------------------------------------------------------------

interface MissionRow {
  id: string;
  user_id: string;
  question: string;
  report_mode: ReportMode;
  cadence: MissionCadence;
  deliver: "in_app" | "email";
  status: "active" | "paused";
}

async function handleMissionRun(missionId: string, req: Request): Promise<Response> {
  const mission = await fetchMission(missionId);
  if (!mission) return json({ error: "mission not found" }, 404, req);
  if (mission.status !== "active") return json({ ok: true, skipped: "inactive" }, 200, req);

  const next = nextRunAt(mission.cadence, new Date()).toISOString();

  const quota = await consumeQuota(mission.user_id);
  if (!quota.allowed) {
    await patchMission(mission.id, {
      last_run_at: new Date().toISOString(),
      last_run_status: "skipped_quota",
      next_run_at: next,
      updated_at: new Date().toISOString(),
    }).catch((e) => console.error("mission skip patch failed:", (e as Error).message));
    return json({ ok: true, skipped: "quota" }, 200, req);
  }

  let runId: string;
  try {
    runId = await insertRun(mission.user_id, mission.question, quota.plan);
  } catch (e) {
    console.error("mission insertRun failed:", (e as Error).message);
    await patchMission(mission.id, {
      last_run_at: new Date().toISOString(),
      last_run_status: "failed",
      next_run_at: next,
      updated_at: new Date().toISOString(),
    }).catch(() => {});
    return json({ error: "could not start mission run" }, 500, req);
  }

  const job = executeMissionRun(mission, runId, next);
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(job);
  else void job;
  return json({ ok: true, run_id: runId }, 202, req);
}

/** The normal executeRun, then mission bookkeeping + optional email. Never rejects. */
async function executeMissionRun(mission: MissionRow, runId: string, nextIso: string): Promise<void> {
  await executeRun(runId, mission.user_id, mission.question, mission.report_mode);
  // Read the finished run row to learn the outcome (executeRun never rejects).
  const run = await fetchRunRow(runId, mission.user_id).catch(() => null);
  const completed = run?.status === "completed";
  await patchMission(mission.id, {
    last_run_at: new Date().toISOString(),
    last_run_status: completed ? "completed" : "failed",
    last_saved_report_id: completed ? run?.saved_report_id ?? null : null,
    next_run_at: nextIso,
    updated_at: new Date().toISOString(),
  }).catch((e) => console.error("mission complete patch failed:", (e as Error).message));

  if (completed && mission.deliver === "email" && run?.saved_report_id) {
    await sendMissionEmail(mission, run.saved_report_id).catch((e) =>
      console.error("mission email failed:", (e as Error).message)
    );
  }
}

async function fetchMission(id: string): Promise<MissionRow | null> {
  const url = new URL(`${SB_URL}/rest/v1/research_missions`);
  url.searchParams.set("id", `eq.${id}`);
  url.searchParams.set("select", "id,user_id,question,report_mode,cadence,deliver,status");
  const res = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  if (!res.ok) return null;
  const rows = await res.json() as MissionRow[];
  return rows[0] ?? null;
}

async function patchMission(id: string, fields: Record<string, unknown>): Promise<void> {
  const url = new URL(`${SB_URL}/rest/v1/research_missions`);
  url.searchParams.set("id", `eq.${id}`);
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`patch mission failed (${res.status})`);
}

async function fetchRunRow(runId: string, userId: string): Promise<{ status: string; saved_report_id: string | null } | null> {
  const url = new URL(`${SB_URL}/rest/v1/research_report_runs`);
  url.searchParams.set("id", `eq.${runId}`);
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("select", "status,saved_report_id");
  const res = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  if (!res.ok) return null;
  const rows = await res.json() as Array<{ status: string; saved_report_id: string | null }>;
  return rows[0] ?? null;
}

/** DORMANT without RESEND_API_KEY/RESEND_FROM (watch-digest posture): skip silently, run still succeeds. */
async function sendMissionEmail(mission: MissionRow, savedReportId: string): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = Deno.env.get("RESEND_FROM") ?? "";
  if (!apiKey || !from) return;
  const appUrl = Deno.env.get("APP_URL") ?? "https://app.pharmaorb.app";

  // Owner's email via GoTrue admin (service key).
  const uRes = await fetch(`${SB_URL}/auth/v1/admin/users/${mission.user_id}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!uRes.ok) return;
  const user = await uRes.json() as { email?: string };
  if (!user.email) return;

  // Report title + count for the email body.
  const rUrl = new URL(`${SB_URL}/rest/v1/saved_reports`);
  rUrl.searchParams.set("id", `eq.${savedReportId}`);
  rUrl.searchParams.set("select", "title,citation_count");
  const rRes = await fetch(rUrl, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  const report = rRes.ok ? (await rRes.json() as Array<{ title: string; citation_count: number }>)[0] : undefined;

  const content = buildMissionEmail({
    question: mission.question,
    cadence: mission.cadence,
    reportTitle: report?.title ?? mission.question,
    sources: report?.citation_count ?? 0,
    reportUrl: `${appUrl}/app/reports/${savedReportId}`,
    manageUrl: `${appUrl}/app/monitor`,
  });
  await sendEmail({ apiKey, from, to: user.email, ...content });
}
```

New imports at the top of index.ts:

```ts
import { nextRunAt, type MissionCadence } from "../../../packages/shared/src/missions.ts";
import { buildMissionEmail } from "../../../packages/shared/src/mission-email.ts";
import { sendEmail } from "./resend.ts";
```

- [ ] **Step 4: Typecheck** — Run: `deno check supabase/functions/research/index.ts` — expect clean. Also run `deno test packages/shared/src/` (unchanged, but confirms the imports resolve).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/research/index.ts supabase/functions/research/resend.ts
git commit -m "feat(research-fn): service-role mission_run action — quota-billed scheduled runs + dormant report-ready email"
```

---

### Task 5: Web API — mission CRUD + run-for-report lookup

**Files:**
- Modify: `apps/web/lib/api.ts` (append a new `// ── Missions ──` section after the watch CRUD section; import `MissionSummary`, `MissionCadence`, `MissionDeliver`, `missionEntitlement` from `@nemesis/shared`)

**Interfaces (produced; consumed by Task 6/7b UI):**
- `fetchMissions(): Promise<MissionSummary[]>` — RLS select, newest first.
- `createMission(input: { question: string; report_mode: string; cadence: MissionCadence; deliver: MissionDeliver }): Promise<{ ok: true; id: string } | { ok: false; reason: "not_enabled" | "limit" | "duplicate" | "auth" | "unknown" }>`
- `setMissionStatus(id: string, status: "active" | "paused"): Promise<void>`
- `deleteMission(id: string): Promise<void>`
- `fetchRunForReport(savedReportId: string): Promise<ResearchRunRow | null>` — for the Task 7b activity trail.

- [ ] **Step 1: Implement** (follow `createWatch`/`deleteWatch`/`setWatchStatus` at api.ts:984+ exactly — same `isPreviewMode` guards, same `isMissingRelation` mapping; duplicate detection = Postgres unique violation code `23505` or message containing `research_missions_user_question_uniq`):

```ts
// ── Missions: scheduled background research runs (research_missions, RLS owner-scoped) ────────

export async function fetchMissions(): Promise<MissionSummary[]> {
  if (isPreviewMode) return [];
  const { data, error } = await supabase
    .from("research_missions")
    .select("id,question,report_mode,cadence,deliver,status,next_run_at,last_run_at,last_run_status,last_saved_report_id")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    if (isMissingRelation(error)) return []; // pre-migration: section renders empty, no crash
    throw new Error(`missions failed: ${error.message}`);
  }
  return (data ?? []) as unknown as MissionSummary[];
}

export type CreateMissionResult = { ok: true; id: string } | { ok: false; reason: "not_enabled" | "limit" | "duplicate" | "auth" | "unknown" };

export async function createMission(input: { question: string; report_mode: string; cadence: MissionCadence; deliver: MissionDeliver }): Promise<CreateMissionResult> {
  if (isPreviewMode) return { ok: false, reason: "not_enabled" };
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess.session?.user?.id;
  if (!userId) return { ok: false, reason: "auth" };
  const { data, error } = await supabase
    .from("research_missions")
    .insert({
      user_id: userId,
      question: input.question.slice(0, 1000),
      report_mode: input.report_mode,
      cadence: input.cadence,
      deliver: input.deliver,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return { ok: false, reason: "not_enabled" };
    if (/mission_limit_exceeded/i.test(error.message ?? "")) return { ok: false, reason: "limit" };
    if (error.code === "23505" || /research_missions_user_question_uniq/i.test(error.message ?? "")) {
      return { ok: false, reason: "duplicate" };
    }
    return { ok: false, reason: "unknown" };
  }
  return data && typeof data.id === "string" ? { ok: true, id: data.id } : { ok: false, reason: "unknown" };
}

export async function setMissionStatus(id: string, status: "active" | "paused"): Promise<void> {
  if (isPreviewMode) return;
  const { error } = await supabase.from("research_missions").update({ status }).eq("id", id);
  if (error) throw new Error(`update mission failed: ${error.message}`);
}

export async function deleteMission(id: string): Promise<void> {
  if (isPreviewMode) return;
  const { error } = await supabase.from("research_missions").delete().eq("id", id);
  if (error) throw new Error(`delete mission failed: ${error.message}`);
}

/** The run row that produced a saved report (RLS-scoped) — powers the report's activity trail. */
export async function fetchRunForReport(savedReportId: string): Promise<ResearchRunRow | null> {
  if (isPreviewMode) return null;
  const { data, error } = await supabase
    .from("research_report_runs")
    .select("id,status,question,progress,saved_report_id,error")
    .eq("saved_report_id", savedReportId)
    .maybeSingle();
  if (error || !isObj(data) || typeof data.id !== "string") return null;
  return {
    id: data.id,
    status: (typeof data.status === "string" ? data.status : "completed") as ResearchRunStatusValue,
    question: typeof data.question === "string" ? data.question : "",
    progress: Array.isArray(data.progress) ? (data.progress as unknown as ResearchProgressStep[]) : [],
    saved_report_id: typeof data.saved_report_id === "string" ? data.saved_report_id : null,
    error: typeof data.error === "string" ? data.error : null,
  };
}
```

NOTE: check the file's existing imports — `MissionSummary`/`MissionCadence`/`MissionDeliver` come from `@nemesis/shared` (Task 2 exported them). `isMissingRelation`, `isObj`, `ResearchProgressStep`, `ResearchRunStatusValue` already exist in the file.

- [ ] **Step 2: Typecheck** — in `apps/web`: `pnpm typecheck` — clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/api.ts
git commit -m "feat(web): mission CRUD + run-for-report lookup in the API layer"
```

---

### Task 6: Mission UI — clock icon, MissionSheet, Monitoring "Scheduled research" section

**Files:**
- Create: `apps/web/components/MissionSheet.tsx`
- Modify: `apps/web/app/app/ask/page.tsx` (ResearchRunCard done state: add clock chip)
- Modify: `apps/web/components/ResearchReportView.tsx` (header export row: add "Repeat this research" chip)
- Modify: `apps/web/app/app/monitor/page.tsx` (add the Scheduled research section)
- Modify: `apps/web/app/styles/shell.css` (only if a needed style is missing — reuse `watch-card*`, `chip-action`, `scope-*` classes first)

**Interfaces:**
- Consumes: `createMission`, `fetchMissions`, `setMissionStatus`, `deleteMission`, `fetchEntitlements` (api.ts); `missionEntitlement`, `missionUsageLabel`, `cadenceLabel`, `MissionSummary`, `MissionCadence`, `MissionDeliver` (`@nemesis/shared`); `Icon` (`@/components/icons` — icon names `clock` if it exists, else `bell`; CHECK `apps/web/components/icons.tsx` for available names first and use an existing one).
- Produces: `<MissionSheet question={string} reportMode={string} onClose={() => void} />` — a small popover/sheet that creates the mission and reports the outcome inline.

- [ ] **Step 1: Build `MissionSheet.tsx`:**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MissionCadence, MissionDeliver } from "@nemesis/shared";
import { missionEntitlement } from "@nemesis/shared";
import { createMission, fetchEntitlements } from "@/lib/api";
import { Icon } from "@/components/icons";

const OUTCOME_COPY: Record<string, string> = {
  not_enabled: "Scheduled research isn’t switched on yet.",
  limit: "You’ve reached your plan’s scheduled-research limit.",
  duplicate: "This research is already scheduled — manage it under Monitoring.",
  auth: "Sign in to schedule research.",
  unknown: "Couldn’t schedule this — try again.",
};

/** "Repeat this research" — the clock-icon sheet (ChatGPT agent's schedule affordance, our engine).
 *  Creates a research_missions row; the cron takes it from there. */
export function MissionSheet({ question, reportMode, onClose }: { question: string; reportMode: string; onClose: () => void }) {
  const [cadence, setCadence] = useState<MissionCadence>("weekly");
  const [deliver, setDeliver] = useState<MissionDeliver>("in_app");
  const [limit, setLimit] = useState<number | null>(null); // null = still loading entitlements
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null); // copy shown after attempt
  const [created, setCreated] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchEntitlements()
      .then((e) => { if (alive) setLimit(missionEntitlement(e).limit); })
      .catch(() => { if (alive) setLimit(0); });
    return () => { alive = false; };
  }, []);

  async function schedule() {
    if (busy) return;
    setBusy(true);
    setOutcome(null);
    try {
      const res = await createMission({ question, report_mode: reportMode, cadence, deliver });
      if (res.ok) {
        setCreated(true);
        setOutcome(`Scheduled. A fresh report will land ${cadence === "daily" ? "every day" : cadence === "weekly" ? "every week" : "every month"} under Reports${deliver === "email" ? " — and in your inbox" : ""}.`);
      } else {
        setOutcome(OUTCOME_COPY[res.reason] ?? OUTCOME_COPY.unknown);
      }
    } finally {
      setBusy(false);
    }
  }

  const proGated = limit === 0;
  return (
    <div className="scope-card mission-sheet" role="dialog" aria-label="Repeat this research on a schedule">
      <div className="ai-block-label"><Icon name="sparkle" size={14} /> Repeat this research</div>
      {proGated ? (
        <>
          <p className="tmpl-note">Scheduled research is a Pro feature — reports re-run automatically and land in your library.</p>
          <div className="scope-actions">
            <Link href="/app/billing" className="chip-action"><Icon name="card" size={14} />See Pro plans</Link>
            <button type="button" className="chip-action" onClick={onClose}>Close</button>
          </div>
        </>
      ) : (
        <>
          <div className="chip-row">
            {(["daily", "weekly", "monthly"] as const).map((c) => (
              <button key={c} type="button" className={`chip-action${cadence === c ? " active" : ""}`} onClick={() => setCadence(c)}>
                {c === "daily" ? "Daily" : c === "weekly" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>
          <div className="chip-row">
            <button type="button" className={`chip-action${deliver === "in_app" ? " active" : ""}`} onClick={() => setDeliver("in_app")}>In-app only</button>
            <button type="button" className={`chip-action${deliver === "email" ? " active" : ""}`} onClick={() => setDeliver("email")}>Email me the report</button>
          </div>
          {outcome ? <p className="tmpl-note">{outcome}</p> : null}
          <div className="scope-actions">
            {created ? (
              <Link href="/app/monitor" className="chip-action"><Icon name="bell" size={14} />Manage in Monitoring</Link>
            ) : (
              <button type="button" className="chip-action" onClick={() => void schedule()} disabled={busy || limit === null}>
                <Icon name="send" size={14} />{busy ? "Scheduling…" : "Schedule"}
              </button>
            )}
            <button type="button" className="chip-action" onClick={onClose}>{created ? "Done" : "Cancel"}</button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Clock chip on the finished research card** (`apps/web/app/app/ask/page.tsx`, `ResearchRunCard`'s `done` branch — currently a single `<Link className="research-card">`). Wrap so the sheet can render under the card:

```tsx
  if (done) {
    return (
      <div className="research-done">
        <Link href={done.id ? `/app/reports/${done.id}` : "/app/reports"} className="research-card" title={done.title}>
          <Icon name="doc" size={15} />
          <span className="research-card-title">Report ready: {done.title}</span>
          <small>{done.sources} sources · {modeLabel}</small>
        </Link>
        <div className="msg-actions">
          <button type="button" className="chip-action" onClick={() => setShowMission((v) => !v)} aria-expanded={showMission}>
            <Icon name="bell" size={14} />Repeat this research
          </button>
        </div>
        {showMission ? <MissionSheet question={card.title} reportMode={card.mode} onClose={() => setShowMission(false)} /> : null}
      </div>
    );
  }
```

with `const [showMission, setShowMission] = useState(false);` added to `ResearchRunCard`, and `import { MissionSheet } from "@/components/MissionSheet";` at the top of the file. NOTE: `card.mode` is a `ReportMode` — pass it through unchanged so a discovery mission re-runs discovery.

- [ ] **Step 3: "Repeat this research" in the report header** (`apps/web/components/ResearchReportView.tsx`). In the export-chip row (the block at ~line 419 with the pdf/docx/pptx buttons), append the same toggle + sheet, using the report's own question/mode: the component receives `report: ResearchReport` — check its fields (`report.question`, `report.mode`) at the top of the file and use those; add the same `useState` + `<MissionSheet …/>` right below the row. Render the chip only when `reportId` is set (it already gates the export row).

- [ ] **Step 4: Monitoring section** (`apps/web/app/app/monitor/page.tsx`). Below the watches list block, add a sibling section:

```tsx
      <section className="watch-section" style={{ marginTop: 28 }}>
        <h3 className="watch-section-h"><Icon name="doc" size={14} /> Scheduled research</h3>
        {missions === null ? null : missions.length === 0 ? (
          <p className="watch-empty">
            Nothing scheduled. Run a Deep research report from <Link href="/app/ask">Ask</Link>, then press
            “Repeat this research” on the finished report to get a fresh one on a schedule.
          </p>
        ) : (
          <div className="watch-card-list">
            {missions.map((m) => (
              <div key={m.id} className="watch-card" title={m.question}>
                <span className={`watch-card-dot${m.status === "active" ? " active" : ""}`} aria-hidden />
                <span className="watch-card-main">
                  <span className="watch-card-title">{m.question}</span>
                  <span className="watch-card-meta">
                    {cadenceLabel(m.cadence)} · next {relTime(m.next_run_at)}
                    {m.last_run_status === "skipped_quota" ? " · last run skipped (daily limit)" : ""}
                    {m.last_run_status === "failed" ? " · last run failed" : ""}
                  </span>
                </span>
                {m.last_saved_report_id ? (
                  <Link href={`/app/reports/${m.last_saved_report_id}`} className="chip-action">Latest report</Link>
                ) : null}
                <button type="button" className="chip-action" onClick={() => void toggleMission(m)}>
                  {m.status === "active" ? "Pause" : "Resume"}
                </button>
                <button type="button" className="chip-action" onClick={() => void removeMission(m.id)} aria-label={`Delete scheduled research: ${m.question}`}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
```

State + handlers in `MonitorPage` (mirror the watches pattern incl. cache seeding):

```tsx
  const [missions, setMissions] = useState<MissionSummary[] | null>(() => getCached<MissionSummary[]>("missions") ?? null);
  // in the existing mount effect, alongside fetchWatches():
  fetchMissions().then((m) => { if (alive) { setMissions(m); setCached("missions", m); } }).catch(() => {});

  async function toggleMission(m: MissionSummary) {
    const status = m.status === "active" ? "paused" : "active";
    await setMissionStatus(m.id, status).catch(() => {});
    const next = (missions ?? []).map((x) => (x.id === m.id ? { ...x, status } : x));
    setMissions(next);
    setCached("missions", next);
  }
  async function removeMission(id: string) {
    await deleteMission(id).catch(() => {});
    const next = (missions ?? []).filter((x) => x.id !== id);
    setMissions(next);
    setCached("missions", next);
  }
```

Imports: `fetchMissions, setMissionStatus, deleteMission` from `@/lib/api`; `cadenceLabel, type MissionSummary` from `@nemesis/shared`. NOTE: `relTime` exists in the file; `next` times are in the FUTURE — extend `relTime` usage with a small local wrapper if it renders future dates oddly: `const relNext = (iso: string) => { const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000); if (!Number.isFinite(mins)) return "—"; if (mins <= 0) return "due now"; if (mins < 60) return `in ${mins}m`; const hrs = Math.round(mins / 60); if (hrs < 24) return `in ${hrs}h`; return `in ${Math.round(hrs / 24)}d`; };` — use `relNext(m.next_run_at)` instead of `relTime`.

- [ ] **Step 5: Styles** — add to `shell.css` only what's missing: `.research-done { display: flex; flex-direction: column; gap: 8px; }` and `.mission-sheet { margin-top: 4px; }` (verify `scope-card`, `chip-action.active`, `watch-card*` already style the rest — they do).

- [ ] **Step 6: Typecheck + build** — `pnpm typecheck` then `pnpm build` in `apps/web` — both clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/MissionSheet.tsx apps/web/app/app/ask/page.tsx apps/web/components/ResearchReportView.tsx apps/web/app/app/monitor/page.tsx apps/web/app/styles/shell.css
git commit -m "feat(web): Repeat-this-research clock sheet + Scheduled research section on Monitoring"
```

---

### Task 7: Pre-run editable plan (engine action + composer step)

**Files:**
- Modify: `supabase/functions/research/index.ts` (new `action:"plan"`; accept `sub_questions` on run)
- Modify: `supabase/functions/ask/research/orchestrate.ts` (cfg.subQuestions bypasses the internal plan call)
- Modify: `apps/web/lib/api.ts` (`planResearchPreview`, `startResearch` optional subQuestions)
- Modify: `apps/web/app/app/ask/page.tsx` (`ScopeTurn` gains an editable plan list)

**Interfaces:**
- `POST /research {action:"plan", question, mode}` (user JWT, NO quota) → `{ sub_questions: string[] }` (empty array on any internal failure — the UI then just runs without a visible plan).
- `startResearch(question, mode, subQuestions?: string[])` — when provided, the run body carries `sub_questions`.
- `runResearch(question, cfg)` — `cfg.subQuestions?: string[]`; when non-empty, the engine SKIPS its own `planResearch` LLM call and uses these verbatim (still capped/validated).

- [ ] **Step 1: Engine — find the `planResearch` call in `orchestrate.ts`** (search `planResearch(`). Add to the config interface `subQuestions?: readonly string[];` with the doc comment: `/** Pre-approved sub-questions from the user's edited plan (research fn action:"plan" → user edit). Non-empty ⇒ the plan step is skipped and these are used verbatim (already validated at the fn boundary). */` — and change the call site to:

```ts
  const subQuestions = cfg.subQuestions?.length
    ? [...cfg.subQuestions]
    : await planResearch(question, cfg.mode, cfg.apiKey);
```

(match the surrounding variable name — read the call site first; keep the existing failure-degrade behavior of `planResearch` untouched.)

- [ ] **Step 2: Engine test.** `supabase/functions/ask/research/research.test.ts` (or the most fitting existing test file — read them; `meta-wiring.test.ts` shows the stub pattern for orchestrate tests). Add a test asserting that when `cfg.subQuestions` is provided, the plan LLM is never called. If orchestrate's tests stub `callTool`/fetch, follow that pattern; the assertion is that the planned sub-questions in the report's method section equal the injected ones. If orchestrate is impractical to test at that level in this suite, put the guard lower: extract a pure helper `resolveSubQuestions(provided: readonly string[] | undefined, planned: () => Promise<string[]>): Promise<string[]>` in `plan.ts`, test THAT (provided non-empty → planned() never invoked; provided empty/undefined → planned() result), and use it at the call site. Run: `deno test supabase/functions/ask/research/` — green.

- [ ] **Step 3: Research fn — plan action + run-body validation.** In `index.ts`, after the scope action block, add:

```ts
  // ---- Plan pre-step: return the 3-6 planned sub-questions for user review/edit. No quota consumed,
  // no run started. Best-effort: any failure returns an empty list and the UI just runs without a plan.
  if (body.action === "plan") {
    try {
      const subQuestions = await planResearch(question, mode, llmApiKey());
      return json({ sub_questions: subQuestions }, 200, req);
    } catch {
      return json({ sub_questions: [] }, 200, req);
    }
  }
```

And where the run starts (before `executeRun` is scheduled), validate + thread the user's plan:

```ts
  // Optional user-edited plan (from action:"plan"): only well-formed, bounded strings pass.
  const subQuestions = Array.isArray(body.sub_questions)
    ? body.sub_questions.filter((s): s is string => typeof s === "string" && s.trim().length > 0 && s.length <= 300).slice(0, 8)
    : undefined;
```

Thread `subQuestions` through `executeRun(runId, userId, question, mode, subQuestions)` → `runResearch(question, { ..., subQuestions })`. Import `planResearch` from `../ask/research/plan.ts` (check its exact exported name/signature in plan.ts first — it may be `planResearch(question, mode, apiKey)`; match it). Mission runs (Task 4) pass no subQuestions — unchanged.

- [ ] **Step 4: Client.** In `api.ts`: add

```ts
/** Preview the research plan (3-6 sub-questions) for user review. Best-effort: [] on any failure. */
export async function planResearchPreview(question: string, mode: ReportMode): Promise<string[]> {
  if (isPreviewMode) return [];
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return [];
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/research`, {
      method: "POST",
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ question, mode, action: "plan" }),
    });
    if (!res.ok) return [];
    const body = await res.json().catch(() => null);
    return isObj(body) && Array.isArray(body.sub_questions)
      ? body.sub_questions.filter((s: unknown): s is string => typeof s === "string").slice(0, 8)
      : [];
  } catch {
    return [];
  }
}
```

and extend `startResearch(question, mode, subQuestions?: string[])` to include `...(subQuestions?.length ? { sub_questions: subQuestions } : {})` in the POST body.

- [ ] **Step 5: Composer step.** In `ask/page.tsx`, extend the scope flow: `ScopeTurnState` gains `plan: string[]`; in `submit()`'s research branch, fetch scope AND plan together — `const [scope, plan] = await Promise.all([scopeResearch(text), planResearchPreview(text, runMode)]);` — and show the scope card whenever there are clarifying questions OR a non-empty plan (`if (scope.needs_clarification || plan.length) { …set scope turn with plan… } else { launch }`). In `ScopeTurn`, render the plan as editable rows above the action buttons:

```tsx
      {plan.length ? (
        <div className="scope-q">
          <div className="scope-q-text">The research plan — edit any line before it runs:</div>
          {planDraft.map((p, i) => (
            <input key={i} className="scope-input" value={p} aria-label={`Planned sub-question ${i + 1}`}
              onChange={(e) => setPlanDraft((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
        </div>
      ) : null}
```

with `const [planDraft, setPlanDraft] = useState<string[]>(() => [...state.plan]);` and `onRun` extended to pass the (trimmed, non-empty) `planDraft` through `launchResearch` → `startResearch(searchQ, runMode, planDraft)`. IMPORTANT: when the user edited scope answers ("Focus: …" enrichment), the edited plan may no longer match the enriched question — that's fine and user-owned; pass both. Keep "Just run it" = original question + NO subQuestions (engine plans itself).

- [ ] **Step 6: Verify** — `deno check supabase/functions/research/index.ts`; `deno test supabase/functions/ask/research/ packages/shared/src/`; `pnpm typecheck` + `pnpm build` in apps/web. All green.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/research/index.ts supabase/functions/ask/research/orchestrate.ts supabase/functions/ask/research/plan.ts apps/web/lib/api.ts apps/web/app/app/ask/page.tsx
git commit -m "feat: editable pre-run research plan — plan action, sub_questions passthrough, composer editing"
```

---

### Task 7b: Activity trail on finished reports

**Files:**
- Modify: `apps/web/app/app/reports/[id]/page.tsx` (read it first — it loads the report and renders `ResearchReportView`; add the run fetch there and pass it down) — if the report page instead lives elsewhere, follow `fetchResearchReport`'s callers.
- Modify: `apps/web/components/ResearchReportView.tsx`

**Interfaces:**
- Consumes: `fetchRunForReport(savedReportId)` (Task 5); `ResearchProgress` component; `ResearchRunRow`.
- Produces: `ResearchReportView` accepts optional `run?: ResearchRunRow | null`.

- [ ] **Step 1:** In the report page component, alongside the existing report fetch: `const [run, setRun] = useState<ResearchRunRow | null>(null);` + `useEffect(() => { let alive = true; if (reportId) fetchRunForReport(reportId).then((r) => { if (alive) setRun(r); }).catch(() => {}); return () => { alive = false; }; }, [reportId]);` and pass `run={run}` to `ResearchReportView`.

- [ ] **Step 2:** In `ResearchReportView`, below the export-chip row, render (only when `run?.progress?.length`):

```tsx
      {run?.progress?.length ? (
        <details className="report-activity">
          <summary className="ai-block-label" style={{ cursor: "pointer" }}>
            <Icon name="sparkle" size={14} /> How this report was researched
          </summary>
          <ResearchProgress steps={run.progress} done />
        </details>
      ) : null}
```

Imports: `ResearchProgress` from `./ResearchProgress`, `type ResearchRunRow` from `@/lib/api`. Add `.report-activity { margin: 10px 0 4px; }` to shell.css if unstyled.

- [ ] **Step 3:** `pnpm typecheck` + `pnpm build` — clean. Commit:

```bash
git add apps/web/components/ResearchReportView.tsx apps/web/app/app/reports apps/web/app/styles/shell.css
git commit -m "feat(web): 'How this report was researched' activity trail on finished reports"
```

---

### Task 8: Playbook gallery

**Files:**
- Create: `apps/web/lib/playbooks.ts`
- Modify: `apps/web/app/app/ask/page.tsx` (welcome screen: playbook chips row under the existing welcome chips)

**Interfaces:**
- Produces: `PLAYBOOKS: readonly Playbook[]` with `interface Playbook { id: string; title: string; question: string; tool: "deep" | "discovery"; }`.

- [ ] **Step 1: Write the curated list** — `apps/web/lib/playbooks.ts`:

```ts
// Playbooks — curated, deterministic task recipes (the Manus pattern): one click seeds the composer
// with a proven question AND arms the right tool. Pure data; no LLM, no fetch.

export interface Playbook {
  id: string;
  title: string;     // short chip label
  question: string;  // the seeded composer text
  tool: "deep" | "discovery";
}

export const PLAYBOOKS: readonly Playbook[] = [
  {
    id: "evidence-brief",
    title: "Evidence brief on a drug",
    question: "What does the current human evidence say about tirzepatide for weight loss — efficacy, safety, and open questions?",
    tool: "deep",
  },
  {
    id: "claim-check-deep",
    title: "Deep-check a viral claim",
    question: "Is it true that creatine causes hair loss? Review the primary evidence for and against.",
    tool: "deep",
  },
  {
    id: "head-to-head",
    title: "Compare two treatments",
    question: "How does semaglutide compare with tirzepatide for weight loss in adults — pooled efficacy and adverse events?",
    tool: "deep",
  },
  {
    id: "research-gaps",
    title: "Find the research gaps",
    question: "Where are the research gaps in using GLP-1 receptor agonists for alcohol use disorder?",
    tool: "discovery",
  },
] as const;
```

- [ ] **Step 2: Render on the welcome screen** (`ask/page.tsx`, inside the `!hasThread` welcome block, after the existing `welcome-chips` row):

```tsx
            <div className="chip-row welcome-chips" aria-label="Playbooks — one-click research recipes">
              {PLAYBOOKS.map((p) => (
                <button key={p.id} type="button" className="chip-action" title={p.question}
                  onClick={() => { setMode(p.tool); setQuestion(p.question); taRef.current?.focus(); }}>
                  <Icon name="doc" size={14} />{p.title}
                </button>
              ))}
            </div>
```

Import `PLAYBOOKS` from `@/lib/playbooks`. Note the armed tool is visible in the depth dial (and single-shot per the existing behavior); the user can edit the seeded question before sending.

- [ ] **Step 3:** `pnpm typecheck` + build — clean. Commit:

```bash
git add apps/web/lib/playbooks.ts apps/web/app/app/ask/page.tsx
git commit -m "feat(web): playbook chips — curated one-click research recipes on the welcome screen"
```

---

### Task 9: Batch mission creation

**Files:**
- Modify: `apps/web/components/MissionSheet.tsx`

**Interfaces:**
- Consumes: `createMission` (Task 5). No new API.

- [ ] **Step 1:** Add a collapsed "Schedule several at once" affordance to `MissionSheet` (below the deliver row, above outcome):

```tsx
          <details className="mission-batch">
            <summary className="muted-label" style={{ cursor: "pointer" }}>Schedule several at once</summary>
            <p className="tmpl-note">One question per line — each becomes its own scheduled research run (same cadence and delivery).</p>
            <textarea
              className="scope-input"
              rows={3}
              value={batch}
              aria-label="Additional questions to schedule, one per line"
              onChange={(e) => setBatch(e.target.value)}
              placeholder={"How does semaglutide compare with tirzepatide for weight loss?\nWhat is the current evidence on berberine for blood sugar?"}
            />
          </details>
```

with `const [batch, setBatch] = useState("");` and `schedule()` extended: build `const questions = [question, ...batch.split("\n").map((s) => s.trim()).filter(Boolean)].slice(0, 10);` then create sequentially, counting outcomes:

```tsx
      let okCount = 0;
      let firstError: string | null = null;
      for (const q of questions) {
        const res = await createMission({ question: q, report_mode: reportMode, cadence, deliver });
        if (res.ok) okCount++;
        else if (res.reason === "limit") { firstError = OUTCOME_COPY.limit; break; } // cap reached — stop, don't spam errors
        else if (!firstError) firstError = OUTCOME_COPY[res.reason] ?? OUTCOME_COPY.unknown;
      }
      if (okCount > 0) {
        setCreated(true);
        setOutcome(`Scheduled ${okCount} ${okCount === 1 ? "run" : "runs"}.${firstError ? ` ${firstError}` : ""}`);
      } else {
        setOutcome(firstError ?? OUTCOME_COPY.unknown);
      }
```

(replacing the single-question body of `schedule()`; the single-question path is just `questions.length === 1`).

- [ ] **Step 2:** `pnpm typecheck` + build — clean. Commit:

```bash
git add apps/web/components/MissionSheet.tsx
git commit -m "feat(web): batch mission creation — schedule several research questions at once"
```

---

### Task 10: Docs + roadmap touch

**Files:**
- Modify: `docs/design/research-superapp-parity-audit.md` (§9 build-order table: mark rows 1, 2 (trail part), 4→plan, playbooks as "built on feat/missions-v1"; add one line to §5 noting Missions v1 is implemented and awaiting the owner-gated migration + fn deploy)

- [ ] **Step 1:** Make the edits (keep them to status annotations — no restructuring).
- [ ] **Step 2:** Commit: `git add docs/design/research-superapp-parity-audit.md && git commit -m "docs: mark missions v1 + agent-grammar items built (pending owner-gated apply/deploy)"`

---

## Ship checklist (controller, after final review — NOT a subagent task)

1. Full verification: `deno test packages/shared/src/ supabase/functions/ask/research/`; `deno check supabase/functions/research/index.ts`; `pnpm typecheck && pnpm build` in apps/web.
2. Final whole-branch review (most capable model) with the branch diff package.
3. Push branch, open PR. **DEPLOY ORDER IS BINDING: the research function must be deployed to prod BEFORE (or atomically with) the web merge** — the new web client sends action:"plan" on every deep-research start, and the currently-deployed fn treats an unknown action as a REAL run (double quota burn + a phantom report per question). The MIGRATION alone is safe to defer (missing table degrades to not_enabled everywhere); the fn deploy is not.
4. **OWNER-GATED (explicit fresh ask, all three):** apply `20260703000000_research_missions.sql` via MCP apply_migration → deploy the `research` function (`supabase functions deploy research --project-ref qyjmivntajbigjswhahb --use-api`) → owner later sets the `mission_run_url` Vault secret to activate the cron (documented in the migration header).
5. Post-deploy: create one real mission on the owner account, manually invoke `select public.run_due_missions();` (or wait a tick), verify a report lands + mission cursor advances; run the guardrail suite (research fn shares the ask engine's modules — required after any deploy touching them).
6. Merge PR; update memory.
