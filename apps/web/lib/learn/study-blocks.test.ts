import assert from "node:assert/strict";
import { test } from "node:test";

import type { RetentionView } from "./canvas-retention";
import { fitToAvailable, studyBlockFor, studyBlocks } from "./study-blocks";

function view(retrievability: number, id = "k"): RetentionView {
  return {
    objectiveId: id,
    lastRetrievalAt: "2026-08-01T00:00:00.000Z",
    stabilityDays: 3,
    difficulty: 0.4,
    successes: 1,
    failures: 0,
    retrievability,
  };
}

function many(count: number, retrievability = 0.6): RetentionView[] {
  return Array.from({ length: count }, (_, index) => view(retrievability, `k${index}`));
}

test("🔴 two hundred due objectives produce ONE block, not two hundred entries", () => {
  // The whole point. A calendar entry per objective buries the exam under machine noise.
  const block = studyBlockFor({ canvasId: "c1", canvasTitle: "Calculus", due: many(200) });
  assert.ok(block);
  assert.equal(typeof block.title, "string");
  assert.equal(block.objectiveCount, 200);
  // And it is capped, because a 13-hour entry is not a plan.
  assert.ok(block.minutes <= 45, `expected a capped block, got ${block.minutes}`);
});

test("the title names the subject, not the concepts", () => {
  const block = studyBlockFor({ canvasId: "c1", canvasTitle: "Calculus", due: many(5) })!;
  assert.equal(block.title, "20-minute Calculus review");
  // A list of objective titles is unrecognisable out of context and would not fit anyway.
  assert.ok(!block.title.includes("k0"));
});

test("a trivial amount of work does not become a calendar entry", () => {
  // "3-minute review" on a Tuesday is how someone learns to ignore the calendar.
  assert.equal(studyBlockFor({ canvasId: "c1", canvasTitle: "Calculus", due: many(1) }), null);
  assert.equal(studyBlockFor({ canvasId: "c1", canvasTitle: "Calculus", due: [] }), null);
});

test("durations are rounded, because the estimate has no precision to claim", () => {
  const block = studyBlockFor({ canvasId: "c1", canvasTitle: "Physio", due: many(7) })!;
  assert.equal(block.minutes % 5, 0, `expected a rounded duration, got ${block.minutes}`);
});

test("🔴 a block is marked as a plan, never as an obligation", () => {
  const block = studyBlockFor({ canvasId: "c1", canvasTitle: "Calculus", due: many(5) })!;
  // §19: an exam has a date because the world says so; this exists because Nemesis suggested
  // it. Rendering them as peers is what makes a calendar untrustworthy.
  assert.equal(block.origin, "nemesis_plan");
});

test("objectives with no prediction are not counted", () => {
  // Unknown is not the same as due. Counting an undated objective would inflate the block and
  // schedule work on the basis of nothing.
  const unknown = { ...view(0.5), retrievability: null } as RetentionView;
  assert.equal(studyBlockFor({ canvasId: "c1", canvasTitle: "Calculus", due: [unknown, ...many(2)] })?.objectiveCount ?? 0, 0);
});

test("across canvases, the closest to failing comes first", () => {
  const blocks = studyBlocks([
    { canvasId: "a", canvasTitle: "Biology", due: many(5, 0.85) },
    { canvasId: "b", canvasTitle: "Calculus", due: many(5, 0.35) },
    { canvasId: "c", canvasTitle: "History", due: many(5, 0.6) },
  ]);
  assert.deepEqual(blocks.map((block) => block.canvasId), ["b", "c", "a"]);
});

test("a plan fits the time the learner actually has", () => {
  const blocks = studyBlocks([
    { canvasId: "a", canvasTitle: "Calculus", due: many(10, 0.3) },
    { canvasId: "b", canvasTitle: "Biology", due: many(5, 0.5) },
  ]);
  // Twenty minutes before class is not a free afternoon, and Nemesis does not get to decide a
  // full block is going to happen.
  const fitted = fitToAvailable(blocks, 25);
  assert.equal(fitted.length, 1);
  assert.ok(fitted[0]!.minutes <= 25);
  assert.deepEqual(fitToAvailable(blocks, 0), []);
});
