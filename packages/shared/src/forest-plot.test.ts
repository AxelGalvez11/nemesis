import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { poolRiskRatio, type StudyArm } from "./meta-analysis.ts";
import { buildForestPlot, renderForestSvg } from "./forest-plot.ts";

function arm(label: string, et: number, nt: number, ec: number, nc: number): StudyArm {
  return {
    label,
    citation_tag: label,
    source_quote: `${et}/${nt} vs ${ec}/${nc}`,
    outcome_label: "mortality",
    events_treatment: et,
    total_treatment: nt,
    events_control: ec,
    total_control: nc,
  };
}

// Three studies with clearly different precision (totals) → different weights, and a protective effect.
const RESULT = poolRiskRatio([
  arm("A", 10, 100, 20, 100), // RR 0.5, small
  arm("B", 100, 1000, 200, 1000), // RR 0.5, large (more weight)
  arm("C", 30, 100, 25, 100), // RR 1.2, small
]);

Deno.test("non-poolable result yields no plot", () => {
  const none = poolRiskRatio([arm("solo", 1, 10, 2, 10)]); // < 2 studies
  assertEquals(buildForestPlot(none), null);
});

Deno.test("plot has one row per study plus pooled rows", () => {
  assert(RESULT.poolable);
  const m = buildForestPlot(RESULT)!;
  assert(m, "expected a plot model");
  const studyRows = m.rows.filter((r) => r.kind === "study");
  assertEquals(studyRows.length, 3);
  assert(m.rows.some((r) => r.kind === "pooled_random"));
  assert(m.rows.some((r) => r.kind === "pooled_fixed"));
});

Deno.test("RR=1 reference line sits inside the plot area at refX", () => {
  const m = buildForestPlot(RESULT)!;
  assert(m.refX > m.plotLeft && m.refX < m.plotRight, "RR=1 must be drawn within the plot");
});

Deno.test("a study's point estimate maps left of 1 when protective, and CI brackets it", () => {
  const m = buildForestPlot(RESULT)!;
  const a = m.rows.find((r) => r.label === "A")!;
  assert(a.markX < m.refX, "RR 0.5 should plot left of the RR=1 line");
  assert(a.whiskerLowX < a.markX && a.markX < a.whiskerHighX, "CI must bracket the point");
});

Deno.test("higher-weight study gets a larger box (area ∝ weight)", () => {
  const m = buildForestPlot(RESULT)!;
  const a = m.rows.find((r) => r.label === "A")!; // small n
  const b = m.rows.find((r) => r.label === "B")!; // 10x n → more weight
  assert(b.weightPercent! > a.weightPercent!);
  assert(b.boxSize > a.boxSize, "more weight → bigger box");
});

Deno.test("axis ticks are positive, ascending, and include 1", () => {
  const m = buildForestPlot(RESULT)!;
  assert(m.ticks.length >= 2);
  for (let i = 1; i < m.ticks.length; i++) {
    assert(m.ticks[i]!.value > m.ticks[i - 1]!.value, "tick values ascend");
    assert(m.ticks[i]!.x > m.ticks[i - 1]!.x, "tick x ascends (monotonic log scale)");
  }
  assert(m.ticks.some((t) => t.value === 1), "RR=1 tick present");
});

Deno.test("renderForestSvg is deterministic, well-formed, and labels each study", () => {
  const m = buildForestPlot(RESULT)!;
  const svg = renderForestSvg(m);
  assert(svg.startsWith("<svg"), "is an svg root");
  assert(svg.trimEnd().endsWith("</svg>"));
  for (const label of ["A", "B", "C"]) assert(svg.includes(label), `labels ${label}`);
  assert(svg.includes("<polygon"), "draws the pooled diamond");
  // Pure + deterministic (no Date/random): identical input → identical output.
  assertEquals(renderForestSvg(buildForestPlot(RESULT)!), svg);
});
