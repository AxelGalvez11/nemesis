import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { scienceState } from "./science-state.ts";
import type { Citation } from "./answer.ts";

// Minimal citation-evidence fixtures (only the study-type metadata matters here).
function cite(over: Partial<Citation>): Citation {
  return {
    chunk_tag: "1",
    source_id: "s",
    source_type: "pubmed_oa",
    title: null,
    section: null,
    url: null,
    license: null,
    published_date: null,
    retrieved_at: null,
    ...over,
  };
}

Deno.test("scienceState: a meta-analysis among the cited sources => well_studied", () => {
  const r = scienceState([
    cite({ publication_types: ["Meta-Analysis", "Journal Article"] }),
    cite({ publication_types: ["Journal Article"] }),
  ]);
  assertEquals(r?.state, "well_studied");
  assertEquals(r?.syntheses, 1);
  assertEquals(r?.total, 2);
});

Deno.test("scienceState: a systematic review also counts as well_studied", () => {
  const r = scienceState([cite({ publication_types: ["Systematic Review"] })]);
  assertEquals(r?.state, "well_studied");
  assertEquals(r?.syntheses, 1);
});

Deno.test("scienceState: synthesis WINS even when early-phase trials are also present (precedence)", () => {
  const r = scienceState([
    cite({ publication_types: ["Meta-Analysis"] }),
    cite({ trial_phase: "Phase II" }),
  ]);
  assertEquals(r?.state, "well_studied");
});

Deno.test("scienceState: only early-phase trials, no synthesis/RCT => emerging", () => {
  const r = scienceState([
    cite({ study_type: "INTERVENTIONAL", trial_phase: "PHASE2" }),
    cite({ study_type: "INTERVENTIONAL", trial_phase: "PHASE1" }),
  ]);
  assertEquals(r?.state, "emerging");
  assertEquals(r?.earlyStage, 2);
});

Deno.test("scienceState: a preprint with no stronger evidence => emerging", () => {
  const r = scienceState([cite({ publication_types: ["Preprint"] })]);
  assertEquals(r?.state, "emerging");
  assertEquals(r?.earlyStage, 1);
});

Deno.test("scienceState: an RCT present (no synthesis) => null (we do NOT overclaim 'established')", () => {
  const r = scienceState([
    cite({ publication_types: ["Randomized Controlled Trial"] }),
    cite({ publication_types: ["Journal Article"] }),
  ]);
  assertEquals(r, null);
});

Deno.test("scienceState: a late-phase trial suppresses 'emerging' even with an early-phase one present", () => {
  const r = scienceState([
    cite({ trial_phase: "PHASE3" }),
    cite({ trial_phase: "PHASE1" }),
  ]);
  assertEquals(r, null); // late-phase present => not emerging; no synthesis => not well_studied
});

Deno.test("scienceState: sparse/absent study-type metadata => null (positive-only, no false 'limited')", () => {
  const r = scienceState([
    cite({ title: "Some article", publication_types: [] }),
    cite({ title: "Another", study_type: undefined, trial_phase: undefined }),
  ]);
  assertEquals(r, null);
});

Deno.test("scienceState: observational-only evidence => null (no early-phase signal to stand behind)", () => {
  const r = scienceState([cite({ study_type: "OBSERVATIONAL" })]);
  assertEquals(r, null);
});

Deno.test("scienceState: empty citation list => null", () => {
  assertEquals(scienceState([]), null);
});

Deno.test("scienceState: PubMed Roman 'Phase II' and CT.gov 'PHASE2' both read as early-stage", () => {
  assertEquals(scienceState([cite({ trial_phase: "Phase II" })])?.state, "emerging");
  assertEquals(scienceState([cite({ trial_phase: "PHASE2" })])?.state, "emerging");
  assertEquals(scienceState([cite({ trial_phase: "EARLY_PHASE1" })])?.state, "emerging");
});
