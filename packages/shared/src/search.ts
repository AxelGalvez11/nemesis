// Search + drug-read shapes (§8). These mirror the Phase-2 read RPCs
// (search_entities, get_drug, get_drug_label/trials/pubmed) so the app and the
// backend agree on one set of names.

import type { EvidenceCounts, EvidenceTier } from "./evidence.ts";

export type EntityType =
  | "drug"
  | "supplement"
  | "peptide"
  | "biologic"
  | "class"
  | "company";

export type ApprovedStatus =
  | "approved"
  | "investigational"
  | "research_use"
  | "supplement"
  | "unknown";

/** GET /search?q= result row (search_entities RPC). */
export interface SearchResult {
  type: EntityType;
  id: string;
  name: string;
  subtitle: string | null; // top brand alias
  status: ApprovedStatus;
  score: number;
}

/** A cited Layer-A source row as surfaced by the read RPCs. */
export interface SourceRef {
  source_id: string;
  provider: string;
  title: string | null;
  url: string | null;
  license: string | null;
  retrieved_at: string | null;
}

/** GET /drugs/{id} overview (get_drug RPC). */
export interface DrugOverview {
  id: string;
  canonical_name: string;
  entity_type: EntityType;
  approved_status: ApprovedStatus;
  mechanism_summary: string | null;
  rxnorm_cui: string | null;
  primary_class: { id: string; name: string } | null;
  classes: Array<{ id: string; name: string }>;
  brand_names: string[];
  // Phase-4 contract touch-up: the evidence engine persists the frozen
  // EvidenceTier + EvidenceCounts, and limitations is a doc-12 ARRAY (jsonb,
  // migration 0114). The Phase-2 sketch typed these as string/Record<string,
  // number>/string|null while the column was empty text; corrected here at the
  // source of truth BEFORE Phase 6 consumes it.
  evidence_score: {
    score: EvidenceTier;
    rationale: string;
    evidence_counts: EvidenceCounts;
    limitations: string[];
  } | null;
  counts: { labels: number; trials: number; pubmed: number; prices: number };
  sources: SourceRef[];
}

/** Canonical doc-20 label section keys (GET /drugs/{id}/label). */
export type LabelSectionKey =
  | "boxed_warning"
  | "indications"
  | "contraindications"
  | "warnings"
  | "adverse_reactions"
  | "drug_interactions"
  | "pregnancy_lactation"
  | "renal_hepatic"
  | "patient_counseling";
