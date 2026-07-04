import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeAppraisal, verbatimQuote } from "./appraise.ts";
import type { PaperMeta } from "../../../packages/shared/src/research.ts";

const PAPER = "This was a double-blind, placebo-controlled randomized trial. The primary endpoint was all-cause mortality at 12 months. 402 patients were enrolled.";
const META: PaperMeta = { title: "A Trial", pages: 10, truncated: false };

Deno.test("verbatimQuote accepts a verbatim substring and rejects a paraphrase", () => {
  assertEquals(verbatimQuote("double-blind, placebo-controlled randomized trial", PAPER), "double-blind, placebo-controlled randomized trial");
  // A model paraphrase that is NOT literally in the paper is rejected.
  assertEquals(verbatimQuote("the study used a double blind design", PAPER), null);
});

Deno.test("verbatimQuote is whitespace-tolerant and trims model-added punctuation", () => {
  // Collapsed internal whitespace + a trailing period the model added still matches.
  assertEquals(
    verbatimQuote("The  primary   endpoint was all-cause mortality at 12 months.", PAPER),
    "The primary endpoint was all-cause mortality at 12 months",
  );
});

Deno.test("normalizeAppraisal keeps points whose quote verifies, drops the quote on ones that don't", () => {
  const raw = {
    bottom_line: "Solid RCT.",
    evidence_grade: "strong",
    dimensions: [
      {
        key: "design",
        heading: "Study design",
        verdict: "strong",
        points: [
          { text: "Double-blind placebo-controlled RCT.", quote: "double-blind, placebo-controlled randomized trial" },
          { text: "Adequately powered.", quote: "we invented this sentence" },
        ],
      },
    ],
    limitations: ["Single center."],
    questions: ["Does it generalize?"],
  };
  const input = normalizeAppraisal(raw, META, PAPER);
  const pts = input.dimensions[0].points;
  assert(pts[0].quote && pts[0].quote.includes("double-blind"));
  assertEquals(pts[1].quote, null); // fabricated quote stripped
  // At least one load-bearing point lost its quote -> not fully verified.
  assertEquals(input.claims_verified, false);
});

Deno.test("normalizeAppraisal clamps garbage to a safe empty-ish appraisal (never throws)", () => {
  const input = normalizeAppraisal({}, META, PAPER);
  assertEquals(input.dimensions.length, 0);
  assertEquals(input.questions.length, 0);
  assertEquals(input.evidence_grade, "unknown");
  assertEquals(input.claims_verified, true); // no load-bearing points => nothing failed verification
  assertEquals(input.paper_meta.title, "A Trial");
});

Deno.test("normalizeAppraisal only accepts the six known dimension keys and four verdicts", () => {
  const raw = {
    dimensions: [
      { key: "design", heading: "Design", verdict: "strong", points: [] },
      { key: "made_up_dimension", heading: "X", verdict: "strong", points: [] },
      { key: "statistics", heading: "Stats", verdict: "not_a_verdict", points: [] },
    ],
  };
  const input = normalizeAppraisal(raw, META, PAPER);
  assertEquals(input.dimensions.map((d) => d.key), ["design", "statistics"]);
  assertEquals(input.dimensions[1].verdict, "unclear"); // bad verdict clamped to unclear
});
