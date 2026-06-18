// Dated "what's new since X" evidence fetch for the watch-check — the live half of WS-D detection.
//
// WHY THIS IS SEPARATE FROM ask/live-sources.ts (not a date param bolted onto it):
//   • ask/live-sources fetches by RELEVANCE — the top-N most relevant sources are the landmark
//     papers that NEVER change, so diffing that set would never reveal a new paper. Monitoring must
//     fetch by DATE: recently INDEXED PubMed papers, recently UPDATED trials, recently EFFECTIVE
//     labels. Different question, different query.
//   • ISOLATION (advisor-mandated): the default green gate does NOT run the providers' own test dirs,
//     so threading a date param through the /ask-critical fetchers could regress /ask invisibly. This
//     module OWNS its dated queries and touches ZERO provider fetchers — it reuses only the canonical
//     PURE parser (parsePubMedXml) and maps raw API JSON straight to the lean WatchSource detection
//     currency. (The openFDA name-scope is replicated here rather than imported from live-sources to
//     keep this monitoring module a clean leaf, not coupled to the whole /ask retrieval import graph;
//     the format mirrors live-sources.openFdaSearch exactly — the name-drop fraud guard.)
//
// Every query shape here is LIVE-VERIFIED read-only by scripts/diag/watch-dated-probe.ts (3/3 PASS):
//   PubMed   esearch datetype=edat + mindate/maxdate         → recently-INDEXED papers
//   CT.gov   filter.advanced AREA[LastUpdatePostDate]RANGE    → recently-UPDATED trials (full studies)
//   openFDA  search (name-scope) AND effective_time:[X TO Y]  → recently-EFFECTIVE labels
//
// The module is ENV-FREE (API keys are passed in by the edge function) so it unit-tests under plain
// `deno test` with no --allow-env. Fetch is injectable + fault-tolerant + time-bounded, like the
// live sources: a failed/slow/non-200 source contributes [] and never sinks a watch cycle.

import type { WatchSource } from "../../../packages/shared/src/watch-detect.ts";
import { parsePubMedXml } from "../core-source-sync/providers/pubmed.ts";

const ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
const CTGOV_BASE = "https://clinicaltrials.gov/api/v2/studies";
const OPENFDA_BASE = "https://api.fda.gov/drug/label.json";
const UA = "PharmaOrbWatch/1.0 (+https://pharmaorb.app)";
const PER_SOURCE_MAX = 15;
const DATED_TIMEOUT_MS = 6000;
const DEFAULT_LOOKBACK_DAYS = 30;
const OVERLAP_DAYS = 2;

// ── pure date formatters (each API wants a different format) ──────────────────────────────────
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
/** NCBI mindate/maxdate: YYYY/MM/DD (UTC). */
export function pubmedDate(d: Date): string {
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
}
/** CT.gov RANGE + the YYYY-MM-DD published_date currency. */
export function ctDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
/** openFDA effective_time: YYYYMMDD (UTC). */
export function fdaDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

/**
 * The lower bound of this cycle's dated window.
 * - No cursor (first/baseline run): look back a bounded default so cycle 2 isn't spammed with the
 *   back-catalogue (the baseline stores these keys silently; only what arrives AFTER alerts).
 * - With a cursor: back off by a small overlap so indexing lag / clock skew can't drop a record that
 *   lands exactly on the boundary. The known-set diff makes the overlap free (re-fetched → deduped).
 */
export function windowSince(
  lastCheckedAt: Date | null,
  opts: { now?: Date; overlapDays?: number; defaultLookbackDays?: number } = {},
): Date {
  const now = opts.now ?? new Date();
  if (lastCheckedAt === null) {
    const days = opts.defaultLookbackDays ?? DEFAULT_LOOKBACK_DAYS;
    return new Date(now.getTime() - days * 86_400_000);
  }
  const overlap = opts.overlapDays ?? OVERLAP_DAYS;
  return new Date(lastCheckedAt.getTime() - overlap * 86_400_000);
}

// ── pure query/param builders (the 3 live-verified shapes) ────────────────────────────────────
export function buildPubMedDatedParams(query: string, since: Date, until: Date, retmax: number): URLSearchParams {
  return new URLSearchParams({
    db: "pubmed",
    term: query,
    retmax: String(retmax),
    retmode: "json",
    datetype: "edat", // Entrez date = when INDEXED (new to a watcher), NOT pdat (publication date)
    mindate: pubmedDate(since),
    maxdate: pubmedDate(until),
  });
}

export function buildCtGovDatedParams(query: string, since: Date, pageSize: number): URLSearchParams {
  return new URLSearchParams({
    "query.term": query,
    pageSize: String(pageSize),
    format: "json",
    // NO `fields` restriction: full studies guarantee designModule.studyType/phases reach the
    // classifier (advisor #3). pageSize is small so the payload is fine.
    "filter.advanced": `AREA[LastUpdatePostDate]RANGE[${ctDate(since)},MAX]`,
  });
}

/**
 * openFDA search value: each drug name matched generic OR brand (quoted → phrase-match), AND-ed with
 * the effective_time range. Returns null when no drug is named — the caller then SKIPS openFDA rather
 * than running a bare full-text search (the pattern that once admitted fraudulent name-drop products).
 */
export function buildOpenFdaDatedSearch(mentions: string[], since: Date, until: Date): string | null {
  const names = mentions.map((m) => m.trim()).filter((m) => m.length > 0);
  if (names.length === 0) return null;
  const scope = names
    .map((m) => {
      const q = JSON.stringify(m); // quote + escape, matching live-sources.openFdaSearch
      return `openfda.generic_name:${q} OR openfda.brand_name:${q}`;
    })
    .join(" OR ");
  return `(${scope}) AND effective_time:[${fdaDate(since)} TO ${fdaDate(until)}]`;
}

// ── pure mappers: raw API JSON → the lean WatchSource the detector + classifier need ──────────────
interface PubMedArticleLike {
  pmid: string;
  title: string;
  publication_types: string[];
  year: number | null;
}
export function pubmedArticleToWatchSource(a: PubMedArticleLike): WatchSource {
  return {
    provider: "pubmed_oa", // dedupes vs the live/library PubMed namespace (bare PMID)
    provider_id: a.pmid,
    title: a.title || `PubMed ${a.pmid}`,
    url: `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/`,
    published_date: a.year ? `${a.year}-01-01` : null, // coarse (XML carries year); edat window bounds recency
    publication_types: a.publication_types,
  };
}

interface CtStudyLike {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string; officialTitle?: string };
    statusModule?: { overallStatus?: string; lastUpdatePostDateStruct?: { date?: string } };
    designModule?: { studyType?: string; phases?: string[] };
  };
}
export function ctStudyToWatchSource(s: CtStudyLike): WatchSource | null {
  const ident = s.protocolSection?.identificationModule;
  const nctId = ident?.nctId;
  if (!nctId) return null;
  const phases = s.protocolSection?.designModule?.phases ?? [];
  return {
    provider: "clinicaltrials",
    provider_id: nctId,
    title: ident.briefTitle || ident.officialTitle || `Trial ${nctId}`,
    url: `https://clinicaltrials.gov/study/${nctId}`,
    published_date: s.protocolSection?.statusModule?.lastUpdatePostDateStruct?.date ?? null,
    study_type: s.protocolSection?.designModule?.studyType,
    trial_phase: phases.length ? phases[phases.length - 1] : undefined, // last phase wins (live-adapter parity)
  };
}

interface OpenFdaLabelLike {
  set_id?: string;
  effective_time?: string;
  openfda?: { brand_name?: string[]; generic_name?: string[] };
}
export function openFdaLabelToWatchSource(l: OpenFdaLabelLike): WatchSource | null {
  const setId = l.set_id;
  if (!setId) return null;
  const name = l.openfda?.brand_name?.[0] || l.openfda?.generic_name?.[0] || `Label ${setId}`;
  const t = l.effective_time;
  const published = t && t.length === 8 ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : null;
  return {
    provider: "openfda",
    // VERSION-AWARE key: an SPL set_id is STABLE across label revisions (a revised label keeps the
    // set_id, only effective_time changes). Keying on set_id alone would permanently hide every future
    // revision after the baseline — but a label CHANGE is exactly a monitoring signal we want in the
    // feed. So the detection key folds in effective_time → each revision surfaces once as a new feed
    // item. (The watch known-set is a private table, never joined to the citation namespace, so this
    // version-aware key is local to monitoring.) The URL still points at the current DailyMed label.
    provider_id: t ? `${setId}:${t}` : setId,
    title: name,
    url: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setId}`, // canonical SPL deep link (matches openfda.ts)
    published_date: published,
    // No study-type fields: a label is never a "high-tier study" → it stays feed-only, never a loud alert.
  };
}

// ── fault-tolerant, injectable, time-bounded fetchers ─────────────────────────────────────────
export type DatedFetch = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<Response>;

const defaultFetch: DatedFetch = (u, init) => fetch(u, init);

export async function fetchDatedPubMed(opts: {
  query: string;
  since: Date;
  until: Date;
  max: number;
  fetchImpl?: DatedFetch;
  ncbiApiKey?: string;
}): Promise<WatchSource[]> {
  const doFetch = opts.fetchImpl ?? defaultFetch;
  try {
    const sp = buildPubMedDatedParams(opts.query, opts.since, opts.until, opts.max);
    if (opts.ncbiApiKey) sp.set("api_key", opts.ncbiApiKey);
    const sRes = await doFetch(`${ESEARCH}?${sp}`, { headers: { "User-Agent": UA } });
    // Observability (the pubmed.ts lesson): a SILENT drop here = a MISSED alert with no trace. A 429
    // is the shared-IP throttle when NCBI_API_KEY is unset — warn so a half-skipped scan is diagnosable.
    if (!sRes.ok) {
      console.warn(`watch/pubmed esearch HTTP ${sRes.status} (api_key ${opts.ncbiApiKey ? "set" : "MISSING"}) for "${opts.query.slice(0, 60)}"`);
      return [];
    }
    const ids: string[] = (await sRes.json())?.esearchresult?.idlist ?? [];
    if (!ids.length) return [];

    const fp = new URLSearchParams({ db: "pubmed", id: ids.join(","), rettype: "abstract", retmode: "xml" });
    if (opts.ncbiApiKey) fp.set("api_key", opts.ncbiApiKey);
    const fRes = await doFetch(`${EFETCH}?${fp}`, { headers: { "User-Agent": UA } });
    if (!fRes.ok) {
      console.warn(`watch/pubmed efetch HTTP ${fRes.status} for ${ids.length} pmids`);
      return [];
    }
    // parsePubMedXml only emits articles that carry a PMID — exactly the detection key we need.
    return parsePubMedXml(await fRes.text()).map(pubmedArticleToWatchSource);
  } catch (err) {
    console.warn(`watch/pubmed dated fetch error for "${opts.query.slice(0, 60)}":`, err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchDatedClinicalTrials(opts: {
  query: string;
  since: Date;
  max: number;
  fetchImpl?: DatedFetch;
}): Promise<WatchSource[]> {
  const doFetch = opts.fetchImpl ?? defaultFetch;
  try {
    const sp = buildCtGovDatedParams(opts.query, opts.since, opts.max);
    const res = await doFetch(`${CTGOV_BASE}?${sp}`, { headers: { "User-Agent": UA } });
    if (!res.ok) {
      console.warn(`watch/clinicaltrials HTTP ${res.status} for "${opts.query.slice(0, 60)}"`);
      return [];
    }
    const studies: CtStudyLike[] = (await res.json())?.studies ?? [];
    return studies.map(ctStudyToWatchSource).filter((w): w is WatchSource => w !== null);
  } catch (err) {
    console.warn(`watch/clinicaltrials dated fetch error for "${opts.query.slice(0, 60)}":`, err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchDatedOpenFda(opts: {
  mentions: string[];
  since: Date;
  until: Date;
  max: number;
  fetchImpl?: DatedFetch;
  openFdaApiKey?: string;
}): Promise<WatchSource[]> {
  const search = buildOpenFdaDatedSearch(opts.mentions, opts.since, opts.until);
  if (search === null) return []; // no drug named → skip the network (the name-drop fraud guard)
  const doFetch = opts.fetchImpl ?? defaultFetch;
  try {
    const sp = new URLSearchParams({ limit: String(opts.max), search });
    if (opts.openFdaApiKey) sp.set("api_key", opts.openFdaApiKey);
    const res = await doFetch(`${OPENFDA_BASE}?${sp}`, { headers: { "User-Agent": UA } });
    if (res.status === 404) return []; // openFDA's "no matches" — expected, not a failure (no warn)
    if (!res.ok) {
      console.warn(`watch/openfda HTTP ${res.status} for [${opts.mentions.join(", ").slice(0, 60)}]`);
      return [];
    }
    const labels: OpenFdaLabelLike[] = (await res.json())?.results ?? [];
    return labels.map(openFdaLabelToWatchSource).filter((w): w is WatchSource => w !== null);
  } catch (err) {
    console.warn(`watch/openfda dated fetch error for [${opts.mentions.join(", ").slice(0, 60)}]:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Fetch every dated source concurrently and return the deduped union (first-wins by provider key),
 * mirroring ask/live-sources.gatherLiveCandidates. A registry (one entry per source) so adding a
 * dated Europe PMC / OpenAlex query later is one line, not a rewrite. Never throws: each source is
 * raced against a timeout that yields [], so a slow/failed source can't sink the watch cycle.
 */
export async function gatherDatedCandidates(opts: {
  query: string;
  mentions: string[];
  since: Date;
  until?: Date;
  perSourceMax?: number;
  timeoutMs?: number;
  fetchImpl?: DatedFetch;
  ncbiApiKey?: string;
  openFdaApiKey?: string;
}): Promise<WatchSource[]> {
  const until = opts.until ?? new Date();
  const max = opts.perSourceMax ?? PER_SOURCE_MAX;
  const timeoutMs = opts.timeoutMs ?? DATED_TIMEOUT_MS;
  const f = opts.fetchImpl;

  const sources: Array<() => Promise<WatchSource[]>> = [
    () => fetchDatedPubMed({ query: opts.query, since: opts.since, until, max, fetchImpl: f, ncbiApiKey: opts.ncbiApiKey }),
    () => fetchDatedClinicalTrials({ query: opts.query, since: opts.since, max, fetchImpl: f }),
    () => fetchDatedOpenFda({ mentions: opts.mentions, since: opts.since, until, max, fetchImpl: f, openFdaApiKey: opts.openFdaApiKey }),
  ];

  const batches = await Promise.all(sources.map((run) => withTimeout(run, timeoutMs)));
  const seen = new Set<string>();
  return batches.flat().filter((c) => {
    const key = `${c.provider}:${c.provider_id}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

/** Resolve to [] (never reject) if the source errors or exceeds `ms` — keeps a watch cycle robust.
 *  Exported so the edge fn races the retraction-recheck pass (same WatchSource[] shape) the same way. */
export async function withTimeout(run: () => Promise<WatchSource[]>, ms: number): Promise<WatchSource[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<WatchSource[]>((resolve) => {
    timer = setTimeout(() => resolve([]), ms);
  });
  try {
    return await Promise.race([run(), timeout]);
  } catch {
    return [];
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
