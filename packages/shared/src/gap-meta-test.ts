// Gap test-runner (meta-analysis) — PURE, deterministic.
//
// Turns "here is a research gap and the studies extracted for it" into an honest, COMPUTED test:
// group the studies by the SAME outcome (only same-outcome studies are comparable), pool each
// comparable cluster with the real meta engine (poolRiskRatio — inverse-variance + DerSimonian-Laird),
// and ABSTAIN per outcome when there aren't >= 2 usable studies. This is the comparability gate that
// sits between extraction and pooling: the math engine pools whatever it is handed; this module decides
// what is fair to hand it, and NEVER pools across different outcomes.
//
// HONESTY: reuses the existing computed-statistics engine (never an LLM-guessed number); abstains
// rather than pooling incomparable studies; carries each study's citation_tag + source_quote through
// (inside StudyArm) so the faithfulness layer can audit every number. The LLM EXTRACTION of StudyArm
// counts + quotes from a gap's sources, and the report/UI wiring, are the OWNER-GATED next steps — the
// same gate the existing meta-analysis pipeline already sits behind. Nothing here calls an LLM or the
// network.

import { poolRiskRatio, type MetaAnalysisResult, type StudyArm } from "./meta-analysis.ts";

/** The pooled (or abstained) result for one comparable-outcome cluster of a gap's studies. */
export interface GapMetaOutcomeTest {
  /** The outcome these studies share (verbatim, from the first study seen for it). */
  outcome_label: string;
  /** How many studies were offered for this outcome (before the engine's usable-counts filter). */
  studies_offered: number;
  /** poolable:true with the computed estimates + heterogeneity, or poolable:false with the reason. */
  result: MetaAnalysisResult;
}

export interface GapMetaTestResult {
  /** One entry per distinct outcome, ordered by outcome_label for determinism. */
  outcomes: GapMetaOutcomeTest[];
  /** True when at least one outcome produced a real pooled estimate. */
  tested: boolean;
  /** Honest one-line summary safe to show in a report (claims "pooled" only where it truly pooled). */
  summary: string;
}

function normOutcome(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Run the meta-analysis gap test over the studies extracted for a gap. PURE + deterministic.
 * Groups by outcome (only same-outcome studies are pooled), pools each group, abstains otherwise.
 */
export function runGapMetaTest(studies: readonly StudyArm[]): GapMetaTestResult {
  // Group by normalized outcome; keep the first-seen original label and insertion order within a group.
  const groups = new Map<string, { label: string; arms: StudyArm[] }>();
  for (const s of studies) {
    const key = normOutcome(s.outcome_label);
    const g = groups.get(key);
    if (g) g.arms.push(s);
    else groups.set(key, { label: s.outcome_label.trim(), arms: [s] });
  }

  const outcomes: GapMetaOutcomeTest[] = [...groups.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((g) => ({
      outcome_label: g.label,
      studies_offered: g.arms.length,
      result: poolRiskRatio(g.arms),
    }));

  const pooled = outcomes.filter((o) => o.result.poolable);
  const tested = pooled.length > 0;

  let summary: string;
  if (outcomes.length === 0) {
    summary = "No studies were available to test this gap.";
  } else if (!tested) {
    summary = `Not pooled: no outcome had at least 2 comparable studies with usable counts ` +
      `(${outcomes.length} outcome${outcomes.length === 1 ? "" : "s"} reviewed).`;
  } else {
    const parts = pooled.map((o) => {
      const r = o.result;
      if (!r.poolable) return o.outcome_label; // unreachable (filtered), keeps the types honest
      return `${o.outcome_label} (RR ${r.random.estimate.toFixed(2)}, ` +
        `95% CI ${r.random.ci_low.toFixed(2)}–${r.random.ci_high.toFixed(2)}, k=${r.k})`;
    });
    summary = `Pooled ${pooled.length} of ${outcomes.length} outcome${outcomes.length === 1 ? "" : "s"}: ` +
      `${parts.join("; ")}.`;
  }

  return { outcomes, tested, summary };
}
