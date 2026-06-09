// Live evidence sources for the answer engine: query PubMed + ClinicalTrials.gov in
// real time, on EVERY question, alongside the embedded library. Reuses the proven
// ingest providers (same fetch + normalization the corpus was built from), so a live
// hit and a library hit share one shape and can be ranked together by the reranker.
//
// Design contract (from the backend plan): the library is the default; live sources are
// an additive supplement for recency / gaps / precise filters. So this module is:
//   - PARALLEL  — PubMed and CT.gov are fetched concurrently.
//   - FAULT-TOLERANT — one source erroring (or timing out) never sinks the other or the
//     answer; it just contributes zero candidates (Promise.allSettled + per-source timeout).
//   - TIME-BOUNDED — a slow API can't hang /ask; each source is capped at LIVE_TIMEOUT_MS.
// Wiring this into /ask's retrieval path is a separate, owner-gated edge deploy.

import { fetchPubMedOA } from "../core-source-sync/providers/pubmed.ts";
import { fetchClinicalTrials } from "../core-source-sync/providers/clinicaltrials.ts";

export type LiveOrigin = "pubmed" | "clinicaltrials";

/** One live result, normalized to a shape the reranker + citation layer can consume. */
export interface LiveCandidate {
  origin: LiveOrigin;
  provider: string; // "pubmed_oa" | "clinicaltrials" (matches core_sources.provider)
  provider_id: string; // PMID | NCT id — the key for read-through-ingest + dedupe vs library
  title: string;
  url: string;
  text: string; // title+abstract / trial summary — fed to the reranker and to grounding
}

export interface GatherLiveOpts {
  query: string;
  /** Max results per source before reranking (PubMed hard-caps 25, CT 100). */
  perSourceMax?: number;
  /** Per-source wall-clock cap; a source slower than this contributes nothing. */
  timeoutMs?: number;
}

const PER_SOURCE_MAX = 10;
const LIVE_TIMEOUT_MS = 4000;

/**
 * Fetch live PubMed + ClinicalTrials candidates concurrently. Never throws: a failed or
 * slow source yields [] for that source. Returns the union (order = PubMed then CT; the
 * reranker decides final order downstream).
 */
export async function gatherLiveCandidates(opts: GatherLiveOpts): Promise<LiveCandidate[]> {
  const perSourceMax = opts.perSourceMax ?? PER_SOURCE_MAX;
  const timeoutMs = opts.timeoutMs ?? LIVE_TIMEOUT_MS;

  const [pubmed, trials] = await Promise.all([
    withTimeout(fetchPubMed(opts.query, perSourceMax), timeoutMs, "pubmed"),
    withTimeout(fetchTrials(opts.query, perSourceMax), timeoutMs, "clinicaltrials"),
  ]);
  return [...pubmed, ...trials];
}

async function fetchPubMed(query: string, max: number): Promise<LiveCandidate[]> {
  const sources = await fetchPubMedOA({ query, retmax: max });
  return sources.map((s) => ({
    origin: "pubmed",
    provider: s.provider,
    provider_id: s.provider_id,
    title: s.title,
    url: s.source_url,
    text: s.content_text,
  }));
}

async function fetchTrials(query: string, max: number): Promise<LiveCandidate[]> {
  const sources = await fetchClinicalTrials({ query, pageSize: max });
  return sources.map((s) => ({
    origin: "clinicaltrials",
    provider: s.provider,
    provider_id: s.provider_id,
    title: s.title,
    url: s.source_url,
    text: s.content_text,
  }));
}

/** Resolve to [] (never reject) if `p` errors or exceeds `ms`. Keeps /ask non-hostage. */
async function withTimeout(
  p: Promise<LiveCandidate[]>,
  ms: number,
  label: LiveOrigin,
): Promise<LiveCandidate[]> {
  let timer: number | undefined;
  const timeout = new Promise<LiveCandidate[]>((resolve) => {
    timer = setTimeout(() => resolve([]), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } catch (err) {
    console.error(`live source ${label} failed:`, err instanceof Error ? err.message : err);
    return [];
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
