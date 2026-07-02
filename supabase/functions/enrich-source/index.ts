// Supabase Edge Function: enrich-source
//
// Batch source-enrichment endpoint. The client sends the PMIDs visible in the
// evidence panel; we serve from the source_enrichment cache (Task 1) and fill
// misses live (OpenAlex + scite via providers.ts, study snapshot via
// snapshot.ts). Best-effort per id — one bad id never fails the batch, and any
// failure degrades a card to exactly today's render (no spinner, no error state).
//
// Auth + CORS mirror the ask/compare functions: explicit verifyUser(token) 401
// gate (defense-in-depth on top of the platform's verify_jwt default) and an
// origin-allowlist CORS reflection (not a wildcard).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { fetchEnrichmentBase, type SourceEnrichment } from "./providers.ts";
import { extractSnapshot } from "./snapshot.ts";
import { isFresh, parsePmids } from "./cache.ts";

const TTL_DAYS = 30;
const MAX_BATCH = 24;
// scite's public tallies endpoint is throttled to <=5 req/s (carry-forward constraint
// from the Task 3 review). Misses are resolved SEQUENTIALLY (one pmid's OpenAlex+scite+
// snapshot chain at a time) rather than fanned out with Promise.all, so at most one
// scite call is in flight at any moment — well under the 5 req/s ceiling by construction,
// regardless of batch size (capped at MAX_BATCH=24 anyway).
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

interface CacheRow {
  key: string;
  payload: SourceEnrichment;
  fetched_at: string;
}

async function loadCachedRows(keys: string[]): Promise<CacheRow[]> {
  if (keys.length === 0) return [];
  try {
    const url = new URL(`${SB_URL}/rest/v1/source_enrichment`);
    url.searchParams.set("select", "key,payload,fetched_at");
    url.searchParams.set("key", `in.(${keys.join(",")})`);
    const res = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    });
    if (!res.ok) return [];
    return (await res.json()) as CacheRow[];
  } catch {
    return [];
  }
}

async function upsertCacheRow(key: string, payload: SourceEnrichment): Promise<void> {
  try {
    await fetch(`${SB_URL}/rest/v1/source_enrichment`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ key, payload, fetched_at: new Date().toISOString() }),
    });
  } catch {
    // Best-effort: a failed cache write just means the next request refetches live.
  }
}

/** Resolve one cache-missed pmid's full enrichment (OpenAlex + scite + snapshot). Never throws.
 * `cacheable` is true only when OpenAlex actually ANSWERED (data, or a definitive 4xx "no
 * such record"); an outage-class failure (network error, timeout, 5xx) must not be cached —
 * its nulls (notably retracted:false) are not authoritative, and writing them would both
 * hide a retraction banner for the whole TTL and overwrite a stale-but-correct row. Partial
 * success (OpenAlex ok, scite/snapshot failed) still caches. */
async function resolveMiss(pmid: string): Promise<{ payload: SourceEnrichment; cacheable: boolean }> {
  const { fetched, ...base } = await fetchEnrichmentBase(pmid);
  const snapshot = await extractSnapshot(pmid);
  return { payload: { ...base, snapshot }, cacheable: fetched };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, req);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyUser(token);
  if (!userId) return json({ error: "authentication required" }, 401, req);

  let body: { pmids?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad request" }, 400, req);
  }

  const pmids = parsePmids(body?.pmids, MAX_BATCH);
  const results: Record<string, SourceEnrichment> = {};
  if (pmids.length === 0) return json({ results }, 200, req);

  const keys = pmids.map((p) => `pmid:${p}`);
  const cached = await loadCachedRows(keys);
  const now = Date.now();
  const fresh = new Set<string>();
  for (const row of cached) {
    if (isFresh(row.fetched_at, now, TTL_DAYS)) {
      results[row.key] = row.payload;
      fresh.add(row.key);
    }
  }

  const misses = pmids.filter((p) => !fresh.has(`pmid:${p}`));
  // Sequential on purpose (see the scite rate-limit note above): each iteration completes
  // its OpenAlex+scite+snapshot chain — and its cache write — before the next pmid starts.
  for (const pmid of misses) {
    const { payload, cacheable } = await resolveMiss(pmid);
    results[`pmid:${pmid}`] = payload;
    // Outage-class provider failures are served best-effort but NOT cached: the next
    // request refetches live (same recovery path as a failed cache write below).
    if (cacheable) await upsertCacheRow(`pmid:${pmid}`, payload);
  }

  return json({ results }, 200, req);
});
