// Answer-spec types (doc-20 / §7 / §8). The /ask request + frozen response.

import type { ClaimRelation } from "./claim-relation.ts";

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
  | "general_health"
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

/** How directly a source supports the answer text that cited it. Optional/additive:
 *  older saved answers simply omit it. This is deterministic metadata from the
 *  citation/support layer, not the model's own confidence. */
export type SourceSupportLevel =
  | "direct"
  | "partial"
  | "weak"
  | "background"
  | "reviewed";

/** Coarse evidence role derived from provider/publication metadata. It describes
 *  what kind of source this is, not whether its conclusion is favorable. */
export type SourceEvidenceRole =
  | "official_label"
  | "systematic_review"
  | "randomized_trial"
  | "clinical_trial"
  | "observational_study"
  | "case_report"
  | "review_article"
  | "consumer_health"
  | "adverse_event_signal"
  | "research_article"
  | "background";

/** Speed/depth dial for a single (non-research) answer:
 *  - "fast"     — plain-English register for a general reader, concise (the web default).
 *  - "thorough" — technical register for a clinician/researcher; fuller, casts a wider candidate net per source.
 *  Absent → current behavior (standard register, current retrieval), so older clients, the mobile app, and
 *  saved-chat replays are byte-for-byte unchanged. Deep research / meta-analysis use the research endpoint. */
export type AskMode = "fast" | "thorough";

/** POST /ask request body (§8). */
export interface AskRequest {
  question: string;
  use_health_context?: boolean;
  conversation_id?: string;
  /** Speed/depth dial; see AskMode. Optional — absent preserves current behavior. */
  mode?: AskMode;
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
  /** A free-to-read full-text LINK (open-access PDF/article page) when the source exposes one — a
   *  pointer the reader can follow to read the whole paper free, NOT text we retrieved or grounded
   *  (we still only ground the abstract). Surfaced from OA data the live providers already return
   *  (OpenAlex `best_oa_location`/`open_access`, Europe PMC `fullTextUrlList`); absent otherwise and
   *  on older saved chats/reports. The UI shows it as a distinct "Read full text (free)" affordance. */
  oa_url?: string;
  /** Claim-support rating: how directly this retrieved source backs the answer claim(s) that cited it.
   *  `reviewed` means the engine searched/ranked the source but the final answer did not cite it. */
  support_level?: SourceSupportLevel;
  /** Approximate 0..100 support signal computed from source type + citation/support overlap. */
  support_score?: number;
  /** Coarse source role from deterministic metadata, e.g. official_label, randomized_trial. */
  evidence_role?: SourceEvidenceRole;
  /** Approximate 0..100 source-quality/role score, independent of whether the result supports the claim. */
  evidence_weight?: number;
  /** Short human-readable reason for the support/source rating. */
  support_reason?: string;
  /** Claim relation label for the citation UI: support direction, not model confidence. */
  claim_relation?: ClaimRelation;
  /** Short human-readable reason for the claim relation. */
  relation_reason?: string;
}

/** Verbatim retrieved text behind one citation tag — the verification payload. Returned ONLY when the
 *  request opts in with `include_source_text`, so a benchmark/judge can check each claim against the
 *  EXACT source text it cited (turning "grounded" into a per-claim verifiable read), rather than
 *  reconstructing the source by re-fetching (lossy). Never part of a normal answer. */
export interface SourceText {
  /** The retrieval-local [n] tag, matching Citation.chunk_tag. */
  tag: string;
  /** Verbatim retrieved chunk text for that tag. */
  text: string;
}

/** One walled "In the news — not verified evidence" headline attached to an answer. Deliberately a
 *  DISTINCT, minimal shape (no provider/license/grounding fields): a news item can NEVER be mistaken
 *  for, or coerced into, a Citation/evidence source. Mirrors the engine-side NewsItem. */
export interface AnswerNewsItem {
  title: string;
  url: string;
  /** Outlet name (e.g. "Reuters"); "" when the feed omits it. */
  source: string;
  /** ISO 8601, or null when the feed date was unparseable. */
  published_at: string | null;
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
  /** Per-citation verbatim source text, present ONLY when the request set `include_source_text=true`
   *  (a verification/eval aid). Omitted from normal answers and the stored trace to keep them small. */
  source_texts?: SourceText[];
  /** The resolved primary drug name (canonical, else the literal mention) for the answer header's
   *  molecule image. Absent for non-drug/zero-entity questions and on older saved chats; the renderer
   *  404-hides the image for anything PubChem can't depict, so it is safe to set loosely. */
  primary_drug?: string;
  /** The reranked sources the engine REVIEWED for this answer but the text didn't cite — surfaced in
   *  the evidence panel as "also reviewed" so the full breadth of the search is visible (e.g. the
   *  PubMed / trial sources behind an FDA-label-cited answer). Additive; absent on older saved chats. */
  reviewed_sources?: Citation[];
  /** Walled "In the news — not verified evidence" headlines for this question. A PAID surface
   *  (Plus/Pro). These are feed metadata ONLY — never grounded, cited, counted as evidence, or mixed
   *  into citations/reviewed_sources. Absent for free users (see news_locked), non-drug questions,
   *  and older saved chats. The UI renders them in a clearly-labeled, separate panel. */
  news?: AnswerNewsItem[];
  /** True when the user's plan can't see the news panel (free tier) but the panel WOULD have shown
   *  (a drug question) — the UI shows a locked upgrade teaser instead. Absent/false for paid users and
   *  where no panel would appear anyway. */
  news_locked?: boolean;
}

/** Which canned template produced the answer, when one did. */
export type AnswerTemplate =
  | "emergency_routing"
  | "sourcing_refusal"
  | "no_source"
  /** A generation tripped the post-filter (doc-20 forbidden pattern) and was discarded. */
  | "safety_fallback"
  /** A lab_draft request whose SCOPE was hazardous (chemical-synthesis/production, weaponization, or
   *  pathogen gain-of-function) — declined before any retrieval by the lab-draft scope guard. */
  | "lab_draft_refused";

/** Detected-entity record stored on the trace + echoed for the app. */
export interface DetectedEntity {
  mention: string;
  entity_id: string | null; // null when /search resolved nothing
  canonical_name: string | null;
}
