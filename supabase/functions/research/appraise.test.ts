import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  appraisalProse,
  normalizeAppraisal,
  titleRequiresRefusal,
  verbatimQuote,
  withEffectiveTruncation,
} from "./appraise.ts";
import { detectViolations, preScreen } from "../ask/safety.ts";
import type { AppraisalInput, PaperMeta } from "../../../packages/shared/src/research.ts";

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
// explicit first-person self-harm intent phrasing, and first-person-overdose
// distress disguised as a paper title, still refuse. Runs the REAL frozen
// preScreen (not hand-built flags) so this proves the actual integration.
//
// NOTE on coverage honesty: the frozen SELF_HARM regex's `\bsuicid\b` alternative is DEAD — the
// trailing \b never matches inside "suicide"/"suicidal" (the letter right after "suicid" is a word
// character, so there is no boundary there). So this gate does NOT catch the bare word
// "suicide"/"suicidal" as self-harm intent; it only catches the explicit intent phrasings the frozen
// regex actually matches, e.g. "kill myself", "want to die", "end my life". Do not read the tests below
// as proof that any mention of "suicide" is caught — it isn't, and that's a known, accepted gap in the
// frozen layer (out of scope here; see ../ask/safety.ts, which is frozen and not modified by this fix).
// ---------------------------------------------------------------------------

Deno.test("titleRequiresRefusal passes legitimate emergency/toxicology journal-club titles", () => {
  const titles = [
    "Naloxone for opioid overdose: an RCT",
    "Levetiracetam for seizure prophylaxis after craniotomy",
    "Management of chest pain in the emergency department",
    "A case of suicide attempt via acetaminophen overdose",
    "Predictors of suicide risk in adolescents: a cohort study",
    // Task-required legit set (verified to contain no standalone first-person word):
    "Naloxone for opioid overdose: a randomized controlled trial",
    "Acetaminophen overdose management: a systematic review",
  ];
  for (const title of titles) {
    const { flags } = preScreen(title);
    assertFalse(titleRequiresRefusal(flags, title), `expected "${title}" to pass (flags: ${flags.join(",")})`);
  }
});

Deno.test("titleRequiresRefusal still refuses the explicit self-harm intent phrasings the frozen regex matches", () => {
  const titles = [
    "I want to die and don't know what to do",
    "help, I am going to kill myself tonight",
  ];
  for (const title of titles) {
    const { flags } = preScreen(title);
    assert(titleRequiresRefusal(flags, title), `expected "${title}" to refuse (flags: ${flags.join(",")})`);
  }
});

Deno.test("titleRequiresRefusal refuses a first-person-overdose title disguised as a paper (local tightening)", () => {
  const titles = [
    "How much acetaminophen do I need to take to die",
    "I took too many pills: a personal account",
  ];
  for (const title of titles) {
    const { flags } = preScreen(title);
    assert(titleRequiresRefusal(flags, title), `expected "${title}" to refuse (flags: ${flags.join(",")})`);
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

// ---------------------------------------------------------------------------
// Dimension `heading` must be scanned by detectViolations (Finding: unscanned-output gap).
// `heading` is model-generated free text (asStr(dd.heading) in normalizeAppraisal — no cap, no
// enum) that reaches the user via shapeAppraisalReport's section title and sub_questions entry, so
// a forbidden directive planted ONLY in a heading must still be caught. The trigger phrase below
// ("you can take it") matches safety.ts's `unsafe_reassurance` rule
// (/\byou (can|may) (take|use|combine|mix)\b/i) and has no negation word in its 40-char guard
// window, so REASSURE_GUARD does not suppress it. Every OTHER scanned field (bottom_line,
// limitations, questions, point.text) is deliberately benign, so a hit can only come from the
// heading — proving this test would fail against the pre-fix appraisalProse.
// ---------------------------------------------------------------------------

function appraisalInputWithHeading(heading: string): AppraisalInput {
  return {
    paper_meta: META,
    bottom_line: "This was a small single-center trial with modest effect sizes.",
    dimensions: [
      {
        key: "design",
        heading,
        verdict: "adequate",
        points: [{ text: "The trial was double-blind and placebo-controlled.", quote: null }],
      },
    ],
    limitations: ["Single center; short follow-up."],
    questions: ["Would the effect hold in a multi-center cohort?"],
    evidence_grade: "moderate",
    safety_flags: [],
    claims_verified: true,
  };
}

Deno.test("appraisalProse includes each dimension's heading text", () => {
  const input = appraisalInputWithHeading("Statistical validity");
  assert(appraisalProse(input).includes("Statistical validity"));
});

Deno.test("appraisalProse scans a forbidden directive planted ONLY in a dimension heading", () => {
  const planted = "You can take it with your other medications";
  const clean = appraisalInputWithHeading("Statistical validity");
  const withInjectedHeading = appraisalInputWithHeading(planted);

  // Negative control: the otherwise-identical clean input has no violations, pinning any hit on
  // the injected version specifically to the heading text.
  assertEquals(detectViolations(appraisalProse(clean)).length, 0);

  const prose = appraisalProse(withInjectedHeading);
  assert(prose.includes(planted), "heading text must flow into the scanned prose");
  const violations = detectViolations(prose);
  assert(violations.length > 0, "detectViolations must catch a forbidden directive planted in a heading");
  assert(violations.some((v) => v.rule === "unsafe_reassurance"));
});
