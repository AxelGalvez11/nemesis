// Supabase Edge Function: science-search.
//
// Thin authenticated gateway over the ported scientific-database connector registry
// (supabase/functions/_shared/science, derived from synthetic-sciences/openscience, Apache-2.0 —
// see that dir's NOTICE.md). Two actions:
//   { action: "list" }                              → the connector catalog (id/name/domain/desc)
//   { action: "search", db, query, limit?, organism? } → one connector's normalized hits
//
// GATED, DEFAULT OFF: returns 503 unless SCIENCE_SEARCH_ENABLED === "true". This keeps ~39 new
// third-party API egress paths dark until the owner deliberately turns them on — nothing about the
// live product changes on deploy. Auth mirrors the /ask house pattern (verified bearer token,
// authenticated-only), same CORS allow-list and JSON envelope.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { registry } from "../_shared/science/index.ts";
import type { ConnectorHit } from "../_shared/science/types.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const ALLOWED_ORIGINS = [
  "https://app.enternemesis.com",
  "https://app.pharmaorb.app",
  "https://pharmaorb.app",
  "https://www.pharmaorb.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

// Hard ceiling regardless of what the caller asks for (connectors clamp further to their own limits).
const MAX_LIMIT = 25;

function enabled(): boolean {
  return Deno.env.get("SCIENCE_SEARCH_ENABLED") === "true";
}

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin);
}

function corsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("origin") ?? "";
  const allowOrigin = origin && isAllowedOrigin(origin) ? origin : "https://app.enternemesis.com";
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

/** Verify the bearer token against the auth server. Returns user id or null. Mirrors /ask:
 *  authenticated-only, anonymous sign-in sessions rejected. */
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

/**
 * 🔴🔴🔴 THE SEVEN SCHOLARLY SOURCES, NAMED — AND THE ONLY ONES THIS ACTION MAY REACH.
 *
 * Owner 2026-08-24, after being shown that the four "evidence" domains on the old thinking-preview
 * chips never searched anything: *"Applying the literature seven. Plug the literature seven."*
 *
 * 🔴 THEY ARE A LIST, NOT `registry.byDomain("literature")`. Reading the domain would mean this
 * action's reach changes whenever someone registers a connector and tags it literature — the
 * blast radius of a one-word edit in a file nobody reviews for egress. Naming them makes widening
 * this set a visible, deliberate change to THIS line.
 *
 * 🔴 THESE SEVEN, AND NOT THE OTHER THIRTY-FIVE, BECAUSE THEY GENERALISE. Crossref, OpenAlex and
 * Semantic Scholar index every discipline — law, history, education, engineering — and arXiv
 * carries physics, maths and computer science. CLAUDE.md's standing rule is that Nemesis is
 * field-agnostic and no feature may be scoped to one discipline, and the other folders here
 * (genomics, proteins, omics, pathways, chemistry) are life-sciences instruments: real value to a
 * pharmacy student, dead weight to everyone else, and not something to switch on for all learners.
 * PubMed and Europe PMC are in because medicine is one of the fields, not because it is the field.
 */
const LITERATURE_IDS = [
  "openalex",
  "crossref",
  "semantic-scholar",
  "europepmc",
  "pubmed",
  "arxiv",
  "biorxiv",
] as const;

/**
 * 🔴🔴🔴 ONE DEADLINE FOR THE WHOLE FAN-OUT, NOT A BUDGET EACH — AND THAT DISTINCTION IS THE
 * DIFFERENCE BETWEEN A 2-SECOND LANE AND AN 8-SECOND ONE.
 *
 * Measured 2026-08-24, all seven asked the same question:
 *
 *     openalex 522ms   crossref 305ms   europepmc 1637ms   pubmed 587ms
 *     arxiv 654ms      biorxiv 2276ms   semantic-scholar — never returned
 *
 * Six answer inside 2.3s. Semantic Scholar rate-limits us (HTTP 429 without an API key) and then
 * consumes whatever budget it is given: with a per-connector 8s it took 8005ms, and shortening
 * that to 6s made it take 7846ms, because it retries inside its own call. A per-connector timeout
 * therefore does not bound anything — the slowest index sets the wall clock no matter what number
 * is written next to it, and a student asking an evidence question would have waited ~6 extra
 * seconds for a source that returned nothing.
 *
 * A shared deadline cannot be gamed that way: it starts when the fan-out starts, so the total is
 * the deadline whatever any single index does.
 *
 * 🔴 3s RATHER THAN 4s, MEASURED BOTH WAYS. At 4s the fan-out returned 10 papers from six indexes
 * on every discipline tried; at 3s it still returned 10, losing only the slowest index's tail on
 * one query out of four. Papers are an ADDITION to an answer, so a second of every learner's time
 * is worth more than the seventh copy of a result the other indexes already have. An index that
 * cannot answer in three seconds is simply not in this answer.
 */
const LITERATURE_TOTAL_MS = 3_000;
/** Hits requested per connector before merging. */
const LITERATURE_PER_DB = 5;

/** A paper, flattened to the shape the caller already renders for a web result. */
interface LiteratureRow {
  db: string;
  id: string;
  title: string;
  summary: string;
  url: string;
}

/**
 * Ask all seven at once and merge what answers.
 *
 * 🔴 ONE FAILING INDEX IS NOT A FAILED SEARCH. `allSettled`, never `all`: PubMed rate-limiting us
 * must not turn six good answers into an error. A student gets the six.
 *
 * 🔴 DEDUPED ON URL, BECAUSE THE OVERLAP IS THE NORM AND NOT THE EXCEPTION. Europe PMC mirrors
 * PubMed, OpenAlex and Crossref share DOIs, and a preprint usually appears twice. Undeduped, a
 * five-paper answer would cite the same study three times and read as three independent findings —
 * which is worse than showing fewer papers, because it manufactures agreement.
 */
async function searchLiterature(query: string, limit: number): Promise<LiteratureRow[]> {
  // The one clock every index races. Resolving (not rejecting) keeps a lapsed index indistinguishable
  // from one that found nothing, which is what the caller should see either way.
  let lapse: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<LiteratureRow[]>((resolve) => {
    lapse = setTimeout(() => resolve([]), LITERATURE_TOTAL_MS);
  });

  const settled = await Promise.allSettled(
    LITERATURE_IDS.map(async (db) => {
      const connector = registry.get(db);
      if (!connector) return [] as LiteratureRow[];
      // The abort still fires: racing alone would leave the losing request in flight, holding a
      // socket open on a function that is about to return.
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), LITERATURE_TOTAL_MS);
      try {
        const hits = await Promise.race([
          connector.search(query, { limit: LITERATURE_PER_DB, signal: ac.signal }),
          deadline.then(() => [] as ConnectorHit[]),
        ]);
        return (hits as ConnectorHit[])
          .filter((hit) => hit.url && hit.title)
          .map((hit) => ({
            db,
            id: hit.id,
            title: hit.title,
            summary: (hit.summary ?? "").slice(0, 600),
            url: hit.url as string,
          }));
      } catch {
        return [] as LiteratureRow[];
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  if (lapse !== undefined) clearTimeout(lapse);

  const seen = new Set<string>();
  const rows: LiteratureRow[] = [];
  // Round-robin across the indexes rather than draining one at a time, so a single source cannot
  // fill the whole answer and the merge reflects agreement between indexes rather than their order.
  const lists = settled.map((s) => (s.status === "fulfilled" ? s.value : []));
  for (let depth = 0; depth < LITERATURE_PER_DB; depth += 1) {
    for (const list of lists) {
      const row = list[depth];
      if (!row) continue;
      const key = row.url.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
      if (rows.length >= limit) return rows;
    }
  }
  return rows;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, req);

  // 🔴🔴 THE GATE STILL SHUTS THE OTHER THIRTY-FIVE, AND THAT IS THE POINT OF SPLITTING IT.
  // `SCIENCE_SEARCH_ENABLED` exists to keep ~39 third-party egress paths dark until the owner
  // deliberately turns them on. The owner asked for the literature seven and only those, so the
  // honest change is a second door that reaches exactly those seven — not flipping the flag, which
  // would open genomics, proteomics, omics and chemistry as a side effect nobody asked for.
  //
  // Read the body before the gate so the action is known; `list` and `search` (arbitrary db, all
  // 42) stay behind the flag exactly as before.

  let body: { action?: string; db?: string; query?: string; limit?: number; organism?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400, req);
  }

  const action = body.action;
  if (action !== "literature" && !enabled()) return json({ error: "science_search_disabled" }, 503, req);

  // Authentication is required for every action, literature included — these are free upstreams,
  // but an unauthenticated door onto seven third-party APIs is an open relay whoever pays for it.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyUser(token);
  if (!userId) return json({ error: "authentication required" }, 401, req);

  if (action === "literature") {
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) return json({ error: "query is required" }, 400, req);
    if (query.length > 500) return json({ error: "query too long" }, 400, req);
    const limit = Math.min(
      Math.max(1, Number.isFinite(body.limit) ? Math.floor(body.limit as number) : 10),
      MAX_LIMIT,
    );
    // Never throws: searchLiterature swallows per-connector failure and an all-seven outage is an
    // empty list, which the caller treats as "no papers" rather than as an error.
    const hits = await searchLiterature(query, limit);
    return json({ query, hits, sources: LITERATURE_IDS }, 200, req);
  }

  if (action === "list") {
    return json({ databases: registry.catalog() }, 200, req);
  }

  if (action === "search") {
    const db = typeof body.db === "string" ? body.db.trim() : "";
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!db) return json({ error: "db is required" }, 400, req);
    if (!query) return json({ error: "query is required" }, 400, req);
    if (query.length > 500) return json({ error: "query too long" }, 400, req);

    const connector = registry.get(db);
    if (!connector) {
      return json({ error: "unknown_database", db, hint: "call { action: 'list' } for valid ids" }, 404, req);
    }

    const limit = Math.min(
      Math.max(1, Number.isFinite(body.limit) ? Math.floor(body.limit as number) : 10),
      MAX_LIMIT,
    );
    const organism = typeof body.organism === "string" ? body.organism.trim() : undefined;

    // Bound every external call — a slow third-party API must never hang the function.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 12_000);
    try {
      const hits = await connector.search(query, { limit, organism, signal: ac.signal });
      return json({ db, query, hits }, 200, req);
    } catch (err) {
      // Connector/network failure is a clean 502 — the caller learns the upstream failed, not a stack.
      const message = err instanceof Error ? err.message : "connector error";
      return json({ error: "connector_failed", db, detail: message.slice(0, 200) }, 502, req);
    } finally {
      clearTimeout(timer);
    }
  }

  return json({ error: "unknown_action", hint: "use 'list' or 'search'" }, 400, req);
});
