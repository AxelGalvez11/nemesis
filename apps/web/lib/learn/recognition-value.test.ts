// When options are the right ask, and what a correct pick actually establishes.
//
// 🔴 THE ONE PROPERTY EVERY OTHER ASSERTION SERVES: no number of recognitions becomes a production.
// It is checked from three directions on purpose — through the folded type, through the runtime's own
// `satisfies` gate, and through the refusal that stops a second cheap ask — because the failure this
// guards against is invisible. A learner credited with knowing something they only ever picked out is
// then skipped by scheduling, and nothing anywhere reports it.

import assert from "node:assert/strict";
import { test } from "node:test";

import { isRefusal, optionsFor, type ChoiceCandidate, type ChoiceSet } from "./choice-set";
import { projectLearnerState, satisfies, type LearnerEvidence } from "./learner-evidence";
import {
  convergingAcrossForms,
  establishesMastery,
  masteryEvidenceIn,
  recognitionPreferred,
  RECOGNITION_AFTER_UNRESOLVED,
} from "./recognition-value";

const AT = "2026-08-16T10:00:00.000Z";

function row(over: Partial<LearnerEvidence> & { id: string }): LearnerEvidence {
  return {
    demonstrationObtained: true,
    misconceptions: [],
    objectiveIdentityKey: "obj-1",
    occurredAt: AT,
    verdict: "understood",
    ...over,
  };
}

/** An attempt that produced nothing usable — what a miss looks like in the log. */
function missed(id: string): LearnerEvidence {
  return row({ demonstrationObtained: false, id, objectiveEvidence: "nothing_produced", verdict: null });
}

function setOf(over: Partial<ChoiceCandidate> = {}): ChoiceSet {
  const result = optionsFor({
    answer: "the answer",
    heldMisconceptions: [],
    identityKey: "obj-1",
    neighbouringClasses: [],
    prompt: "a question",
    siblingAnswers: [],
    ...over,
  });
  assert.ok(!isRefusal(result), `expected a set, got ${String(result)}`);
  return result;
}

const NEAR = setOf({ heldMisconceptions: ["a belief"], neighbouringClasses: ["a neighbour"] });
const LOOSE = setOf({ siblingAnswers: ["one", "two", "three"] });

// ── the asymmetry, from three directions ─────────────────────────────────────

test("🔴🔴 one correct recognition does NOT establish mastery", () => {
  const evidence = [row({ id: "e1", scaffoldRung: "recognition" })];
  const mastery = masteryEvidenceIn(evidence);
  assert.equal(mastery.kind, "recognised");
  assert.equal(establishesMastery(mastery), false);
});

test("🔴🔴 no number of correct recognitions, in any number of forms, becomes a production", () => {
  // The whole reason this is a union rather than a confidence float: addition cannot tell the two
  // apart, so three recognitions would eventually outweigh one production and the learner would be
  // skipped past material they have never produced.
  const evidence = [
    row({ id: "e1", operation: "recall", scaffoldRung: "recognition" }),
    row({ id: "e2", operation: "discriminate", scaffoldRung: "recognition" }),
    row({ id: "e3", operation: "explain", scaffoldRung: "recognition" }),
    row({ id: "e4", operation: "predict", scaffoldRung: "recognition" }),
  ];
  const mastery = masteryEvidenceIn(evidence);
  assert.equal(mastery.kind, "recognised");
  assert.equal(establishesMastery(mastery), false);
  // Confidence, however, genuinely did move — which is the other half of the owner's sentence.
  assert.equal(convergingAcrossForms(mastery), true);
});

test("🔴 one independent production DOES establish mastery, and a later recognition cannot undo it", () => {
  const evidence = [
    row({ id: "e1", scaffoldRung: "independent" }),
    row({ id: "e2", scaffoldRung: "recognition" }),
  ];
  assert.equal(establishesMastery(masteryEvidenceIn(evidence)), true);
});

test("🔴 this reading and `satisfies(state, 'independent')` never disagree on the same log", () => {
  // Two readings of one truth that nothing compares are how they come to disagree. Swept across
  // every rung and both directions.
  const logs: LearnerEvidence[][] = [
    [],
    [row({ id: "a", scaffoldRung: "recognition" })],
    [row({ id: "b", scaffoldRung: "cued" })],
    [row({ id: "c", scaffoldRung: "narrowed" })],
    [row({ id: "d", scaffoldRung: "independent" })],
    [row({ id: "e", scaffoldRung: "independent", verdict: "partial" })],
    [row({ id: "f", scaffoldRung: "independent", verdict: "incorrect" })],
    [row({ id: "g", scaffoldRung: "recognition" }), row({ id: "h", scaffoldRung: "independent" })],
    [row({ id: "i" })],
  ];
  for (const log of logs) {
    const state = projectLearnerState("obj-1", log);
    assert.equal(
      establishesMastery(masteryEvidenceIn(log)),
      satisfies(state, "independent"),
      `disagreement on log [${log.map((entry) => `${entry.scaffoldRung ?? "none"}/${entry.verdict ?? "none"}`).join(", ")}]`,
    );
  }
});

test("🔴 an unaided WRONG answer is not a production, and neither is a partial one", () => {
  // The exact row that once made `satisfies(state, "independent")` true for a learner who had only
  // ever answered unaided and wrong.
  assert.equal(
    establishesMastery(masteryEvidenceIn([row({ id: "e1", scaffoldRung: "independent", verdict: "incorrect" })])),
    false,
  );
  assert.equal(
    establishesMastery(masteryEvidenceIn([row({ id: "e2", scaffoldRung: "independent", verdict: "partial" })])),
    false,
  );
});

test("no evidence is `none`, which is not a weak `recognised`", () => {
  const mastery = masteryEvidenceIn([]);
  assert.deepEqual(mastery, { kind: "none" });
  assert.equal(convergingAcrossForms(mastery), false);
});

test("🔴 a demonstration that recorded no operation contributes nothing rather than a default form", () => {
  // Legacy rows carry no operation. Counting one as some form would invent evidence nobody observed,
  // and the error would run in the over-claiming direction for once.
  const mastery = masteryEvidenceIn([
    row({ id: "e1", scaffoldRung: "recognition" }),
    row({ id: "e2", scaffoldRung: "recognition" }),
  ]);
  assert.equal(mastery.kind !== "none" && mastery.distinctOperations, 0);
  assert.equal(convergingAcrossForms(mastery), false);
});

test("🔴 the same form twice is repetition, not convergence", () => {
  const mastery = masteryEvidenceIn([
    row({ id: "e1", operation: "recall", scaffoldRung: "recognition" }),
    row({ id: "e2", operation: "recall", scaffoldRung: "recognition" }),
  ]);
  assert.equal(convergingAcrossForms(mastery), false);
});

// ── when options are the right ask ───────────────────────────────────────────

test("🔴 the FIRST ask is never options, however confusable the material is", () => {
  // "Prefer a task that reveals the learner over a question about them." A recognition item put first
  // hands the answer to someone who could have produced it, and the log records a weaker
  // demonstration than the learner was capable of.
  assert.deepEqual(recognitionPreferred({ choices: NEAR, evidence: [] }), {
    preferred: false,
    refusal: "production-not-yet-tried",
  });
});

test("🔴 one miss is not a pattern, and does not change the FORM of the question", () => {
  assert.deepEqual(recognitionPreferred({ choices: NEAR, evidence: [missed("e1")] }), {
    preferred: false,
    refusal: "production-not-yet-tried",
  });
});

test("🔴 unaided attempts unresolved more than once make options the better ask", () => {
  const decision = recognitionPreferred({ choices: NEAR, evidence: [missed("e1"), missed("e2")] });
  assert.equal(decision.preferred, true);
  assert.ok(decision.preferred && decision.reasons.includes("unaided-production-unresolved"));
  assert.ok(decision.preferred && decision.reasons.includes("competing-model-on-offer"));
  assert.ok(decision.preferred && decision.reasons.includes("source-declared-neighbours"));
});

test("the bar is the same trailing-run fold the scaffold ladder already uses", () => {
  // Two misses, then something that resolved, then one miss: the run is 1 and the form does not
  // change. A learner who failed twice in March must not be handed options in August.
  const evidence = [
    missed("e1"),
    missed("e2"),
    row({ id: "e3", scaffoldRung: "independent" }),
    missed("e4"),
  ];
  assert.equal(recognitionPreferred({ choices: NEAR, evidence }).preferred, false);
  assert.equal(RECOGNITION_AFTER_UNRESOLVED, 2);
});

test("🔴🔴 a set the learner could solve by elimination is REFUSED", () => {
  // The refusal that keeps this from becoming a quiz. Loose options measure elimination, and a
  // correct tap on them would be filed as a demonstration of the objective.
  assert.deepEqual(recognitionPreferred({ choices: LOOSE, evidence: [missed("e1"), missed("e2")] }), {
    preferred: false,
    refusal: "nothing-to-discriminate",
  });
});

test("no honest set of options means no recognition, stated rather than silently skipped", () => {
  assert.deepEqual(recognitionPreferred({ choices: null, evidence: [missed("e1"), missed("e2")] }), {
    preferred: false,
    refusal: "no-choice-set",
  });
});

test("🔴🔴 after a recognition-only pass, PRODUCTION is owed and another cheap ask is refused", () => {
  // The owner's "do not mechanically ask why after every correct pick" from the other side: what is
  // owed is the harder form, and this refusal is what stops the easy one being offered again.
  const evidence = [missed("e1"), missed("e2"), row({ id: "e3", operation: "recall", scaffoldRung: "recognition" })];
  assert.deepEqual(recognitionPreferred({ choices: NEAR, evidence }), {
    preferred: false,
    refusal: "production-owed",
  });
});

test("🔴 picks that converged across DIFFERENT forms lift the refusal, and still are not mastery", () => {
  const evidence = [
    missed("e1"),
    missed("e2"),
    row({ id: "e3", operation: "recall", scaffoldRung: "recognition" }),
    row({ id: "e4", operation: "discriminate", scaffoldRung: "recognition" }),
    missed("e5"),
    missed("e6"),
  ];
  assert.equal(recognitionPreferred({ choices: NEAR, evidence }).preferred, true);
  // The line the owner drew: confidence moved, mastery did not.
  assert.equal(establishesMastery(masteryEvidenceIn(evidence)), false);
});

test("🔴 a learner with production on record may meet options again", () => {
  const evidence = [
    row({ id: "e1", operation: "recall", scaffoldRung: "independent" }),
    missed("e2"),
    missed("e3"),
  ];
  assert.equal(recognitionPreferred({ choices: NEAR, evidence }).preferred, true);
});
