// Live evidence sources for the answer engine: query external APIs in real time, on EVERY
// question, alongside the embedded library. Reuses the proven ingest providers (same fetch +
// normalization the corpus was built from), so a live hit and a library hit share one shape
// and can be ranked together by the reranker AND saved back via read-through-ingest.
//
// EXTENSIBLE BY DESIGN: add a source = one entry in LIVE_SOURCES below. Each entry is fetched
// concurrently, fault-tolerantly (a failed/slow source contributes nothing, never sinks the
// answer), and time-bounded (LIVE_TIMEOUT_MS) so a slow API can't hang /ask.
//
// Wiring this into /ask's retrieval path is a separate, owner-gated edge deploy.

import type { NormalizedSource } from "../core-source-sync/normalized-source.ts";
import type { RetrievedChunk } from "./citation.ts";
import { fetchPubMedOA } from "../core-source-sync/providers/pubmed.ts";
import { fetchClinicalTrials } from "../core-source-sync/providers/clinicaltrials.ts";
import { fetchOpenFdaLabels } from "../core-source-sync/providers/openfda.ts";
import { fetchEuropePmc } from "../core-source-sync/providers/europepmc.ts";
import { fetchFaersReactions } from "../core-source-sync/providers/faers.ts";
import { fetchOpenAlex } from "../core-source-sync/providers/openalex.ts";
import { fetchMedlinePlus } from "../core-source-sync/providers/medlineplus.ts";
import { fetchOpenFdaEnforcement } from "../core-source-sync/providers/enforcement.ts";
import { fetchToxicologyReference } from "../core-source-sync/providers/toxicology.ts";
import { extractSearchTerms } from "./search-query.ts";

/** One live result, normalized for the reranker + citation layer; `source` is the full
 *  record, so a candidate the reranker keeps can be persisted via read-through-ingest. */
export interface LiveCandidate {
  origin: string; // "pubmed" | "clinicaltrials" | "openfda" | ...
  provider: string; // matches core_sources.provider
  provider_id: string; // PMID | NCT | SPL set-id — key for dedupe vs library + ingest
  title: string;
  url: string;
  text: string; // fed to the reranker and to grounding
  source: NormalizedSource; // full normalized record (for save-to-library)
}

/**
 * Adapt a live candidate to the RetrievedChunk shape so it ranks + cites alongside library chunks.
 * Live results have no DB row, so source_id/chunk_id are SYNTHETIC ("live:<provider>:<id>") — safe
 * because generated_answers.source_ids is jsonb (no UUID type / FK) and enforceCitations keys on the
 * retrieval-local tag, not source_id. similarity is 0 (no dense score); the reranker sets the order.
 * Bibliographic + study-type fields are read from c.source.metadata (already populated by the
 * provider fetchers) so the citation layer and gap detector can use them without a second fetch.
 */
export function liveToChunk(c: LiveCandidate, tag: string): RetrievedChunk {
  const syntheticId = `live:${c.provider}:${c.provider_id}`;
  const m = (c.source.metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined => {
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
    return undefined;
  };
  const strArr = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : undefined;
  const phases = strArr(m.phases);
  return {
    tag,
    chunk_id: syntheticId,
    chunk_text: c.text,
    source_id: syntheticId,
    provider: c.provider,
    title: c.title,
    section: null,
    url: c.url,
    license: c.source.license,
    published_date: c.source.effective_at ? c.source.effective_at.slice(0, 10) : null,
    retrieved_at: new Date().toISOString(),
    similarity: 0,
    // Bibliographic (PubMed/Europe PMC).
    authors: strArr(m.authors),
    journal: str(m.journal_iso) ?? str(m.journal),
    issn: strArr(m.issn),
    year: str(m.year),
    volume: str(m.volume),
    issue: str(m.issue),
    pages: str(m.pages),
    publication_types: strArr(m.publication_types),
    // Study-type (ClinicalTrials).
    study_type: str(m.study_type),
    trial_status: str(m.status),
    trial_phase: phases && phases.length ? phases[phases.length - 1] : undefined,
    // Free-to-read full-text link (OpenAlex/Europe PMC OA data — a link, not grounded text).
    oa_url: str(m.oa_url),
  };
}

// `mentions` are the literal drug names the classifier extracted (e.g. ["lisinopril",
// "spironolactone"]); `query` is the free-text term (mentions joined, or the raw question when no
// drug was named). Field-scoped providers (openFDA) MUST use mentions, not the free-text query.
interface LiveSourceDef {
  origin: string;
  // `query` = the drug-centric term (mentions joined / raw) for field-scoped + adverse-event sources;
  // `researchQuery` = the user's actual question, for free-text RESEARCH sources (PubMed/Europe PMC/
  // OpenAlex/MedlinePlus) so "<drug> side effects" retrieves on-topic papers, not generic drug papers.
  // researchQuery defaults to query for callers that don't differentiate (monograph, deep research).
  fetch: (query: string, max: number, mentions: string[], researchQuery: string) => Promise<NormalizedSource[]>;
}

export function shouldFetchClinicalTrials(
  query: string,
  mentions: string[],
  researchQuery = query,
): boolean {
  const haystack = `${query} ${researchQuery}`.toLowerCase();
  if (/\b(?:energy drink|celsius energy drink|red bull|monster energy|prime energy)\b/.test(haystack)) return false;
  return true;
}

// THE REGISTRY. Add a source = one line. (DailyMed is intentionally omitted: it returns the same
// FDA labels as openFDA, the preferred label source — redundant, not additive.)
const LIVE_SOURCES: LiveSourceDef[] = [
  { origin: "pubmed", fetch: (_q, n, _m, rq) => fetchPubMedOA({ query: rq, retmax: n }) },
  { origin: "europepmc", fetch: (_q, n, _m, rq) => fetchEuropePmc({ query: rq, retmax: n }) },
  {
    origin: "clinicaltrials",
    fetch: (q, n, mentions, rq) =>
      shouldFetchClinicalTrials(q, mentions, rq)
        ? fetchClinicalTrials({ query: q, pageSize: n })
        : Promise.resolve([]),
  },
  // openFDA: field-scope to the named drug (generic OR brand name). A bare full-text search matched
  // FRAUDULENT OTC products that merely name-drop a trendy drug in their marketing copy — e.g.
  // "slimming patches" returned for the investigational retatrutide, which the model then grounded
  // its answer in and cited as an "openFDA label". Those products carry the drug in their label TEXT
  // but not as their generic/brand NAME, so field-scoping excludes them while still matching real
  // labels by generic (lisinopril) or brand (Ozempic). No drug named -> SKIP openFDA entirely
  // (openFdaSearch returns null): a bare free-text fallback is exactly the pattern that admitted the
  // name-drop products, and a general non-drug question needs no FDA label anyway. The other sources
  // handle free text safely, so only openFDA opts out when the classifier extracted no drug.
  { origin: "openfda", fetch: (q, n, mentions) => {
    const scoped = openFdaSearch(q, mentions);
    return scoped === null ? Promise.resolve([]) : fetchOpenFdaLabels({ query: scoped, limit: n });
  } },
  { origin: "faers", fetch: (q, n) => fetchFaersReactions({ query: q, retmax: n }) },
  {
    origin: "fda_enforcement",
    fetch: (q, n, _m, rq) =>
      isSafetyCriticalQuery(`${q} ${rq}`) ? fetchOpenFdaEnforcement({ query: q || rq, limit: n }) : Promise.resolve([]),
  },
  {
    origin: "toxicology",
    fetch: (q, n, _m, rq) =>
      isSafetyCriticalQuery(`${q} ${rq}`)
        ? fetchToxicologyReference({ query: q || rq, limit: n })
        : Promise.resolve([]),
  },
  // OpenAlex LAST: the union is deduped first-wins by (provider, provider_id). A work carrying a PMID
  // normalizes to pubmed_oa:<pmid> and collapses into the PubMed/Europe PMC hit above; only OpenAlex's
  // non-PMID long tail (provider "openalex") survives as net-new breadth.
  { origin: "openalex", fetch: (_q, n, _m, rq) => fetchOpenAlex({ query: rq, retmax: n }) },
  // MedlinePlus: NLM/NIH consumer-health topic pages — mainstream "general guidance" register that the
  // research sources lack. Distinct namespace (provider "medlineplus"), so no dedupe collision; it
  // self-limits (only ~1k topics, returns nothing for a specific drug-pharmacology query) and the
  // reranker orders it, so it adds an authoritative plain-language hit for benign/everyday questions
  // without crowding technical ones.
  { origin: "medlineplus", fetch: (_q, n, _m, rq) => fetchMedlinePlus({ query: rq, retmax: n }) },
];

/**
 * Build a field-scoped openFDA `search` value: each drug name matched against generic OR brand name,
 * the names OR'd together. URLSearchParams (in the provider) encodes the spaces to `+`, yielding
 * openFDA's canonical `field:"x"+OR+field:"y"` boolean form. Names are quoted so multi-word names
 * ("insulin glargine") phrase-match instead of splitting into loose tokens. Returns `null` when the
 * classifier extracted no drug name (a general, non-drug question): the caller then SKIPS openFDA
 * rather than running a bare free-text search, which is the pattern that admitted fraudulent
 * name-drop products. The raw query is retained in the signature for symmetry with the other sources.
 */
export function openFdaSearch(_rawQuery: string, mentions: string[]): string | null {
  const names = mentions.map((m) => m.trim()).filter((m) => m.length > 0);
  if (names.length === 0) return null;
  return names
    .map((m) => {
      const q = JSON.stringify(m); // wrap in quotes + escape any embedded quote
      return `openfda.generic_name:${q} OR openfda.brand_name:${q}`;
    })
    .join(" OR ");
}

export function isSafetyCriticalQuery(query: string): boolean {
  return /\b(lethal|fatal|death|deadly|toxic|toxicity|poison(?:ing)?|overdose|overdosed|recall(?:ed)?|withdrawn|contaminat(?:ed|ion)|adulterat(?:ed|ion)|arrhythmia|cardiac arrest|heart attack)\b/i
    .test(query);
}

export interface GatherLiveOpts {
  query: string;
  /** Literal drug names the classifier extracted, for field-scoped providers (openFDA). */
  mentions?: string[];
  /** Free-text query for the RESEARCH sources (PubMed/Europe PMC/OpenAlex/MedlinePlus) — the user's
   *  actual question. Defaults to `query` when omitted, so existing callers are unchanged. */
  researchQuery?: string;
  perSourceMax?: number;
  timeoutMs?: number;
}

const PER_SOURCE_MAX = 10;
const LIVE_TIMEOUT_MS = 4000;

/**
 * Fetch every registered live source concurrently. Never throws: a failed or slow source
 * yields [] for that source. Returns the union (reranker decides final order downstream).
 */
export async function gatherLiveCandidates(opts: GatherLiveOpts): Promise<LiveCandidate[]> {
  const perSourceMax = opts.perSourceMax ?? PER_SOURCE_MAX;
  const timeoutMs = opts.timeoutMs ?? LIVE_TIMEOUT_MS;
  const mentions = opts.mentions ?? [];
  const researchQuery = opts.researchQuery ?? opts.query; // research sources search this; defaults to query

  const primary = await fanOut(opts.query, researchQuery, perSourceMax, timeoutMs, mentions);

  // Retry-on-empty for benign, no-drug questions. Conversational phrasing
  // ("how do i get rid of heartburn fast?") matches NOTHING in PubMed term-mapping, while the bare
  // topic ("heartburn") retrieves well. This fires ONLY when the primary fan-out returned nothing
  // AND no drug was named — so it can never dilute a query that already retrieved (the benign
  // questions that already work never reach here). When a drug WAS named, the term is the literal
  // drug list already, so simplification is moot.
  if (primary.length > 0 || mentions.length > 0) return primary;
  const cleaned = extractSearchTerms(opts.query);
  if (!cleaned || cleaned === opts.query) return primary;
  return await fanOut(cleaned, cleaned, perSourceMax, timeoutMs, mentions);
}

/** One concurrent, fault-tolerant pass over every live source, deduped by (provider, provider_id). */
async function fanOut(
  query: string,
  researchQuery: string,
  perSourceMax: number,
  timeoutMs: number,
  mentions: string[],
): Promise<LiveCandidate[]> {
  const batches = await Promise.all(
    LIVE_SOURCES.map((def) => withTimeout(fetchOne(def, query, researchQuery, perSourceMax, mentions), timeoutMs, def.origin)),
  );
  // Dedupe the union by (provider, provider_id): e.g. PubMed and Europe PMC both returning the
  // same PMID collapse to one candidate (first wins). Keeps the rerank set clean.
  const seen = new Set<string>();
  return batches.flat().filter((c) => {
    const key = `${c.provider}:${c.provider_id}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

async function fetchOne(def: LiveSourceDef, query: string, researchQuery: string, max: number, mentions: string[]): Promise<LiveCandidate[]> {
  const sources = await def.fetch(query, max, mentions, researchQuery);
  return sources.map((s) => ({
    origin: def.origin,
    provider: s.provider,
    provider_id: s.provider_id,
    title: s.title,
    url: s.source_url,
    text: s.content_text,
    source: s,
  }));
}

/** Resolve to [] (never reject) if `p` errors or exceeds `ms`. Keeps /ask non-hostage. */
async function withTimeout(
  p: Promise<LiveCandidate[]>,
  ms: number,
  label: string,
): Promise<LiveCandidate[]> {
  // ReturnType<typeof setTimeout>, not number: Deno's setTimeout returns number, but when the
  // type-checker pulls Node lib types into scope it returns NodeJS.Timeout — this handle type
  // stays correct under either resolution (the unit gate type-checks this file on CI).
  let timer: ReturnType<typeof setTimeout> | undefined;
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
