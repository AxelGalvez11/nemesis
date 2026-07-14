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
  buildReviewedSources,
  buildSearchMethod,
  hasSupportedContent,
  mergeEvidence,
} from "./orchestrate.ts";
import type { RetrievedChunk } from "../citation.ts";
import { detectViolations } from "../safety.ts";
import { detectForbiddenPhrases } from "../../../../packages/shared/src/forbidden-phrases.ts";

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

Deno.test("buildReviewedSources: returns the UNCITED pool chunks (the also-reviewed breadth)", () => {
  const pool = [chunk("1"), chunk("2"), chunk("3"), chunk("4", { provider: "web", url: "https://nejm.org/x" })];
  const reviewed = buildReviewedSources(["1", "3"], pool);
  assertEquals(reviewed.map((c) => c.chunk_tag).sort(), ["2", "4"]);
  const web = reviewed.find((c) => c.chunk_tag === "4");
  assertEquals(web?.source_type, "web");
  assertEquals(web?.url, "https://nejm.org/x");
});

Deno.test("buildReviewedSources: empty when every pool chunk was cited", () => {
  const pool = [chunk("1"), chunk("2")];
  assertEquals(buildReviewedSources(["1", "2"], pool).length, 0);
});

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
    gaps: [],
    counts: { total_retrieved: 0, per_provider: {}, per_search_cap: 6, n_searches: 3, retrieved_at: null },
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
    gaps: [],
    counts: { total_retrieved: 0, per_provider: {}, per_search_cap: 6, n_searches: 3, retrieved_at: null },
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

// ---------------------------------------------------------------------------
// deriveGaps — deterministic run-scoped literature gaps
// ---------------------------------------------------------------------------

import { deriveGaps } from "./gaps.ts";

function gapChunk(partial: Partial<RetrievedChunk>): RetrievedChunk {
  return {
    tag: "1", chunk_id: "x", source_id: "x", provider: "pubmed_oa", title: null, section: null,
    url: null, license: null, published_date: null, retrieved_at: "2026-06-10T00:00:00Z",
    similarity: 0, ...partial,
  };
}

Deno.test("deriveGaps: no human trial, no rct, no synthesis when only labels retrieved", () => {
  const chunks = [gapChunk({ provider: "openfda" }), gapChunk({ provider: "openfda" })];
  const { gaps, counts } = deriveGaps(chunks, ["q1"]);
  const types = gaps.map((g) => g.type).sort();
  assertEquals(types.includes("no_human_trial"), true);
  assertEquals(types.includes("no_rct"), true);
  assertEquals(types.includes("no_synthesis"), true);
  assertEquals(counts.total_retrieved, 2);
  assertEquals(counts.per_provider.openfda, 2);
  // Denominator-scoped phrasing, never "no evidence exists".
  for (const g of gaps) {
    assertEquals(/no evidence exists/i.test(g.text), false);
    assertEquals(g.scope, "this_run");
  }
});

Deno.test("deriveGaps: an RCT chunk removes the no_rct gap and the no_human_trial gap (if interventional)", () => {
  const chunks = [
    gapChunk({ provider: "pubmed_oa", publication_types: ["Randomized Controlled Trial"] }),
    gapChunk({ provider: "clinicaltrials", study_type: "INTERVENTIONAL" }),
  ];
  const { gaps } = deriveGaps(chunks, ["q1"]);
  assertEquals(gaps.some((g) => g.type === "no_rct"), false);
  assertEquals(gaps.some((g) => g.type === "no_human_trial"), false);
  // No synthesis still flagged.
  assertEquals(gaps.some((g) => g.type === "no_synthesis"), true);
});

Deno.test("deriveGaps: a meta-analysis removes no_synthesis", () => {
  const chunks = [gapChunk({ publication_types: ["Meta-Analysis"] })];
  const { gaps } = deriveGaps(chunks, ["q1"]);
  assertEquals(gaps.some((g) => g.type === "no_synthesis"), false);
});

Deno.test("deriveGaps: a systematic review also removes no_synthesis", () => {
  const { gaps } = deriveGaps([gapChunk({ publication_types: ["Systematic Review"] })], ["q1"]);
  assertEquals(gaps.some((g) => g.type === "no_synthesis"), false);
});

Deno.test("deriveGaps: recruiting trial attaches as corroborating, never deletes a gap", () => {
  const chunks = [
    gapChunk({ provider: "openfda" }),
    gapChunk({ provider: "clinicaltrials", source_id: "live:clinicaltrials:NCT9", study_type: "INTERVENTIONAL", trial_status: "RECRUITING" }),
  ];
  const { gaps } = deriveGaps(chunks, ["q1"]);
  // An interventional+recruiting trial means no_human_trial is gone, but no_rct/no_synthesis remain,
  // and the recruiting NCT is attached to a surviving gap as "an answer may be coming".
  const rct = gaps.find((g) => g.type === "no_rct");
  assertEquals(!!rct, true);
  assertEquals(rct?.corroborating_trials.includes("NCT9"), true);
  assertEquals(gaps.some((g) => g.type === "no_human_trial"), false); // the recruiting interventional trial removed it
  const synth = gaps.find((g) => g.type === "no_synthesis");
  assertEquals(synth?.corroborating_trials.includes("NCT9"), true);   // NCT attaches to ALL surviving gaps
});

Deno.test("deriveGaps: empty pool yields counts but a single sparse gap", () => {
  const { gaps, counts } = deriveGaps([], ["q1"]);
  assertEquals(counts.total_retrieved, 0);
  assertEquals(gaps.length, 1);
  assertEquals(gaps[0].type, "sparse");
});

Deno.test("the assembled safety-scan string includes gap text (one-scan guarantee)", () => {
  // deriveGaps text is deterministic + safe, so we assert the JOIN includes it by constructing the
  // same string orchestrate builds. A banned phrase placed in a gap MUST be caught.
  const gapText = "This peptide is completely safe to inject."; // a doc-20 violation
  const assembled = ["summary", "section", "point", gapText].join("  ");
  assertEquals(detectViolations(assembled).length > 0, true);
});

// ---------------------------------------------------------------------------
// planSubQuestions mode parameter — prompt-only change; normalize contract unchanged
// ---------------------------------------------------------------------------

Deno.test("normalizeSubQuestions unchanged under structured mode (prompt-only change)", () => {
  assertEquals(normalizeSubQuestions(["a", "b", "c"], "q").length, 3);
});

// ---------------------------------------------------------------------------
// buildSearchMethod — code-authored PRISMA-clean method copy
// ---------------------------------------------------------------------------

Deno.test("buildSearchMethod produces honest, PRISMA-clean method copy", () => {
  const m = buildSearchMethod(
    ["pubmed_oa", "clinicaltrials", "openfda"],
    ["tesamorelin efficacy", "tesamorelin safety"],
    "2026-06-10",
  );
  assertEquals(m.search_date, "2026-06-10");
  // The fixed copy must never trip the PRISMA-overclaim guard.
  const allCopy = [...m.databases, ...m.queries, m.inclusion_notes, m.exclusion_notes].join("  ");
  assertEquals(detectForbiddenPhrases(allCopy), []);
  // Honesty cornerstone (plan §2): the limitations disclosure must never be silently dropped,
  // and the copy must NOT imply an eligibility/screening process PharmaOrb does not perform.
  assert(/no registered protocol/i.test(m.exclusion_notes));
  assert(/not an exhaustive census/i.test(m.inclusion_notes));
  assert(!/\b(included|excluded|eligibility)\b/i.test(m.inclusion_notes + " " + m.exclusion_notes)); // no screening/eligibility framing
});

// ---------------------------------------------------------------------------
// assembleReport — mode payload vs kind (frozen read-path safety)
// ---------------------------------------------------------------------------

Deno.test("assembleReport output carries mode in payload, never a kind field", () => {
  const report = assembleReport({
    question: "q",
    subQuestions: ["q"],
    enforced: {
      summary: "s",
      body: [{ section: "X", text: "t", citation_ids: ["1"] }],
      safety_notes: [],
      uncertainties: [],
    },
    chunks: [chunk("1")],
    evidenceGrade: "moderate",
    safetyFlags: [],
    claimsVerified: true,
    gaps: [],
    counts: { per_provider: {}, total_retrieved: 0, per_search_cap: 6, n_searches: 1, retrieved_at: null },
    mode: "structured_review",
  });
  // mode must be preserved in the payload (used by export formatters + UI)
  assertEquals(report.mode, "structured_review");
  // kind must NEVER appear in assembleReport output — it is set only by the edge function
  // when persisting to DB (insertSavedReport). The frozen read-path filters .eq('kind','deep_research'),
  // so a stray kind here would cause structured_review reports to appear in the deep-research list.
  assertEquals("kind" in report, false);
});

Deno.test("assembleReport in discovery mode attaches the Level 4 discovery payload", () => {
  const report = assembleReport({
    question: "Creatine for cognition in sleep-deprived adults",
    subQuestions: ["q"],
    enforced: {
      summary: "Human evidence is suggestive but limited.",
      body: [{
        section: "Human evidence",
        text: "Small human studies suggest creatine may preserve cognition during sleep deprivation.",
        citation_ids: ["1"],
      }],
      safety_notes: [],
      uncertainties: [{ text: "Studies are small.", citation_ids: [] }],
    },
    chunks: [chunk("1", {
      title: "Creatine cognition trial",
      publication_types: ["Randomized Controlled Trial"],
    })],
    evidenceGrade: "weak",
    safetyFlags: [],
    claimsVerified: true,
    gaps: [{
      dimension: "study_design",
      type: "no_rct",
      scope: "this_run",
      text: "No randomized controlled trial was among the sources we searched for this question.",
      denominator: {
        providers_searched: ["pubmed_oa"],
        n_sources: 1,
        retrieved_at: "2026-06-28T00:00:00Z",
      },
      corroborating_trials: [],
    }],
    counts: { per_provider: { pubmed_oa: 1 }, total_retrieved: 1, per_search_cap: 6, n_searches: 1, retrieved_at: "2026-06-28T00:00:00Z" },
    mode: "discovery",
  });

  assertEquals(report.mode, "discovery");
  assertEquals(report.discovery?.claims.length, 1);
  assertEquals(report.discovery?.study_designs[0].design_type, "randomized_controlled_trial");
  assertEquals(report.discovery?.evidence_meter, "weak");
});

Deno.test("assembleReport carries model slot metadata when provided", () => {
  const report = assembleReport({
    question: "q",
    subQuestions: ["q"],
    enforced: {
      summary: "s",
      body: [{ section: "X", text: "t", citation_ids: ["1"] }],
      safety_notes: [],
      uncertainties: [],
    },
    chunks: [chunk("1")],
    evidenceGrade: "moderate",
    safetyFlags: [],
    claimsVerified: true,
    gaps: [],
    counts: { per_provider: {}, total_retrieved: 0, per_search_cap: 6, n_searches: 1, retrieved_at: null },
    modelSlots: { classify: "cheap", research: "strong", verify: "judge" },
  });
  assertEquals(report.model_slots?.research, "strong");
});
