// Supabase Edge Function: nemesis-literature.
//
// The scholarly lane: six public literature indexes, asked at once, merged into one list.
//
// Owner 2026-08-24, on being shown that the four "evidence" domains on the old thinking-preview
// chips never searched anything: *"Applying the literature seven. Plug the literature seven."*
//
// 🔴🔴🔴 SIX, NOT SEVEN — bioRxiv REMOVED BY THE OWNER, 2026-08-24: *"i guess we dont need biorxiv."*
// Said on being shown that it had been answering a property-law question with a neuroscience
// preprint and a Thirty Years War question with a paper about worms.
//
// The reason it was the one to go is structural, and worth keeping written down. api.biorxiv.org
// has NO SEARCH ENDPOINT — it serves by DOI or by recency. Every other index here answers the
// question that was asked; bioRxiv could only be handed the ~200 newest preprints, leaving US to
// invent what counted as relevant. That made it the single source in this lane capable of
// fabricating relevance rather than merely failing to find any, and it did. Its matching rule has
// since been repaired (see biorxiv.ts and biorxiv.test.ts), which is why the connector stays
// correct in the tree even though this lane no longer calls it — the `ask` function can reach it
// behind SCIENCE_CONNECTORS, and a dormant bug is only a bug that has not been switched on yet.
//
// 🔴 THIS IS NOT A PRECEDENT FOR DROPPING arXiv OR SEMANTIC SCHOLAR, which were failing at the same
// time for an unrelated and fixable reason: HTTP 429 rate limiting, provoked by a burst of testing
// against them. arXiv has no API key in existence — it is free and keyless and asks only to be
// called politely — and it is the primary index for physics, mathematics and computer science, so
// removing it would put the hole exactly where a CS or physics student stands. Semantic Scholar
// issues a free key on request, which is the whole of its fix. Neither shares bioRxiv's defect.
//
// 🔴🔴🔴 ITS OWN FUNCTION, AND THAT IS A SECURITY BOUNDARY RATHER THAN TIDINESS. This began as an
// action inside `science-search`, which imports the whole connector registry — 42 sources across
// genomics, proteomics, omics, chemistry and pathways. A runtime flag kept the other 35 dark, and
// a flag is a decent guarantee. NOT DEPLOYING THEM IS a better one: nothing here imports the
// registry, so the code for those 35 third-party egress paths is not present in this function at
// all, and no future edit to a gate can expose them. `science-search` is untouched and stays
// undeployed behind `SCIENCE_SEARCH_ENABLED`.
//
// 🔴 THE SIX ARE FREE AND KEY-FREE, so this spends no search unit and needs no secret. It is
// deliberately NOT on the metered path (`nemesis-search` → Brave → Tavily → …): those providers
// bill us, these do not, and putting them on the same meter would charge a student for something
// that cost nothing.
//
// Auth mirrors /ask: a verified Supabase user token, anonymous sessions rejected. Free upstreams
// still make an unauthenticated door an open relay.
//
// POST { action: "literature", query, limit? } → { query, hits, sources }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import type { Connector, ConnectorHit } from "../_shared/science/types.ts";
import { arxiv, crossref, europepmc, openalex, pubmed, semanticScholar } from "../_shared/science/literature/index.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const ALLOWED_ORIGINS = [
  "https://app.enternemesis.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

/** Hard ceiling regardless of what the caller asks for. */
const MAX_LIMIT = 25;

/**
 * 🔴 THE SIX, BOUND BY NAME TO THE MODULES THEMSELVES. Not `registry.get(id)` — there is no
 * registry here — so this map IS the reachable set, and adding a seventh source means importing it
 * on the line above and naming it here. There is no tag, flag or catalogue that can widen it.
 */
const CONNECTORS: Record<string, Connector> = {
  arxiv,
  crossref,
  europepmc,
  openalex,
  pubmed,
  "semantic-scholar": semanticScholar,
};

function corsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("origin") ?? "";
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "https://app.enternemesis.com";
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

/** Verify the bearer token against the auth server. Returns user id or null. */
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
 * 🔴🔴🔴 THE SIX SCHOLARLY SOURCES, NAMED — AND THE ONLY ONES THIS ACTION MAY REACH.
 *
 * Owner 2026-08-24, after being shown that the four "evidence" domains on the old thinking-preview
 * chips never searched anything: *"Applying the literature seven. Plug the literature seven."*
 * Narrowed to six the same day — *"i guess we dont need biorxiv"* — see the file header for why
 * bioRxiv specifically, and why that reasoning does not extend to arXiv or Semantic Scholar.
 *
 * 🔴 THEY ARE A LIST, NOT `registry.byDomain("literature")`. Reading the domain would mean this
 * action's reach changes whenever someone registers a connector and tags it literature — the
 * blast radius of a one-word edit in a file nobody reviews for egress. Naming them makes widening
 * this set a visible, deliberate change to THIS line.
 *
 * 🔴 THESE SIX, AND NOT THE OTHER THIRTY-SIX, BECAUSE THEY GENERALISE. Crossref, OpenAlex and
 * Semantic Scholar index every discipline — law, history, education, engineering — and arXiv
 * carries physics, maths and computer science. CLAUDE.md's standing rule is that Nemesis is
 * field-agnostic and no feature may be scoped to one discipline, and the other folders here
 * (genomics, proteins, omics, pathways, chemistry) are life-sciences instruments: real value to a
 * pharmacy student, dead weight to everyone else, and not something to switch on for all learners.
 * PubMed and Europe PMC are in because medicine is one of the fields, not because it is the field.
 *
 * 🔴 EVERY ONE OF THE SIX ANSWERS THE QUESTION IT IS ASKED. That is now the entry requirement, and
 * it is what bioRxiv could not meet: an index with no search endpoint forces this code to guess at
 * relevance on its behalf, and a guess rendered to a learner as evidence is a fabrication. A future
 * seventh source that only offers "here are the newest records" belongs behind the same door.
 */
const LITERATURE_IDS = [
  "openalex",
  "crossref",
  "semantic-scholar",
  "europepmc",
  "pubmed",
  "arxiv",
] as const;

/**
 * 🔴🔴🔴 ONE DEADLINE FOR THE WHOLE FAN-OUT, NOT A BUDGET EACH — AND THAT DISTINCTION IS THE
 * DIFFERENCE BETWEEN A 2-SECOND LANE AND AN 8-SECOND ONE.
 *
 * Measured 2026-08-24, all seven then in the lane asked the same question:
 *
 *     openalex 522ms   crossref 305ms   europepmc 1637ms   pubmed 587ms
 *     arxiv 654ms      biorxiv 2276ms   semantic-scholar — never returned
 *
 * (bioRxiv has since been removed; its number is left here because the deadline was chosen against
 * this distribution, and silently deleting the row would make the 3s below look arbitrary.)
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
 * Ask all six at once and merge what answers.
 *
 * 🔴 ONE FAILING INDEX IS NOT A FAILED SEARCH. `allSettled`, never `all`: PubMed rate-limiting us
 * must not turn five good answers into an error. A student gets the five.
 *
 * 🔴 DEDUPED ON URL, BECAUSE THE OVERLAP IS THE NORM AND NOT THE EXCEPTION. Europe PMC mirrors
 * PubMed, OpenAlex and Crossref share DOIs, and arXiv preprints resurface in both. Undeduped, a
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
      const connector = CONNECTORS[db];
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

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyUser(token);
  if (!userId) return json({ error: "authentication required" }, 401, req);

  let body: { action?: string; query?: string; limit?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400, req);
  }

  if (body.action !== "literature") {
    return json({ error: "unknown_action", hint: "use 'literature'" }, 400, req);
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) return json({ error: "query is required" }, 400, req);
  if (query.length > 500) return json({ error: "query too long" }, 400, req);
  const limit = Math.min(
    Math.max(1, Number.isFinite(body.limit) ? Math.floor(body.limit as number) : 10),
    MAX_LIMIT,
  );

  // Never throws: searchLiterature swallows per-index failure, and an all-six outage is an empty
  // list — which the caller treats as "no papers" rather than as a failed turn.
  const hits = await searchLiterature(query, limit);
  return json({ query, hits, sources: LITERATURE_IDS }, 200, req);
});
