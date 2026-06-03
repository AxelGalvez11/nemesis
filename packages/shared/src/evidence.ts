// Evidence-scoring enums (§9). The scoring ENGINE is Phase 4; these tier names
// are frozen now because the answer's evidence_grade (Phase 3) reuses them and
// the app renders them.

/** Ordered weakest->strongest; the engine returns the lowest justified tier. */
export type EvidenceTier =
  | "very_weak"
  | "weak"
  | "moderate"
  | "strong"
  | "very_strong"
  | "unknown";

/** Signals the §9 engine extracts per drug/claim (Phase 4 populates). */
export interface EvidenceCounts {
  n_meta_analysis?: number;
  n_systematic_review?: number;
  n_rct?: number;
  n_human_trials?: number;
  n_observational?: number;
  n_preclinical_only?: number;
  max_trial_phase?: string;
}
