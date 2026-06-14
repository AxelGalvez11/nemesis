/**
 * OpenAlex provider. A free, key-less index of ~250M scholarly works with abstracts — the broadest
 * single source we have. Used LIVE (alongside PubMed/Europe PMC/ClinicalTrials/openFDA) to widen the
 * evidence base, especially the long tail of papers that are citable but not surfaced by the others.
 *
 * API: GET https://api.openalex.org/works?search=<q>&per-page=N&mailto=<contact> (the mailto opts
 * into the polite pool — faster, no key). No is_oa filter: we WANT paywalled-but-citable abstracts
 * (e.g. the NEJM RECOVERY dexamethasone trial carries license=None but is the canonical source), and
 * OpenAlex only ever returns the abstract, never full text.
 *
 * Licensing mirrors europepmc.ts: read each work's own license and map it precisely. Anything we
 * can't verify as permissive (incl. null) -> cc_by_nc, so the source SURFACES live (we may cite it)
 * but the commercial gate (assertCommercialFriendly) blocks STORING its text.
 *
 * Dedupe: a work that carries a PMID maps to provider "pubmed_oa" + the BARE pmid, so it collapses
 * against the PubMed/Europe PMC live sources (registered earlier -> they win, first-wins). Only the
 * non-PMID long tail survives under the "openalex" provider — exactly the net-new breadth we want.
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../normalized-source.ts";
import type { CoreSourceLicense, CoreSourceProvider } from "../license.ts";

const API = "https://api.openalex.org/works";
const CONTACT = "support@pharmaorb.app";

/** The slice of the OpenAlex `work` object we read. Everything optional — the API is sparse. */
export interface OpenAlexWork {
  id?: string; // "https://openalex.org/W3042270788"
  title?: string;
  ids?: { openalex?: string; doi?: string; pmid?: string; pmcid?: string; mag?: string };
  abstract_inverted_index?: Record<string, number[]> | null;
  primary_location?: { source?: { display_name?: string; issn_l?: string | null; issn?: string[] | null } | null; license?: string | null } | null;
  // Open-access fields OpenAlex returns on every work — read straight off the same /works response
  // (zero extra network) to surface a free-to-read link.
  open_access?: { is_oa?: boolean; oa_status?: string; oa_url?: string | null } | null;
  best_oa_location?: { pdf_url?: string | null; landing_page_url?: string | null } | null;
  publication_year?: number;
  type?: string;
  authorships?: Array<{ author?: { display_name?: string } }>;
  biblio?: { volume?: string | null; issue?: string | null; first_page?: string | null; last_page?: string | null };
}

/**
 * Rebuild abstract text from OpenAlex's inverted index (word -> [positions]). A word can appear at
 * several, non-contiguous positions, so we emit one (position, word) pair per occurrence, sort by
 * position, and join. Missing/empty index -> "".
 */
export function reconstructAbstract(idx: Record<string, number[]> | null | undefined): string {
  if (!idx) return "";
  const placed: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(idx)) {
    for (const pos of positions) placed.push([pos, word]);
  }
  if (placed.length === 0) return "";
  placed.sort((a, b) => a[0] - b[0]);
  return placed.map(([, w]) => w).join(" ");
}

/**
 * Map an OpenAlex license string to our enum. Order matters: most-restrictive substrings first
 * ("nc"/"nd" before plain "by"). Unknown/null -> cc_by_nc (restricted: surfaces live, never stored).
 */
export function mapOpenAlexLicense(raw: string | null | undefined): CoreSourceLicense {
  const l = (raw ?? "").toLowerCase().replace(/[\s_]+/g, "-");
  if (!l) return "cc_by_nc";
  if (l.includes("cc0") || l === "cc-0") return "cc0";
  if (l.includes("public-domain") || l === "pd") return "public_domain";
  if (l.includes("nc")) return "cc_by_nc"; // CC BY-NC / NC-SA / NC-ND — non-commercial
  if (l.includes("nd")) return "cc_by_nd"; // CC BY-ND — no derivatives (our chunk+embed is one)
  if (l.includes("sa")) return "cc_by_sa";
  if (l.includes("by")) return "cc_by";
  return "cc_by_nc"; // unrecognized publisher terms -> restricted by default
}

/**
 * The best FREE-to-read full-text LINK for a work — a pointer the reader can follow to the free
 * PDF/article, NOT text we retrieve or ground. Prefer a direct PDF, then the OA landing page, then
 * open_access.oa_url; undefined when the work is not open access. Zero extra network: these fields
 * ride the same /works response we already fetch.
 */
export function bestOaUrl(work: OpenAlexWork): string | undefined {
  const pdf = work.best_oa_location?.pdf_url?.trim();
  if (pdf) return pdf;
  const landing = work.best_oa_location?.landing_page_url?.trim();
  if (landing) return landing;
  const oa = work.open_access;
  if (oa?.is_oa && oa.oa_url?.trim()) return oa.oa_url.trim();
  return undefined;
}

/** "https://openalex.org/W3042270788" -> "W3042270788". */
function shortOpenAlexId(idUrl: string | undefined): string {
  return (idUrl ?? "").replace(/^https?:\/\/openalex\.org\//, "").trim();
}

/** "https://pubmed.ncbi.nlm.nih.gov/27633186" (with or without a trailing slash) -> "27633186". */
function barePmid(pmidUrl: string | undefined): string | undefined {
  if (!pmidUrl) return undefined;
  const m = pmidUrl.match(/(\d+)\/?$/);
  return m ? m[1] : undefined;
}

/** "https://doi.org/10.1056/nejmoa2021436" -> "10.1056/nejmoa2021436". */
function bareDoi(doiUrl: string | undefined): string | undefined {
  if (!doiUrl) return undefined;
  return doiUrl.replace(/^https?:\/\/(dx\.)?doi\.org\//, "").trim() || undefined;
}

/**
 * Choose the (provider, provider_id) key. PMID present -> "pubmed_oa" + bare pmid (dedupes against
 * the PubMed/Europe PMC live sources). Otherwise the OpenAlex long tail -> "openalex" + short id.
 */
export function providerAndId(
  work: OpenAlexWork,
): { provider: CoreSourceProvider; provider_id: string } {
  const pmid = barePmid(work.ids?.pmid);
  if (pmid) return { provider: "pubmed_oa", provider_id: pmid };
  return { provider: "openalex", provider_id: shortOpenAlexId(work.id) };
}

/**
 * Map one OpenAlex work to a NormalizedSource. Pure (no network) so the parse is unit-testable.
 * Returns null when the work lacks a reconstructable abstract or a title (we need both to rank +
 * ground). source_url prefers the PMID link, then the DOI link, then the OpenAlex landing page.
 */
export async function normalizeWork(work: OpenAlexWork): Promise<NormalizedSource | null> {
  const abstract = reconstructAbstract(work.abstract_inverted_index);
  const title = (work.title ?? "").trim();
  if (!abstract || !title) return null;

  const { provider, provider_id } = providerAndId(work);
  if (!provider_id) return null;

  const pmid = barePmid(work.ids?.pmid);
  const doi = bareDoi(work.ids?.doi);
  const src = work.primary_location?.source;
  const journal = src?.display_name ?? undefined;
  // ISSN(s) for the DOAJ vetted-journal check: prefer issn_l, then any in issn[], deduped.
  const issn = [...new Set([src?.issn_l, ...(src?.issn ?? [])].filter((s): s is string => Boolean(s)))];
  const pages = [work.biblio?.first_page, work.biblio?.last_page].filter(Boolean).join("-") || undefined;
  const authors = (work.authorships ?? [])
    .map((a) => a.author?.display_name)
    .filter((n): n is string => Boolean(n && n.trim()));

  const source_url = pmid
    ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
    : doi
    ? `https://doi.org/${doi}`
    : work.id ?? `https://openalex.org/${shortOpenAlexId(work.id)}`;

  const content_text = `${title}\n\nABSTRACT\n\n${abstract}`;
  return {
    provider,
    provider_id,
    title,
    subtitle: journal,
    source_url,
    license: mapOpenAlexLicense(work.primary_location?.license),
    content_text,
    content_hash: await sha256Hex(content_text),
    metadata: {
      source: "openalex",
      openalex_id: shortOpenAlexId(work.id),
      pmid,
      doi,
      year: work.publication_year,
      journal,
      issn,
      authors,
      volume: work.biblio?.volume ?? undefined,
      issue: work.biblio?.issue ?? undefined,
      pages,
      publication_types: work.type ? [work.type] : [],
      oa_url: bestOaUrl(work), // free-to-read full-text LINK (not text we ground); undefined when not OA
    },
  };
}

export interface OpenAlexFetchOpts {
  query: string;
  retmax?: number;
}

/**
 * Live fetch. Never throws upstream concerns: a non-OK response yields []. Caps at 25 to match the
 * other providers' politeness ceiling.
 */
export async function fetchOpenAlex(opts: OpenAlexFetchOpts): Promise<NormalizedSource[]> {
  const retmax = Math.min(opts.retmax ?? 10, 25);
  const params = new URLSearchParams({
    search: opts.query,
    "per-page": String(retmax),
    mailto: CONTACT,
  });
  const res = await fetch(`${API}?${params.toString()}`, {
    headers: { "User-Agent": "PharmaOrbBot/1.0 (mailto:support@pharmaorb.app)" },
  });
  if (!res.ok) return [];
  const body = await res.json();
  const results: OpenAlexWork[] = body?.results ?? [];

  const out: NormalizedSource[] = [];
  for (const w of results) {
    const s = await normalizeWork(w);
    if (s) out.push(s);
  }
  return out;
}
