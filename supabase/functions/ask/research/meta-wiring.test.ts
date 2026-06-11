import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assembleReport, buildScanInput } from "./orchestrate.ts";
import { detectViolations } from "../safety.ts";
import { META_SECTION } from "./meta-prose.ts";
import type { RawReportPoint } from "./synthesize.ts";
import type { EnforcedReport } from "./faithfulness.ts";
import type { MetaAnalysisResult } from "../../../../packages/shared/src/meta-analysis.ts";
import type { RetrievedChunk } from "../citation.ts";

function chunk(tag: string, overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    tag, chunk_id: `chunk-${tag}`, chunk_text: `body of ${tag}`, source_id: `src-${tag}`,
    provider: "pubmed_oa", title: `Title ${tag}`, section: null, url: `https://example.test/${tag}`,
    license: null, published_date: "2024-01-01", retrieved_at: "2026-06-10T00:00:00Z", similarity: 0.7,
    ...overrides,
  };
}

const enforced: EnforcedReport = {
  summary: "Body summary.",
  body: [{ section: "Findings", text: "A body claim.", citation_ids: ["1"] }],
  safety_notes: [],
  uncertainties: [],
};

const metaPoints: RawReportPoint[] = [
  { section: META_SECTION, text: "Pooled risk ratio for mortality of 0.65 (95% CI 0.50 to 0.84).", citations: ["2", "3"] },
  { section: META_SECTION, text: "Between-study heterogeneity: I² = 42%.", citations: [] },
];

const metaResult: MetaAnalysisResult = {
  poolable: true, measure: "risk_ratio", k: 2,
  studies: [
    { label: "A", citation_tag: "2", source_quote: "q", outcome_label: "mortality", effect_log: -0.4, effect: 0.67, variance: 0.05, ci_low: 0.5, ci_high: 0.9, weight_percent: 50, continuity_corrected: false },
    { label: "B", citation_tag: "3", source_quote: "q", outcome_label: "mortality", effect_log: -0.45, effect: 0.64, variance: 0.06, ci_low: 0.45, ci_high: 0.9, weight_percent: 50, continuity_corrected: false },
  ],
  fixed: { estimate_log: -0.42, variance: 0.04, estimate: 0.66, ci_low: 0.55, ci_high: 0.79 },
  random: { estimate_log: -0.43, variance: 0.06, estimate: 0.65, ci_low: 0.5, ci_high: 0.84 },
  heterogeneity: { q: 5, df: 1, i2: 42, tau2: 0.12 },
};

// The readers' gotcha: meta prose must not escape the ONE safety scan. buildScanInput is the pure
// helper the orchestrator feeds to detectViolations — prove the meta section + text are in it.
Deno.test("buildScanInput includes the meta section heading and text (no escape from the one scan)", () => {
  const scan = buildScanInput({
    summary: "S", points: [{ section: "Findings", text: "body" }],
    safetyNotes: [], uncertainties: [], gapTexts: [], methodStrings: [], metaPoints,
  });
  assertStringIncludes(scan, META_SECTION);
  assertStringIncludes(scan, "Pooled risk ratio for mortality");
  assertStringIncludes(scan, "I² = 42%");
});

Deno.test("a forbidden phrase planted in a meta point is caught by the one detectViolations scan", () => {
  // doc-20 style unsafe directive injected into a computed point — the scan must still see it.
  const evil: RawReportPoint[] = [{ section: META_SECTION, text: "you should take 600 mg twice daily", citations: [] }];
  const scan = buildScanInput({ summary: "S", points: [], safetyNotes: [], uncertainties: [], gapTexts: [], methodStrings: [], metaPoints: evil });
  assert(detectViolations(scan).length > 0, "expected the scan to flag the injected directive");
});

Deno.test("assembleReport appends the meta section, folds its study tags into citations, and sets meta_analysis", () => {
  const report = assembleReport({
    question: "Q", subQuestions: ["sq"], enforced,
    chunks: [chunk("1"), chunk("2"), chunk("3")],
    evidenceGrade: "moderate", safetyFlags: [], claimsVerified: true,
    gaps: [], counts: { per_provider: {}, total_retrieved: 0, n_searches: 1, per_search_cap: 6, retrieved_at: "2026-06-10T00:00:00Z" },
    mode: "meta", metaPoints, metaAnalysis: metaResult,
  });
  // The pooled section is appended after the body.
  const headings = report.sections.map((s) => s.heading);
  assertEquals(headings.includes(META_SECTION), true);
  // The pooled studies' sources (tags 2 and 3) appear in the citation list even though the body only cited 1.
  const tags = report.citations.map((c) => c.chunk_tag);
  assert(tags.includes("2") && tags.includes("3"), "expected pooled study sources in citations");
  // The structured result is carried for the forest table.
  assertEquals(report.meta_analysis?.poolable, true);
  assertEquals(report.mode, "meta");
});

Deno.test("assembleReport without metaPoints is unchanged (no meta section, no meta_analysis)", () => {
  const report = assembleReport({
    question: "Q", subQuestions: ["sq"], enforced,
    chunks: [chunk("1")],
    evidenceGrade: "moderate", safetyFlags: [], claimsVerified: true,
    gaps: [], counts: { per_provider: {}, total_retrieved: 0, n_searches: 1, per_search_cap: 6, retrieved_at: "2026-06-10T00:00:00Z" },
  });
  assertEquals(report.sections.some((s) => s.heading === META_SECTION), false);
  assertEquals(report.meta_analysis, undefined);
});
