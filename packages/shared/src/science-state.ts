// "Where the science stands" — a deterministic evidence-MATURITY signal computed from the
// study-type metadata already captured on each cited source (publication_types / trial_phase).
// It is a sibling to evidence_grade (strength), on a different axis: how mature/synthesized the
// retrieved evidence base is.
//
// HONESTY DISCIPLINE (mirrors evidence-grade.ts holding "unknown" off-ladder):
//   • POSITIVE-ONLY. Every label is backed by metadata that is PRESENT. When the signal is
//     absent or ambiguous we return null (no badge) rather than inventing a "limited"/"weak"
//     label — study-type tags are sparse on library/DB-corpus chunks, so absence is just as
//     likely a retrieval/metadata gap as genuinely-thin evidence. A false "limited" on a
//     well-supported answer would destroy trust, so we stay silent instead.
//   • Wording describes the EVIDENCE BASE, not consensus. "well_studied" means the literature
//     has been synthesized (a systematic review / meta-analysis is among the sources) — NOT that
//     the conclusion is settled (a meta-analysis can itself conclude "insufficient evidence").
//   • NO LLM judgement. Counts only. Disagreement/"contested" is a separate axis that needs the
//     meta engine's computed heterogeneity (I²/τ²/Q) and is intentionally NOT guessed here.

import type { Citation } from "./answer.ts";

export type ScienceState = "well_studied" | "emerging";

export interface ScienceStateSignal {
  state: ScienceState;
  /** Count of systematic reviews / meta-analyses among the cited sources. */
  syntheses: number;
  /** Count of early-stage sources (early-phase trials / preprints) among the cited sources. */
  earlyStage: number;
  /** Total cited sources considered (denominator for an honest basis line). */
  total: number;
}

/** Only the study-type metadata is consulted; accepts any citation-shaped object. */
type CitationEvidence = Pick<Citation, "publication_types" | "study_type" | "trial_phase">;

const isSynthesis = (pt?: string[]): boolean =>
  !!pt?.some((t) => /\b(meta-?analysis|systematic review)\b/i.test(t));
const isRct = (pt?: string[]): boolean =>
  !!pt?.some((t) => /\brandomized controlled trial\b/i.test(t));
const isPreprint = (pt?: string[]): boolean => !!pt?.some((t) => /\bpreprint\b/i.test(t));

// Phase tokens come either PubMed-Roman ("Phase II") or CT.gov ("PHASE2" / "EARLY_PHASE1").
// The \b after the token keeps "Phase II" from matching inside "Phase III".
const isEarlyPhase = (phase?: string): boolean => !!phase && /phase[\s_]?(1|2|i|ii)\b/i.test(phase);
const isLatePhase = (phase?: string): boolean => !!phase && /phase[\s_]?(3|4|iii|iv)\b/i.test(phase);

/**
 * Classify the maturity of the evidence base behind an answer from its cited sources.
 * Returns null when there is no positive signal to stand behind (the common, safe case).
 */
export function scienceState(citations: ReadonlyArray<CitationEvidence>): ScienceStateSignal | null {
  const total = citations.length;
  if (total === 0) return null;

  let syntheses = 0;
  let earlyStage = 0;
  let hasRctOrLate = false;

  for (const c of citations) {
    if (isSynthesis(c.publication_types)) syntheses++;
    if (isRct(c.publication_types) || isLatePhase(c.trial_phase)) hasRctOrLate = true;
    if (isEarlyPhase(c.trial_phase) || isPreprint(c.publication_types)) earlyStage++;
  }

  // Strongest, false-negative-proof signal first: a synthesis IS present.
  if (syntheses > 0) return { state: "well_studied", syntheses, earlyStage, total };
  // Early-stage only when early evidence is POSITIVELY present and nothing stronger (RCT /
  // late-phase) was retrieved — a confident "this is early-stage", not an absence-of-RCTs guess.
  if (earlyStage > 0 && !hasRctOrLate) return { state: "emerging", syntheses, earlyStage, total };
  return null;
}
