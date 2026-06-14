import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { studyTypeLabel } from "./study-type.ts";

Deno.test("studyTypeLabel picks the most informative label from PubMed publication types", () => {
  assertEquals(studyTypeLabel({ publication_types: ["Meta-Analysis", "Journal Article"] }), "Meta-analysis");
  assertEquals(studyTypeLabel({ publication_types: ["Systematic Review"] }), "Systematic review");
  assertEquals(studyTypeLabel({ publication_types: ["Randomized Controlled Trial", "Journal Article"] }), "Randomized controlled trial");
  assertEquals(studyTypeLabel({ publication_types: ["Review", "Journal Article"] }), "Review");
});

Deno.test("studyTypeLabel surfaces trial phase (Roman from PubMed, Arabic from ClinicalTrials)", () => {
  assertEquals(studyTypeLabel({ publication_types: ["Clinical Trial, Phase III"] }), "Clinical trial · Phase 3");
  assertEquals(studyTypeLabel({ study_type: "INTERVENTIONAL", trial_phase: "PHASE3" }), "Interventional trial · Phase 3");
  assertEquals(studyTypeLabel({ study_type: "INTERVENTIONAL", trial_phase: "Phase 2" }), "Interventional trial · Phase 2");
  assertEquals(studyTypeLabel({ study_type: "INTERVENTIONAL" }), "Interventional trial");
  assertEquals(studyTypeLabel({ study_type: "OBSERVATIONAL" }), "Observational study");
});

Deno.test("studyTypeLabel returns undefined when nothing identifiable (no false badge)", () => {
  assertEquals(studyTypeLabel({ publication_types: ["Journal Article"] }), undefined);
  assertEquals(studyTypeLabel({}), undefined);
  assertEquals(studyTypeLabel({ publication_types: [] }), undefined);
});

Deno.test("studyTypeLabel prefers the strongest evidence label over a weaker one", () => {
  // A meta-analysis that is also tagged Review/Journal Article -> Meta-analysis wins.
  assertEquals(studyTypeLabel({ publication_types: ["Journal Article", "Review", "Meta-Analysis"] }), "Meta-analysis");
});
