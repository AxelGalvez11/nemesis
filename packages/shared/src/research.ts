// Deep Research contract (§ research-modes). A deep-research run is NOT a chat answer — it's a
// saved, cited REPORT produced by a multi-step pipeline: plan sub-questions → gather evidence in
// bounded parallel → synthesize → fact-check each claim. The deterministic safety layer wraps the
// synthesis exactly as it wraps /ask. Lit-review and meta-analysis modes (later) reuse this shape.
//
// Additive to the frozen contract: new file, optional/standalone types — nothing here changes the
// /ask AskResponse.

import type { AnswerPoint, AnswerTemplate, Citation, EvidenceGrade, SafetyFlag } from "./answer.ts";

// ── Clarifying-question scoping (Phase 2) ───────────────────────────────────
// Before a deep-research run, a cheap scope step may return 1-3 clarifying questions to focus the
// search. Best-effort: needs_clarification=false means "just run it" (no clarification).

/** One clarifying question with quick-pick chips (a free-text answer is always available in the UI). */
export interface ScopeQuestion {
  text: string;
  chips: string[];
}

/** The scope step's output: whether the question is ambiguous, and the clarifiers if so. */
export interface ScopeResult {
  needs_clarification: boolean;
  questions: ScopeQuestion[];
}

/** One themed section of a report (≈ one planned sub-question), with cited sentences. */
export interface ResearchSection {
  heading: string;
  points: AnswerPoint[];
}

/** The deep-research deliverable: a saved, cited report. */
export interface ResearchReport {
  question: string;
  /** Bottom line — the plain-English answer, up front. */
  summary: string;
  /** The sub-questions the planner decomposed the question into (surfaced as "what it researched"). */
  sub_questions: string[];
  /** Themed body sections, each a list of cited points. */
  sections: ResearchSection[];
  /** Honest gaps / where the evidence conflicts. */
  uncertainties: AnswerPoint[];
  /** Safety cautions — kept visually prominent in the UI. */
  safety_notes: AnswerPoint[];
  /** Every source cited anywhere in the report, in reranked order. */
  citations: Citation[];
  evidence_grade: EvidenceGrade;
  safety_flags: SafetyFlag[];
  /**
   * True = every load-bearing claim passed an independent semantic-support check (the faithfulness
   * judge confirmed its cited source actually backs it). False = that check could not run (e.g. the
   * judge errored), so claims carry only the deterministic existence check on their citations — the
   * UI surfaces this so an unverified report is never presented as fully verified.
   */
  claims_verified: boolean;
  /**
   * Set when the run did NOT produce a synthesized report: a deterministic safety route
   * (emergency_routing / sourcing_refusal), a discarded unsafe synthesis (safety_fallback), or no
   * supporting evidence (no_source). Reuses the /ask AnswerTemplate so the frozen routes carry over
   * to Deep Research unchanged.
   */
  template?: AnswerTemplate;
  // ── Publishable-reports additions (all optional; default to today's behavior). ──
  /** Rigor mode. Absent/`'standard'` = the existing Deep Research report. */
  mode?: ReportMode;
  /** Deterministic, denominator-scoped literature gaps (Phase 3). */
  gaps?: GapStatement[];
  /** Documented honest method, set only for `structured_review` (Phase 5). */
  search_method?: SearchMethod;
  /** "What we searched" counts (Phase 3). */
  counts?: RetrievalCounts;
  /** Citation style chosen for this report; exports read it so a download matches the screen. */
  citation_style?: CitationStyle;
}

/** Async run lifecycle (mirrors research_report_runs.status). */
export type ResearchRunStatus = "queued" | "running" | "done" | "error";

/** A progress step streamed to the UI while a run executes (persisted on the run row). */
export interface ResearchProgressStep {
  step: "planning" | "gathering" | "writing" | "checking" | "done" | "error";
  detail: string;
  /** Cumulative distinct sources gathered so far (shown live). */
  sources_found?: number;
  at: string; // ISO timestamp, stamped by the orchestrator
}

// ── Publishable-reports additions (additive & optional; saved in payload JSON) ──

/** Report rigor mode. 'standard' = today's Deep Research; 'structured_review' = the
 *  honest, method-documenting "structured / PRISMA-informed evidence review". */
export type ReportMode = "standard" | "structured_review";

/** Numbered medical citation style the reference list/exports use. */
export type CitationStyle = "vancouver" | "ama";

/** PICOS-ish dimension a gap is about (kept small + honest; not a formal framework). */
export type GapDimension =
  | "study_design"
  | "population"
  | "outcome"
  | "comparator"
  | "long_term"
  | "synthesis";

/** The scope a gap statement is measured against — what was searched, how many, when. */
export interface EvidenceDenominator {
  providers_searched: string[];
  n_sources: number;
  retrieved_at: string | null;
}

/** A deterministic, denominator-scoped literature gap. Computed in real code from the
 *  evidence actually retrieved this run (never "no evidence exists" — Altman-Bland). */
export interface GapStatement {
  dimension: GapDimension;
  type: "no_rct" | "no_human_trial" | "no_synthesis" | "conflicting" | "sparse";
  /** 'this_run' = scoped to the sources we searched; 'indexed_literature' = scoped to
   *  what we index (only used when projection coverage is verified — see plan §3). */
  scope: "this_run" | "indexed_literature";
  text: string;
  denominator: EvidenceDenominator;
  /** Ongoing/recruiting trials that may answer the gap (strengthening-only; never deletes a gap). */
  corroborating_trials: string[]; // NCT ids
}

/** Honest "what we searched" summary. Counts are candidates retrieved (relevance-capped per
 *  search, then merged + de-duplicated), NEVER PRISMA "records identified". */
export interface RetrievalCounts {
  per_provider: Record<string, number>;
  /** Size of the final merged, de-duplicated pool (what per_provider sums to). */
  total_retrieved: number;
  /** Number of sub-question searches the pool was assembled from. */
  n_searches: number;
  /** Top-ranked sources kept PER SEARCH (not per source) before merge. */
  per_search_cap: number;
  retrieved_at: string | null;
}

/** The documented, honest method for a structured_review report. Plain English; no PRISMA labels. */
export interface SearchMethod {
  databases: string[];
  queries: string[];
  search_date: string; // YYYY-MM-DD
  inclusion_notes: string;
  exclusion_notes: string;
}
