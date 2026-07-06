// Third-party enrichment for a literature source, keyed by PMID.
//  - OpenAlex (CC0): DOI resolution, is_retracted, cited_by_count.
//  - scite public tallies (per DOI): supporting / contrasting / mentioning counts.
// Both are best-effort: any HTTP/shape failure degrades to nulls, never throws to the caller.
// The OpenAlex outcome additionally distinguishes "provider answered" (data, or a definitive
// 4xx "no such record") from "provider outage" (network error, timeout, 5xx) via the
// `fetched` flag, so the caller can decide whether a null-heavy result is authoritative
// enough to cache — a transient outage must never pin retracted:false for the TTL window.

import { normalizeDoi } from "../../../packages/shared/src/source-ids.ts";

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
  const openAlex = await getJson(
    `https://api.openalex.org/works/pmid:${pmid}?mailto=${OPENALEX_MAILTO}&select=ids,is_retracted,cited_by_count`,
  );
  const work = parseOpenAlexWork(openAlex.json);
  // scite is decoration on top of the OpenAlex base: its failure (outage or no tallies)
  // degrades to tallies:null and does NOT poison `fetched` — partial success stays cacheable.
  const tallies = work.doi
    ? parseSciteTallies((await getJson(`https://api.scite.ai/tallies/${encodeURIComponent(work.doi)}`)).json)
    : null;
  return { ...work, tallies, fetched: openAlex.ok };
}
