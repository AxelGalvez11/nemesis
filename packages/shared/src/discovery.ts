import type { Citation, EvidenceGrade } from "./answer.ts";
import type { ClaimRelation } from "./claim-relation.ts";

export type ClaimVerdict = "likely" | "unlikely" | "mixed" | "unknown";
export type ClaimConfidence = "high" | "moderate" | "low" | "very_low";

export type DiscoveryGapDimension =
  | "study_design"
  | "population"
  | "outcome"
  | "comparator"
  | "duration"
  | "safety"
  | "mechanism"
  | "replication"
  | "publication";

export type DiscoveryGapSeverity = "high" | "medium" | "low";

export type StudyDesignType =
  | "randomized_controlled_trial"
  | "crossover_trial"
  | "dose_ranging_trial"
  | "prospective_cohort"
  | "retrospective_cohort"
  | "pharmacovigilance_study"
  | "mechanistic_lab_study"
  | "individual_participant_meta_analysis";

export interface DiscoveryEvidenceLink {
  citation_tag: string;
  source_id: string;
  relation: ClaimRelation;
  evidence_weight: number;
  support_quote?: string;
}

export interface DiscoveryClaim {
  id: string;
  claim_text: string;
  normalized_claim: string;
  verdict: ClaimVerdict;
  confidence: ClaimConfidence;
  evidence_grade: EvidenceGrade;
  evidence: DiscoveryEvidenceLink[];
  rationale?: string;
}

export interface StudyCharacteristic {
  citation_tag: string;
  source_id: string;
  title: string;
  study_type: string;
  population?: string;
  sample_size?: number;
  intervention?: string;
  comparator?: string;
  duration?: string;
  outcomes: string[];
  limitations: string[];
}

export interface ResearchGap {
  id: string;
  dimension: DiscoveryGapDimension;
  severity: DiscoveryGapSeverity;
  description: string;
  rationale: string;
  related_claim_ids: string[];
  source_tags: string[];
}

export interface ResearchHypothesis {
  id: string;
  gap_id?: string;
  hypothesis: string;
  why_plausible: string[];
  evidence_basis: string[];
  uncertainty: string;
  priority: DiscoveryGapSeverity;
}

export interface SuggestedStudyDesign {
  id: string;
  design_type: StudyDesignType;
  research_question: string;
  hypothesis: string;
  population: string;
  intervention: string;
  comparator: string;
  primary_endpoint: string;
  secondary_endpoints: string[];
  duration: string;
  sample_size_notes: string;
  safety_monitoring: string[];
  feasibility: "high" | "moderate" | "low";
  ethics: string;
}

export interface DiscoveryReport {
  project_title: string;
  question: string;
  summary: string;
  evidence_meter: EvidenceGrade;
  claims: DiscoveryClaim[];
  study_characteristics: StudyCharacteristic[];
  research_gaps: ResearchGap[];
  hypotheses: ResearchHypothesis[];
  study_designs: SuggestedStudyDesign[];
  monitor_terms: string[];
  generated_at: string;
}

export interface DiscoveryProjectSummary {
  id: string;
  title: string;
  question: string;
  saved_report_id: string | null;
  current_grade: EvidenceGrade;
  claim_count: number;
  gap_count: number;
  updated_at: string;
}

export interface EvidenceUpdateSummary {
  id: string;
  project_id: string;
  claim_id: string | null;
  change_type: "new_source" | "new_conflict" | "grade_change" | "verdict_change" | "trial_status_change";
  summary: string;
  review_status: "pending" | "approved" | "rejected";
  created_at: string;
}

export function normalizeDiscoveryClaim(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.?!]+$/g, "");
}

export function discoveryTitle(question: string): string {
  const cleaned = question.trim().replace(/\s+/g, " ");
  return cleaned.length <= 90 ? cleaned : `${cleaned.slice(0, 87)}...`;
}

export function claimEvidenceCounts(claim: DiscoveryClaim): Record<ClaimRelation, number> {
  const counts: Record<ClaimRelation, number> = {
    supports: 0,
    partial: 0,
    mentions: 0,
    conflicts: 0,
    reviewed: 0,
  };
  for (const item of claim.evidence) counts[item.relation] += 1;
  return counts;
}

export function citationToEvidenceLink(c: Citation): DiscoveryEvidenceLink {
  return {
    citation_tag: c.chunk_tag,
    source_id: c.source_id,
    relation: c.claim_relation ?? "reviewed",
    evidence_weight: typeof c.evidence_weight === "number" ? c.evidence_weight : c.support_score ?? 0,
    support_quote: undefined,
  };
}
