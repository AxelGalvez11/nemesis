// Structured abstract for a meta-analysis report — the Background/Methods/Results/Conclusions block a
// journal article opens with. PURE: the Results line is COMPUTED from the real pool (meta-analysis.ts),
// never stated by the LLM — the same honesty rule as the pooled numbers themselves. Returns null unless
// the report actually pooled, so a non-meta or unpoolable report never grows a fake abstract.

import type { ResearchReport } from "./research.ts";

export interface StructuredAbstract {
  objective: string;
  methods: string;
  /** Code-generated from the computed pool — the precise pooled estimate + heterogeneity. */
  results: string;
  conclusions: string;
}

const f2 = (n: number) => n.toFixed(2);

/** Cochrane-style heterogeneity band from I² (percent). */
function heterogeneityWord(i2: number | null): string {
  if (i2 == null) return "not estimable";
  if (i2 < 25) return "low";
  if (i2 < 50) return "moderate";
  if (i2 < 75) return "substantial";
  return "considerable";
}

/** Build the structured abstract from a poolable meta report, or null. PURE. */
export function buildMetaAbstract(report: ResearchReport): StructuredAbstract | null {
  const ma = report.meta_analysis;
  if (!ma || !ma.poolable) return null;

  const outcome = ma.studies.find((s) => s.outcome_label?.trim())?.outcome_label?.trim() || "the primary outcome";
  const i2 = ma.heterogeneity.i2;
  const studyWord = ma.k === 1 ? "study" : "studies";

  const objective =
    `To estimate the pooled effect on ${outcome} by combining the reported event counts of comparable studies.`;

  const sm = report.search_method;
  const methodsLead = sm
    ? `${sm.databases.join(", ")} were searched (as of ${sm.search_date}).`
    : `Comparable studies retrieved for this question were screened for extractable event counts.`;
  const methods =
    `${methodsLead} ${ma.k} ${studyWord} with usable 2×2 counts were pooled using inverse-variance ` +
    `fixed-effect and DerSimonian–Laird random-effects risk-ratio models; heterogeneity was summarized ` +
    `with I², τ², and Cochran's Q.`;

  const results =
    `In a random-effects meta-analysis of ${ma.k} ${studyWord}, the pooled risk ratio for ${outcome} was ` +
    `${f2(ma.random.estimate)} (95% CI ${f2(ma.random.ci_low)}–${f2(ma.random.ci_high)}). ` +
    `Between-study heterogeneity was ${heterogeneityWord(i2)} (I² = ${i2 == null ? "n/a" : `${Math.round(i2)}%`}, ` +
    `τ² = ${ma.heterogeneity.tau2.toFixed(3)}, Q = ${f2(ma.heterogeneity.q)} on ${ma.heterogeneity.df} df).`;

  const conclusions = report.summary?.trim() || results;

  return { objective, methods, results, conclusions };
}
