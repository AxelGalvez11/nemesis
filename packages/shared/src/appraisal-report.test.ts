import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { shapeAppraisalReport } from "./appraisal-report.ts";
import type { AppraisalInput } from "./research.ts";

function baseInput(overrides: Partial<AppraisalInput> = {}): AppraisalInput {
  return {
    paper_meta: { title: "A Randomized Trial of Drug X", pages: 12, truncated: false },
    bottom_line: "A well-powered RCT with a modest but consistent benefit.",
    dimensions: [
      {
        key: "design",
        heading: "Study design",
        verdict: "strong",
        points: [{ text: "Double-blind, placebo-controlled RCT.", quote: "This was a double-blind, placebo-controlled trial." }],
      },
      {
        key: "statistics",
        heading: "Statistical validity",
        verdict: "adequate",
        points: [{ text: "Primary analysis was intention-to-treat.", quote: null }],
      },
    ],
    limitations: ["Single-center; results may not generalize."],
    questions: ["Would the effect hold in an outpatient population?"],
    evidence_grade: "strong",
    safety_flags: [],
    claims_verified: true,
    ...overrides,
  };
}

Deno.test("shapeAppraisalReport maps dimensions to sections and preserves order", () => {
  const report = shapeAppraisalReport(baseInput());
  assertEquals(report.mode, "appraisal");
  assertEquals(report.sections.length, 2);
  assertEquals(report.sections[0].heading, "Study design — strong");
  assertEquals(report.sections[1].heading, "Statistical validity — adequate");
  assertEquals(report.summary, "A well-powered RCT with a modest but consistent benefit.");
});

Deno.test("shapeAppraisalReport carries questions, limitations, and paper_meta", () => {
  const report = shapeAppraisalReport(baseInput());
  assertEquals(report.appraisal_questions, ["Would the effect hold in an outpatient population?"]);
  assertEquals(report.uncertainties.map((u) => u.text), ["Single-center; results may not generalize."]);
  assertEquals(report.paper_meta?.title, "A Randomized Trial of Drug X");
});

Deno.test("shapeAppraisalReport puts the paper in as citation [1] with support quotes", () => {
  const report = shapeAppraisalReport(baseInput());
  assertEquals(report.citations.length, 1);
  assertEquals(report.citations[0].chunk_tag, "1");
  assertEquals(report.citations[0].source_type, "uploaded_paper");
  assertEquals(report.citations[0].title, "A Randomized Trial of Drug X");
  // The design point had a quote → it is cited [1] and carries the verbatim quote as support.
  const designPoint = report.sections[0].points[0];
  assertEquals(designPoint.citation_ids, ["1"]);
  assert(designPoint.support && designPoint.support[0].citation_tag === "1");
  assert(designPoint.support[0].quote.includes("double-blind"));
  // The stats point had no quote → no citation, no support.
  const statsPoint = report.sections[1].points[0];
  assertEquals(statsPoint.citation_ids, []);
});

Deno.test("shapeAppraisalReport with an untitled paper still produces a non-empty question and a citation", () => {
  const report = shapeAppraisalReport(baseInput({ paper_meta: { title: null, pages: 0, truncated: true } }));
  assertEquals(report.citations.length, 1);
  assertEquals(report.citations[0].title, "Uploaded paper");
  assertEquals(report.question, "Appraisal of the uploaded paper");
});

Deno.test("shapeAppraisalReport with unverified claims appends the not-fully-verified caution", () => {
  const report = shapeAppraisalReport(baseInput({ claims_verified: false }));
  assertEquals(report.claims_verified, false);
  assert(report.uncertainties.some((u) => u.text.toLowerCase().includes("not")));
});
