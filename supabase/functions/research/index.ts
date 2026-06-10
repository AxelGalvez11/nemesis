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
import { hasLlmKey, llmApiKey } from "../ask/llm.ts";
import type { ResearchProgressStep, ResearchReport } from "../../../packages/shared/src/research.ts";

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

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyUser(token);
  if (!userId) return json({ error: "authentication required" }, 401, req);

  let body: { question?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400, req);
  }
  const question = (body.question ?? "").trim();
  if (!question) return json({ error: "question required" }, 400, req);
  if (question.length > 1000) return json({ error: "question too long" }, 400, req);

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

  // ---- execute in the background; respond immediately with the run id ----
  const job = executeRun(runId, userId, question);
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
async function executeRun(runId: string, userId: string, question: string): Promise<void> {
  const steps: ResearchProgressStep[] = [];
  try {
    const report = await runResearch(question, {
      apiKey: llmApiKey(),
      sbUrl: SB_URL,
      serviceKey: SERVICE_KEY,
      liveOn: LIVE_SOURCES_ON,
      onProgress: (step) => {
        steps.push(step);
        // Best-effort live update; a dropped progress patch must not fail the run.
        void patchRun(runId, userId, { progress: steps }).catch((e) =>
          console.error("research progress patch failed:", (e as Error).message)
        );
      },
    });

    const savedReportId = await insertSavedReport(userId, question, report);
    await patchRun(runId, userId, {
      status: "completed",
      progress: steps,
      saved_report_id: savedReportId,
      source_ids: report.citations.map((c) => c.source_id),
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
