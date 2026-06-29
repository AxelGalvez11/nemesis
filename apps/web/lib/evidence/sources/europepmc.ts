import { legalFullTextAccess, openVersionAccess } from "../access";
import { normalizeDoi } from "../dedupe";
import type { PaperHit, PaperSourceAdapter, SearchOptions } from "../types";

interface EuropePmcFullTextUrl {
  url?: string;
  documentStyle?: string;
  availability?: string;
}

interface EuropePmcResult {
  id?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  abstractText?: string;
  journalTitle?: string;
  pubYear?: string;
  authorString?: string;
  pubType?: string;
  isOpenAccess?: "Y" | "N";
  license?: string;
  fullTextUrlList?: {
    fullTextUrl?: EuropePmcFullTextUrl[];
  };
}

interface EuropePmcResponse {
  resultList?: {
    result?: EuropePmcResult[];
  };
}

function parseYear(value: string | undefined): number | null {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePublicationTypes(value: string | undefined): string[] {
  return value
    ? value
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
    : [];
}

function accessCandidates(result: EuropePmcResult) {
  const urls = result.fullTextUrlList?.fullTextUrl ?? [];
  if (result.isOpenAccess !== "Y" || !urls.length) return [];

  const primary = urls.find((url) => url.documentStyle === "html") ?? urls[0];
  if (!primary?.url) return [];

  const input = {
    source: "europepmc" as const,
    fullTextUrl: primary.url,
    pdfUrl: urls.find((url) => url.documentStyle === "pdf")?.url ?? null,
    license: result.license ?? null,
    version: primary.availability ?? null,
    explanation: "Europe PMC reports an open-access full-text location.",
  };

  return result.license ? [legalFullTextAccess(input)] : [openVersionAccess(input)];
}

export function mapEuropePmcResult(result: EuropePmcResult): PaperHit | null {
  if (!result.title) return null;
  const pmid = result.pmid ?? (result.id && /^\d+$/.test(result.id) ? result.id : null);

  return {
    id: `europepmc:${result.pmcid ?? pmid ?? normalizeDoi(result.doi) ?? result.title}`,
    title: result.title,
    abstract: result.abstractText ?? null,
    doi: normalizeDoi(result.doi),
    pmid,
    pmcid: result.pmcid ?? null,
    arxiv_id: null,
    year: parseYear(result.pubYear),
    journal: result.journalTitle ?? null,
    authors: result.authorString
      ? result.authorString
          .split(",")
          .map((author) => author.trim())
          .filter(Boolean)
          .slice(0, 12)
      : [],
    publication_types: parsePublicationTypes(result.pubType),
    source_rank: ["europepmc"],
    access_candidates: accessCandidates(result),
    metadata: {
      source_url: pmid
        ? `https://europepmc.org/article/MED/${pmid}`
        : result.pmcid
          ? `https://europepmc.org/article/PMC/${result.pmcid.replace(/^PMC/i, "")}`
          : null,
    },
  };
}

export function createEuropePmcAdapter(): PaperSourceAdapter {
  return {
    name: "europepmc",
    async search(query: string, options: SearchOptions = {}) {
      const fetchImpl = options.fetchImpl ?? fetch;
      const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
      const url = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
      url.searchParams.set("query", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("resultType", "core");
      url.searchParams.set("pageSize", String(limit));

      const response = await fetchImpl(url, { signal: options.signal });
      if (!response.ok) {
        throw new Error(`Europe PMC search failed with ${response.status}`);
      }
      const json = (await response.json()) as EuropePmcResponse;
      return (json.resultList?.result ?? [])
        .map(mapEuropePmcResult)
        .filter((paper): paper is PaperHit => Boolean(paper));
    },
  };
}
