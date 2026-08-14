import assert from "node:assert/strict";
import { test } from "node:test";

import type { LearnerEvidence } from "./learner-evidence";
import { compareStrategies, RETENTION_DELAY_MS, summariseStrategy } from "./strategy-outcomes";
import type { TeachingStrategyId } from "./teaching-strategy";

// CAN THE COMPARISON ACTUALLY BE COMPUTED? — which is a different question from "was it recorded".
//
// 🔴 THE FAILURE THESE GUARD AGAINST IS AN EXPERIMENT THAT RAN AND CANNOT BE READ. Every metric here
// is derived from `learner_evidence` rows on every call, so the way it breaks is not an exception:
// it is a number that comes out plausible and means something other than what it is labelled. A
// `0` where nothing was measured, a mean over a bimodal population, a rate whose denominator is the
// wrong set — each of those looks exactly like a finding.

const HOUR = 60 * 60 * 1000;
const START = Date.parse("2026-08-14T09:00:00.000Z");

function at(offsetMs: number): string {
  return new Date(START + offsetMs).toISOString();
}

let nextId = 0;
function row(over: Partial<LearnerEvidence> & { teachingStrategy: TeachingStrategyId }): LearnerEvidence {
  nextId += 1;
  return {
    canvasId: "canvas-1",
    demonstrationObtained: true,
    id: `e${nextId}`,
    objectiveIdentityKey: "obj-1",
    occurredAt: at(0),
    operation: "recall",
    responseId: `resp-${nextId}`,
    scaffoldingLevel: 0,
    verdict: "understood",
    ...over,
  };
}

test("🔴 time to mastery is measured from FIRST evidence to FIRST demonstration", () => {
  const summary = summariseStrategy("nemesis_policy", [
    row({ objectiveEvidence: "contradicted", occurredAt: at(0), teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
    row({ objectiveEvidence: "contradicted", occurredAt: at(HOUR), teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
    row({ objectiveEvidence: "demonstrated", occurredAt: at(2 * HOUR), teachingStrategy: "nemesis_policy" }),
    // 🔴 A SECOND DEMONSTRATION MUST NOT RESTART OR EXTEND THE CLOCK. Mastery is reached once;
    // counting the latest one would make an arm that keeps reviewing look slower at teaching.
    row({ objectiveEvidence: "demonstrated", occurredAt: at(9 * HOUR), teachingStrategy: "nemesis_policy" }),
  ]);
  assert.equal(summary.objectivesMastered, 1);
  assert.deepEqual(summary.timeToMasteryMs, [2 * HOUR]);
  assert.equal(summary.medianTimeToMasteryMs, 2 * HOUR);
});

test("🔴 the DISTRIBUTION is returned, not only a middle", () => {
  // This repo has already published a mean over a bimodal population and read it as a finding. The
  // median is reported, and so is every observation, so a reader can see the shape rather than a
  // number that describes nobody.
  const rows = [0, 1, 2].flatMap((n) => [
    row({
      objectiveEvidence: "not_addressed",
      objectiveIdentityKey: `obj-${n}`,
      occurredAt: at(0),
      teachingStrategy: "llm_teacher",
      verdict: null,
    }),
    row({
      objectiveEvidence: "demonstrated",
      objectiveIdentityKey: `obj-${n}`,
      occurredAt: at((n + 1) * HOUR),
      teachingStrategy: "llm_teacher",
    }),
  ]);
  const summary = summariseStrategy("llm_teacher", rows);
  assert.deepEqual(summary.timeToMasteryMs, [HOUR, 2 * HOUR, 3 * HOUR]);
  assert.equal(summary.medianTimeToMasteryMs, 2 * HOUR);
});

test("🔴 interactions counts PERFORMANCES, not rows", () => {
  // One answer covering three objectives is three rows and ONE interaction. Counting rows would
  // report an arm that asks broad questions as three times busier than one asking narrow ones —
  // an artefact of the knowledge shape, not of the teaching.
  const shared = "resp-shared";
  const summary = summariseStrategy("nemesis_policy", [
    row({ objectiveIdentityKey: "obj-a", responseId: shared, teachingStrategy: "nemesis_policy" }),
    row({ objectiveIdentityKey: "obj-b", responseId: shared, teachingStrategy: "nemesis_policy" }),
    row({ objectiveIdentityKey: "obj-c", responseId: shared, teachingStrategy: "nemesis_policy" }),
  ]);
  assert.equal(summary.interactions, 1);
  assert.equal(summary.objectivesTouched, 3);
});

test("🔴 a FIRST wrong answer is not a repeated error — the second one is", () => {
  // A first miss is the system finding out what the learner does not know, which is what it is for.
  // The interesting number is whether the teaching that followed it landed.
  const oneMiss = summariseStrategy("nemesis_policy", [
    row({ objectiveEvidence: "contradicted", teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
  ]);
  assert.equal(oneMiss.repeatedErrors, 0);

  const threeMisses = summariseStrategy("nemesis_policy", [
    row({ objectiveEvidence: "contradicted", occurredAt: at(0), teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
    row({ objectiveEvidence: "contradicted", occurredAt: at(HOUR), teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
    row({ objectiveEvidence: "contradicted", occurredAt: at(2 * HOUR), teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
  ]);
  assert.equal(threeMisses.repeatedErrors, 2);
});

test("🔴 asking again about something already demonstrated, inside the window, is counted", () => {
  // The outcome this experiment is most likely to separate the arms on. `decideNext` holds a
  // demonstrated objective behind an eligibility interval; the baseline has to decide for itself.
  const summary = summariseStrategy("llm_teacher", [
    row({ objectiveEvidence: "demonstrated", occurredAt: at(0), teachingStrategy: "llm_teacher" }),
    row({ objectiveEvidence: "demonstrated", occurredAt: at(HOUR), teachingStrategy: "llm_teacher" }),
    row({ objectiveEvidence: "demonstrated", occurredAt: at(2 * HOUR), teachingStrategy: "llm_teacher" }),
  ]);
  assert.equal(summary.askedAgainTooSoon, 2, "two retrievals after it was already established");
});

test("🔴 an objective asked repeatedly BEFORE it was ever demonstrated is not 'too soon'", () => {
  // 🔴 THE CALIBRATION THAT STOPS THIS METRIC BEING A REPEAT COUNTER. Coming back to something the
  // learner has NOT got yet is the product working — it is exactly the tempo §39 requires. If this
  // counted, the metric would punish the behaviour it exists to reward and the two arms would be
  // ranked backwards.
  const summary = summariseStrategy("nemesis_policy", [
    row({ objectiveEvidence: "contradicted", occurredAt: at(0), teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
    row({ objectiveEvidence: "contradicted", occurredAt: at(HOUR), teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
    row({ objectiveEvidence: "nothing_produced", occurredAt: at(2 * HOUR), teachingStrategy: "nemesis_policy", verdict: null }),
  ]);
  assert.equal(summary.askedAgainTooSoon, 0);
  assert.equal(summary.nothingProduced, 1);
});

test("🔴 retention and immediate performance split the SAME population into disjoint halves", () => {
  const summary = summariseStrategy("nemesis_policy", [
    row({ objectiveEvidence: "contradicted", occurredAt: at(0), teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
    // Same sitting: an easy win that says the answer is still in working memory.
    row({ objectiveEvidence: "demonstrated", occurredAt: at(HOUR), teachingStrategy: "nemesis_policy" }),
    // Next day: the one that says anything about durable knowledge.
    row({
      objectiveEvidence: "demonstrated",
      occurredAt: at(HOUR + RETENTION_DELAY_MS + 1),
      teachingStrategy: "nemesis_policy",
    }),
  ]);
  assert.equal(summary.immediatePostTestRate, 1, "one immediate opportunity, demonstrated");
  assert.equal(summary.delayedRetentionRate, 1, "one delayed opportunity, demonstrated");
});

test("🔴🔴 a pilot inside one afternoon reports delayed retention as ABSENT, never as zero", () => {
  // The defect this exists to prevent: a rate of 0 would say both arms failed at retention when
  // neither was measured on it, and the reader would draw a conclusion from a denominator of zero.
  const summary = summariseStrategy("llm_teacher", [
    row({ objectiveEvidence: "demonstrated", occurredAt: at(0), teachingStrategy: "llm_teacher" }),
    row({ objectiveEvidence: "demonstrated", occurredAt: at(HOUR), teachingStrategy: "llm_teacher" }),
  ]);
  assert.equal(summary.delayedRetentionRate, null);
  assert.notEqual(summary.delayedRetentionRate, 0, "🔴 absent and zero are opposite findings");
});

test("🔴🔴 transfer and scaffolding read ABSENT today, because this runtime cannot stage either", () => {
  // Both are structurally unmeasurable right now and that is a fact about the product, not about the
  // arms. `objectivesForKnowledge` mints one operation, and every prompt is staged at
  // `scaffoldingLevel: 0` / `independent`. Reported as `0` they would be IDENTICAL BETWEEN ARMS BY
  // CONSTRUCTION, which a reader would very reasonably mistake for "the two arms are the same on
  // this". They are not the same; they are unmeasured.
  const summary = summariseStrategy("nemesis_policy", [
    row({ objectiveEvidence: "demonstrated", occurredAt: at(0), teachingStrategy: "nemesis_policy" }),
    row({ objectiveEvidence: "demonstrated", occurredAt: at(HOUR), teachingStrategy: "nemesis_policy" }),
  ]);
  assert.equal(summary.transferDemonstrations, null, "one operation in the corpus means no transfer measurement");
  assert.equal(summary.meanScaffoldingLevel, null, "every observation at the floor is not 'equally scaffolded'");
});

test("🔴 transfer becomes measurable the day a second operation ships, without anyone rewriting it", () => {
  // Written now against the field that will carry it, so the meaning is fixed before there is any
  // pressure to define it in a way that flatters a result.
  const summary = summariseStrategy("nemesis_policy", [
    row({ objectiveEvidence: "demonstrated", occurredAt: at(0), operation: "recall", teachingStrategy: "nemesis_policy" }),
    row({ objectiveEvidence: "demonstrated", occurredAt: at(HOUR), operation: "predict", teachingStrategy: "nemesis_policy" }),
  ]);
  assert.equal(summary.transferDemonstrations, 1, "produced under a demand it had never been produced under");
});

test("🔴🔴 rows with no arm are EXCLUDED, never folded into the control", () => {
  // Absent means the row predates the strategy layer. Assigning those to `nemesis_policy` would
  // enrol months of pre-experiment behaviour into one arm's result — which would look completely
  // ordinary and be completely wrong.
  const legacy: LearnerEvidence = {
    canvasId: "canvas-1",
    demonstrationObtained: true,
    id: "legacy-1",
    objectiveEvidence: "demonstrated",
    objectiveIdentityKey: "obj-legacy",
    occurredAt: at(0),
    verdict: "understood",
  };
  const compared = compareStrategies([
    legacy,
    row({ objectiveEvidence: "demonstrated", teachingStrategy: "nemesis_policy" }),
    row({ objectiveEvidence: "demonstrated", objectiveIdentityKey: "obj-2", teachingStrategy: "llm_teacher" }),
  ]);
  assert.equal(compared.nemesis_policy.objectivesTouched, 1, "the legacy row must not join the control arm");
  assert.equal(compared.llm_teacher.objectivesTouched, 1);
});

test("🔴 an arm that never ran still APPEARS, so 'never ran' and 'not asked about' stay different", () => {
  const compared = compareStrategies([
    row({ objectiveEvidence: "demonstrated", teachingStrategy: "nemesis_policy" }),
  ]);
  assert.ok("llm_teacher" in compared, "omitting an empty arm hides exactly the case a refusal rate reports");
  assert.equal(compared.llm_teacher.objectivesTouched, 0);
  assert.equal(compared.llm_teacher.interactions, 0);
  assert.equal(compared.llm_teacher.medianTimeToMasteryMs, null, "no mastery is absent, not zero time");
});

test("🔴 mastery follows the PER-OBJECTIVE reading, not the answer's overall verdict", () => {
  // 🔴 THE ONE THAT WOULD SILENTLY INFLATE EVERY ARM'S SCORE. A multi-target answer carries one
  // verdict and a per-objective account; reading the verdict would credit every objective the answer
  // touched with whatever the answer as a whole scored — the exact spreading `objective-task.ts`
  // refuses at the write boundary. Undoing it at the read boundary is no better for being downstream.
  const summary = summariseStrategy("nemesis_policy", [
    row({
      objectiveEvidence: "not_addressed",
      objectiveIdentityKey: "never-mentioned",
      teachingStrategy: "nemesis_policy",
      // The ANSWER was strong; this objective was simply not in it.
      verdict: "understood",
    }),
  ]);
  assert.equal(summary.objectivesMastered, 0, "an objective the answer never mentioned was not mastered");
  assert.equal(summary.medianTimeToMasteryMs, null);
});
