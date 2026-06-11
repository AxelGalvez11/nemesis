import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { poolRiskRatio, type StudyArm } from "./meta-analysis.ts";
import { buildMetaAbstract } from "./meta-abstract.ts";
import type { ResearchReport } from "./research.ts";

function arm(label: string, et: number, nt: number, ec: number, nc: number): StudyArm {
  return { label, citation_tag: label, source_quote: "q", outcome_label: "28-day mortality", events_treatment: et, total_treatment: nt, events_control: ec, total_control: nc };
}

function report(extra: Partial<ResearchReport>): ResearchReport {
  return {
    question: "Do corticosteroids reduce mortality in severe COVID-19?",
    summary: "Corticosteroids modestly reduce 28-day mortality.",
    sub_questions: [],
    sections: [],
    uncertainties: [],
    safety_notes: [],
    citations: [],
    evidence_grade: "moderate",
    safety_flags: [],
    claims_verified: true,
    ...extra,
  };
}

const POOL = poolRiskRatio([arm("A", 10, 100, 20, 100), arm("B", 100, 1000, 200, 1000), arm("C", 30, 100, 25, 100)]);

Deno.test("no abstract for a report that did not pool", () => {
  assertEquals(buildMetaAbstract(report({})), null); // no meta_analysis
  const unpoolable = poolRiskRatio([arm("solo", 1, 10, 2, 10)]);
  assertEquals(buildMetaAbstract(report({ meta_analysis: unpoolable })), null);
});

Deno.test("abstract has all four sections and a code-computed Results line", () => {
  assert(POOL.poolable);
  const a = buildMetaAbstract(report({ meta_analysis: POOL }))!;
  assert(a, "expected an abstract");
  for (const part of [a.objective, a.methods, a.results, a.conclusions]) assert(part.length > 0);
  // Results states the REAL pooled estimate + heterogeneity (computed, not narrated).
  assert(a.results.includes(POOL.random.estimate.toFixed(2)), "results carries the pooled RR");
  assert(a.results.includes("95% CI"));
  assert(a.results.includes("I²"));
  assert(a.results.includes("28-day mortality"), "names the outcome");
});

Deno.test("methods reflect the documented search method when present", () => {
  const a = buildMetaAbstract(report({
    meta_analysis: POOL,
    search_method: { databases: ["PubMed", "Europe PMC"], queries: ["q"], search_date: "2026-06-11", inclusion_notes: "", exclusion_notes: "" },
  }))!;
  assert(a.methods.includes("PubMed"));
  assert(a.methods.includes("2026-06-11"));
});

Deno.test("conclusions carry the report's bottom line", () => {
  const a = buildMetaAbstract(report({ meta_analysis: POOL, summary: "Bottom line here." }))!;
  assertEquals(a.conclusions, "Bottom line here.");
});
