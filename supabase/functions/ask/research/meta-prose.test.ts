import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildMetaProse, META_SECTION, noComparisonProse } from "./meta-prose.ts";
import type { MetaAnalysisResult } from "../../../../packages/shared/src/meta-analysis.ts";
import type { GroundingResult } from "./ground.ts";

const PICO = { intervention: "drug X", comparator: "placebo", outcome: "mortality" };

function poolable(over: { i2?: number; ci_low?: number; ci_high?: number } = {}): MetaAnalysisResult {
  return {
    poolable: true,
    measure: "risk_ratio",
    k: 2,
    studies: [
      { label: "Trial A", citation_tag: "1", source_quote: "q1", outcome_label: "mortality", effect_log: -0.4, effect: 0.67, variance: 0.05, ci_low: 0.5, ci_high: 0.9, weight_percent: 50, continuity_corrected: false },
      { label: "Trial B", citation_tag: "2", source_quote: "q2", outcome_label: "mortality", effect_log: -0.45, effect: 0.64, variance: 0.06, ci_low: 0.45, ci_high: 0.9, weight_percent: 50, continuity_corrected: false },
    ],
    fixed: { estimate_log: -0.42, variance: 0.04, estimate: 0.66, ci_low: 0.55, ci_high: 0.79 },
    random: { estimate_log: -0.43, variance: 0.06, estimate: 0.65, ci_low: over.ci_low ?? 0.50, ci_high: over.ci_high ?? 0.84 },
    heterogeneity: { q: 5, df: 1, i2: over.i2 ?? 42, tau2: 0.12 },
  };
}

function grounding(considered: number, droppedCodes: GroundingResult["dropped"][number]["code"][]): GroundingResult {
  return {
    studies: [],
    dropped: droppedCodes.map((code) => ({ citation_tag: "9", label: "X", outcome_label: "other", code, reason: "r" })),
    outcome: "mortality",
    considered,
  };
}

Deno.test("poolable: headline carries the computed RR + CI, cites the study tags, and may say meta-analysis", () => {
  const meta = poolable();
  const points = buildMetaProse(PICO, grounding(3, ["different_outcome"]), meta);
  for (const p of points) assertEquals(p.section, META_SECTION);
  const headline = points[0];
  assertStringIncludes(headline.text, "pooled risk ratio");
  assertStringIncludes(headline.text, "0.65"); // random.estimate
  assertStringIncludes(headline.text, "0.50");
  assertStringIncludes(headline.text, "0.84");
  assertStringIncludes(headline.text, "meta-analysis");
  assertEquals(headline.citations, ["1", "2"]);
});

Deno.test("poolable: transparency line reports found / pooled / excluded", () => {
  const points = buildMetaProse(PICO, grounding(4, ["different_outcome", "quote_not_in_source"]), poolable());
  const all = points.map((p) => p.text).join(" ");
  assertStringIncludes(all, "Found 4");
  assertStringIncludes(all, "2 were pooled");
  assertStringIncludes(all, "2 excluded");
});

Deno.test("poolable: high I² triggers a prominent caution", () => {
  const points = buildMetaProse(PICO, grounding(2, []), poolable({ i2: 90 }));
  const all = points.map((p) => p.text).join(" ");
  assertStringIncludes(all, "I² = 90%");
  assertStringIncludes(all, "high");
  assertStringIncludes(all, "caution");
});

Deno.test("poolable: a CI crossing 1.0 is flagged as not conclusive", () => {
  const points = buildMetaProse(PICO, grounding(2, []), poolable({ ci_low: 0.8, ci_high: 1.3 }));
  assertStringIncludes(points[0].text, "not statistically conclusive");
});

Deno.test("poolable: a CI clear of 1.0 is not flagged as crossing", () => {
  const points = buildMetaProse(PICO, grounding(2, []), poolable({ ci_low: 0.5, ci_high: 0.84 }));
  assert(!points[0].text.includes("not statistically conclusive"));
});

Deno.test("NOT poolable: never says meta-analysis, shows no pooled number, explains why", () => {
  const meta: MetaAnalysisResult = { poolable: false, k: 1, reason: "needs >= 2" };
  const points = buildMetaProse(PICO, grounding(3, ["different_outcome", "numbers_not_in_quote"]), meta);
  const all = points.map((p) => p.text).join(" ");
  assert(!all.includes("meta-analysis"));
  assertStringIncludes(all, "No pooled estimate");
  assertStringIncludes(all, "fewer than the 2");
  // no citations on a not-poolable block
  for (const p of points) assertEquals(p.citations, []);
});

Deno.test("no comparison: an honest one-liner, no meta-analysis, no numbers", () => {
  const points = noComparisonProse();
  assertEquals(points[0].section, META_SECTION);
  assert(!points[0].text.includes("meta-analysis"));
  assertStringIncludes(points[0].text, "could not");
  assertEquals(points[0].citations, []);
});
