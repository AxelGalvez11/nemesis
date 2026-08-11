import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyCanvas, type LearningCanvas, type ResponseEvaluation } from "./canvas-model";
import { currentObjectiveLabel, objectiveMap } from "./canvas-objectives";

const NOW = "2026-08-10T00:00:00.000Z";

function evaluation(verdict: ResponseEvaluation["verdict"]): ResponseEvaluation {
  return { verdict, confidence: 0.9, demonstrated: [], missing: [], misconceptions: [], feedback: "" };
}

function canvas(over: Partial<LearningCanvas> = {}): LearningCanvas {
  return {
    ...emptyCanvas("c1", NOW),
    state: "diagnose",
    concepts: [
      { id: "k1", label: "Resting potential" },
      { id: "k2", label: "Ventricular phase 0" },
      { id: "k3", label: "Pacemaker cells" },
      { id: "k4", label: "Nodal comparison" },
    ],
    ...over,
  };
}

function states(map: ReturnType<typeof objectiveMap>): Record<string, string> {
  return Object.fromEntries(map.map((objective) => [objective.id, objective.state]));
}

test("every declared objective appears, in the order the lesson declared them", () => {
  const map = objectiveMap(canvas());
  assert.deepEqual(map.map((objective) => objective.id), ["k1", "k2", "k3", "k4"]);
  assert.deepEqual(map.map((objective) => objective.label), [
    "Resting potential",
    "Ventricular phase 0",
    "Pacemaker cells",
    "Nodal comparison",
  ]);
});

test("an objective with no evidence is untouched, not weak", () => {
  // The distinction matters: "we have not covered this" and "you got this wrong" are different
  // facts, and a map that showed them the same would make a fresh canvas look like a bad report.
  assert.deepEqual(states(objectiveMap(canvas())), {
    k1: "untouched",
    k2: "untouched",
    k3: "untouched",
    k4: "untouched",
  });
});

test("evidence drives the state, and nothing else does", () => {
  const map = objectiveMap(
    canvas({
      questions: [
        { id: "q1", type: "free", conceptId: "k1", prompt: "?", task: "explain", expectedEvidence: { mustInclude: [] } },
        { id: "q2", type: "free", conceptId: "k2", prompt: "?", task: "explain", expectedEvidence: { mustInclude: [] } },
      ] as never,
      responses: [
        { questionId: "q1", text: "…", via: "typed", evaluation: evaluation("strong") },
        { questionId: "q2", text: "…", via: "typed", evaluation: evaluation("incorrect") },
      ],
    }),
  );
  assert.equal(states(map).k1, "demonstrated");
  assert.equal(states(map).k2, "needs_evidence");
});

test("🔴 an objective that was fixed reads as corrected, not as still weak", () => {
  // `weakConceptIds` is NOT cleared when a retest passes, so a concept that failed and was then
  // corrected sits in both lists. Checking weak first would report every recovery as an
  // outstanding problem for the rest of the canvas's life.
  const map = objectiveMap(canvas({ weakConceptIds: ["k2"], correctedConceptIds: ["k2"] }));
  assert.equal(states(map).k2, "corrected");
});

test("the active prompt's objective is the current one, whatever else is true of it", () => {
  const withTask = canvas({
    weakConceptIds: ["k3"],
    recall: [{ id: "r1", conceptId: "k3", front: "?", back: "!" }] as never,
  });
  assert.equal(states(objectiveMap(withTask, "r1")).k3, "current");
  // Same canvas, no active task: it falls back to what the evidence says.
  assert.equal(states(objectiveMap(withTask, null)).k3, "needs_evidence");
});

test("the current objective is named in words, and never invented", () => {
  const withTask = canvas({
    recall: [{ id: "r1", conceptId: "k3", front: "?", back: "!" }] as never,
  });
  assert.equal(currentObjectiveLabel(withTask, "r1"), "Pacemaker cells");

  // Between rounds there is genuinely no focus. Saying nothing beats naming something at random.
  assert.equal(currentObjectiveLabel(canvas(), null), null);

  // …except while relearning, where the weak objectives ARE unambiguously the work.
  assert.equal(
    currentObjectiveLabel(canvas({ state: "targeted_relearn", weakConceptIds: ["k4"] }), null),
    "Nodal comparison",
  );
});

test("🔴 no number is ever produced — the map is qualitative", () => {
  const map = objectiveMap(
    canvas({
      questions: [
        { id: "q1", type: "free", conceptId: "k1", prompt: "?", task: "explain", expectedEvidence: { mustInclude: [] } },
      ] as never,
      responses: [{ questionId: "q1", text: "…", via: "typed", evaluation: evaluation("strong") }],
    }),
  );
  // §9: "73% mastery" is a number we cannot defend, computed from a handful of judged answers
  // and read as a measurement. If a score ever appears on this shape, it appears in the UI next.
  for (const objective of map) {
    assert.deepEqual(Object.keys(objective).sort(), ["id", "label", "state"]);
    for (const value of Object.values(objective)) {
      assert.equal(typeof value, "string", "every field is a string; a number here becomes a percentage");
    }
  }
});

test("🔴 the map never says anything was forgotten", () => {
  // Elapsed time is not evidence of loss (§35). The weak state is named for what we know — that
  // we have not seen a recent successful retrieval — not for what we would like to claim.
  const map = objectiveMap(canvas({ weakConceptIds: ["k1", "k2", "k3", "k4"] }));
  for (const objective of map) {
    assert.ok(!/forgot|lost|failed/i.test(objective.state), objective.state);
  }
  assert.equal(states(map).k1, "needs_evidence");
});
