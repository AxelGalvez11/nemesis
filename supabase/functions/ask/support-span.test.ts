import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { attachSupport, bestSupportingSpan } from "./support-span.ts";
import type { AnswerSections } from "../../../packages/shared/src/answer.ts";
import type { RetrievedChunk } from "./citation.ts";

function chunkOf(tag: string, text: string): Pick<RetrievedChunk, "tag" | "chunk_text"> {
  return { tag, chunk_text: text };
}

const SECTIONS: AnswerSections = {
  what_we_know: [
    { text: "Dexamethasone lowers 28-day mortality in COVID-19 patients.", citation_ids: ["1"] },
    { text: "It is given orally or intravenously.", citation_ids: ["2"] },
  ],
  what_we_do_not_know: [],
  safety_notes: [{ text: "Talk to your prescriber.", citation_ids: [] }],
  questions_to_ask: ["What dose?"],
};
const CHUNKS = [
  chunkOf("1", "In hospitalized patients, dexamethasone reduced 28-day mortality. The trial was open-label."),
  chunkOf("2", "Unrelated text about cardiology guidelines and exercise habits."),
];

const SOURCE =
  "Patients were enrolled at 12 centers. Dexamethasone reduced 28-day mortality in hospitalized COVID-19 patients. The trial was open-label.";

Deno.test("returns the supporting sentence as a VERBATIM substring with correct offsets", () => {
  const s = bestSupportingSpan("Dexamethasone lowered 28-day mortality in COVID-19 patients", SOURCE);
  assert(s, "expected a supporting span");
  // The never-fabricate property: the quote is exactly the source text at [start,end).
  assertEquals(SOURCE.slice(s.start, s.end), s.quote);
  assert(s.quote.includes("Dexamethasone reduced 28-day mortality"));
});

Deno.test("returns null when no passage clears the support threshold (no fabricated highlight)", () => {
  assertEquals(bestSupportingSpan("Aspirin prevents migraine headaches in adolescents", SOURCE), null);
});

Deno.test("picks the passage with the most claim-term overlap", () => {
  const s = bestSupportingSpan("open-label trial design", SOURCE);
  assert(s, "expected a supporting span");
  assert(s.quote.includes("open-label"));
});

Deno.test("requires more than one matched content word (no single-word spurious highlight)", () => {
  // Only "patients" overlaps — one common word must not be enough to claim support.
  assertEquals(bestSupportingSpan("patients", SOURCE), null);
});

Deno.test("returns null on empty inputs", () => {
  assertEquals(bestSupportingSpan("", SOURCE), null);
  assertEquals(bestSupportingSpan("anything meaningful here", ""), null);
});

// ---------------------------------------------------------------------------
// bounded multi-sentence window — grounds a claim whose support is SPREAD across
// sentences (no single sentence clears the bar), at the SAME MIN_SCORE rigor.
// Phase 2 only fires when no single sentence supports, so existing highlights are
// unchanged. The window never lowers the bar and is capped at 3 sentences.
// ---------------------------------------------------------------------------

// Each sentence holds <34% of the claim's content words (so today's single-sentence matcher returns
// null), but a 2-sentence span clears it. "It improved memory, reduced inflammation, and extended
// survival." = {improved, memory, reduced, inflammation, extended, survival} (6 content tokens).
const SPREAD =
  "The compound improved memory in mice. It separately reduced inflammation markers. In a third cohort it extended survival. Tolerability was acceptable.";

Deno.test("window: grounds a claim whose support is spread across sentences (verbatim span)", () => {
  const claim = "It improved memory, reduced inflammation, and extended survival.";
  // single best is 2/6 = 0.33 < 0.34 → no single sentence supports; a contiguous window does.
  const s = bestSupportingSpan(claim, SPREAD);
  assert(s, "expected a multi-sentence supporting span");
  assertEquals(SPREAD.slice(s.start, s.end), s.quote); // still a VERBATIM substring (never fabricated)
  assert(s.quote.includes("improved memory") && s.quote.includes("reduced inflammation"));
});

Deno.test("window is BOUNDED: support split across MORE than 3 sentences stays null", () => {
  // "apixaban" (sentence 1) and "bleeding" (sentence 5) are 5 sentences apart; no ≤3-sentence window
  // can hold both, so matched stays 1 (< MIN_MATCHED) everywhere → null. The bound keeps it rigorous.
  const FAR = "Apixaban matters here. Filler one line. Filler two line. Filler three line. Bleeding matters here.";
  assertEquals(bestSupportingSpan("apixaban bleeding risk", FAR), null);
});

Deno.test("window does NOT lower the bar: a too-sparse claim stays null (no manufactured support)", () => {
  // The claim shares only ~20% of its words with the passage even across a full window — below 0.34,
  // so it must stay unsupported (the genuine-drift case must never be hidden by the window).
  const claim = "The intervention is a multicomponent program combining diet, exercise, and metformin dosing titration.";
  const sparse = "This trial studies frailty in older adults. Metformin was one component. Outcomes are pending.";
  assertEquals(bestSupportingSpan(claim, sparse), null);
});

// A decimal figure (1.4 percent) must not be split at its period into two "sentences", or the highlight
// would begin mid-number at "4 percent" — a WRONG number in the provenance span, the worst place to be
// loose on a clinical answer. The splitter must keep an inter-digit period inside the sentence.
const DECIMAL_SRC =
  "In clinical trials, hyperkalemia occurred in approximately 1.4 percent of hypertensive patients. Most values resolved.";

Deno.test("decimal figures are not split at the period (highlight shows the whole number, not a mid-number fragment)", () => {
  const claim = "Hyperkalemia occurred in approximately 1.4 percent of hypertensive patients";
  const s = bestSupportingSpan(claim, DECIMAL_SRC);
  assert(s, "expected a supporting span");
  assertEquals(DECIMAL_SRC.slice(s.start, s.end), s.quote); // still a VERBATIM substring
  assert(s.quote.includes("1.4 percent"), `quote must contain the whole figure, got: ${s.quote}`);
});

Deno.test("attachSupport adds a verbatim supporting quote for a claim its cited source supports", () => {
  const out = attachSupport(SECTIONS, CHUNKS);
  const p0 = out.what_we_know[0];
  assert(p0.support && p0.support.length === 1, "expected one supporting passage");
  assertEquals(p0.support[0].citation_tag, "1");
  assert(p0.support[0].quote.includes("dexamethasone reduced 28-day mortality"));
});

Deno.test("attachSupport leaves a claim unmarked when its cited source does not support it", () => {
  const out = attachSupport(SECTIONS, CHUNKS);
  assertEquals(out.what_we_know[1].support, undefined); // tag 2 chunk is unrelated
});

Deno.test("attachSupport passes through non-point fields and does not mutate the input", () => {
  const out = attachSupport(SECTIONS, CHUNKS);
  assertEquals(out.questions_to_ask, ["What dose?"]);
  assertEquals(SECTIONS.what_we_know[0].support, undefined); // original object untouched
});
