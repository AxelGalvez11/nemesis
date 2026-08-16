import assert from "node:assert/strict";
import { test } from "node:test";

import type { LearnerEvidence } from "./learner-evidence";
import {
  compareStrategies,
  attentionCoverageOf,
  RETENTION_DELAY_MS,
  summariseStrategy,
} from "./strategy-outcomes";
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

test("🔴🔴 transfer and scaffolding read ABSENT on a cohort that shows only one operation", () => {
  // 🔴 THE REASON FOR THE TRANSFER HALF HAS CHANGED, AND THE ASSERTION HAS NOT. This used to say
  // transfer was structurally unmeasurable because `objectivesForKnowledge` minted one operation.
  // That is stale: `runtime-support.ts` stages four pairs end to end (`association|recall`,
  // `causal|predict`, `classification|discriminate`, `procedure|sequence`) and production rows
  // already carry two operations. What is asserted here is narrower and still true — THESE ROWS
  // carry one operation, so this COHORT cannot show transfer. Scaffolding is unchanged: every prompt
  // is still staged at `scaffoldingLevel: 0` / `independent`.
  //
  // Reported as `0` both would be IDENTICAL BETWEEN ARMS BY CONSTRUCTION, which a reader would very
  // reasonably mistake for "the two arms are the same on this". They are not the same; they are
  // unmeasured.
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

// ── ACTIVE ATTENTION: THE DENOMINATOR ───────────────────────────────────────
//
// 🔴 "PER MINUTE" NEEDS MINUTES ACTUALLY SPENT. Everything below this line exists because the
// summary above measures wall clock, which counts the hours a learner spent away from the tab.

test("🔴🔴 active attention sums PERFORMANCES, not rows — one 20s answer over three objectives is 20s", () => {
  // 🔴 THE DEFECT THIS FILE'S WHOLE DENOMINATOR TURNS ON. `objective-task.ts` writes the WHOLE
  // measured duration on every row a submission produces, so summing rows would report sixty seconds
  // of attention for twenty seconds of work — and would do it in exact proportion to how broad the
  // arm's questions were. The arm asking richer questions would look three times more expensive for
  // being better, and every per-attention rate would be divided by three.
  const shared = "resp-shared";
  const summary = summariseStrategy("nemesis_policy", [
    row({ objectiveIdentityKey: "obj-a", responseId: shared, responseLatencyMs: 20_000, teachingStrategy: "nemesis_policy" }),
    row({ objectiveIdentityKey: "obj-b", responseId: shared, responseLatencyMs: 20_000, teachingStrategy: "nemesis_policy" }),
    row({ objectiveIdentityKey: "obj-c", responseId: shared, responseLatencyMs: 20_000, teachingStrategy: "nemesis_policy" }),
  ]);
  assert.equal(summary.activeAttentionMs, 20_000, "🔴 the answer took twenty seconds, not sixty");
  assert.equal(summary.performancesWithLatency, 1);
  assert.equal(summary.interactions, 1);
});

test("🔴 active attention is ABSENT, never zero, when no row carries a latency", () => {
  // Legacy rows carry none. "Nobody spent any time" is a claim nothing here observed, and a zero
  // denominator would make every rate below either infinite or silently dropped.
  const summary = summariseStrategy("nemesis_policy", [
    row({ objectiveEvidence: "demonstrated", teachingStrategy: "nemesis_policy" }),
  ]);
  assert.equal(summary.activeAttentionMs, null);
  assert.notEqual(summary.activeAttentionMs, 0, "🔴 unobserved and zero are opposite findings");
  assert.equal(summary.performancesWithLatency, 0);
});

test("🔴 performancesWithLatency exposes a denominator measured over a SUBSET of the numerator", () => {
  // "A rate whose denominator is the wrong set" is the defect this file's header names. When some
  // performances carry no latency the rate still computes — over less attention than was really
  // spent, so it reads HIGH. The only defence is showing the reader both counts.
  const summary = summariseStrategy("nemesis_policy", [
    row({ objectiveIdentityKey: "obj-a", responseLatencyMs: 60_000, teachingStrategy: "nemesis_policy" }),
    row({ objectiveIdentityKey: "obj-b", teachingStrategy: "nemesis_policy" }),
  ]);
  assert.equal(summary.interactions, 2, "two performances");
  assert.equal(summary.performancesWithLatency, 1, "🔴 only one of them was timed");
  assert.equal(summary.activeAttentionMs, 60_000);
});

// ── THE HEADLINE: DURABLE UNDERSTANDING PER UNIT OF ACTIVE ATTENTION ────────

test("🔴🔴 the headline counts DURABLE demonstrations per hour of active attention", () => {
  // "Maximise durable understanding of important material per unit of active attention." Durable
  // means across a real gap — not the answer still sitting in working memory.
  const summary = summariseStrategy("nemesis_policy", [
    row({ objectiveEvidence: "contradicted", occurredAt: at(0), responseLatencyMs: 1_800_000, teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
    row({ objectiveEvidence: "demonstrated", occurredAt: at(RETENTION_DELAY_MS + 1), responseLatencyMs: 1_800_000, teachingStrategy: "nemesis_policy" }),
  ]);
  assert.equal(summary.durableOpportunities, 1);
  assert.equal(summary.durableDemonstrations, 1);
  assert.equal(summary.objectivesDurablyDemonstrated, 1);
  assert.equal(summary.activeAttentionMs, 3_600_000, "two half-hour answers");
  assert.equal(summary.durableDemonstrationsPerActiveHour, 1);
});

test("🔴 the headline counts an OBJECTIVE once, however often it is durably re-demonstrated", () => {
  // 🔴 THE CHOICE OF NUMERATOR, PINNED. The owner's sentence is "durable understanding of important
  // MATERIAL" — the unit is a piece of material held, not a repetition of holding it. Counting
  // repetitions would rank an arm that drills one item above one that teaches ten. Both raw counts
  // are published so the other reading stays one division away.
  const summary = summariseStrategy("nemesis_policy", [
    row({ objectiveEvidence: "contradicted", occurredAt: at(0), responseLatencyMs: 1_200_000, teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
    row({ objectiveEvidence: "demonstrated", occurredAt: at(RETENTION_DELAY_MS + 1), responseLatencyMs: 1_200_000, teachingStrategy: "nemesis_policy" }),
    // 🔴 A WHOLE DELAY CLEAR OF THE PREVIOUS ROW, NOT ONE MILLISECOND PAST IT. This test is about
    // the distinct-objective COUNT, so its rows must land in the durable bucket for a reason a
    // reader can see rather than by arithmetic nobody stated — otherwise a later change to
    // `RETENTION_DELAY_MS` makes it pass for the wrong reason or fail opaquely. The boundary itself
    // is probed deliberately elsewhere.
    row({ objectiveEvidence: "demonstrated", occurredAt: at(3 * RETENTION_DELAY_MS), responseLatencyMs: 1_200_000, teachingStrategy: "nemesis_policy" }),
  ]);
  assert.equal(summary.durableDemonstrations, 2, "two durable demonstrations happened");
  assert.equal(summary.objectivesDurablyDemonstrated, 1, "🔴 of ONE objective");
  assert.equal(summary.activeAttentionMs, 3_600_000);
  assert.equal(summary.durableDemonstrationsPerActiveHour, 1, "🔴 one thing held per hour, not two");
});

test("🔴🔴 a pilot inside one afternoon reports the headline as ABSENT, never as zero", () => {
  // 🔴 THE DISTINCTION THE WHOLE FILE IS BUILT ON, APPLIED TO THE NUMBER MOST LIKELY TO BE QUOTED.
  // There is plenty of active attention here and no gap for anything durable to be demonstrated
  // ACROSS — so the numerator counted nothing rather than found nothing. A 0 would say this arm
  // taught an hour and none of it survived, which is a real and damning finding that did not happen.
  const summary = summariseStrategy("llm_teacher", [
    row({ objectiveEvidence: "demonstrated", occurredAt: at(0), responseLatencyMs: 1_800_000, teachingStrategy: "llm_teacher" }),
    row({ objectiveEvidence: "demonstrated", occurredAt: at(HOUR), responseLatencyMs: 1_800_000, teachingStrategy: "llm_teacher" }),
  ]);
  assert.equal(summary.activeAttentionMs, 3_600_000, "the attention WAS measured");
  assert.equal(summary.durableOpportunities, 0, "no gap was ever available");
  assert.equal(summary.durableDemonstrationsPerActiveHour, null);
  assert.notEqual(summary.durableDemonstrationsPerActiveHour, 0, "🔴 not instrumented is not zero");
});

test("🔴 a real zero SURVIVES — gaps existed, answers were given across them, nothing held", () => {
  // 🔴 THE CALIBRATION THAT STOPS `null` SWALLOWING THE FINDING. If the previous test's rule were
  // written as "null whenever the numerator is 0", this genuine failure would be hidden too — and
  // hiding it is the whole reason arms are compared at all.
  const summary = summariseStrategy("llm_teacher", [
    row({ objectiveEvidence: "demonstrated", occurredAt: at(0), responseLatencyMs: 1_800_000, teachingStrategy: "llm_teacher" }),
    row({ objectiveEvidence: "contradicted", occurredAt: at(RETENTION_DELAY_MS + 1), responseLatencyMs: 1_800_000, teachingStrategy: "llm_teacher", verdict: "incorrect" }),
  ]);
  assert.equal(summary.durableOpportunities, 1, "a gap existed and was answered across");
  assert.equal(summary.durableDemonstrationsPerActiveHour, 0, "🔴 measured zero, and it must show");
});

// ── IMPORTANCE-AWARE COVERAGE ───────────────────────────────────────────────
//
// 🔴 THE IMPORTANCE SIGNAL IS BUILT ELSEWHERE (`source-importance.ts`) AND IS PASSED IN. These pin
// the behaviour that has to hold BEFORE it lands, and the behaviour that has to hold when it lands
// only partly — which is the realistic state and the one that can quietly lie.

test("🔴🔴 a PARTIAL importance reading reports UNWEIGHTED, and says so", () => {
  // 🔴 THE FAILURE THIS EXISTS TO PREVENT, AND `weighted: boolean` ALONE WOULD NOT PREVENT IT.
  // Weighting the units that carry a reading and quietly ignoring the rest produces a number that
  // looks weighted, is labelled weighted, and was computed over a subset nobody chose. All or
  // nothing — and the shortfall is reported so a reader can see how far off a real weighting is.
  const coverage = attentionCoverageOf(
    [
      { identityKey: "obj-a", importance: 10 },
      { identityKey: "obj-b" },
    ],
    [row({ objectiveIdentityKey: "obj-a", teachingStrategy: "nemesis_policy" })],
  );
  assert.equal(coverage.weighted, false, "🔴 one unit without a reading means no weighting at all");
  assert.equal(coverage.unitsWithImportance, 1);
  assert.equal(coverage.unitsTotal, 2, "🔴 and the shortfall is visible");
  assert.equal(coverage.reachedFraction, 0.5, "the unweighted answer is still reported");
  assert.equal(coverage.weightedReachedFraction, null, "🔴 never a silent fallback");
});

test("🔴 with NO importance reading at all, coverage is unweighted and still answers", () => {
  // Degrading honestly means degrading, not refusing: breadth is worth knowing before anyone can
  // say which material mattered most.
  const coverage = attentionCoverageOf(
    [{ identityKey: "obj-a" }, { identityKey: "obj-b" }, { identityKey: "obj-c" }, { identityKey: "obj-d" }],
    [
      row({ objectiveEvidence: "demonstrated", objectiveIdentityKey: "obj-a", teachingStrategy: "nemesis_policy" }),
      row({ objectiveEvidence: "contradicted", objectiveIdentityKey: "obj-b", teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
    ],
  );
  assert.equal(coverage.weighted, false);
  assert.equal(coverage.unitsWithImportance, 0);
  assert.equal(coverage.reachedFraction, 0.5, "two of four were put in front of the learner");
  assert.equal(coverage.demonstratedFraction, 0.25, "one of four was actually established");
});

test("🔴 when EVERY unit carries a reading, coverage weights by importance", () => {
  // The point of weighting at all: reaching the one thing that mattered is not the same as reaching
  // one of four things. Unweighted coverage cannot tell those apart; this can.
  const coverage = attentionCoverageOf(
    [
      { identityKey: "obj-a", importance: 9 },
      { identityKey: "obj-b", importance: 1 },
    ],
    [row({ objectiveEvidence: "demonstrated", objectiveIdentityKey: "obj-a", teachingStrategy: "nemesis_policy" })],
  );
  assert.equal(coverage.weighted, true);
  assert.equal(coverage.reachedFraction, 0.5, "half the units");
  assert.equal(coverage.weightedReachedFraction, 0.9, "🔴 but nine tenths of what mattered");
  assert.equal(coverage.weightedDemonstratedFraction, 0.9);
});

test("🔴 an objective the answer never addressed was still REACHED — it was staged", () => {
  // A row exists only for an objective that was a target of a prompt, so `not_addressed` is proof
  // the material was put in front of the learner. Coverage measures where attention was SPENT;
  // `unitsDemonstrated` measures what came of it, and neither is reported without the other.
  const coverage = attentionCoverageOf(
    [{ identityKey: "obj-a" }, { identityKey: "obj-b" }],
    [
      row({ objectiveEvidence: "not_addressed", objectiveIdentityKey: "obj-a", teachingStrategy: "nemesis_policy", verdict: null }),
    ],
  );
  assert.equal(coverage.unitsReached, 1);
  assert.equal(coverage.unitsDemonstrated, 0, "reached is not learned");
});

test("🔴 coverage is ABSENT when no units were supplied — not zero coverage", () => {
  const summary = summariseStrategy("nemesis_policy", [
    row({ objectiveEvidence: "demonstrated", teachingStrategy: "nemesis_policy" }),
  ]);
  assert.equal(summary.coverage, null, "🔴 the caller did not ask; the arm did not cover nothing");

  const asked = summariseStrategy(
    "nemesis_policy",
    [row({ objectiveEvidence: "demonstrated", objectiveIdentityKey: "obj-1", teachingStrategy: "nemesis_policy" })],
    { coverage: [{ identityKey: "obj-1" }, { identityKey: "obj-2" }] },
  );
  assert.equal(asked.coverage?.reachedFraction, 0.5);
});

// ── DID DEFERRING HURT? ─────────────────────────────────────────────────────
//
// 🔴🔴 THE ONLY MEASUREMENT HERE THAT CAN TELL A GOOD "MOVE ON" FROM A BAD ONE. Every other outcome
// scores the learner; this one scores the controller.

const DEPENDS: ReadonlyMap<string, readonly string[]> = new Map([["dep", ["pre"]]]);

test("🔴🔴 a dependent attempted over an UNRESOLVED prerequisite is scored apart from one over a resolved one", () => {
  // The contrast IS the finding. Neither rate means anything alone.
  const stranded = summariseStrategy(
    "nemesis_policy",
    [
      row({ objectiveEvidence: "contradicted", objectiveIdentityKey: "pre", occurredAt: at(0), teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
      row({ objectiveEvidence: "contradicted", objectiveIdentityKey: "dep", occurredAt: at(HOUR), teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
    ],
    { prerequisites: DEPENDS },
  );
  assert.equal(stranded.deferredPrerequisites?.attemptsOverUnresolved, 1);
  assert.equal(stranded.deferredPrerequisites?.demonstrationRateOverUnresolved, 0);
  assert.equal(stranded.deferredPrerequisites?.demonstrationRateOverResolved, null, "no such attempt happened");

  const grounded = summariseStrategy(
    "nemesis_policy",
    [
      row({ objectiveEvidence: "demonstrated", objectiveIdentityKey: "pre", occurredAt: at(0), teachingStrategy: "nemesis_policy" }),
      row({ objectiveEvidence: "demonstrated", objectiveIdentityKey: "dep", occurredAt: at(HOUR), teachingStrategy: "nemesis_policy" }),
    ],
    { prerequisites: DEPENDS },
  );
  assert.equal(grounded.deferredPrerequisites?.attemptsOverResolved, 1);
  assert.equal(grounded.deferredPrerequisites?.demonstrationRateOverResolved, 1);
});

test("🔴🔴 a prerequisite NEVER ATTEMPTED is a third bucket — it was not moved on from", () => {
  // 🔴 THE ONE THAT MOST CHANGES WHAT THE HEADLINE DEFERRAL NUMBER MEANS. A prerequisite the learner
  // never met was never deferred; it was never reached. Ordinary teaching order produces this
  // constantly, and folding it into "unresolved" would report normal sequencing as deferral harm —
  // on a real corpus it would dominate both rates.
  const summary = summariseStrategy(
    "nemesis_policy",
    [row({ objectiveEvidence: "contradicted", objectiveIdentityKey: "dep", occurredAt: at(HOUR), teachingStrategy: "nemesis_policy", verdict: "incorrect" })],
    { prerequisites: DEPENDS },
  );
  assert.equal(summary.deferredPrerequisites?.attemptsOverUnreached, 1);
  assert.equal(summary.deferredPrerequisites?.attemptsOverUnresolved, 0, "🔴 never reached is not deferred");
  assert.equal(summary.deferredPrerequisites?.demonstrationRateOverUnresolved, null);
});

test("🔴 a dependent answered in the SAME performance as its prerequisite is not deferral", () => {
  // One answer covering both is one broad prompt, not an attempt made after moving on. Counting it
  // would turn prompt breadth into deferral harm — the same row-versus-performance error this file
  // already refuses one layer in.
  const shared = "resp-both";
  const summary = summariseStrategy(
    "nemesis_policy",
    [
      row({ objectiveEvidence: "contradicted", objectiveIdentityKey: "pre", occurredAt: at(0), responseId: shared, teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
      row({ objectiveEvidence: "contradicted", objectiveIdentityKey: "dep", occurredAt: at(0), responseId: shared, teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
    ],
    { prerequisites: DEPENDS },
  );
  assert.equal(summary.deferredPrerequisites?.attemptsSharingPerformance, 1);
  assert.equal(summary.deferredPrerequisites?.attemptsOverUnresolved, 0);
});

test("🔴 deferral is ABSENT when no prerequisite map was supplied — not 'deferring never hurt'", () => {
  const summary = summariseStrategy("nemesis_policy", [
    row({ objectiveEvidence: "contradicted", objectiveIdentityKey: "dep", teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
  ]);
  assert.equal(summary.deferredPrerequisites, null);
});

test("🔴🔴 a prerequisite taught by the OTHER arm still counts as resolved", () => {
  // Whether the learner holds a prerequisite is a fact about the LEARNER, not about one controller.
  // Reading one arm's rows alone would file everything the other arm covered as never-reached, and
  // the deferral measurement would shrink to the subset one controller happened to touch.
  const compared = compareStrategies(
    [
      row({ objectiveEvidence: "demonstrated", objectiveIdentityKey: "pre", occurredAt: at(0), teachingStrategy: "llm_teacher" }),
      row({ objectiveEvidence: "demonstrated", objectiveIdentityKey: "dep", occurredAt: at(HOUR), teachingStrategy: "nemesis_policy" }),
    ],
    { prerequisites: DEPENDS },
  );
  assert.equal(compared.nemesis_policy.deferredPrerequisites?.attemptsOverResolved, 1);
  assert.equal(
    compared.nemesis_policy.deferredPrerequisites?.attemptsOverUnreached,
    0,
    "🔴 the other arm's teaching is not invisible",
  );
});

// ── DID THE TEACHING AFTER A MISS WORK? ─────────────────────────────────────

test("🔴 recovery counts the attempt AFTER a miss, and publishes what it actually was", () => {
  // 🔴 NOT NAMED "DID THE CORRECTION WORK". Showing a correction writes no evidence row — the log
  // cannot separate a miss that was followed by one from a miss that was not.
  const summary = summariseStrategy("nemesis_policy", [
    row({ objectiveEvidence: "contradicted", objectiveIdentityKey: "obj-a", occurredAt: at(0), teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
    row({ objectiveEvidence: "demonstrated", objectiveIdentityKey: "obj-a", occurredAt: at(HOUR), teachingStrategy: "nemesis_policy" }),
    row({ objectiveEvidence: "nothing_produced", objectiveIdentityKey: "obj-b", occurredAt: at(0), teachingStrategy: "nemesis_policy", verdict: null }),
    row({ objectiveEvidence: "contradicted", objectiveIdentityKey: "obj-b", occurredAt: at(HOUR), teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
  ]);
  assert.equal(summary.recoveryAfterMiss.missesWithLaterAttempt, 2);
  assert.equal(summary.recoveryAfterMiss.recovered, 1);
  assert.equal(summary.recoveryAfterMiss.recoveryRate, 0.5);
  assert.equal(summary.recoveryAfterMiss.nextAttemptEvidence.demonstrated, 1);
  assert.equal(summary.recoveryAfterMiss.nextAttemptEvidence.contradicted, 1);
});

test("🔴🔴 `partial` after a miss is PUBLISHED, not ranked — runtime does not decide what partial means", () => {
  // 🔴 THE INVARIANT, HELD AT A PLACE IT WOULD BE EASY TO BREAK. Sorting `partial` into recovered
  // would claim a half-answer is teaching that landed; sorting it into failure would claim it is
  // teaching that did not. Both are Brain's call. The rate's numerator is `demonstrated` only, and
  // the full distribution is published so the other reading is one addition away.
  const summary = summariseStrategy("nemesis_policy", [
    row({ objectiveEvidence: "contradicted", occurredAt: at(0), teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
    row({ objectiveEvidence: "partial", occurredAt: at(HOUR), teachingStrategy: "nemesis_policy", verdict: null }),
  ]);
  assert.equal(summary.recoveryAfterMiss.missesWithLaterAttempt, 1);
  assert.equal(summary.recoveryAfterMiss.recovered, 0, "a partial is not a demonstration");
  assert.equal(summary.recoveryAfterMiss.nextAttemptEvidence.partial, 1, "🔴 and the reader can see it");
});

test("🔴 an answer that never mentioned the objective is not 'the next attempt'", () => {
  // A `not_addressed` row sitting between a miss and the real next attempt would otherwise be read
  // as the learner having tried again and produced nothing — which is a different, and worse, claim
  // than the one the log supports.
  const summary = summariseStrategy("nemesis_policy", [
    row({ objectiveEvidence: "contradicted", occurredAt: at(0), teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
    row({ objectiveEvidence: "not_addressed", occurredAt: at(HOUR), teachingStrategy: "nemesis_policy", verdict: "understood" }),
    row({ objectiveEvidence: "demonstrated", occurredAt: at(2 * HOUR), teachingStrategy: "nemesis_policy" }),
  ]);
  assert.equal(summary.recoveryAfterMiss.missesWithLaterAttempt, 1);
  assert.equal(summary.recoveryAfterMiss.recovered, 1, "the demonstration was the next ATTEMPT");
});

test("🔴 a miss that never got a second chance reports ABSENT, not a zero recovery rate", () => {
  const summary = summariseStrategy("nemesis_policy", [
    row({ objectiveEvidence: "contradicted", teachingStrategy: "nemesis_policy", verdict: "incorrect" }),
  ]);
  assert.equal(summary.recoveryAfterMiss.missesWithLaterAttempt, 0);
  assert.equal(summary.recoveryAfterMiss.recoveryRate, null);
  assert.notEqual(summary.recoveryAfterMiss.recoveryRate, 0, "🔴 never offered is not never worked");
});
