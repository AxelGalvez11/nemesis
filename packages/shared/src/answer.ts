// Answer-spec types (doc-20 / §7 / §8). The /ask request + frozen response.

/** doc-20 intent categories (the 15 the classifier maps to). `smalltalk` is NOT one the
 *  classifier emits — it is set deterministically by the small-talk short-circuit (safety.ts /
 *  index.ts) for a pure greeting/thanks/capability message, answered conversationally without
 *  retrieval. Kept in the union so the response type and the frontend can render it. */
export type Intent =
  | "drug_overview"
  | "drug_interaction"
  | "side_effects"
  | "label_summary"
  | "comparison"
  | "mechanism"
  | "trial_lookup"
  | "evidence_for_claim"
  | "supplement_peptide"
  | "dosing"
  | "emergency_overdose"
  | "pregnancy_pediatrics"
  | "health_context"
  | "drug_sourcing"
  | "investment"
  | "smalltalk";

/** doc-20 safety flags. The first three hard-short-circuit before generation. */
export type SafetyFlag =
  | "emergency_possible"
  | "overdose_possible"
  | "self_harm"
  | "pregnancy"
  | "pediatric"
  | "medication_change_request"
  | "controlled_substance"
  | "psychiatric_medication"
  | "anticoagulant"
  | "insulin"
  | "immunosuppressant"
  | "chemotherapy"
  | "research_use_peptide"
  | "drug_sourcing"
  | "no_sources_found";

/** Evidence grade surfaced on an answer (mirrors the §9 evidence-score tiers). */
export type EvidenceGrade =
  | "very_strong"
  | "strong"
  | "moderate"
  | "weak"
  | "very_weak"
  | "unknown"
  | "not_applicable"; // emergency / sourcing-refusal answers carry no grade

/** POST /ask request body (§8). */
export interface AskRequest {
  question: string;
  use_health_context?: boolean;
  conversation_id?: string;
}

/** One narrative bullet that carries the source chunk_ids backing it. */
/**
 * A verbatim passage from a cited source that supports a specific claim (the provenance highlight
 * behind a citation). Computed deterministically server-side — never an LLM — so `quote` is always a
 * real substring of the cited source; the UI re-locates and highlights it.
 */
export interface ClaimSupport {
  /** The cited source's [n] tag this passage comes from. */
  citation_tag: string;
  /** Verbatim supporting sentence from that source. */
  quote: string;
}

export interface AnswerPoint {
  text: string;
  /** chunk_ids ([n] tags) the generator cited and citation-enforce kept. */
  citation_ids: string[];
  /**
   * Optional: verbatim passage(s) in the cited source(s) that support this claim, for highlighting
   * provenance. Absent on older saved answers and whenever no passage cleared the support threshold.
   */
  support?: ClaimSupport[];
}

/**
 * The six doc-20 narrative sections. `bottom_line` is the doc-20 "Bottom line"
 * (== §8 plain_english_summary, surfaced flat on the response for the app).
 */
export interface AnswerSections {
  what_we_know: AnswerPoint[];
  what_we_do_not_know: AnswerPoint[];
  /** doc-20 "Safety notes" — kept in the superset; §8's 3-array sketch dropped it. */
  safety_notes: AnswerPoint[];
  questions_to_ask: string[];
}

/** A resolved citation (§8 citations[] entry), joined back to core_sources. */
export interface Citation {
  /** The retrieval-local [n] tag the answer text references. */
  chunk_tag: string;
  source_id: string;
  source_type: string; // provider: openfda | clinicaltrials | pubmed_oa | ...
  title: string | null;
  section: string | null;
  url: string | null;
  license: string | null;
  published_date: string | null; // YYYY-MM-DD
  retrieved_at: string | null;
  // ── Optional bibliographic metadata (publishable-reports). Populated for NEW
  //    content once the Phase-2 plumbing lands; absent on older saved reports/chats,
  //    where the reference formatter degrades gracefully. Never required. ──
  authors?: string[];
  journal?: string;
  /** Authoritative publication year (may differ from published_date, which for live sources is the source's effective date). Formatters fall back to published_date.slice(0,4) when absent. */
  year?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  /** True when the source's journal is listed in DOAJ (a vetted, anti-predatory open-access journal).
   *  A POSITIVE-ONLY credibility signal — absent/false means "not confirmed DOAJ-listed", not "low
   *  quality". Stamped server-side from the journal ISSN; absent on older saved reports/chats. */
  doaj_vetted?: boolean;
  // ── Optional study-type metadata (study-type badges). Carried through from the
  //    provider's PubMed <PublicationType> / ClinicalTrials.gov fields so the UI can
  //    show a verbatim study-type label (studyTypeLabel in study-type.ts). Never a
  //    label the LLM guessed; absent on older saved reports/chats. ──
  /** PubMed PublicationType list, e.g. ["Meta-Analysis", "Journal Article"]. */
  publication_types?: string[];
  /** ClinicalTrials.gov study type, e.g. "INTERVENTIONAL" | "OBSERVATIONAL". */
  study_type?: string;
  /** Trial phase, Roman from PubMed ("Phase III") or CT.gov form ("PHASE3"). */
  trial_phase?: string;
}

/** Frozen POST /ask response (doc-11 / §7 / §8 superset). */
export interface AskResponse {
  answer_id: string;
  intent: Intent;
  /** doc-20 "Bottom line" == §8 plain_english_summary. */
  plain_english_summary: string;
  evidence_grade: EvidenceGrade;
  answer_sections: AnswerSections;
  citations: Citation[];
  safety_flags: SafetyFlag[];
  /** Set when the answer is a safety template (emergency / sourcing / no-source). */
  template?: AnswerTemplate;
  /** True when no source cleared the retrieval threshold (AC3 refusal path). */
  refused_unsupported: boolean;
  /** Freshness banner support: oldest retrieved_at across cited sources. */
  oldest_source_date: string | null;
}

/** Which canned template produced the answer, when one did. */
export type AnswerTemplate =
  | "emergency_routing"
  | "sourcing_refusal"
  | "no_source"
  /** A generation tripped the post-filter (doc-20 forbidden pattern) and was discarded. */
  | "safety_fallback";

/** Detected-entity record stored on the trace + echoed for the app. */
export interface DetectedEntity {
  mention: string;
  entity_id: string | null; // null when /search resolved nothing
  canonical_name: string | null;
}
