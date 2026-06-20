// Supabase Edge Function: watch-check (Live Monitoring, WS-D).
//
// Runs ONE watch cycle for a given watch_id and persists the result. This is the SERVICE-ROLE / cron
// path: the scheduler (increment 7, pg_cron) invokes it for each due watch. It is deliberately THIN —
// all the decision logic is pure and unit-tested elsewhere:
//   • windowSince / gatherDatedCandidates  (dated-sources.ts)  — what's new since the cursor
//   • runWatchCycle                          (watch-cycle.ts)   — evidence delta + news delta
//   • planPersistence                        (plan-persistence.ts) — what to write (the WS-F-trap part)
// index.ts only does auth + the DB I/O (load the watch + known-set, then the plan's mechanical writes).
//
// WRITE ORDER IS A CORRECTNESS INVARIANT (idempotent + resumable, per the spec):
//   events → known-set → cursor.  Each step throws on failure (never swallowed), so a mid-cycle failure
//   halts BEFORE the cursor advances → the next run re-covers the same date window. Re-inserting events
//   is safe (watch_events UNIQUE(watch_id,channel,source_key) + resolution=ignore-duplicates), and the
//   known-set diff means re-fetched sources don't double-surface. Advancing the cursor LAST is what makes
//   a missed/crashed run self-heal instead of silently dropping a new paper.
//
// Guardrails: detection is deterministic source IDs (never LLM-guessed); news stays feed-only (the wall
// is enforced in planPersistence + the schema CHECK); per-watch fetch is time-bounded + fault-tolerant.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { acceptedCallerKeys } from "./auth-keys.ts";
import { gatherDatedCandidates, windowSince, withTimeout } from "./dated-sources.ts";
import type { WatchSource } from "../../../packages/shared/src/watch-detect.ts";
import { fetchGoogleNews } from "../news/news-source.ts";
import { runWatchCycle } from "./watch-cycle.ts";
import { planPersistence, type WatchState } from "./plan-persistence.ts";
import {
  buildRetractionSources,
  fetchRetractedPmids,
  recheckCandidatesFromEvents,
  type WatchEventRowForRecheck,
} from "./retraction-recheck.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Callers this internal cron path accepts: the legacy service-role key (still auto-injected) OR any
// new-format secret key (sb_secret_…) from SUPABASE_SECRET_KEYS. Accepting a named secret key lets the
// scheduler use a stable key we set explicitly on both sides, instead of matching the brittle auto-injected
// legacy value. DB writes below still use SERVICE_KEY (legacy keys remain valid through 2026); this only
// widens who may TRIGGER a cycle. (Logic is pure + unit-tested in auth-keys.test.ts.)
const ACCEPTED_CALLER_KEYS = acceptedCallerKeys(SERVICE_KEY, Deno.env.get("SUPABASE_SECRET_KEYS"));
const NCBI_API_KEY = Deno.env.get("NCBI_API_KEY") ?? undefined;
const OPENFDA_API_KEY = Deno.env.get("OPENFDA_API_KEY") ?? undefined;
const RECHECK_TIMEOUT_MS = 6000; // bound the retraction recheck like a dated source — never sink the cycle

const DEFAULT_ALLOWED_ORIGINS = [
  "https://app.pharmaorb.app",
  "https://pharmaorb.app",
  "https://www.pharmaorb.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

interface WatchRow {
  id: string;
  user_id: string;
  query_terms: string;
  mentions: string[] | null;
  include_news: boolean;
  status: string;
  last_checked_at: string | null;
  baselined_at: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, req);
  if (!SB_URL || !SERVICE_KEY) return json({ error: "server not configured" }, 500, req);

  // SERVICE-ROLE only: this is the cron/internal path. The watch_known_sources + watch_events INSERT
  // policies are service-role-only by design, so the caller must present a service-role-privileged key
  // (the legacy service-role key or a new-format secret key — see ACCEPTED_CALLER_KEYS).
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || !ACCEPTED_CALLER_KEYS.has(token)) return json({ error: "service role required" }, 401, req);

  let body: { watch_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400, req);
  }
  const watchId = (body.watch_id ?? "").trim();
  if (!watchId) return json({ error: "watch_id required" }, 400, req);

  try {
    const result = await runOneWatch(watchId);
    return json(result, 200, req);
  } catch (e) {
    console.error("watch-check failed:", (e as Error).message);
    return json({ error: "watch check failed" }, 500, req);
  }
});

async function runOneWatch(watchId: string) {
  const watch = await loadWatch(watchId);
  if (!watch) return { ok: false, reason: "watch not found" };
  if (watch.status !== "active") return { ok: false, reason: `watch ${watch.status}` };

  const nowIso = new Date().toISOString();
  const firstRun = watch.baselined_at === null;
  const since = windowSince(watch.last_checked_at ? new Date(watch.last_checked_at) : null, { now: new Date(nowIso) });

  const known = await loadKnownKeys(watchId);

  // Cheap dated fetch (the keystone): query the sources for what's new since the cursor. The expensive
  // grounded engine does NOT run here — only on a confirmed change, in a later increment.
  const evidenceSources = await gatherDatedCandidates({
    query: watch.query_terms,
    mentions: watch.mentions ?? [],
    since,
    until: new Date(nowIso),
    ncbiApiKey: NCBI_API_KEY,
    openFdaApiKey: OPENFDA_API_KEY,
  });
  const newsItems = watch.include_news ? await fetchGoogleNews({ query: watch.query_terms }) : [];

  // Retraction recheck (the edat-window blind spot): a paper ALREADY in the known-set that is LATER
  // retracted never reappears in the dated query → silently missed. So re-check the high-tier PubMed
  // papers this watch already surfaced, and fold any now-retracted ones in as DISTINCT synthetic
  // sources (pubmed_oa:<pmid>#retracted) that flow through the SAME detector → a loud retraction alert,
  // once. Skipped on the baseline (no prior events). Fault-tolerant + time-bounded like the dated fetch:
  // a failed/slow recheck yields [] and never sinks the cycle, and never blocks the cursor from advancing.
  const retractionSources = firstRun
    ? []
    : await withTimeout(() => gatherRetractionSources(watchId), RECHECK_TIMEOUT_MS);

  const cycle = runWatchCycle({
    evidenceSources: [...evidenceSources, ...retractionSources],
    newsItems,
    knownEvidenceKeys: known.evidence,
    knownNewsKeys: known.news,
    firstRun,
  });

  const state: WatchState = {
    watchId,
    userId: watch.user_id,
    firstRun,
    priorKnownEvidenceKeys: known.evidence,
    priorKnownNewsKeys: known.news,
  };
  const plan = planPersistence({ state, cycle, now: nowIso });

  // WRITE ORDER (see header): events → known-set → cursor. Each throws on failure → no cursor advance.
  // watch_events: its PK is `id uuid`, but the dedupe key is the SEPARATE UNIQUE(watch_id,channel,source_key).
  // PostgREST's ignore-duplicates targets the PK by default, so without on_conflict a retry would get a
  // fresh uuid, dodge the PK, trip the UNIQUE → 23505 → throw → wedge the watch. Point it at the real key.
  await insertRows("watch_events", plan.eventsToInsert, "watch_id,channel,source_key");
  await insertRows("watch_known_sources", plan.keysToUpsert); // PK (watch_id,channel,source_key) IS the dedupe key
  await patchWatch(watchId, {
    last_checked_at: plan.cursorAdvanceTo,
    ...(plan.setBaselinedAt ? { baselined_at: plan.setBaselinedAt } : {}),
    updated_at: nowIso,
  });

  return {
    ok: true,
    baseline: cycle.evidence.baseline,
    new_evidence: cycle.evidence.newSources.length,
    alerts: cycle.evidence.alerts.length,
    new_news: cycle.news.newItems.length,
    events_written: plan.eventsToInsert.length,
  };
}

/**
 * Re-check the high-tier PubMed papers this watch already surfaced and return a retraction-classified
 * synthetic source for each now flagged retracted. Self-contained fault-tolerance: any failure (events
 * read, efetch) → [] (logged, non-fatal). The caller additionally races it against a timeout. The
 * synthetic key is distinct from the original paper's, so it surfaces once then dedupes via the known-set.
 */
async function gatherRetractionSources(watchId: string): Promise<WatchSource[]> {
  try {
    const candidates = recheckCandidatesFromEvents(await loadHighTierEvidenceEvents(watchId));
    if (candidates.length === 0) return [];
    const retracted = await fetchRetractedPmids({ pmids: candidates.map((c) => c.pmid), ncbiApiKey: NCBI_API_KEY });
    return buildRetractionSources(candidates, retracted);
  } catch (e) {
    console.warn("watch/retraction recheck failed (non-fatal):", (e as Error).message);
    return [];
  }
}

// ── DB I/O (raw PostgREST, service role — same pattern as research/index.ts) ──────────────────────
/** The watch's loud evidence alerts so far — the high-tier papers worth re-checking for a retraction. */
async function loadHighTierEvidenceEvents(watchId: string): Promise<WatchEventRowForRecheck[]> {
  const url = new URL(`${SB_URL}/rest/v1/watch_events`);
  url.searchParams.set("watch_id", `eq.${watchId}`);
  url.searchParams.set("channel", "eq.evidence");
  url.searchParams.set("is_alert", "is.true");
  url.searchParams.set("select", "channel,source_key,is_alert,title");
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`load watch events failed (${res.status})`);
  return await res.json() as WatchEventRowForRecheck[];
}

async function loadWatch(watchId: string): Promise<WatchRow | null> {
  const url = new URL(`${SB_URL}/rest/v1/evidence_watches`);
  url.searchParams.set("id", `eq.${watchId}`);
  url.searchParams.set(
    "select",
    "id,user_id,query_terms,mentions,include_news,status,last_checked_at,baselined_at",
  );
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`load watch failed (${res.status})`);
  const rows = await res.json() as WatchRow[];
  return rows[0] ?? null;
}

async function loadKnownKeys(watchId: string): Promise<{ evidence: string[]; news: string[] }> {
  const url = new URL(`${SB_URL}/rest/v1/watch_known_sources`);
  url.searchParams.set("watch_id", `eq.${watchId}`);
  url.searchParams.set("select", "channel,source_key");
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`load known sources failed (${res.status})`);
  const rows = await res.json() as Array<{ channel: string; source_key: string }>;
  const evidence: string[] = [];
  const news: string[] = [];
  for (const r of rows) (r.channel === "news" ? news : evidence).push(r.source_key);
  return { evidence, news };
}

async function insertRows(table: string, rows: readonly unknown[], onConflictCols?: string): Promise<void> {
  if (rows.length === 0) return;
  const url = new URL(`${SB_URL}/rest/v1/${table}`);
  // Without on_conflict, PostgREST resolves ignore-duplicates against the PK; pass the business UNIQUE
  // key for tables (watch_events) whose dedupe constraint is NOT the primary key.
  if (onConflictCols) url.searchParams.set("on_conflict", onConflictCols);
  const res = await fetch(url, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json", Prefer: "return=minimal,resolution=ignore-duplicates" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`insert ${table} failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

async function patchWatch(watchId: string, fields: Record<string, unknown>): Promise<void> {
  const url = new URL(`${SB_URL}/rest/v1/evidence_watches`);
  url.searchParams.set("id", `eq.${watchId}`);
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`patch watch failed (${res.status})`);
}

function authHeaders(): Record<string, string> {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

// ── CORS + JSON ───────────────────────────────────────────────────────────────────────────────
function isAllowedOrigin(origin: string): boolean {
  if (DEFAULT_ALLOWED_ORIGINS.includes(origin)) return true;
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
