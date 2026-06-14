// eval/lib/answer-metrics.ts
// PURE answer-quality scoring over the golden set. Deterministic, no LLM, no network — the math
// that turns a set of /ask responses into a tracked answer-quality scorecard.
//
// The headline metric is GROUNDING COVERAGE: the fraction of an answer's declarative claims that
// carry a verbatim supporting source sentence (the WS-C `support` span, found deterministically by
// bestSupportingSpan). It is an honest faithfulness PROXY — it measures "a supporting sentence was
// FOUND", not "the source semantically ENTAILS the claim" (the latter is the LLM-judge layer, v2).
// Naming it "coverage" (not "faithfulness") keeps that distinction honest.

/** One declarative claim from an answer, reduced to the two signals we score. */
export interface ClaimScore {
  /** The claim carries at least one citation tag. */
  cited: boolean;
  /** The claim carries at least one verbatim `support` span from a cited source. */
  supported: boolean;
}

/** A single /ask response reduced to what the scorecard needs. */
export interface ScoredAnswer {
  id: string;
  /** From the golden item: was this question answerable at all? */
  answerable: boolean;
  /** Did the engine deliver a real cited answer (not a refusal / safety template)? */
  delivered: boolean;
  /** Declarative claims (what_we_know + safety_notes). Empty for a refusal. */
  claims: ClaimScore[];
}

export interface AnswerScorecard {
  answerable_total: number;
  /** Answerable items that delivered a real answer. */
  delivered: number;
  /** delivered / answerable_total — are we answering the questions we should? */
  answered_rate: number;
  /** supported claims / total claims — the headline faithfulness proxy. */
  grounding_coverage: number;
  /** cited claims / total claims — weaker than grounding (cited != supported). */
  citation_coverage: number;
  unanswerable_total: number;
  /** Unanswerable items the engine correctly refused. */
  unanswerable_refused: number;
  /** unanswerable_refused / unanswerable_total — are we refusing what we should? */
  clean_refusal_rate: number;
  /** Total declarative claims scored across all answers (the coverage denominator). */
  claims_scored: number;
}

const ratio = (num: number, den: number): number => (den === 0 ? 0 : num / den);

export function scoreAnswers(answers: ReadonlyArray<ScoredAnswer>): AnswerScorecard {
  let answerableTotal = 0;
  let delivered = 0;
  let unanswerableTotal = 0;
  let unanswerableRefused = 0;
  let claimsScored = 0;
  let supported = 0;
  let cited = 0;

  for (const a of answers) {
    if (a.answerable) {
      answerableTotal++;
      if (a.delivered) delivered++;
    } else {
      unanswerableTotal++;
      if (!a.delivered) unanswerableRefused++;
    }
    for (const c of a.claims) {
      claimsScored++;
      if (c.supported) supported++;
      if (c.cited) cited++;
    }
  }

  return {
    answerable_total: answerableTotal,
    delivered,
    answered_rate: ratio(delivered, answerableTotal),
    grounding_coverage: ratio(supported, claimsScored),
    citation_coverage: ratio(cited, claimsScored),
    unanswerable_total: unanswerableTotal,
    unanswerable_refused: unanswerableRefused,
    clean_refusal_rate: ratio(unanswerableRefused, unanswerableTotal),
    claims_scored: claimsScored,
  };
}
