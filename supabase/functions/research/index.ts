// Supabase Edge Function: research (Deep Research mode).
//
// Async, Pro-gated deep-research jobs. A run is NOT a chat answer — it's a saved, cited REPORT produced
// by the multi-step engine in ../ask/research/orchestrate.ts (plan → gather → synthesize →
// detectViolations → faithfulness). That engine reuses the FROZEN /ask safety layer verbatim.
//
// Flow:
//   verify user → consume_usage('deep_research_daily') [Pro gate + daily limit in one] →
//   insert research_report_runs (status 'running') → return { run_id } immediately (202) →
//   EdgeRuntime.waitUntil(runResearch): stream progress to the run row, then store the report in
//   saved_reports and flip the run to 'completed' (or 'failed' on error).
//
// The web client polls the run row (RLS-scoped to the user) for live progress, then reads the finished
// report from saved_reports.payload. Service key is used for the writes, scoped to the verified user id.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { runResearch } from "../ask/research/orchestrate.ts";
import { scopeQuestion } from "../ask/research/scope.ts";
import { planSubQuestions } from "../ask/research/plan.ts";
import { hasLlmKey, llmApiKey } from "../ask/llm.ts";
import { persistDiscoveryProject } from "./discovery-persist.ts";
import type { ReportMode, ResearchProgressStep, ResearchReport } from "../../../packages/shared/src/research.ts";
import { nextRunAt, type MissionCadence } from "../../../packages/shared/src/missions.ts";
import { buildMissionEmail } from "../../../packages/shared/src/mission-email.ts";
import { sendEmail } from "./resend.ts";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://app.pharmaorb.app",
  "https://pharmaorb.app",
  "https://www.pharmaorb.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:8081",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:8081",
];

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const LIVE_SOURCES_ON = Deno.env.get("LIVE_SOURCES") === "on";

// Supabase edge runtime keeps the worker alive past the response for background work. Typed loosely so
// the file type-checks outside the edge runtime (local tooling); guarded at the call site.
declare const EdgeRuntime: { waitUntil?: (p: Promise<unknown>) => void } | undefined;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, req);
  if (!hasLlmKey()) return json({ error: "LLM API key not configured" }, 500, req);

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

  const question = (body.question ?? "").trim();
  if (!question) return json({ error: "question required" }, 400, req);
  if (question.length > 1000) return json({ error: "question too long" }, 400, req);
  const mode: ReportMode = body.mode === "meta"
    ? "meta"
    : body.mode === "structured_review"
    ? "structured_review"
    : body.mode === "lab_draft"
    ? "lab_draft"
    : body.mode === "discovery"
    ? "discovery"
    : "standard";

  // ---- Scoping pre-step: return clarifying questions only. No quota consumed and no run started — the
  // real run (a later POST WITHOUT action:"scope") is what bills a deep-research slot. Best-effort:
  // scopeQuestion degrades to needs_clarification:false on any failure, so this never blocks a run. ----
  if (body.action === "scope") {
    const scope = await scopeQuestion(question, llmApiKey());
    return json(scope, 200, req);
  }

  // ---- Plan pre-step: return the 3-6 planned sub-questions for user review/edit. No quota consumed,
  // no run started. Best-effort: any failure returns an empty list and the UI just runs without a plan.
  if (body.action === "plan") {
    try {
      const subQuestions = await planSubQuestions(question, llmApiKey(), mode);
      return json({ sub_questions: subQuestions }, 200, req);
    } catch {
      return json({ sub_questions: [] }, 200, req);
    }
  }

  // ---- Pro gate + daily limit (one call): deep_research_daily_limit is 0 for free/plus, 3 for pro ----
  const quota = await consumeQuota(userId);
  if (!quota.allowed) {
    return json({
      error: "quota_exceeded",
      counter_key: "deep_research_daily",
      reason: quota.reason,
      used: quota.used,
      limit: quota.limit,
      plan: quota.plan,
    }, 429, req);
  }

  // ---- create the run row (status running) ----
  // Retry once before failing: the quota unit was already consumed (consume_usage is committed and has
  // no rollback RPC), so a transient PostgREST blip should not silently cost a Pro user a daily run.
  let runId: string;
  try {
    runId = await insertRun(userId, question, quota.plan);
  } catch {
    try {
      runId = await insertRun(userId, question, quota.plan);
    } catch (e) {
      console.error("research insertRun failed after retry:", (e as Error).message);
      return json({ error: "could not start research" }, 500, req);
    }
  }

  // Optional user-edited plan (from action:"plan"): only well-formed, bounded strings pass.
  const subQuestions = Array.isArray(body.sub_questions)
    ? body.sub_questions.filter((s): s is string => typeof s === "string" && s.trim().length > 0 && s.length <= 300).slice(0, 8)
    : undefined;

  // ---- execute in the background; respond immediately with the run id ----
  const job = executeRun(runId, userId, question, mode, subQuestions);
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(job);
  } else {
    // No background runtime (local/dev): don't block the response on a long job, but keep the promise
    // referenced so it isn't GC'd. Errors are handled inside executeRun (it never rejects).
    void job;
  }
  return json({ run_id: runId, status: "running" }, 202, req);
});

/** Run the engine, streaming progress to the run row, then persist the report. Never rejects. */
async function executeRun(runId: string, userId: string, question: string, mode: ReportMode, subQuestions?: string[]): Promise<void> {
  const steps: ResearchProgressStep[] = [];
  try {
    const report = await runResearch(question, {
      apiKey: llmApiKey(),
      sbUrl: SB_URL,
      serviceKey: SERVICE_KEY,
      liveOn: LIVE_SOURCES_ON,
      mode,
      subQuestions,
      onProgress: (step) => {
        steps.push(step);
        // Best-effort live update; a dropped progress patch must not fail the run.
        void patchRun(runId, userId, { progress: steps }).catch((e) =>
          console.error("research progress patch failed:", (e as Error).message)
        );
      },
    });

    const savedReportId = await insertSavedReport(userId, question, report);
    const discoveryProjectId = report.discovery
      ? await persistDiscoveryProject({
        sbUrl: SB_URL,
        serviceKey: SERVICE_KEY,
        userId,
        runId,
        savedReportId,
        report,
      })
      : null;
    await patchRun(runId, userId, {
      status: "completed",
      progress: steps,
      saved_report_id: savedReportId,
      source_ids: report.citations.map((c) => c.source_id),
      metadata: discoveryProjectId ? { report_mode: report.mode ?? mode, discovery_project_id: discoveryProjectId } : { report_mode: report.mode ?? mode },
      completed_at: new Date().toISOString(),
    });
  } catch (e) {
    // Log the real detail server-side; store a GENERIC message on the row (it is read by the client),
    // so Postgres / LLM-provider internals never reach the user — same posture as ask/index.ts.
    console.error("research run failed (detail):", (e as Error).message);
    await patchRun(runId, userId, {
      status: "failed",
      progress: steps,
      error: "Research could not be completed. Please try again.",
      completed_at: new Date().toISOString(),
    }).catch(() => {});
  }
}

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

// ---------------------------------------------------------------------------
// DB helpers (service key; every write scoped to the verified user id)
// ---------------------------------------------------------------------------

async function verifyUser(token: string): Promise<string | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = await res.json() as { id?: string; is_anonymous?: boolean };
    if (!user.id || user.is_anonymous) return null;
    return user.id;
  } catch {
    return null;
  }
}

interface QuotaResult {
  allowed: boolean;
  reason: string;
  plan: string;
  used: number;
  limit: number | null;
}

async function consumeQuota(userId: string): Promise<QuotaResult> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/consume_usage`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_user_id: userId,
      p_counter_key: "deep_research_daily",
      p_cost: 1,
      p_metadata: { surface: "research" },
    }),
  });
  if (!res.ok) throw new Error(`usage check failed (${res.status})`);
  const raw = await res.json() as Partial<QuotaResult>;
  return {
    allowed: raw.allowed === true,
    reason: typeof raw.reason === "string" ? raw.reason : "unknown",
    plan: typeof raw.plan === "string" ? raw.plan : "free",
    used: typeof raw.used === "number" ? raw.used : 0,
    limit: typeof raw.limit === "number" ? raw.limit : null,
  };
}

async function insertRun(userId: string, question: string, plan: string): Promise<string> {
  const res = await fetch(`${SB_URL}/rest/v1/research_report_runs`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      user_id: userId,
      report_kind: "deep_research",
      report_depth: "deep",
      question,
      status: "running",
      plan,
      counter_key: "deep_research_daily",
      progress: [],
    }),
  });
  if (!res.ok) throw new Error(`insert run failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json() as Array<{ id: string }>;
  const id = rows[0]?.id;
  if (!id) throw new Error("insert run returned no id");
  return id;
}

async function insertSavedReport(userId: string, question: string, report: ResearchReport): Promise<string | null> {
  try {
    const title = question.length > 120 ? `${question.slice(0, 117)}…` : question;
    const res = await fetch(`${SB_URL}/rest/v1/saved_reports`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        user_id: userId,
        title,
        kind: "deep_research",
        report_depth: "deep",
        status: "completed",
        mode: report.mode ?? "standard",
        payload: report,
        source_ids: report.citations.map((c) => c.source_id),
        citation_count: report.citations.length,
        completed_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      console.error("research insertSavedReport failed:", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const rows = await res.json() as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  } catch (e) {
    console.error("research insertSavedReport threw:", (e as Error).message);
    return null;
  }
}

async function patchRun(runId: string, userId: string, fields: Record<string, unknown>): Promise<void> {
  const url = new URL(`${SB_URL}/rest/v1/research_report_runs`);
  url.searchParams.set("id", `eq.${runId}`);
  // Defense-in-depth: scope the patch to the owner too (runId is a server uuid, but this guarantees a
  // patch can never touch another user's row even if an id were ever guessed/leaked).
  url.searchParams.set("user_id", `eq.${userId}`);
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
  if (!res.ok) throw new Error(`patch run failed (${res.status})`);
}

// ---------------------------------------------------------------------------
// CORS + JSON
// ---------------------------------------------------------------------------

function allowedOrigins(): string[] {
  const env = Deno.env.get("WEB_ALLOWED_ORIGINS");
  if (!env) return DEFAULT_ALLOWED_ORIGINS;
  return [...DEFAULT_ALLOWED_ORIGINS, ...env.split(",").map((s) => s.trim()).filter(Boolean)];
}

function isAllowedOrigin(origin: string): boolean {
  if (allowedOrigins().includes(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

function corsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("origin") ?? "";
  const allowOrigin = origin && isAllowedOrigin(origin) ? origin : "https://app.pharmaorb.app";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(payload: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}
