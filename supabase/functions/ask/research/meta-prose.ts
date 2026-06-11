// Deep Research — meta-mode: CODE-GENERATED pooled prose.
//
// PURE. Turns a MetaAnalysisResult (computed by the pure pooler) + the grounding outcome into the
// sentences shown in the "Pooled analysis" section. Every number here comes straight from the
// computed result — never the LLM. The WORDING GATE lives here: the words "pooled risk ratio" /
// "meta-analysis" are emitted ONLY when poolable; otherwise the block honestly says no pooled
// estimate could be computed and shows no number. These points are injected into the report BEFORE
// the one safety scan, so they are checked like any other prose.

import type { Pico } from "../../../../packages/shared/src/research.ts";
import type { MetaAnalysisResult } from "../../../../packages/shared/src/meta-analysis.ts";
import type { RawReportPoint } from "./synthesize.ts";
import type { DropCode, GroundingResult } from "./ground.ts";

export const META_SECTION = "Pooled analysis";

const f2 = (n: number) => n.toFixed(2);

/** Short phrases for the excluded-count summary, grouped by drop reason. */
const DROP_PHRASE: Record<DropCode, string> = {
  tag_not_in_pool: "cited a source outside the search",
  source_text_unavailable: "had no readable source text",
  invalid_counts: "had impossible counts",
  quote_not_in_source: "could not be verified against the source",
  numbers_not_in_quote: "the numbers weren't in the quoted text",
  different_outcome: "reported a different outcome",
  duplicate_source: "duplicated another source",
};

/** "2 reported a different outcome; 1 could not be verified against the source" */
function excludedSummary(dropped: GroundingResult["dropped"]): string {
  const counts = new Map<DropCode, number>();
  for (const d of dropped) counts.set(d.code, (counts.get(d.code) ?? 0) + 1);
  return [...counts.entries()].map(([code, n]) => `${n} ${DROP_PHRASE[code]}`).join("; ");
}

function point(text: string, citations: string[] = []): RawReportPoint {
  return { section: META_SECTION, text, citations };
}

/** The honest one-liner when no poolable comparison could even be defined from the question. */
export function noComparisonProse(): RawReportPoint[] {
  return [point(
    "A pooled estimate could not be computed: this question does not define a single treatment-versus-comparator " +
      "comparison on one outcome to pool. The findings above summarise the evidence without a combined statistic.",
  )];
}

/**
 * Build the "Pooled analysis" section points from the computed result. Poolable → the headline RR/CI
 * (citing every pooled study), a heterogeneity line (with a prominent caution when I² is high), and a
 * found/pooled/excluded transparency line. Not poolable → one honest "no pooled estimate" point.
 * PURE.
 */
export function buildMetaProse(pico: Pico, grounding: GroundingResult, meta: MetaAnalysisResult): RawReportPoint[] {
  const considered = grounding.considered;
  const droppedN = grounding.dropped.length;

  if (!meta.poolable) {
    const why = droppedN ? ` (${droppedN} excluded: ${excludedSummary(grounding.dropped)})` : "";
    return [point(
      `No pooled estimate could be computed for ${pico.intervention} versus ${pico.comparator} on ${pico.outcome}. ` +
        `Of ${considered} candidate studies, ${meta.k} reported verifiable, comparable counts — fewer than the 2 needed to pool${why}. ` +
        `No pooled number is shown.`,
    )];
  }

  const rr = f2(meta.random.estimate);
  const lo = f2(meta.random.ci_low);
  const hi = f2(meta.random.ci_high);
  const crosses = meta.random.ci_low < 1 && meta.random.ci_high > 1;
  const conclusiveness = crosses
    ? " Because the 95% confidence interval crosses 1.0, this pooled estimate is not statistically conclusive."
    : " The 95% confidence interval does not cross 1.0.";

  const tags = meta.studies.map((s) => s.citation_tag);
  const headline = point(
    `Across ${meta.k} comparable studies of ${pico.intervention} versus ${pico.comparator}, a random-effects ` +
      `meta-analysis gives a pooled risk ratio for ${pico.outcome} of ${rr} (95% CI ${lo} to ${hi}).${conclusiveness}`,
    tags,
  );

  const i2 = meta.heterogeneity.i2;
  const i2str = i2 == null ? "n/a" : `${Math.round(i2)}%`;
  const highHet = i2 != null && i2 >= 75;
  const hetCaution = highHet
    ? " This is high: the studies disagree substantially, so the pooled estimate should be read with caution and pooling may not be appropriate here."
    : "";
  const heterogeneity = point(
    `Between-study heterogeneity: I² = ${i2str} (τ² = ${meta.heterogeneity.tau2.toFixed(3)}, ` +
      `Cochran's Q = ${f2(meta.heterogeneity.q)} on ${meta.heterogeneity.df} degrees of freedom).${hetCaution}`,
  );

  const excl = droppedN ? `, ${droppedN} excluded (${excludedSummary(grounding.dropped)})` : "";
  const transparency = point(
    `Found ${considered} candidate studies reporting counts for this comparison; ${meta.k} were pooled${excl}.`,
  );

  return [headline, heterogeneity, transparency];
}
