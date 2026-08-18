// The worked-example lane: what it builds, what it refuses, and what it must never write.
//
// 🔴 THE ONE PROPERTY WORTH MORE THAN THE REST: a worked example shows the answer on purpose, and
// that is only safe because it produces no evidence. The last test in this file is the one that
// would go red if anybody ever gave the action a prompt to answer or a row to write.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ASSAY,
  BEARING,
  LIMITATION,
  OHM,
  PHARMACOKINETICS,
  PLEADING,
  association,
  classification,
  resolved,
} from "./__fixtures__/three-disciplines";
import { NO_EXPOSITION } from "./cognitive-mode";
import { performanceOf, type TeachingAction } from "./teaching-policy";
import { workedExampleAvailable, workedExampleFor } from "./worked-example";

test("🔴 an ordered procedure is modelled start to finish, in any discipline", () => {
  // The same builder, three unrelated fields. If it had learned a vocabulary the three would not
  // produce the same SHAPE, and one of these would come back a refusal.
  for (const material of [ASSAY, PLEADING, BEARING]) {
    const built = workedExampleFor(resolved(material));
    const modelled = built.modelled;
    assert.ok(modelled, `${material.id} produced no demonstration`);
    assert.equal(modelled.from, "procedure_steps");
    assert.deepEqual(
      modelled.steps,
      material.steps!.map((step) => step.text),
      "the demonstration must be the source's own steps, in the source's own order",
    );
    // 🔴 THE LEAD NAMES WHAT IS BEING WORKED, so a learner meeting it mid-session knows what they are
    // reading rather than a bare numbered list.
    assert.ok(modelled.lead.includes(material.statement));
  }
});

test("🔴 a causal relation is modelled as the moves, not restated as the claim", () => {
  // 🔴 THE DISTINCTION FROM `teach` MADE CHECKABLE. `teach` prints the claim; this prints how you get
  // there. A demonstration that were merely the assertion again would have one step, and it would be
  // the source sentence — which is exactly what this asserts is NOT the case.
  for (const material of [PHARMACOKINETICS, LIMITATION, OHM]) {
    const modelled = workedExampleFor(resolved(material)).modelled;
    assert.ok(modelled, `${material.id} produced no demonstration`);
    assert.equal(modelled.from, "causal_relation");
    assert.ok(modelled.steps.length >= 3, "a demonstration of one step is a restatement");
    assert.notDeepEqual(modelled.steps, [material.statement]);

    const relation = material.relation!;
    // Grounded at both ends: it starts from the condition and it quotes the source's own sentence.
    assert.ok(modelled.steps[0]!.includes(relation.cause.text), "the demonstration must start from the given condition");
    assert.ok(
      modelled.steps.some((step) => step.includes(relation.assertion)),
      "the source's own assertion must appear, so the reasoning traces to the material",
    );
    assert.ok(modelled.steps.some((step) => step.includes(relation.effect.text)));
  }
});

test("🔴 a class contrast is modelled as the decision, including what it is ruled against", () => {
  // Built from a wide grid in a field with no procedures and no causal edges at all, so the
  // classification branch cannot be riding on either of the two above.
  const material = classification({
    axis: "period",
    id: "art1",
    label: "Early Netherlandish",
    members: ["the Ghent Altarpiece"],
    siblings: [{ label: "Italian Quattrocento", members: ["the Brancacci Chapel"] }],
  });
  const entry = resolved(material);
  const modelled = workedExampleFor(entry).modelled;
  assert.ok(modelled);
  assert.equal(modelled.from, "class_contrast");
  assert.ok(modelled.steps.some((step) => step.includes("period")), "the axis the source sorts by must be stated");
  assert.ok(
    modelled.steps.some((step) => step.includes("Italian Quattrocento")),
    "a placement demonstration that never names what it is ruled against teaches no discrimination",
  );
  assert.ok(modelled.steps.some((step) => step.includes("Early Netherlandish")));
});

test("🔴 material with no process REFUSES rather than inventing one", () => {
  // 🔴🔴 THE INVARIANT THIS FILE EXISTS FOR MOST. A two-column glossary has two sides and nothing
  // between them; the only way to produce "steps" would be to write them, and a procedure Nemesis
  // authored and then taught as though the source had said it is a fabricated source claim.
  const glossary = resolved(association("g1", "escheat", "reversion of property to the state"));
  const built = workedExampleFor(glossary);
  assert.equal(built.modelled, undefined);
  assert.equal(built.refusal, "no-process-to-model");
  assert.equal(workedExampleAvailable(glossary), false);
});

test("🔴 a type that claims a structure it does not have refuses too, and says which", () => {
  // A `procedure` row whose steps never survived extraction. Distinguished from "this kind of
  // knowledge has no process" because they call for different fixes: one is a parser problem.
  const hollow = { ...ASSAY, steps: [] };
  const built = workedExampleFor({ knowledge: hollow, objective: resolved(ASSAY).objective });
  assert.equal(built.refusal, "structure-missing");
});

test("🔴🔴 a worked example asks the learner for nothing, so it can write nothing", () => {
  // 🔴 INVARIANTS 1 AND 2, HELD BY CONSTRUCTION RATHER THAN BY REMEMBERING. Viewing is not evidence
  // of mastery, and being shown a worked example is not either. Both hold for one reason: the action
  // mints no prompt, and every row in `learner_evidence` is written from a prompt. There is no
  // "worked example evidence" branch to get wrong because there is no evidence.
  //
  // 🔴 CALIBRATION: add `case "worked_example":` to the asking side of `performanceOf` and this test
  // reddens immediately — which is the exact edit that would let a demonstration mint a prompt id
  // and, one screen later, record a durable claim about someone who had only read something.
  const action: TeachingAction = {
    because: "the process is worth inspecting before another attempt",
    exposition: NO_EXPOSITION,
    objectiveId: "obj-1",
    type: "worked_example",
  };
  assert.equal(performanceOf(action), null);
});
