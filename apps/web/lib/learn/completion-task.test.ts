// The faded worked example: what is supplied, what is withheld, and what the row is allowed to claim.
//
// 🔴 THE ORDERING THIS FILE DEFENDS, END TO END:
//
//     worked example  <  completion  <  independent production
//
// The first gap is held by there being no row at all (see worked-example.test.ts). The second is
// held here, and it is held at the point it can actually fail: a stored row, read back, projected
// into learner state, asked whether it establishes unaided production.

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
import { MISSING_MARKER, completionAvailable, completionTaskFor } from "./completion-task";
import { projectLearnerState, satisfies, type LearnerEvidence } from "./learner-evidence";
import { evidenceFromRow, evidenceRow } from "./learner-store";
import { completionPromptFor, evidenceForSubmission, judgementOf, SOLUTION_PART_ON_SCREEN } from "./objective-task";
import { entails } from "./scaffold-rung";

const NOW = "2026-08-18T09:00:00.000Z";

test("🔴 a procedure is faded by blanking ONE step and showing the rest, in any discipline", () => {
  for (const material of [ASSAY, PLEADING, BEARING]) {
    const steps = material.steps!;
    // The third step of each — a middle one, so both a leading and a trailing context exist.
    const entry = resolved(material, 2);
    const built = completionTaskFor(entry);
    const task = built.task;
    assert.ok(task, `${material.id} produced no completion`);
    assert.equal(task.from, "procedure_steps");
    assert.equal(task.given.length, steps.length, "the whole solution must be on screen, with a hole in it");
    assert.equal(task.given[2], MISSING_MARKER, "the withheld step is the one the objective is about");
    assert.equal(task.given[0], steps[0]!.text);
    assert.equal(task.given[3], steps[3]!.text, "the steps AFTER the gap are shown too — that is the fade");
    assert.equal(task.expectedAnswer, steps[2]!.text);
    // 🔴 THE ANSWER IS NOT ALSO IN THE GIVEN. A completion that printed the missing step somewhere
    // else on the page would be a `taught` screen recorded as a production.
    assert.equal(task.given.includes(steps[2]!.text), false);
    assert.equal(task.question.includes(steps[2]!.text), false);
  }
});

test("🔴 a causal relation is faded by giving the DIRECTION and withholding the target", () => {
  for (const material of [PHARMACOKINETICS, LIMITATION, OHM]) {
    const relation = material.relation!;
    const task = completionTaskFor(resolved(material)).task;
    assert.ok(task, `${material.id} produced no completion`);
    assert.equal(task.from, "causal_relation");
    assert.ok(task.given.some((line) => line.includes(relation.cause.text)));
    assert.equal(task.expectedAnswer.includes(relation.effect.text), true);
    // 🔴 THE WITHHELD HALF IS NOWHERE ON THE SCREEN — not in the supplied lines, not in the question,
    // and specifically not in the source's assertion, which states the whole thing and must
    // therefore never be one of the given lines.
    for (const line of [...task.given, task.question]) {
      assert.equal(line.includes(relation.effect.text), false, `the answer leaked into: ${line}`);
      assert.equal(line.includes(relation.assertion), false, "the source sentence contains the answer");
    }
  }
});

test("🔴 material with no part to withhold REFUSES, and says which kind of nothing it is", () => {
  // An association's answer is one thing; there is no part of it that is not the whole.
  const glossary = resolved(association("g2", "usufruct", "a right to use another's property"));
  assert.equal(completionTaskFor(glossary).refusal, "nothing-to-part-supply");
  assert.equal(completionAvailable(glossary), false);

  // Neither has a class contrast: naming the neighbours it is ruled against narrows straight to the
  // label, which is giving the answer rather than fading it.
  const grid = classification({
    axis: "era",
    id: "geo1",
    label: "Cretaceous",
    members: ["chalk"],
    siblings: [{ label: "Jurassic", members: ["oolite"] }],
  });
  assert.equal(completionTaskFor(resolved(grid)).refusal, "nothing-to-part-supply");

  // 🔴 AND A ONE-STEP RUN IS ITS OWN REFUSAL. Blanking the only step leaves the bare question with a
  // rule above it — the `independent` rung wearing a costume, recorded as though help had been given.
  const single = { ...ASSAY, statement: "the single move", steps: ASSAY.steps!.slice(0, 1) };
  assert.equal(
    completionTaskFor({ knowledge: single, objective: resolved(ASSAY).objective }).refusal,
    "no-part-to-withhold",
  );
});

test("🔴 the prompt records the assistance it put on screen, at mint time", () => {
  const entry = resolved(BEARING, 1);
  const prompt = completionPromptFor(entry, "p-1");
  assert.ok(prompt);
  assert.equal(prompt.rung, "completion");
  assert.equal(prompt.form, "completion");
  assert.equal(prompt.scaffoldingLevel, SOLUTION_PART_ON_SCREEN);
  assert.ok(prompt.given && prompt.given.length > 1, "the supplied part must travel with the prompt");
});

test("🔴🔴 a completion pass is a real demonstration that CANNOT satisfy unaided production", () => {
  // The whole round trip, because that is where a rung dies: prompt → row → database shape → read
  // back → projection → the question the policy actually asks.
  const entry = resolved(PHARMACOKINETICS);
  const prompt = completionPromptFor(entry, "p-2")!;
  const rows = evidenceForSubmission({
    canvasId: "canvas-1",
    judgement: judgementOf([
      { objectiveIdentityKey: entry.objective.identityKey, verdict: "understood" },
    ]),
    occurredAt: NOW,
    prompt,
    responseText: "steady-state plasma concentration",
    teachingStrategy: "llm_teacher",
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.scaffoldRung, "completion");
  assert.equal(rows[0]!.taskForm, "completion");

  const stored = evidenceRow("user-1", rows[0]!);
  assert.equal(stored.scaffold_rung, "completion");
  assert.equal(stored.task_form, "completion");
  const readBack: LearnerEvidence = evidenceFromRow(
    { ...stored, id: "e1" },
    entry.objective.identityKey,
  );
  assert.equal(readBack.scaffoldRung, "completion");
  assert.equal(readBack.taskForm, "completion");

  const state = projectLearnerState(entry.objective.identityKey, [readBack]);
  // It IS a demonstration — the learner produced the missing piece and the record says so.
  assert.equal(state.status, "correct");
  assert.equal(state.demonstrationCount, 1);
  assert.equal(state.demonstratedAt, "completion");
  // 🔴 AND IT IS NOT UNAIDED PRODUCTION. This is the assertion the whole rung exists for: the policy
  // asks exactly this question to decide whether a pass still owes a probe.
  //
  // 🔴 CALIBRATION: move `"completion"` above `"independent"` in `scaffold-rung.ts`'s LADDER and
  // this line reddens on its own, while the two above stay green.
  assert.equal(satisfies(state, "independent"), false, "a partly supplied solution never establishes unaided production");
  assert.equal(satisfies(state, "recognition"), true, "producing the missing piece does establish picking it out");
});

test("🔴 stronger assistance cannot masquerade as weaker, in either direction", () => {
  // The ordering, stated once, on the function every consumer goes through.
  assert.equal(entails("independent", "completion"), true);
  assert.equal(entails("completion", "independent"), false);
  assert.equal(entails("completion", "recognition"), true);
  assert.equal(entails("recognition", "completion"), false);
  assert.equal(entails("completion", "taught"), true);
  // Below `cued`, deliberately: a partly worked solution supplies more of the surrounding structure
  // than a first letter supplies of a word, and where the ranking is genuinely arguable the ladder's
  // standing asymmetry picks the side that under-credits.
  assert.equal(entails("cued", "completion"), true);
  assert.equal(entails("completion", "cued"), false);
});
