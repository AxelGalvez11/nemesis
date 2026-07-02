import { legalFullTextAccess, openVersionAccess } from "../access";
import { normalizeDoi } from "../dedupe";
import type { PaperHit, PaperSourceAdapter, SearchOptions } from "../types";

interface OpenAlexWork {
  id?: string;
  title?: string;
  doi?: string | null;
  publication_year?: number | null;
  type_crossref?: string | null;
  type?: string | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  ids?: {
    pmid?: string;
    pmcid?: string;
    doi?: string;
  };
  open_access?: {
    is_oa?: boolean;
    oa_url?: string | null;
  };
  best_oa_location?: {
    landing_page_url?: string | null;
    pdf_url?: string | null;
    license?: string | null;
    version?: string | null;
  } | null;
  primary_location?: {
    source?: {
      display_name?: string | null;
    } | null;
  } | null;
  authorships?: Array<{
    author?: {
      display_name?: string | null;
    };
  }>;
  cited_by_count?: number;
}

interface OpenAlexResponse {
  results?: OpenAlexWork[];
}

function lastUrlSegment(value: string | undefined): string | null {
  if (!value) return null;
  const segment = value.split("/").filter(Boolean).at(-1);
  return segment ?? null;
}

export function reconstructOpenAlexAbstract(
  index: Record<string, number[]> | null | undefined,
): string | null {
  if (!index) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) {
      words[position] = word;
    }
  }
  const abstract = words.filter(Boolean).join(" ").trim();
  return abstract || null;
}

function publicationType(work: OpenAlexWork): string[] {
  return [work.type_crossref, work.type].filter((value): value is string => Boolean(value));
}

function accessCandidates(work: OpenAlexWork) {
  const location = work.best_oa_location;
  const url = location?.landing_page_url ?? work.open_access?.oa_url ?? null;
  if (!work.open_access?.is_oa || !url) return [];

  const input = {
    source: "openalex" as const,
    fullTextUrl: url,
    pdfUrl: location?.pdf_url ?? null,
    license: location?.license ?? null,
    version: location?.version ?? null,
    explanation: "OpenAlex reports an open-access location for this work.",
  };

  return location?.license ? [legalFullTextAccess(input)] : [openVersionAccess(input)];
}

export function mapOpenAlexWork(work: OpenAlexWork): PaperHit | null {
  if (!work.title) return null;
  const doi = normalizeDoi(work.doi ?? work.ids?.doi);
  const pmid = lastUrlSegment(work.ids?.pmid);
  const pmcid = lastUrlSegment(work.ids?.pmcid);

  return {
    id: `openalex:${work.id ?? doi ?? work.title}`,
    title: work.title,
    abstract: reconstructOpenAlexAbstract(work.abstract_inverted_index),
    doi,
    pmid,
    pmcid,
    arxiv_id: null,
    year: work.publication_year ?? null,
    journal: work.primary_location?.source?.display_name ?? null,
    authors:
      work.authorships
        ?.map((authorship) => authorship.author?.display_name)
        .filter((author): author is string => Boolean(author))
        .slice(0, 12) ?? [],
    publication_types: publicationType(work),
    source_rank: ["openalex"],
    access_candidates: accessCandidates(work),
    metadata: {
      source_url: work.id ?? null,
      cited_by_count: work.cited_by_count ?? null,
    },
  };
}

export function createOpenAlexAdapter(): PaperSourceAdapter {
  return {
    name: "openalex",
    async search(query: string, options: SearchOptions = {}) {
      const fetchImpl = options.fetchImpl ?? fetch;
      const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
      const url = new URL("https://api.openalex.org/works");
      url.searchParams.set("search", query);
      url.searchParams.set("per-page", String(limit));
      url.searchParams.set("sort", "relevance_score:desc");
      url.searchParams.set("mailto", process.env.UNPAYWALL_EMAIL ?? "support@pharmaorb.app");

      const response = await fetchImpl(url, { signal: options.signal });
      if (!response.ok) {
        throw new Error(`OpenAlex search failed with ${response.status}`);
      }
      const json = (await response.json()) as OpenAlexResponse;
      return (json.results ?? [])
        .map(mapOpenAlexWork)
        .filter((paper): paper is PaperHit => Boolean(paper));
    },
  };
}
