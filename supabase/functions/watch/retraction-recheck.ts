// Retraction recheck — the one offline-buildable piece of "computed-shift" alerting (WS-D increment 5).
//
// THE GAP IT CLOSES: the dated-source diff (watch-detect) keys on edat (Entrez index date). A paper
// that was already in a watch's known-set and is LATER retracted keeps the same PMID, so it never
// reappears in the edat window — the retraction is silently missed, yet it is exactly the
// conclusion-mover a clinician most needs to hear. This module re-checks the PMIDs a watch has already
// surfaced as high-tier evidence; for any now flagged retracted by PubMed it mints a DISTINCT synthetic
// source (`pubmed_oa:<pmid>#retracted`) that flows through the SAME detect/persist pipeline → surfaces
// once as a loud retraction alert, then dedupes on the next cycle.
//
// PURE + injectable + fault-tolerant, like dated-sources.ts: a failed efetch yields an empty set and
// never sinks a cycle. It reuses the canonical PubMed XML parser, the shared WatchSource shape, AND the
// shared injectable-fetch contract (DatedFetch) so a caller can race it against the same withTimeout
// used by gatherDatedCandidates — the timeout wrapping lives at the edge-fn call site, but accepting a
// signal here means that wiring is a drop-in with no signature change. Large recheck sets are chunked
// (NCBI recommends POST beyond ~200 UIDs in a GET) so a long-running watch's accumulated known-set can't
// overflow the efetch URL and silently zero out every detection.
//
// The other two "computed-shift" triggers — (a) an evidence-grade shift across a watch's accumulated
// studies and (b) a meta-analysis significance re-pool — are deliberately NOT here: both need a richer
// stored data model (per-source study-type enrichment of the known-set; stored 2×2 arm data) that the
// current tables don't carry, so they are deferred as an explicit owner-gated follow-up, not guessed.

import type { WatchSource } from "../../../packages/shared/src/watch-detect.ts";
import type { DatedFetch } from "./dated-sources.ts";
import { parsePubMedXml } from "../core-source-sync/providers/pubmed.ts";

const EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
const UA = "PharmaOrbWatch/1.0 (+https://pharmaorb.app)";
const RETRACTED_SUFFIX = "#retracted";
// NCBI recommends POST beyond ~200 UIDs; keep each GET well under that so the id list can't overflow.
const EFETCH_CHUNK_SIZE = 200;

/**
 * Extract the bare PMID from a pubmed source_key ("pubmed_oa:<pmid>"). Returns null for non-pubmed
 * providers and for keys that are ALREADY a retraction synthetic, so a recheck never re-checks its own
 * output (which would loop a retraction back through efetch forever).
 */
export function pmidFromSourceKey(key: string): string | null {
  const prefix = "pubmed_oa:";
  if (!key.startsWith(prefix)) return null;
  const id = key.slice(prefix.length);
  if (id.endsWith(RETRACTED_SUFFIX)) return null; // already a recheck synthetic
  return /^\d+$/.test(id) ? id : null;
}

export interface RetractionCandidate {
  pmid: string;
  title?: string;
}

/**
 * Turn each candidate whose PMID is now in the retracted set into a retraction-classified WatchSource.
 * The provider_id carries a `#retracted` suffix so the synthetic has a DISTINCT key from the original
 * paper's event (already in the known-set) — it surfaces as NEW exactly once, then dedupes next cycle.
 * publication_types is set to the retraction type PubMed reports so the source flows through the normal
 * `classifyAlertReason` → "retraction" (no special-casing in the detector). The title is passed through
 * verbatim (never editorialized); the red "retraction" pill in the UI carries the meaning.
 */
export function buildRetractionSources(
  candidates: readonly RetractionCandidate[],
  retractedPmids: ReadonlySet<string>,
): WatchSource[] {
  const out: WatchSource[] = [];
  for (const c of candidates) {
    if (!retractedPmids.has(c.pmid)) continue;
    out.push({
      provider: "pubmed_oa",
      provider_id: `${c.pmid}${RETRACTED_SUFFIX}`,
      title: c.title || `PubMed ${c.pmid}`,
      url: `https://pubmed.ncbi.nlm.nih.gov/${c.pmid}/`,
      publication_types: ["Retracted Publication"],
    });
  }
  return out;
}

/** efetch ONE chunk of (already-validated numeric) PMIDs → the subset now carrying a retraction type.
 *  Fully self-contained fault-tolerance: a non-200, a 200-with-error-body, a parse miss, or a thrown
 *  network error each yields an empty set and a warn — never throws, so one bad chunk can't sink the run. */
async function fetchRetractedChunk(ids: string[], doFetch: DatedFetch, ncbiApiKey?: string): Promise<Set<string>> {
  try {
    const fp = new URLSearchParams({ db: "pubmed", id: ids.join(","), rettype: "abstract", retmode: "xml" });
    if (ncbiApiKey) fp.set("api_key", ncbiApiKey);
    const res = await doFetch(`${EFETCH}?${fp}`, { headers: { "User-Agent": UA } });
    if (!res.ok) {
      // Same observability lesson as dated-sources: a silent drop here is a MISSED retraction alert.
      console.warn(`watch/retraction efetch HTTP ${res.status} for ${ids.length} pmids`);
      return new Set();
    }
    const articles = parsePubMedXml(await res.text());
    // NCBI can answer 200 with an <ERROR> body / empty set; for retraction detection (a safety signal)
    // a non-empty batch of REAL PMIDs parsing to zero articles is worth a warn, not a silent clean.
    if (articles.length === 0) {
      console.warn(`watch/retraction efetch returned 0 articles for ${ids.length} pmids — possible NCBI error body`);
      return new Set();
    }
    const retracted = new Set<string>();
    for (const a of articles) {
      const types = (a.publication_types ?? []).map((t) => t.toLowerCase());
      if (types.some((t) => t.includes("retract"))) retracted.add(a.pmid);
    }
    return retracted;
  } catch (err) {
    console.warn(`watch/retraction efetch error for ${ids.length} pmids:`, err instanceof Error ? err.message : err);
    return new Set();
  }
}

/**
 * efetch the given PMIDs and return the subset whose record now carries a retraction publication-type.
 * Deduped + validated (only numeric ids reach the URL, so the id param can't be an injection vector),
 * chunked under the NCBI GET limit, and fault-tolerant per chunk. Skips the network entirely when there
 * are no numeric PMIDs to check (an empty or all-non-numeric list).
 */
export async function fetchRetractedPmids(opts: {
  pmids: readonly string[];
  fetchImpl?: DatedFetch;
  ncbiApiKey?: string;
}): Promise<Set<string>> {
  const ids = [...new Set(opts.pmids)].filter((p) => /^\d+$/.test(p));
  if (ids.length === 0) return new Set(); // nothing real to check → no network call
  const doFetch = opts.fetchImpl ?? ((u, init) => fetch(u, init));
  const retracted = new Set<string>();
  for (let i = 0; i < ids.length; i += EFETCH_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + EFETCH_CHUNK_SIZE);
    for (const p of await fetchRetractedChunk(chunk, doFetch, opts.ncbiApiKey)) retracted.add(p);
  }
  return retracted;
}
