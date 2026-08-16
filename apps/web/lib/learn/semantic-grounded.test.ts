import assert from "node:assert/strict";
import { test } from "node:test";

import type { CanvasSource } from "./canvas-model";
import { objectivesForKnowledge } from "./learning-objective";
import { retrievalPromptFor } from "./objective-task";
import { runtimeCanStage } from "./runtime-support";
import { parseSemanticTerritory } from "./semantic-grounded";

const PASSAGE = "Beta blockers reduce myocardial oxygen demand by lowering heart rate.";
const SOURCES: CanvasSource[] = [{
  excerpts: [{ id: "s1:e1", label: "Functions", text: PASSAGE, unitId: "u1" }],
  id: "s1",
  kind: "document",
  librarySourceId: "lib-1",
  title: "Cardiology",
} as CanvasSource];

const STRUCTURE = {
  evidence: [{ assertion: PASSAGE, excerptId: "s1:e1" }],
  family: "functional",
  relationshipType: "reduces_demand_by",
  roles: [
    { role: "agent", text: "Beta blockers" },
    { role: "function", text: "reduce myocardial oxygen demand" },
    { role: "means", text: "lowering heart rate" },
  ],
};

const read = (structures: unknown[], sources = SOURCES) => parseSemanticTerritory({
  model: "test-model",
  sources,
  text: JSON.stringify({ relations: [], structures }),
});

test("a grounded open relation becomes a stageable explanation", () => {
  const result = read([STRUCTURE]);
  assert.deepEqual(result.refusals, []);
  assert.equal(result.objects.length, 1);
  const object = result.objects[0]!;
  assert.equal(object.type, "conceptual_system");
  assert.equal(object.semanticRelations?.[0]?.family, "functional");
  assert.equal(object.semanticRelations?.[0]?.relationshipType, "reduces_demand_by");
  assert.equal(object.sourceAnchors?.[0]?.unitId, "u1");
  assert.equal(object.provenance?.model, "test-model");

  const [objective] = objectivesForKnowledge(object);
  assert.equal(objective?.capability, "explain");
  assert.equal(runtimeCanStage(object.type, objective!.capability), true);
  const prompt = retrievalPromptFor({ knowledge: object, objective: { ...objective!, rowId: "row-1" } }, "p1");
  assert.equal(prompt.task, "explain");
  assert.match(prompt.prompt, /in your own words/);
  assert.deepEqual(prompt.expectedEvidence.requiredConcepts, [
    "Beta blockers",
    "reduce myocardial oxygen demand",
    "lowering heart rate",
  ]);
});

test("an unknown relationship type survives even when its proposed family is unknown", () => {
  const object = read([{ ...STRUCTURE, family: "new_family", relationshipType: "load_shedding_equivalence" }]).objects[0]!;
  const { semanticRelations } = object;
  assert.equal(semanticRelations?.[0]?.relationshipType, "load_shedding_equivalence");
  assert.equal(semanticRelations?.[0]?.family, undefined);
});

test("two relations supported by one sentence remain distinct knowledge", () => {
  const second = {
    ...STRUCTURE,
    family: "classification",
    relationshipType: "member_of",
    roles: [
      { role: "member", text: "Beta blockers" },
      { role: "category", text: "blockers" },
    ],
  };
  const result = read([STRUCTURE, second]);
  assert.equal(result.objects.length, 2);
  assert.notEqual(result.objects[0]?.identityKey, result.objects[1]?.identityKey);
});

test("invented evidence, rewritten assertions, and unsupported roles are refused", () => {
  assert.equal(read([{ ...STRUCTURE, evidence: [{ assertion: PASSAGE, excerptId: "s9:e9" }] }]).refusals[0]?.reason, "unresolvable-excerpt");
  assert.equal(read([{ ...STRUCTURE, evidence: [{ assertion: "Beta blockers help the heart.", excerptId: "s1:e1" }] }]).refusals[0]?.reason, "assertion-not-verbatim");
  assert.equal(read([{ ...STRUCTURE, roles: [...STRUCTURE.roles, { role: "target", text: "blood pressure" }] }]).refusals[0]?.reason, "ungrounded-role");
});

test("a duplicated relation is kept once, and a causal-only envelope is valid", () => {
  const duplicate = read([STRUCTURE, STRUCTURE]);
  assert.equal(duplicate.objects.length, 1);
  assert.equal(duplicate.refusals[0]?.reason, "duplicate");

  const causalOnly = parseSemanticTerritory({ model: "m", sources: SOURCES, text: JSON.stringify({ relations: [] }) });
  assert.deepEqual(causalOnly, { objects: [], refusals: [] });
});

test("an explicitly procedural relation becomes ordered steps rather than generic prose", () => {
  const first = "Filing a motion: Serve the opposing party.";
  const second = "Then file proof of service.";
  const sources: CanvasSource[] = [{
    ...SOURCES[0]!,
    excerpts: [
      { id: "s1:e1", label: "Procedure", text: first, unitId: "u1" },
      { id: "s1:e2", label: "Procedure", text: second, unitId: "u2" },
    ],
  }];
  const result = read([{
    evidence: [
      { assertion: first, excerptId: "s1:e1" },
      { assertion: second, excerptId: "s1:e2" },
    ],
    family: "procedural_algorithmic",
    relationshipType: "ordered_steps",
    roles: [
      { role: "goal", text: "Filing a motion" },
      { order: 1, role: "step", text: "Serve the opposing party" },
      { order: 2, role: "step", text: "file proof of service" },
    ],
  }], sources);
  assert.deepEqual(result.refusals, []);
  assert.equal(result.objects[0]?.type, "procedure");
  assert.deepEqual(result.objects[0]?.steps?.map((step) => [step.text, step.unitId]), [
    ["Serve the opposing party", "u1"],
    ["file proof of service", "u2"],
  ]);
  assert.deepEqual(objectivesForKnowledge(result.objects[0]!).map((objective) => objective.capability), ["sequence", "sequence"]);
});
