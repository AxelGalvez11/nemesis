export type EvidenceSourceName =
  | "pubmed"
  | "pmc_oa"
  | "europepmc"
  | "openalex"
  | "unpaywall"
  | "crossref"
  | "clinicaltrials"
  | "dailymed"
  | "openfda"
  | "core"
  | "arxiv";

export type EvidenceAccessStatus =
  | "legal_full_text"
  | "open_version"
  | "preprint"
  | "abstract_or_metadata_only"
  | "metadata_only";

export interface PaperAccess {
  status: EvidenceAccessStatus;
  source: EvidenceSourceName | "none";
  full_text_url: string | null;
  pdf_url: string | null;
  license: string | null;
  version: string | null;
  can_index: boolean;
  can_store_full_text: boolean;
  can_show_snippets: boolean;
  explanation: string;
}

export interface PaperHit {
  id: string;
  title: string;
  abstract: string | null;
  doi: string | null;
  pmid: string | null;
  pmcid: string | null;
  arxiv_id: string | null;
  year: number | null;
  journal: string | null;
  authors: string[];
  publication_types: string[];
  source_rank: EvidenceSourceName[];
  access_candidates: PaperAccess[];
  metadata: Record<string, unknown>;
  score?: number;
}

export interface SearchOptions {
  limit?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface PaperSourceAdapter {
  name: EvidenceSourceName;
  search(query: string, options?: SearchOptions): Promise<PaperHit[]>;
  resolveByDoi?(
    doi: string,
    options?: Pick<SearchOptions, "fetchImpl" | "signal">,
  ): Promise<PaperAccess | null>;
}

export interface EvidenceSearchWarning {
  source: EvidenceSourceName;
  message: string;
}

export interface EvidenceSearchResult extends PaperHit {
  access: PaperAccess;
}

export interface EvidenceSearchResponse {
  query: string;
  count: number;
  results: EvidenceSearchResult[];
  warnings: EvidenceSearchWarning[];
  searched_sources: EvidenceSourceName[];
  generated_at: string;
}
