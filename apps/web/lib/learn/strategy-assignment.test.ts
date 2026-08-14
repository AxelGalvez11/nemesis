import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { LearnerEvidence } from "./learner-evidence";
import {
  conflictingStrategy,
  DEFAULT_STRATEGY,
  resolveStrategy,
  strategyOverrideFrom,
  TEACHING_STRATEGIES,
} from "./teaching-strategy";

// WHICH ARM A SESSION RUNS, AND THE ONE PROPERTY THE EXPERIMENT CANNOT SURVIVE LOSING.
//
// 🔴🔴 "THE CHOSEN STRATEGY MUST BE FIXED FOR THE SESSION AND MUST NOT SILENTLY SWITCH HALFWAY
// THROUGH" IS NOT A NICETY — IT IS WHAT MAKES THE ROWS MEAN ANYTHING. A session that changed
// controllers partway writes rows under two labels, or worse under one, and produces evidence that
// looks completely ordinary and belongs to no arm. Nothing computed afterwards can find those rows,
// because there is nothing wrong with any of them individually.
//
// The mechanism is that assignment is DERIVED rather than stored. These tests are what makes that
// claim checkable instead of a comment.

test("🔴 the same learner and canvas resolve to the same arm, every time, for ever", () => {
  const inputs = { canvasId: "canvas-9", learnerId: "learner-3", override: null, randomise: true } as const;
  const first = resolveStrategy(inputs);
  // A reload, a second tab, a remount, a week later: the function has no state, so all of them are
  // this call. The repetition is the point — a `useState` version would pass a single call too.
  for (let i = 0; i < 50; i += 1) {
    assert.equal(resolveStrategy(inputs).strategy, first.strategy);
  }
  assert.equal(first.assignedBy, "randomised");
});

test("🔴 randomisation is OFF, so shipping this changes nothing for anybody", () => {
  // The whole feature is inert until someone decides to run the experiment. With `randomise: false`
  // every learner who has not typed an arm into the URL meets the structured policy, which is
  // exactly today's behaviour.
  const assignment = resolveStrategy({
    canvasId: "canvas-1",
    learnerId: "learner-1",
    override: null,
    randomise: false,
  });
  assert.equal(assignment.strategy, "nemesis_policy");
  assert.equal(assignment.strategy, DEFAULT_STRATEGY);
  assert.equal(assignment.assignedBy, "default");
});

test("🔴 assignment varies WITHIN a learner as well as across them", () => {
  // 🔴 KEYED ON BOTH IDENTITIES, AND THE REASON IS STATISTICAL RATHER THAN AESTHETIC. Keyed on the
  // learner alone, one person meets the same controller on every canvas for ever — so the arm and
  // the person become the same variable and every difference between arms is also a difference
  // between two groups of people. This asserts the key is not degenerate in that direction.
  const arms = new Set(
    Array.from({ length: 40 }, (_, i) =>
      resolveStrategy({
        canvasId: `canvas-${i}`,
        learnerId: "one-learner",
        override: null,
        randomise: true,
      }).strategy,
    ),
  );
  assert.equal(arms.size, TEACHING_STRATEGIES.length, "one learner must be able to meet both arms");
});

test("🔴 an anonymous session is never enrolled, because its outcomes could never be joined to anyone", () => {
  const assignment = resolveStrategy({
    canvasId: "canvas-1",
    learnerId: null,
    override: null,
    randomise: true,
  });
  assert.equal(assignment.strategy, DEFAULT_STRATEGY);
  assert.equal(assignment.assignedBy, "default");
});

test("🔴 an override outranks randomisation and SAYS SO, so hand-picked sessions can be excluded later", () => {
  const assignment = resolveStrategy({
    canvasId: "canvas-1",
    learnerId: "learner-1",
    override: "llm_teacher",
    randomise: true,
  });
  assert.equal(assignment.strategy, "llm_teacher");
  // Without this, a developer exercising an arm would be indistinguishable from a randomised
  // enrolment, and a result would silently include sessions somebody chose.
  assert.equal(assignment.assignedBy, "override");
});

test("🔴 the URL vocabulary is the STORED vocabulary — no friendly aliases", () => {
  assert.equal(strategyOverrideFrom("llm_teacher"), "llm_teacher");
  assert.equal(strategyOverrideFrom("nemesis_policy"), "nemesis_policy");
  // A friendly alias would be a second name for the same arm, and the moment one appears in a bug
  // report nobody can tell which controller was actually running.
  assert.equal(strategyOverrideFrom("llm"), null);
  assert.equal(strategyOverrideFrom("ai"), null);
  assert.equal(strategyOverrideFrom("1"), null);
  assert.equal(strategyOverrideFrom(null), null);
});

test("🔴🔴 the RUNTIME derives the arm, it does not store it", () => {
  // 🔴 THE TEST ABOVE PROVES `resolveStrategy` IS DETERMINISTIC. IT CANNOT PROVE THE HOOK CALLS IT.
  // The defect that would slip past everything else is someone moving the arm into `useState` —
  // `resolveStrategy` stays perfectly deterministic, every assertion in this file still passes, and
  // the session silently acquires exactly the property the derivation exists to prevent: an arm that
  // survives a re-render and dies on a reload, so a learner who refreshes mid-canvas can finish
  // under a controller that did not start them. Every row they wrote is still stamped with whichever
  // arm was live at the time, so the comparison ends up holding blended sessions labelled as one.
  //
  // There is no React renderer in this suite, so the mechanism is asserted at the source. That is
  // weaker than exercising it and much stronger than nothing — and it is calibrated below.
  const hook = readFileSync(
    new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url),
    "utf8",
  );
  assert.ok(hook.includes("resolveStrategy({"), "the runtime must derive the arm on every render");
  // 🔴 THE BINDING, NOT THE TYPE. An earlier version of this matched `useState[^\n]*Strategy` and
  // went red on `useState<StrategyOutcome>` — which is the DECISION, and is legitimately state: it
  // is the result of an async controller call and has nowhere else to live. What must never be
  // state is the ARM, so the check is on the two ways an arm-shaped binding can appear.
  assert.ok(!storedArm.test(hook), "🔴 the arm must never be held in state — derive it instead");
});

/** A `useState` binding that holds the arm itself. See the guard above for why it is the binding
 *  that is matched and not the type. */
const storedArm = /const \[strategy[,\]]|setStrategy\b/;

test("🔴 CALIBRATION: that guard fails when the arm is put into state", () => {
  // The defect reproduced against the real pattern the assertion applies. Without this, the check
  // above could be passing because the file happens not to contain a string rather than because the
  // rule holds.
  const asIfStored = "const [strategy, setStrategy] = useState<TeachingStrategyId>(DEFAULT_STRATEGY);";
  assert.ok(storedArm.test(asIfStored), "if this passes, the check above is not testing what it says");
  // ...and it must NOT fire on the decision state that legitimately exists, or the guard would be
  // unmaintainable: whoever hit it would delete it rather than work out what it meant.
  assert.ok(
    !storedArm.test("const [decided, setDecided] = useState<{ outcome: StrategyOutcome } | null>(null);"),
    "the guard must not fire on the async decision, which has nowhere else to live",
  );
});

// ── The switch-detector ─────────────────────────────────────────────────────────────────────────

function row(over: Partial<LearnerEvidence>): LearnerEvidence {
  return {
    canvasId: "canvas-1",
    demonstrationObtained: true,
    id: "e1",
    objectiveIdentityKey: "obj-1",
    occurredAt: "2026-08-14T12:00:00.000Z",
    verdict: "understood",
    ...over,
  };
}

test("🔴 a canvas whose evidence was written by the OTHER arm is detected", () => {
  const conflict = conflictingStrategy({
    canvasId: "canvas-1",
    evidence: [row({ teachingStrategy: "llm_teacher" })],
    running: "nemesis_policy",
  });
  assert.equal(conflict, "llm_teacher");
});

test("🔴 rows from a DIFFERENT canvas are not a conflict — that is the durable learner model working", () => {
  // Evidence is deliberately never filtered by canvas anywhere else: an objective met last week
  // under the other arm is exactly what a learner model that outlives a session looks like. What
  // must not happen is one CANVAS producing rows under two controllers.
  const conflict = conflictingStrategy({
    canvasId: "canvas-1",
    evidence: [row({ canvasId: "canvas-2", teachingStrategy: "llm_teacher" })],
    running: "nemesis_policy",
  });
  assert.equal(conflict, null);
});

test("🔴 rows that predate the strategy layer are not a conflict, and must not be read as the control arm", () => {
  const conflict = conflictingStrategy({
    canvasId: "canvas-1",
    evidence: [row({}), row({ id: "e2", teachingStrategy: null })],
    running: "llm_teacher",
  });
  assert.equal(conflict, null, "absent means the row predates the experiment, never `nemesis_policy`");
});

test("🔴 CALIBRATION: the detector fails to fire when the arms agree", () => {
  // The guard must respond to DISAGREEMENT and not merely to the presence of a strategy field. If
  // this returned a conflict, the detector would be firing on any labelled row at all and its
  // `null` above would mean nothing.
  assert.equal(
    conflictingStrategy({
      canvasId: "canvas-1",
      evidence: [row({ teachingStrategy: "nemesis_policy" })],
      running: "nemesis_policy",
    }),
    null,
  );
});
