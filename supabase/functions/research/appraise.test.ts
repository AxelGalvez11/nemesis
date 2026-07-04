import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeAppraisal, titleRequiresRefusal, verbatimQuote, withEffectiveTruncation } from "./appraise.ts";
import { preScreen } from "../ask/safety.ts";
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

// ---------------------------------------------------------------------------
// Title safety gate — clinical/toxicology titles must NOT be blanket-refused;
// genuine first-person self-harm intent still refuses. Runs the REAL frozen
// preScreen (not hand-built flags) so this proves the actual integration.
// ---------------------------------------------------------------------------

Deno.test("titleRequiresRefusal passes legitimate emergency/toxicology journal-club titles", () => {
  const titles = [
    "Naloxone for opioid overdose: an RCT",
    "Levetiracetam for seizure prophylaxis after craniotomy",
    "Management of chest pain in the emergency department",
    "A case of suicide attempt via acetaminophen overdose",
    "Predictors of suicide risk in adolescents: a cohort study",
  ];
  for (const title of titles) {
    const { flags } = preScreen(title);
    assertFalse(titleRequiresRefusal(flags), `expected "${title}" to pass (flags: ${flags.join(",")})`);
  }
});

Deno.test("titleRequiresRefusal still refuses genuine first-person self-harm intent", () => {
  const titles = [
    "I want to die and don't know what to do",
    "help, I am going to kill myself tonight",
  ];
  for (const title of titles) {
    const { flags } = preScreen(title);
    assert(titleRequiresRefusal(flags), `expected "${title}" to refuse (flags: ${flags.join(",")})`);
  }
});

// ---------------------------------------------------------------------------
// Honest truncation flag (Finding 2): meta.truncated only reflects the extractor's 200KB cap; a
// 120-200KB paper must still report truncated:true once this pipeline's smaller APPRAISAL_TEXT_BUDGET
// (120,000 chars) is factored in.
// ---------------------------------------------------------------------------

Deno.test("withEffectiveTruncation leaves a short, untruncated paper alone", () => {
  const out = withEffectiveTruncation(META, PAPER);
  assertEquals(out.truncated, false);
});

Deno.test("withEffectiveTruncation sets truncated when the paper exceeds the appraisal text budget, even if the extractor did not truncate it", () => {
  const longPaper = "x".repeat(150_000); // over APPRAISAL_TEXT_BUDGET (120,000), under the extractor's 200KB cap
  const out = withEffectiveTruncation({ ...META, truncated: false }, longPaper);
  assertEquals(out.truncated, true);
});

Deno.test("withEffectiveTruncation preserves an already-true extractor truncation flag", () => {
  const out = withEffectiveTruncation({ ...META, truncated: true }, "short paper text");
  assertEquals(out.truncated, true);
});
