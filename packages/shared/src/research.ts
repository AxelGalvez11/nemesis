// Deep Research contract (§ research-modes). A deep-research run is NOT a chat answer — it's a
// saved, cited REPORT produced by a multi-step pipeline: plan sub-questions → gather evidence in
// bounded parallel → synthesize → fact-check each claim. The deterministic safety layer wraps the
// synthesis exactly as it wraps /ask. Lit-review and meta-analysis modes (later) reuse this shape.
//
// Additive to the frozen contract: new file, optional/standalone types — nothing here changes the
// /ask AskResponse.

import type { AnswerPoint, AnswerTemplate, Citation, EvidenceGrade, SafetyFlag } from "./answer.ts";

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
