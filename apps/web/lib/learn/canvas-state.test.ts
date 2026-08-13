import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyCanvas, type LearningCanvas } from "./canvas-model";
import { canStart, canTransition, stateAfterSourceAttached } from "./canvas-state";

// 🔴 THE `nextAction` TESTS ARE DELETED WITH THE FUNCTION (owner, §38), NOT WEAKENED. They asserted
// that it offered no move into an evidence stage — true, and the reason every one of those controls
// was invisible (#585). The owner has since ruled the controls out by description, so the function
// they guarded is gone and `canvas-dead-controls.test.ts` now asserts it stays gone. What those
// tests actually protected — that nothing may WRITE a canvas into a retired stage — is
// `canTransition`, which is untouched and still tested below.

function canvasIn(state: LearningCanvas["state"], patch: Partial<LearningCanvas> = {}): LearningCanvas {
  return { ...emptyCanvas("c1", "2026-08-06T00:00:00.000Z"), state, ...patch };
}

test("an empty canvas becomes sources_attached the moment material lands", () => {
  assert.equal(stateAfterSourceAttached(canvasIn("empty")), "sources_attached");
});

test("attaching another source to a canvas already being read does not throw it back to the start", () => {
  // Adding a second lecture mid-lesson must not wipe the lesson.
  assert.equal(stateAfterSourceAttached(canvasIn("learn")), "learn");
  assert.equal(stateAfterSourceAttached(canvasIn("recall")), "recall");
});

test("🔴 THE SIX-STAGE ARC IS CLOSED — and this is the whole enumeration, in one place", () => {
  // 🔴 THIS USED TO WALK THE ARC AND ASSERT EVERY EDGE. That arc IS the six-stage machine, and the
  // owner ruled it dead after meeting a fixed run of six questions on their own canvas. What the
  // test encoded — "every state in the brief is reachable, in order" — was a faithful description
  // of a machine that never wrote a single fact about the learner.
  //
  // 🔴 THE DISTINCTION THAT MATTERS, ASSERTED RATHER THAN DESCRIBED: an ENTRANCE goes INTO an
  // evidence stage and is closed; an EXIT leaves one for reading and survives. Retirement closes
  // ways in, never ways out — otherwise a canvas stored mid-run would be sealed inside a machine
  // that no longer paints.
  for (const [from, to] of [
    ["empty", "sources_attached"],
    ["sources_attached", "learn"],
    ["orient", "learn"],
  ] as const) {
    assert.equal(canTransition(from, to), true, `reading arc: ${from} -> ${to}`);
  }

  // Every edge of the legacy machine that lands in an evidence stage, closed.
  for (const [from, to] of [
    ["learn", "recall"],
    ["recall", "test"],
    ["test", "diagnose"],
    ["targeted_relearn", "retest"],
    ["retest", "diagnose"],
    ["retest", "complete"],
    ["diagnose", "complete"],
  ] as const) {
    assert.equal(canTransition(from, to), false, `entrance must be closed: ${from} -> ${to}`);
  }

  // 🔴 THE TWO THAT ARE NOT ENTRANCES, and would be wrong to close.
  assert.equal(canTransition("diagnose", "targeted_relearn"), true, "an exit into reading survives");
  assert.equal(canTransition("test", "learn"), true, "re-reading survives from anywhere");
});

test("🔴 only TWO of those edges ever started from a reading state", () => {
  // 🔴 THE ENUMERATION THAT DECIDES HOW MUCH OF THIS RETIREMENT IS LOAD-BEARING. Most edges of the
  // legacy machine run evidence-stage → evidence-stage: they are INTERNAL, unreachable the moment
  // nothing can get in, and they die with the components. Only an edge that starts from a state a
  // learner can actually be sitting in is a real door.
  //
  // Those are exactly two: `learn → recall` and `targeted_relearn → retest`. Both are reading
  // states. Everything else in that six-line table is reached only from inside the machine.
  const READING = ["orient", "learn", "targeted_relearn"] as const;
  const EVIDENCE = ["recall", "test", "retest", "diagnose", "complete"] as const;

  const doors: string[] = [];
  for (const from of READING) {
    for (const to of EVIDENCE) {
      if (canTransition(from, to)) doors.push(`${from} -> ${to}`);
    }
  }
  assert.deepEqual(doors, [], "no reading state may lead into the retired machine");
});

test("the learner can always go back to reading, from any working state", () => {
  // "explain this again" must never be refused because of where the state machine is.
  for (const from of ["recall", "test", "diagnose", "retest", "complete"] as const) {
    assert.equal(canTransition(from, "learn"), true, `${from} -> learn`);
  }
});

test("a canvas cannot skip straight from empty to a lesson", () => {
  assert.equal(canTransition("empty", "learn"), false);
  assert.equal(canTransition("empty", "test"), false);
});

test("recall cannot be jumped to before there is anything to recall", () => {
  assert.equal(canTransition("sources_attached", "recall"), false);
});

test("a state never transitions to itself", () => {
  assert.equal(canTransition("learn", "learn"), false);
});

test("canStart refuses a lesson with no material and no topic", () => {
  assert.equal(canStart(canvasIn("empty")).ok, false);
});

test("canStart accepts a canvas with a source attached", () => {
  const canvas = canvasIn("sources_attached", {
    sources: [{ id: "s1", title: "Lecture", kind: "pdf", excerpts: [{ id: "s1:e1", label: null, text: "x" }] }],
  });
  assert.equal(canStart(canvas).ok, true);
});

test("canStart accepts a topic-first canvas with a title but no sources", () => {
  assert.equal(canStart(canvasIn("sources_attached", { title: "Anticoagulation" })).ok, true);
});

const CARD = { id: "r1", front: "f", back: "b", conceptId: "k1" };
const QUESTION = {
  id: "q1",
  format: "choice" as const,
  q: "?",
  options: ["a", "b"],
  answer: 0,
  why: "",
  conceptId: "k1",
};







// ── the level picker is gone ────────────────────────────────────────────────

test("🔴 attaching material leads to teaching, not to a level picker", () => {
  // The picker ("Where should we start? / Start from fundamentals / I know the basics / …") was a
  // static mode selector that made the learner choose a route before Nemesis had used anything it
  // already knew. Restore `sources_attached: ["orient"]` and this goes red.
  assert.equal(canTransition("sources_attached", "learn"), true);
});

test("a canvas stored at the old picker can still move forward", () => {
  // 🔴 `orient` survives in the union for exactly one reason: rows written before the screen was
  // removed. Deleting the state outright would strand them with no legal transition at all.
  assert.equal(canTransition("orient", "learn"), true);
});
