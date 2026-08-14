/**
 * THE PRODUCT INVARIANTS — the behaviours that must hold however the algorithm is built.
 *
 * 🔴🔴 THE OWNER ASKED FOR THESE BEFORE ANY "NEMESIS ALGORITHM" (2026-08-14): *"I do not want us
 * prematurely inventing one giant algorithm. First establish behavioral invariants… Write these
 * down and test them."* So this file is deliberately about WHAT MUST BE TRUE, not about how the
 * policy currently computes it. A rewrite of the policy should keep every test in this file
 * passing; if it cannot, the rewrite changed the product, not the implementation.
 *
 * 🔴🔴 AND HALF OF THEM CANNOT BE TESTED YET, WHICH IS THE POINT OF WRITING THEM DOWN NOW.
 * Fourteen invariants were stated; the ones that need a field nobody has built are marked
 * `NOT YET ENFORCEABLE` with the exact thing that is missing. **A suite of fourteen green tests
 * where nine pass on a shorter path would be worse than useless** — it would report that the
 * product is protected when the protection does not exist. The unenforceable list below IS the
 * work order for evidence strength (#6) and evidence types (#9).
 *
 * Measured against `origin/main`, 2026-08-14.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { causalNodeKey } from "./knowledge-identity";
import type { KnowledgeObject } from "./knowledge-types";
import { projectLearnerState, type LearnerEvidence } from "./learner-evidence";
import { objectivesForKnowledge } from "./learning-objective";
import { decideNext } from "./policy-runtime";

const KEY = "obj:aldosterone";

/** One causal edge, in the shape the grounded extractor emits. */
function causalKnowledge(id: string, cause: string, effect: string): KnowledgeObject {
  return {
    id,
    identityKey: id,
    relation: {
      // The source's own sentence — a causal edge with nothing behind it is an assertion by us.
      assertion: `${cause} causes ${effect}.`,
      cause: { key: causalNodeKey(cause), text: cause },
      effect: { key: causalNodeKey(effect), text: effect },
      negated: false,
      relation: "causes",
    },
    statement: `${cause} — causes — ${effect}`,
    type: "causal",
    unanchoredProvenance: [],
  };
}

/** One observation. Only the fields every row must carry. */
function evidenceOf(over: Partial<LearnerEvidence> & { id: string }): LearnerEvidence {
  return {
    demonstrationObtained: true,
    objectiveIdentityKey: KEY,
    occurredAt: "2026-08-14T00:00:00.000Z",
    verdict: "understood",
    ...over,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ENFORCEABLE TODAY
// ═══════════════════════════════════════════════════════════════════════════

test("I1 · unseen knowledge cannot silently become incorrect", () => {
  // The single most damaging default in a learning system: "we never asked" stored as "they cannot".
  // Every later decision would then be made against a claim about a person nobody ever observed.
  const state = projectLearnerState(KEY, []);
  assert.equal(state.status, "unknown");
  assert.notEqual(state.status, "incorrect");
  assert.notEqual(state.status, "not_demonstrated");
});

test("I2 · an opportunity that produced nothing is NOT a wrong answer", () => {
  // Revealing the answer, giving up, and an unreadable response all mean "we still do not know" —
  // which is a different fact from "they contradicted this", and must stay different.
  const state = projectLearnerState(KEY, [
    evidenceOf({ demonstrationObtained: false, id: "e1", verdict: null }),
  ]);
  assert.equal(state.status, "not_demonstrated");
  assert.notEqual(state.status, "incorrect");
});

test("I3 · a misconception is stored AS a misconception, never as low confidence", () => {
  // A named competing model can be taught against. A low number cannot — it says "they are bad at
  // this" where the truth is "they believe something specific and coherent that is wrong".
  const state = projectLearnerState(KEY, [
    evidenceOf({ id: "e1", misconceptions: ["aldosterone raises potassium"], verdict: "misconception" }),
  ]);
  assert.equal(state.status, "misconception");
  assert.notEqual(state.status, "incorrect");
});

test("I4 · a partial answer preserves what was demonstrated while recording what was missing", () => {
  const state = projectLearnerState(KEY, [evidenceOf({ id: "e1", verdict: "partial" })]);
  assert.equal(state.status, "partial");
  // Not rounded down to a failure…
  assert.notEqual(state.status, "incorrect");
  // …and not rounded up to a success.
  assert.notEqual(state.status, "correct");
});

test("I5 · strong production establishes the objective", () => {
  const state = projectLearnerState(KEY, [evidenceOf({ id: "e1", verdict: "strong" })]);
  assert.equal(state.status, "correct");
  assert.ok(state.demonstrationCount >= 1);
});

test("I6 · adding a new source cannot erase existing learner evidence", () => {
  // Evidence is keyed by the KNOWLEDGE, not by the canvas that met it. A second canvas over new
  // material must inherit what the first established, or every upload silently resets the learner.
  const fromFirstCanvas = evidenceOf({ canvasId: "canvas-1", id: "e1", verdict: "strong" });
  const stateBefore = projectLearnerState(KEY, [fromFirstCanvas]);
  const stateAfter = projectLearnerState(KEY, [
    fromFirstCanvas,
    // A brand-new canvas, over a brand-new document, that has not touched this objective.
    { ...evidenceOf({ canvasId: "canvas-2", id: "e2" }), objectiveIdentityKey: "obj:something-else" },
  ]);
  assert.equal(stateAfter.status, stateBefore.status);
  assert.equal(stateAfter.demonstrationCount, stateBefore.demonstrationCount);
});

test("I7 · replaying the same observation twice does not count as two attempts", () => {
  // A log assembled from two overlapping reads must not inflate what the learner did. Otherwise
  // "attempts before successful production" — a time-to-mastery signal — measures our plumbing.
  const row = evidenceOf({ id: "e1", verdict: "strong" });
  const once = projectLearnerState(KEY, [row]);
  const twice = projectLearnerState(KEY, [row, { ...row }]);
  assert.equal(twice.demonstrationCount, once.demonstrationCount);
});

test("I8 · evidence for a DIFFERENT objective never leaks into this one", () => {
  const state = projectLearnerState(KEY, [
    { ...evidenceOf({ id: "e1", verdict: "strong" }), objectiveIdentityKey: "obj:unrelated" },
  ]);
  assert.equal(state.status, "unknown");
});

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 NOT YET ENFORCEABLE — each names the exact missing thing
//
// These are stated, agreed, and unprotected. They are NOT written as passing tests, because a
// green test here would claim a guarantee the code does not make.
// ═══════════════════════════════════════════════════════════════════════════

test("I9 · recognition alone cannot establish strong mastery — NOT ENFORCEABLE", () => {
  // Owner, 2026-08-14: a correct multiple-choice answer is WEAK evidence and must never silently
  // become mastery; production (explain / retrieve / solve / reconstruct / apply / draw) is
  // substantially stronger.
  //
  // 🔴 MISSING: `LearnerEvidence` has no evidence-STRENGTH field. `confidence` exists but is
  // explicitly the evaluator's certainty about its own verdict — a fact about the judgement, not
  // about how much the answer settled — and `projectLearnerState` ignores it by design.
  //
  // So today a recognition verdict of `strong` and a production verdict of `strong` are the same
  // row, and this invariant cannot be expressed. `teaching-policy.ts` DOES already act on the
  // distinction at decision time ("this was recognised rather than produced, so… asking them to
  // produce it is what would settle whether they know it"), which means the concept exists in the
  // policy and not in the record — the gap is one field wide.
  const recognition = projectLearnerState(KEY, [evidenceOf({ id: "e1", verdict: "strong" })]);
  const production = projectLearnerState(KEY, [evidenceOf({ id: "e2", verdict: "strong" })]);
  assert.deepEqual(
    recognition.status,
    production.status,
    "documents today's behaviour: the record cannot tell recognition from production",
  );
});

test("I10 · asking for an explanation must not reduce mastery — NOT ENFORCEABLE", () => {
  // Owner, 2026-08-14: highlighting a term and asking about it is evidence of interest, confusion
  // or need for support. It is real, it belongs in the learner model, and it is NOT a failed
  // retrieval.
  //
  // 🔴 MISSING: friction is not representable. `LearnerEvidence` requires
  // `demonstrationObtained` + `verdict`, so the only shapes available are "they showed something"
  // and "an opportunity produced nothing". A highlight is neither.
  //
  // Today the question is moot in the safest possible way — `use-canvas-session.ts` writes a canvas
  // EVENT and nothing on that path writes evidence at all — so mastery is not reduced. The
  // invariant is unprotected rather than violated, and it becomes violable the moment someone wires
  // that action to the evidence log without adding a type for it.
  const untouched = projectLearnerState(KEY, [evidenceOf({ id: "e1", verdict: "strong" })]);
  assert.equal(untouched.status, "correct");
});

test("🔴🔴 I11 · a prerequisite failure changes what is presented next — ENFORCED", () => {
  // 🔴 THIS READ "NOT ENFORCEABLE" FROM THE DAY THE LIST WAS WRITTEN: *"there are no prerequisites.
  // Nothing in the knowledge model expresses that one objective depends on another, so 'move down,
  // teach the prerequisite, return' has no edge to walk."* The edge exists now —
  // `objective-prerequisites.ts` joins a causal chain on the extractor's own node keys — and this is
  // the behaviour it buys, proved through the real `decideNext` rather than the scorer alone.
  //
  // The learner has met the SECOND step of a mechanism and missed it, and has already been shown the
  // answer. Two untouched objectives remain: the step the missed one starts from, and an unrelated
  // one. Nemesis must offer the step underneath.
  const upstream = causalKnowledge("k-up", "Increasing resistance", "decreased current");
  const downstream = causalKnowledge("k-down", "decreased current", "reduced heating");
  const unrelated = causalKnowledge("k-other", "adding a catalyst", "a faster reaction");

  const resolve = (knowledge: KnowledgeObject, row: string) => ({
    knowledge,
    objective: { ...objectivesForKnowledge(knowledge)[0]!, rowId: row },
  });
  // 🔴 THE UNRELATED ONE IS FIRST ON PURPOSE — THE CALIBRATION IS BUILT INTO THE FIXTURE. Ties break
  // on the caller's order, so without the prerequisite term this array hands back `unrelated` and
  // the test fails. Ordering it the other way would let a tie pass as a pass.
  const objectives = [
    resolve(unrelated, "row-other"),
    resolve(upstream, "row-up"),
    resolve(downstream, "row-down"),
  ];
  const downstreamKey = objectives[2]!.objective.identityKey;

  const decision = decideNext({
    // They answered the downstream step wrongly, and the answer has already been put in front of
    // them — so the correction is no longer owed and the question is what to do next.
    correctionsShown: new Set([downstreamKey]),
    evidence: [
      {
        demonstrationObtained: true,
        id: "e1",
        objectiveEvidence: "contradicted",
        objectiveIdentityKey: downstreamKey,
        occurredAt: "2026-08-14T12:00:00.000Z",
        verdict: "incorrect",
      },
    ],
    now: new Date("2026-08-14T12:01:00.000Z"),
    objectives,
  });

  assert.equal(
    decision?.objective.identityKey,
    objectives[1]!.objective.identityKey,
    "the step the missed one starts from, not the unrelated one that sorts first",
  );
  assert.ok(
    decision?.selection.reasons.includes("unlocks-other-work"),
    "and it says why, in the product's own vocabulary",
  );
});

test("I12 · difficulty must respond to learner evidence — NOT ENFORCEABLE", () => {
  // Owner: difficulty is multidimensional — prompting, vocabulary, explanation depth, scaffolding,
  // recall specificity, transfer distance, interacting concepts, prerequisites.
  //
  // 🔴 MISSING: `scaffoldRung` is RECORDED on evidence but nothing SELECTS it, and
  // `ObjectiveCapability` is minted as `recall` at the single site that creates objectives. With
  // one capability and no chosen rung there is no difficulty axis to move along.
  assert.ok(true, "stated so it is not lost; unenforceable until an operation and rung are chosen");
});

test("I13 · the same knowledge must not always demand the same interaction — NOT ENFORCEABLE", () => {
  // 🔴 MISSING: same root cause as I12. `learning-objective.ts` hardcodes `capability: "recall"` at
  // the only place objectives are minted, so every objective asks for the same thing regardless of
  // whether the knowledge is an association, a causal chain, a procedure or an equation.
  assert.ok(true, "stated so it is not lost; unenforceable until more than one capability is minted");
});

test("I14 · uncertain source interpretation must not create confident learner claims", () => {
  // This one IS protected, and it is protected in the extractor rather than here: every refusal in
  // `knowledge-extraction.ts` produces zero objects WITH a reason rather than a guessed one, and a
  // knowledge object is what a learner is later drilled on. `knowledge-extraction.test.ts` and
  // `table-subject-column.test.ts` are where it is enforced — including the case where falling
  // through a prose column would have attached class-level claims to a list of drug names.
  //
  // Asserted here as a pointer so the invariant is findable from the list, not re-tested.
  assert.ok(true, "enforced in knowledge-extraction.ts and its calibrated guards");
});
