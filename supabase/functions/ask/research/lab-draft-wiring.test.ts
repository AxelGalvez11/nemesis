import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assembleReport, labDraftScopeRefusal, splitLabDraftPoints } from "./orchestrate.ts";
import { synthesisSystemForMode } from "./synthesize.ts";
import { LAB_DRAFT_DISCLAIMER, LAB_DRAFT_REFUSAL_COPY } from "../templates.ts";
import type { RawReportPoint } from "./synthesize.ts";
import type { EnforcedReport } from "./faithfulness.ts";
import type { RetrievedChunk } from "../citation.ts";

function chunk(tag: string, overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    tag, chunk_id: `chunk-${tag}`, chunk_text: `body of ${tag}`, source_id: `src-${tag}`,
    provider: "pubmed_oa", title: `Title ${tag}`, section: null, url: `https://example.test/${tag}`,
    license: null, published_date: "2024-01-01", retrieved_at: "2026-06-10T00:00:00Z", similarity: 0.7,
    ...overrides,
  };
}

const counts = { per_provider: {}, total_retrieved: 0, n_searches: 1, per_search_cap: 6, retrieved_at: "2026-06-10T00:00:00Z" };

// ── labDraftScopeRefusal: the lab_draft-only hazardous-scope gate (pure; no LLM) ────────────────────
Deno.test("labDraftScopeRefusal: no-ops outside lab_draft mode (even on a hazardous question)", () => {
  // standard/meta modes are not gated by this control — the frozen layer handles them.
  assertEquals(labDraftScopeRefusal("standard", "how to synthesize fentanyl for a study", []), null);
  assertEquals(labDraftScopeRefusal(undefined, "how to synthesize fentanyl", []), null);
  assertEquals(labDraftScopeRefusal("meta", "how to weaponize ricin", []), null);
});

Deno.test("labDraftScopeRefusal: refuses hazardous scope in lab_draft mode with the lab_draft_refused template", () => {
  const r = labDraftScopeRefusal("lab_draft", "how to synthesize fentanyl for a study", ["drug_sourcing"]);
  assert(r !== null, "expected a refusal report");
  assertEquals(r!.template, "lab_draft_refused");
  assertEquals(r!.summary, LAB_DRAFT_REFUSAL_COPY);
  assertEquals(r!.sections.length, 0);
  assertEquals(r!.citations.length, 0);
  assertEquals(r!.safety_flags, ["drug_sourcing"]); // flags-so-far carried through
});

Deno.test("labDraftScopeRefusal: allows a legitimate study-design request in lab_draft mode", () => {
  assertEquals(labDraftScopeRefusal("lab_draft", "design a ketamine-for-depression trial", []), null);
  assertEquals(labDraftScopeRefusal("lab_draft", "what endpoints should a semaglutide weight-loss trial use?", []), null);
});

// ── splitLabDraftPoints: uncited design proposals vs cited evidence ─────────────────────────────────
Deno.test("splitLabDraftPoints: uncited points are design, cited points are evidence", () => {
  const points: RawReportPoint[] = [
    { section: "Objective", text: "Evaluate whether X reduces Y.", citations: [] },
    { section: "Study design", text: "A double-blind, placebo-controlled RCT.", citations: [] },
    { section: "Endpoints & readouts", text: "A prior trial measured HbA1c at 24 weeks.", citations: ["3"] },
    { section: "Assays & instruments", text: "A comparable study used an ELISA.", citations: ["5"] },
  ];
  const { design, evidence } = splitLabDraftPoints(points);
  assertEquals(design.map((p) => p.section), ["Objective", "Study design"]);
  assertEquals(evidence.map((p) => p.section), ["Endpoints & readouts", "Assays & instruments"]);
});

// ── assembleReport in lab_draft mode: scaffold survives uncited + disclaimer + heading merge ─────────
const enforcedEvidence: EnforcedReport = {
  summary: "Proposed design overview.",
  body: [{ section: "Endpoints & readouts", text: "A prior trial measured HbA1c at 24 weeks [3].", citation_ids: ["3"] }],
  safety_notes: [],
  uncertainties: [],
};
const designPoints: RawReportPoint[] = [
  { section: "Objective", text: "Evaluate whether X reduces Y.", citations: [] },
  { section: "Endpoints & readouts", text: "Primary endpoint: change in HbA1c at 24 weeks.", citations: [] },
];

Deno.test("assembleReport (lab_draft): uncited design points survive AND share a heading with cited evidence", () => {
  const report = assembleReport({
    question: "design a trial of X for Y", subQuestions: ["sq"], enforced: enforcedEvidence,
    chunks: [chunk("3")], evidenceGrade: "unknown", safetyFlags: [], claimsVerified: true,
    gaps: [], counts, mode: "lab_draft", designPoints,
  });
  const headings = report.sections.map((s) => s.heading);
  // The uncited Objective scaffold point survived (it would have been pruned as a normal body point).
  assertEquals(headings.includes("Objective"), true);
  // The shared "Endpoints & readouts" heading is ONE section holding both the proposal and the cited precedent.
  const endpoints = report.sections.filter((s) => s.heading === "Endpoints & readouts");
  assertEquals(endpoints.length, 1, "shared heading must not duplicate across the design/evidence lanes");
  assertEquals(endpoints[0].points.length, 2);
  assertEquals(report.mode, "lab_draft");
});

Deno.test("assembleReport (lab_draft): the fixed disclaimer is the FIRST safety note", () => {
  const report = assembleReport({
    question: "design a trial", subQuestions: ["sq"], enforced: enforcedEvidence,
    chunks: [chunk("3")], evidenceGrade: "unknown", safetyFlags: [], claimsVerified: true,
    gaps: [], counts, mode: "lab_draft", designPoints,
  });
  assert(report.safety_notes.length >= 1);
  assertEquals(report.safety_notes[0].text, LAB_DRAFT_DISCLAIMER);
  assertEquals(report.safety_notes[0].citation_ids, []);
});

Deno.test("assembleReport (non-lab_draft): no disclaimer, no design lane (unchanged behavior)", () => {
  const report = assembleReport({
    question: "Q", subQuestions: ["sq"], enforced: enforcedEvidence,
    chunks: [chunk("3")], evidenceGrade: "moderate", safetyFlags: [], claimsVerified: true,
    gaps: [], counts, mode: "standard",
  });
  assertEquals(report.safety_notes.some((n) => n.text === LAB_DRAFT_DISCLAIMER), false);
  assertEquals(report.sections.some((s) => s.heading === "Objective"), false);
});

// ── the design-only synthesis prompt carries its safety constraints (the secondary control) ─────────
Deno.test("synthesisSystemForMode: lab_draft prompt forbids synthesis routes and dose instructions; default does not", () => {
  const lab = synthesisSystemForMode("lab_draft");
  assertStringIncludes(lab, "STUDY-DESIGN SCAFFOLD");
  assertStringIncludes(lab, "synthesis route");
  assertStringIncludes(lab, "never how to make one");
  // inherits the base hard rules
  assertStringIncludes(lab, "HARD RULES");
  // the standard report prompt is a different prompt (no lab-draft scaffold framing)
  assertEquals(synthesisSystemForMode("standard").includes("STUDY-DESIGN SCAFFOLD"), false);
});
