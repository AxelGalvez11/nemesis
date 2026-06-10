// Tests for the Deep Research engine's PURE helpers (no LLM, no network). These cover the parts that
// carry correctness/safety guarantees: sub-question normalization, evidence merge (the round-robin that
// keeps every sub-question represented in ONE namespace), citation existence enforcement, the
// faithfulness verdict application (drop unsupported claims), and final assembly.
// Run: deno test supabase/functions/ask/
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { normalizeSubQuestions } from "./plan.ts";
import { assembleSections } from "./synthesize.ts";
import {
  applyVerdicts,
  collectClaims,
  type EnforcedReport,
  enforceReportCitations,
  isFullyVerified,
  type RawReportLike,
} from "./faithfulness.ts";
import {
  assembleReport,
  buildCitations,
  hasSupportedContent,
  mergeEvidence,
} from "./orchestrate.ts";
import type { RetrievedChunk } from "../citation.ts";

// ---- fixtures ----
function chunk(tag: string, overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    tag,
    chunk_id: overrides.chunk_id ?? `chunk-${tag}`,
    chunk_text: overrides.chunk_text ?? `body of ${tag}`,
    source_id: overrides.source_id ?? `src-${tag}`,
    provider: overrides.provider ?? "pubmed_oa",
    title: overrides.title ?? `Title ${tag}`,
    section: overrides.section ?? null,
    url: overrides.url ?? `https://example.test/${tag}`,
    license: overrides.license ?? null,
    published_date: overrides.published_date ?? "2024-01-01",
    retrieved_at: overrides.retrieved_at ?? "2026-06-10T00:00:00Z",
    similarity: overrides.similarity ?? 0.7,
  };
}

// ---------------------------------------------------------------------------
// normalizeSubQuestions
// ---------------------------------------------------------------------------

Deno.test("normalizeSubQuestions: trims, dedupes case-insensitively, clamps to 6", () => {
  const raw = [
    " What is X? ", "what is x?", // dup (case + whitespace)
    "How does X work?", "Is X studied in humans?", "What are X's risks?",
    "What is X's approval status?", "What trials exist for X?", "Extra seventh question?",
  ];
  const out = normalizeSubQuestions(raw, "original");
  assertEquals(out.length, 6);
  assertEquals(out[0], "What is X?");
  assert(!out.includes("Extra seventh question?")); // clamped at 6
});

Deno.test("normalizeSubQuestions: fewer than 3 valid -> falls back to the original question", () => {
  assertEquals(normalizeSubQuestions(["only one"], "the original q"), ["the original q"]);
  assertEquals(normalizeSubQuestions([], "the original q"), ["the original q"]);
  assertEquals(normalizeSubQuestions(["a", "  ", 42, null], "orig"), ["orig"]);
});

Deno.test("normalizeSubQuestions: non-array / empty original -> empty (pipeline will no_source)", () => {
  assertEquals(normalizeSubQuestions("nope", "   "), []);
  assertEquals(normalizeSubQuestions(undefined, ""), []);
});

// ---------------------------------------------------------------------------
// mergeEvidence — round-robin, dedupe, namespace
// ---------------------------------------------------------------------------

Deno.test("mergeEvidence: round-robin keeps every sub-question represented before seconds", () => {
  const a = [chunk("x", { chunk_id: "a1" }), chunk("x", { chunk_id: "a2" })];
  const b = [chunk("y", { chunk_id: "b1" }), chunk("y", { chunk_id: "b2" })];
  const merged = mergeEvidence([a, b], 10);
  // rank0: a1, b1 ; rank1: a2, b2
  assertEquals(merged.map((c) => c.chunk_id), ["a1", "b1", "a2", "b2"]);
  // retagged to a single 1..N namespace
  assertEquals(merged.map((c) => c.tag), ["1", "2", "3", "4"]);
});

Deno.test("mergeEvidence: dedupes the same chunk_id across sub-question lists", () => {
  const a = [chunk("p", { chunk_id: "shared" }), chunk("p", { chunk_id: "a-only" })];
  const b = [chunk("q", { chunk_id: "shared" }), chunk("q", { chunk_id: "b-only" })];
  const merged = mergeEvidence([a, b], 10);
  // rank0: a.shared (add), b.shared (dup skip); rank1: a.a-only, b.b-only
  assertEquals(merged.map((c) => c.chunk_id), ["shared", "a-only", "b-only"]);
  assertEquals(new Set(merged.map((c) => c.chunk_id)).size, 3);
});

Deno.test("mergeEvidence: respects the global cap", () => {
  const a = [chunk("a", { chunk_id: "a1" }), chunk("a", { chunk_id: "a2" })];
  const b = [chunk("b", { chunk_id: "b1" }), chunk("b", { chunk_id: "b2" })];
  const merged = mergeEvidence([a, b], 3);
  assertEquals(merged.length, 3);
  assertEquals(merged.map((c) => c.chunk_id), ["a1", "b1", "a2"]);
});

Deno.test("mergeEvidence: empty input -> empty", () => {
  assertEquals(mergeEvidence([], 10), []);
  assertEquals(mergeEvidence([[], []], 10), []);
});

// ---------------------------------------------------------------------------
// enforceReportCitations — existence check
// ---------------------------------------------------------------------------

const chunks3 = [chunk("1"), chunk("2"), chunk("3")];

Deno.test("enforceReportCitations: drops body/safety points with no valid citation", () => {
  const raw: RawReportLike = {
    summary: "Summary.",
    points: [
      { section: "What it is", text: "Supported.", citations: ["1"] },
      { section: "What it is", text: "Hallucinated cite.", citations: ["99"] },
      { section: "What it is", text: "No cite.", citations: [] },
    ],
    uncertainties: [{ text: "Evidence is limited.", citations: [] }],
    safety_notes: [
      { text: "Real caution.", citations: ["2"] },
      { text: "Uncited caution.", citations: [] },
    ],
  };
  const out = enforceReportCitations(raw, chunks3);
  assertEquals(out.body.length, 1);
  assertEquals(out.body[0].text, "Supported.");
  assertEquals(out.body[0].citation_ids, ["1"]);
  assertEquals(out.safety_notes.length, 1);
  assertEquals(out.safety_notes[0].citation_ids, ["2"]);
  // uncertainties are non-asserting: kept verbatim with empty citation_ids
  assertEquals(out.uncertainties.length, 1);
  assertEquals(out.uncertainties[0].citation_ids, []);
});

Deno.test("enforceReportCitations: normalizes bracketed tags and dedupes within a point", () => {
  const raw: RawReportLike = {
    summary: "s",
    points: [{ section: "S", text: "t", citations: ["[1]", " 1 ", "2"] }],
    uncertainties: [],
    safety_notes: [],
  };
  const out = enforceReportCitations(raw, chunks3);
  assertEquals(out.body[0].citation_ids, ["1", "2"]);
});

// ---------------------------------------------------------------------------
// collectClaims + applyVerdicts — faithfulness pruning
// ---------------------------------------------------------------------------

function enforcedFixture(): EnforcedReport {
  return {
    summary: "Summary.",
    body: [
      { section: "A", text: "body0", citation_ids: ["1"] },
      { section: "A", text: "body1", citation_ids: ["2"] },
    ],
    safety_notes: [{ text: "safety0", citation_ids: ["3"] }],
    uncertainties: [{ text: "gap", citation_ids: [] }],
  };
}

Deno.test("collectClaims: body first then safety, contiguous indices", () => {
  const claims = collectClaims(enforcedFixture());
  assertEquals(claims.map((c) => c.index), [0, 1, 2]);
  assertEquals(claims.map((c) => c.kind), ["body", "body", "safety"]);
  assertEquals(claims.map((c) => c.text), ["body0", "body1", "safety0"]);
});

Deno.test("applyVerdicts: drops only claims judged unsupported", () => {
  const out = applyVerdicts(enforcedFixture(), [
    { index: 0, supported: true },
    { index: 1, supported: false }, // drop body1
    { index: 2, supported: true },
  ]);
  assertEquals(out.body.map((p) => p.text), ["body0"]);
  assertEquals(out.safety_notes.length, 1);
  assertEquals(out.uncertainties.length, 1); // untouched
});

Deno.test("applyVerdicts: a missing verdict KEEPS the claim (existence already passed)", () => {
  const out = applyVerdicts(enforcedFixture(), [{ index: 0, supported: true }]);
  assertEquals(out.body.length, 2); // body1 has no verdict -> kept
  assertEquals(out.safety_notes.length, 1); // safety0 has no verdict -> kept
});

Deno.test("applyVerdicts: does not mutate the input", () => {
  const input = enforcedFixture();
  applyVerdicts(input, [{ index: 0, supported: false }]);
  assertEquals(input.body.length, 2); // original unchanged
});

// ---------------------------------------------------------------------------
// isFullyVerified — the honest claims_verified gate
// ---------------------------------------------------------------------------

Deno.test("isFullyVerified: true only when every judged item has a verdict and summary holds", () => {
  // 3 claims (0,1,2) + summary (3), all covered and supported
  assert(isFullyVerified([0, 1, 2, 3], 3, [
    { index: 0, supported: true },
    { index: 1, supported: true },
    { index: 2, supported: false }, // a dropped claim still counts as COVERED
    { index: 3, supported: true },
  ]));
});

Deno.test("isFullyVerified: false when the judge under-emits (a claim is unjudged)", () => {
  // claim 2 has no verdict -> partial coverage -> NOT fully verified
  assert(!isFullyVerified([0, 1, 2, 3], 3, [
    { index: 0, supported: true },
    { index: 1, supported: true },
    { index: 3, supported: true },
  ]));
});

Deno.test("isFullyVerified: false when the summary is marked unsupported", () => {
  assert(!isFullyVerified([0, 3], 3, [
    { index: 0, supported: true },
    { index: 3, supported: false }, // summary unsupported
  ]));
});

Deno.test("isFullyVerified: no summary index (null) -> only coverage matters", () => {
  assert(isFullyVerified([0, 1], null, [{ index: 0, supported: true }, { index: 1, supported: false }]));
  assert(!isFullyVerified([0, 1], null, [{ index: 0, supported: true }]));
});

// ---------------------------------------------------------------------------
// assembleSections
// ---------------------------------------------------------------------------

Deno.test("assembleSections: groups by heading, preserves first-appearance order", () => {
  const sections = assembleSections([
    { section: "Human evidence", point: { text: "h1", citation_ids: ["2"] } },
    { section: "What it is", point: { text: "w1", citation_ids: ["1"] } },
    { section: "Human evidence", point: { text: "h2", citation_ids: ["3"] } },
  ]);
  assertEquals(sections.map((s) => s.heading), ["Human evidence", "What it is"]);
  assertEquals(sections[0].points.map((p) => p.text), ["h1", "h2"]);
});

Deno.test("assembleSections: blank heading collapses to 'Findings'", () => {
  const sections = assembleSections([{ section: "  ", point: { text: "x", citation_ids: ["1"] } }]);
  assertEquals(sections[0].heading, "Findings");
});

// ---------------------------------------------------------------------------
// buildCitations / hasSupportedContent / assembleReport
// ---------------------------------------------------------------------------

Deno.test("buildCitations: numeric order, deduped, ignores tags with no chunk", () => {
  const cites = buildCitations(["3", "1", "1", "99"], chunks3);
  assertEquals(cites.map((c) => c.chunk_tag), ["1", "3"]);
  assertEquals(cites[0].source_type, "pubmed_oa");
});

Deno.test("hasSupportedContent: true when any body or safety point survives", () => {
  assert(hasSupportedContent(enforcedFixture()));
  assert(!hasSupportedContent({ summary: "s", body: [], safety_notes: [], uncertainties: [{ text: "g", citation_ids: [] }] }));
});

Deno.test("assembleReport: builds sections + citations; appends caution when unverified", () => {
  const report = assembleReport({
    question: "What is X?",
    subQuestions: ["q1", "q2", "q3"],
    enforced: enforcedFixture(),
    chunks: chunks3,
    evidenceGrade: "moderate",
    safetyFlags: [],
    claimsVerified: false,
  });
  assertEquals(report.sections.length, 1); // both body points share section "A"
  assertEquals(report.sections[0].points.length, 2);
  assertEquals(report.safety_notes.length, 1);
  assertEquals(report.claims_verified, false);
  // unverified -> an explicit caution is appended to uncertainties
  assert(report.uncertainties.some((u) => u.text.includes("could not run")));
  assertEquals(report.citations.map((c) => c.chunk_tag), ["1", "2", "3"]);
  assertEquals(report.evidence_grade, "moderate");
});

Deno.test("assembleReport: verified report carries no extra caution", () => {
  const report = assembleReport({
    question: "q",
    subQuestions: ["a", "b", "c"],
    enforced: enforcedFixture(),
    chunks: chunks3,
    evidenceGrade: "strong",
    safetyFlags: [],
    claimsVerified: true,
  });
  assertEquals(report.claims_verified, true);
  assert(!report.uncertainties.some((u) => u.text.includes("could not run")));
  assertEquals(report.uncertainties.length, 1); // just the original gap
});

// ---------------------------------------------------------------------------
// buildCitations carries bibliographic metadata onto the Citation
// ---------------------------------------------------------------------------

Deno.test("buildCitations carries bibliographic metadata onto the Citation", () => {
  const chunks: RetrievedChunk[] = [{
    tag: "1", chunk_id: "live:pubmed_oa:1", source_id: "live:pubmed_oa:1", provider: "pubmed_oa",
    title: "A study", section: null, url: null, license: "cc_by",
    published_date: "2024-01-01", retrieved_at: "2026-06-10T00:00:00Z", similarity: 0,
    authors: ["Falutz J"], journal: "N Engl J Med", year: "2024", volume: "390", issue: "2", pages: "101-110",
  }];
  const [c] = buildCitations(["1"], chunks);
  assertEquals(c.authors, ["Falutz J"]);
  assertEquals(c.journal, "N Engl J Med");
  assertEquals(c.volume, "390");
});
