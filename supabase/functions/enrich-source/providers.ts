// Third-party enrichment for a literature source, keyed by PMID.
//  - OpenAlex (CC0): DOI resolution, is_retracted, cited_by_count.
//  - scite public tallies (per DOI): supporting / contrasting / mentioning counts.
// Both are best-effort: any HTTP/shape failure degrades to nulls, never throws to the caller.
// The OpenAlex outcome additionally distinguishes "provider answered" (data, or a definitive
// 4xx "no such record") from "provider outage" (network error, timeout, 5xx) via the
// `fetched` flag, so the caller can decide whether a null-heavy result is authoritative
// enough to cache — a transient outage must never pin retracted:false for the TTL window.

import { normalizeDoi } from "../../../packages/shared/src/source-ids.ts";
import { journalTier, type JournalTier } from "../../../packages/shared/src/paper-quality.ts";

export interface StudySnapshot {
  population: string | null;
  sample_size: number | null;
  duration: string | null;
  design: string | null;
}

export interface SourceEnrichment {
  doi: string | null;
  retracted: boolean;
  cited_by: number | null;
  tallies: { supporting: number; contrasting: number; mentioning: number } | null;
  snapshot: StudySnapshot | null;
  // ── Per-paper journal-quality (WS-1). Additive; the client reads these for the tier badge.
  //    "unranked" when no venue metric was available OR the WS1_PER_PAPER flag is off (the
  //    step-2 /sources call is skipped entirely when off, so the field is zero-cost). ──
  journal_tier: JournalTier;
  mean_citedness_2yr: number | null;
  is_in_doaj: boolean;
}

// WS-1 flag — mirrors the LIVE_SOURCES `=== "on"` idiom (ask/index.ts). Read at CALL time
// (not a module const) so the field can be toggled between tests without re-importing.
function ws1PerPaperOn(): boolean {
  return Deno.env.get("WS1_PER_PAPER") === "on";
}

/** Enrichment base plus provenance: `fetched` is true only when OpenAlex ANSWERED
 * (2xx with data, or a definitive 4xx "no such record"). False means outage-class
 * failure (network error, timeout, 5xx) — the nulls are NOT authoritative. */
export interface EnrichmentBase extends Omit<SourceEnrichment, "snapshot"> {
  fetched: boolean;
}

const OPENALEX_MAILTO = "engineering@pharmaorb.app";
// Per-call upstream timeout. Misses resolve SEQUENTIALLY (scite rate-limit constraint),
// so one stuck socket would otherwise hang the whole batch until the edge runtime kills
// it. A timeout aborts into the catch below = outage-class (ok:false) — never cached.
const FETCH_TIMEOUT_MS = 8_000;

export function parseOpenAlexWork(json: unknown): { doi: string | null; retracted: boolean; cited_by: number | null } {
  const w = (json ?? {}) as Record<string, unknown>;
  const ids = (w.ids ?? {}) as Record<string, unknown>;
  return {
    doi: normalizeDoi(typeof ids.doi === "string" ? ids.doi : null),
    retracted: w.is_retracted === true,
    cited_by: typeof w.cited_by_count === "number" ? w.cited_by_count : null,
  };
}

/** WS-1 step-1 read: the `/works` `primary_location.source` carries the venue id (needed for the
 *  step-2 `/sources` lookup) plus is_in_doaj / is_oa — but NOT `summary_stats` (no impact metric).
 *  Kept SEPARATE from parseOpenAlexWork so that function's exact-shape return is untouched. */
export function parseOpenAlexVenue(json: unknown): {
  source_id: string | null;
  is_in_doaj: boolean;
  is_oa: boolean;
} {
  const w = (json ?? {}) as Record<string, unknown>;
  const loc = (w.primary_location ?? {}) as Record<string, unknown>;
  const src = (loc.source ?? {}) as Record<string, unknown>;
  return {
    source_id: typeof src.id === "string" ? src.id : null,
    is_in_doaj: src.is_in_doaj === true,
    is_oa: src.is_oa === true,
  };
}

/** WS-1 step-2 read: the OpenAlex `/sources/{id}` object carries the venue impact metrics.
 *  Pure; on `{}` / null / missing fields every value degrades to null (→ "unranked"), never a
 *  guessed number. `is_in_doaj` here is a fallback for the step-1 venue read. */
export function parseOpenAlexSource(json: unknown): {
  mean_citedness_2yr: number | null;
  h_index: number | null;
  is_in_doaj: boolean;
} {
  const s = (json ?? {}) as Record<string, unknown>;
  const stats = (s.summary_stats ?? {}) as Record<string, unknown>;
  const mean = stats["2yr_mean_citedness"];
  const h = stats.h_index;
  return {
    mean_citedness_2yr: typeof mean === "number" ? mean : null,
    h_index: typeof h === "number" ? h : null,
    is_in_doaj: s.is_in_doaj === true,
  };
}

/** Extract the OpenAlex source short-id (e.g. "S12345") from a full source URL/id, for the
 *  `/sources/{id}` path. Returns null when the shape isn't the expected OpenAlex source id. */
export function openAlexSourceId(sourceUrlOrId: string | null): string | null {
  if (!sourceUrlOrId) return null;
  const m = sourceUrlOrId.match(/(S\d+)\s*$/);
  return m ? m[1] : null;
}

export function parseSciteTallies(json: unknown): SourceEnrichment["tallies"] {
  const t = (json ?? {}) as Record<string, unknown>;
  if (typeof t.supporting !== "number" || typeof t.mentioning !== "number") return null;
  const contrasting = typeof t.contradicting === "number" ? t.contradicting
    : typeof t.contrasting === "number" ? t.contrasting : 0;
  return { supporting: t.supporting, contrasting, mentioning: t.mentioning };
}

/** One provider fetch's outcome. `ok` separates "the provider answered" from "the provider
 * was unreachable": 400/404/410 are definitive answers about the record (ok, json null),
 * while 429/408, other 4xx, 5xx, network errors and malformed bodies are outages (not ok) —
 * never a statement about the record itself. Never throws. */
export interface FetchOutcome {
  ok: boolean;
  json: unknown;
}

async function getJson(url: string): Promise<FetchOutcome> {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.ok) return { ok: true, json: await res.json() };
    // Only these codes are the provider actually answering "no such record / bad request".
    // Everything else — 429 rate limit, 408 timeout, other 4xx, all 5xx — is transient and
    // must stay outage-class so it is never cached as an authoritative answer.
    const definitive = res.status === 400 || res.status === 404 || res.status === 410;
    return { ok: definitive, json: null };
  } catch {
    return { ok: false, json: null }; // network error / timeout = outage
  }
}

export async function fetchEnrichmentBase(pmid: string): Promise<EnrichmentBase> {
  // Step 1 (/works): the base signals. `primary_location` is added to the select so the WS-1
  // step-2 lookup can find the venue id + read is_in_doaj/is_oa. `fetched` reflects THIS call only.
  const openAlex = await getJson(
    `https://api.openalex.org/works/pmid:${pmid}?mailto=${OPENALEX_MAILTO}&select=ids,is_retracted,cited_by_count,primary_location`,
  );
  const work = parseOpenAlexWork(openAlex.json);
  const venue = parseOpenAlexVenue(openAlex.json);
  // scite is decoration on top of the OpenAlex base: its failure (outage or no tallies)
  // degrades to tallies:null and does NOT poison `fetched` — partial success stays cacheable.
  const tallies = work.doi
    ? parseSciteTallies((await getJson(`https://api.scite.ai/tallies/${encodeURIComponent(work.doi)}`)).json)
    : null;

  // WS-1 step 2 (/sources): the venue impact metric lives on the source object, not /works.
  // Gated on WS1_PER_PAPER — when off, the call is skipped entirely (zero-cost) and the tier
  // degrades to "unranked". A step-2 failure ALSO degrades to "unranked" and, like tallies,
  // never poisons `fetched` (which reflects step-1 only).
  let journal_tier: JournalTier = "unranked";
  let mean_citedness_2yr: number | null = null;
  let is_in_doaj = false;
  if (ws1PerPaperOn()) {
    const sourceId = openAlexSourceId(venue.source_id);
    is_in_doaj = venue.is_in_doaj;
    if (sourceId) {
      const srcRes = await getJson(
        `https://api.openalex.org/sources/${sourceId}?mailto=${OPENALEX_MAILTO}&select=summary_stats,is_in_doaj,is_oa`,
      );
      const src = parseOpenAlexSource(srcRes.json);
      mean_citedness_2yr = src.mean_citedness_2yr;
      is_in_doaj = venue.is_in_doaj || src.is_in_doaj;
      journal_tier = journalTier({
        mean_citedness_2yr: src.mean_citedness_2yr,
        h_index: src.h_index,
        is_in_doaj,
        is_oa: venue.is_oa,
      });
    }
  }

  return { ...work, tallies, journal_tier, mean_citedness_2yr, is_in_doaj, fetched: openAlex.ok };
}
