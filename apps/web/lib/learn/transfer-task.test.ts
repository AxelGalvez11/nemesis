// The transfer probe: a case the material never stated, an answer the material nonetheless
// determines, and a refusal wherever it does not.
//
// 🔴 THE TWO PROPERTIES THAT MAKE IT WORTH HAVING AT ALL:
//
//   1. It is genuinely surface-changed. The remembered answer is WRONG on a transfer probe, which is
//      the only way to tell someone who has the relationship from someone who has the sentence.
//   2. It is grounded. The reference answer is derived from the direction the source asserted, never
//      imagined — so the learner is never judged against a scenario Nemesis made up.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LIMITATION,
  OHM,
  PHARMACOKINETICS,
  association,
  causal,
  procedure,
  resolved,
} from "./__fixtures__/three-disciplines";
import { projectLearnerState, satisfies, type LearnerEvidence } from "./learner-evidence";
import { evidenceFromRow, evidenceRow } from "./learner-store";
import { evidenceForSubmission, judgementOf, transferPromptFor, UNSUPPORTED_RETRIEVAL } from "./objective-task";
import { relationIsInvertible, transferAvailable, transferTaskFor } from "./transfer-task";

const NOW = "2026-08-18T09:00:00.000Z";

test("🔴🔴 the transfer answer is NOT the answer the learner was taught", () => {
  // 🔴 THE ANTI-PARAPHRASE TEST, AND IT IS THE ONE THAT MATTERS. A "transfer" that reworded the same
  // question would have the same correct answer, and a learner reciting what they memorised would
  // pass it — which would make transfer evidence indistinguishable from ordinary recall while
  // claiming to be stronger. Three unrelated fields, three directions of relation.
  for (const material of [PHARMACOKINETICS, LIMITATION, OHM]) {
    const entry = resolved(material);
    const task = transferTaskFor({ knowledge: material }).task;
    assert.ok(task, `${material.id} produced no transfer`);
    assert.notEqual(task.expectedAnswer, entry.objective.answer);
    assert.equal(
      task.expectedAnswer.startsWith(entry.objective.answer),
      false,
      "the transfer answer must not merely extend the remembered one",
    );
    assert.equal(task.question, entry.objective.cue ? task.question : task.question);
    assert.notEqual(task.question, `What follows from ${entry.objective.cue}, and why?`);
    assert.equal(task.changed, "the direction of the condition");
  }
});

test("🔴 the changed case names a condition and never the consequence", () => {
  // 🔴 IF IT NAMED THE EFFECT, THE ROW WOULD BE A LIE. A transfer row records `independent` — nothing
  // about the answer on screen — and the effect IS half the answer. Printing it would make the
  // probe easier than the ordinary question while claiming to be harder.
  for (const material of [PHARMACOKINETICS, LIMITATION, OHM]) {
    const relation = material.relation!;
    const task = transferTaskFor({ knowledge: material }).task!;
    assert.ok(task.question.includes(relation.cause.text), "the changed condition must be stated");
    assert.equal(
      task.question.includes(relation.effect.text),
      false,
      `the consequence leaked into the question: ${task.question}`,
    );
    // The reference answer is grounded: it cites the relation the source actually asserted.
    assert.ok(task.expectedAnswer.includes(relation.effect.text));
    assert.ok(task.expectedAnswer.includes(relation.cause.text));
    assert.deepEqual(task.requiredConcepts, [relation.effect.text]);
  }
});

test("🔴 the inverted consequence follows the direction the source asserted", () => {
  // Each relation kind inverts differently, and every one of these is a claim the source's own
  // direction licenses. A single generic sentence for all five would be the fabrication.
  const increasing = transferTaskFor({ knowledge: PHARMACOKINETICS }).task!;
  assert.match(increasing.expectedAnswer, /lower/);
  const decreasing = transferTaskFor({ knowledge: OHM }).task!;
  assert.match(decreasing.expectedAnswer, /higher/);
  const preventing = transferTaskFor({ knowledge: LIMITATION }).task!;
  assert.match(preventing.expectedAnswer, /free to happen/);

  const enabling = causal({
    assertion: "A quorum enables the committee to pass a resolution.",
    cause: "a quorum",
    effect: "passing a resolution",
    id: "gov1",
    relation: "enables",
  });
  assert.match(transferTaskFor({ knowledge: enabling }).task!.expectedAnswer, /cannot happen/);
});

test("🔴🔴 a relation that does not survive inversion REFUSES rather than inventing an answer", () => {
  // 🔴 THE INVARIANT: Nemesis may not invent a case and then judge the learner against its own
  // invention. "Smoking causes cancer" does not license "not smoking prevents cancer", and a
  // contribution is by definition one of several — so both refuse, by name.
  const causes = causal({
    assertion: "Prolonged vibration causes fatigue cracking at the weld toe.",
    cause: "prolonged vibration",
    effect: "fatigue cracking at the weld toe",
    id: "eng2",
    relation: "causes",
  });
  assert.equal(transferTaskFor({ knowledge: causes }).refusal, "relation-not-invertible");
  assert.equal(relationIsInvertible("causes"), false);
  assert.equal(relationIsInvertible("contributes_to"), false);
  assert.equal(transferAvailable({ knowledge: causes }), false);

  // A hedged claim is not a direction the material stands behind either way.
  const hedged = causal({
    assertion: "Delay may increase the risk of the claim being struck out.",
    cause: "delay",
    effect: "the risk of the claim being struck out",
    id: "law2",
    qualifier: "may",
    qualifierKind: "epistemic",
    relation: "increases",
  });
  assert.equal(transferTaskFor({ knowledge: hedged }).refusal, "relation-hedged");

  const negated = causal({
    assertion: "Filing an acknowledgement does not extend the time for a defence.",
    cause: "filing an acknowledgement",
    effect: "the time for a defence",
    id: "law3",
    negated: true,
    relation: "increases",
  });
  assert.equal(transferTaskFor({ knowledge: negated }).refusal, "relation-hedged");
});

test("🔴 knowledge with no asserted direction has no invariant to carry, and says so", () => {
  assert.equal(
    transferTaskFor({ knowledge: association("g3", "laches", "unreasonable delay barring relief") }).refusal,
    "no-invariant-to-carry",
  );
  assert.equal(
    transferTaskFor({ knowledge: procedure("pr-x", "the calibration run", ["Zero the scale.", "Load the standard."]) })
      .refusal,
    "no-invariant-to-carry",
  );
});

test("🔴🔴 a transfer pass is unaided production, recorded as a different KIND of task", () => {
  const entry = resolved(OHM);
  const prompt = transferPromptFor(entry, "p-t1");
  assert.ok(prompt);
  // 🔴 THE RUNG IS `independent` AND THE FORM CARRIES THE REST. Nothing about the answer was on
  // screen, so no assistance may be claimed; what makes it different from an ordinary ask is the
  // CASE, and that is not a point on the assistance ladder.
  assert.equal(prompt.rung, "independent");
  assert.equal(prompt.form, "transfer");
  assert.equal(prompt.scaffoldingLevel, UNSUPPORTED_RETRIEVAL);
  assert.equal(prompt.given, undefined);
  // The judge already knows how to score this shape — `apply` has had an intent line since it was
  // written and nothing had ever emitted it.
  assert.equal(prompt.task, "apply");
  assert.equal(prompt.operation, entry.objective.capability);

  const rows = evidenceForSubmission({
    canvasId: "canvas-1",
    judgement: judgementOf([{ objectiveIdentityKey: entry.objective.identityKey, verdict: "understood" }]),
    occurredAt: NOW,
    prompt,
    responseText: "the current goes up, because more resistance is what pushed it down",
    teachingStrategy: "llm_teacher",
  });
  const readBack: LearnerEvidence = evidenceFromRow(
    { ...evidenceRow("user-1", rows[0]!), id: "e1" },
    entry.objective.identityKey,
  );
  assert.equal(readBack.taskForm, "transfer");
  assert.equal(readBack.scaffoldRung, "independent");

  const state = projectLearnerState(entry.objective.identityKey, [readBack]);
  assert.equal(satisfies(state, "independent"), true);
  // 🔴 AND IT IS STILL DISTINGUISHABLE FROM ORDINARY RETRIEVAL, which is the point of the second
  // field: the rung alone would make this row identical to a plain correct answer.
  assert.notEqual(readBack.taskForm, "direct");
});

test("🔴 a FAILED transfer does not erase evidence of the simpler competence", () => {
  const entry = resolved(PHARMACOKINETICS);
  const key = entry.objective.identityKey;
  const produced: LearnerEvidence = {
    demonstrationObtained: true,
    id: "e-direct",
    objectiveEvidence: "demonstrated",
    objectiveIdentityKey: key,
    occurredAt: "2026-08-17T09:00:00.000Z",
    scaffoldRung: "independent",
    taskForm: "direct",
    verdict: "understood",
  };
  const failedTransfer: LearnerEvidence = {
    demonstrationObtained: true,
    id: "e-transfer",
    objectiveEvidence: "contradicted",
    objectiveIdentityKey: key,
    occurredAt: NOW,
    scaffoldRung: "independent",
    taskForm: "transfer",
    verdict: "incorrect",
  };
  const state = projectLearnerState(key, [produced, failedTransfer]);
  // The CURRENT status honestly reflects the most recent attempt — they got the new case wrong.
  assert.equal(state.status, "incorrect");
  // 🔴 AND THE DEMONSTRATION THEY REALLY GAVE IS STILL THERE. `demonstratedAt` is the highest rung
  // EVER reached, not the latest one, which is what stops one hard question from deleting a history.
  assert.equal(state.demonstratedAt, "independent");
  assert.equal(state.demonstrationCount, 2);
  assert.equal(satisfies(state, "independent"), true);
});
