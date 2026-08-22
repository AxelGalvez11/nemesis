// The live thinking preview: what a learner sees while Nemesis works, and what it is never shown.
//
// 🔴🔴 THIS REPLACES A "SHOW THINKING" DISCLOSURE, AND THE OWNER WAS RIGHT THAT THEY ARE DIFFERENT
// FEATURES. 2026-08-21: *"Do not implement 'Show thinking' as a raw chain-of-thought viewer… The
// thinking preview is a temporary, user-facing representation of what Nemesis is doing while the
// response is being generated."* A transcript under an answer is an archive nobody opens twice; a
// line that says what is happening while it happens is a tutor working in front of you.
//
// 🔴 EVERY TEST HERE IS ABOUT A CLAIM BEING REFUSED OR WITHHELD, not about one being displayed. The
// display is three lines of JSX. What is hard — and what `thinking-phases.ts` spent a section
// forbidding in a weaker form — is a plausible sequence that runs on a timer and looks exactly like
// a system working.

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_MILESTONE_LENGTH,
  MAX_MILESTONES,
  previewLine,
  previewWorthShowing,
  readMilestones,
  TURN_STAGES,
} from "./turn-preview";

const GOOD = [
  "Comparing your notes with the current guidance",
  "Checking the latest treatment recommendations",
  "Comparing the new guidance with your lecture",
];

test("well-formed milestones are kept in order", () => {
  assert.deepEqual(readMilestones(GOOD, true), GOOD);
});

// 🔴🔴 THE ONE THAT MATTERS MOST. A model that says it is checking the latest guidance on a turn
// that bought no search has described a system that does not exist — and it is the most believable
// thing this field can carry, because it is exactly what a working product would say.
test("🔴 a milestone claiming a search is dropped when no search runs", () => {
  const kept = readMilestones(["Reading your lecture notes", "Checking the latest recommendations"], false);
  assert.deepEqual(kept, ["Reading your lecture notes"]);
});

// 🔴 THE OWNER'S OWN LIST, AND EVERY ITEM IS A WAY OF LOOKING BUSY RATHER THAN BEING INFORMATIVE:
// "no fake progress, no percentages, no 'Step 1 / Step 2', no token counts, no technical
// implementation details, no repeating 'Thinking…'". A model reaches for all of them, because they
// are what "show your progress" looks like in most training data.
test("🔴 progress theatre is refused, line by line", () => {
  for (const bad of [
    "45% through your notes",
    "Step 2: comparing the guidance",
    "Read 1200 tokens of your lecture",
    "Thinking about your question",
    "Parsing the JSON payload",
    "Calling the model endpoint",
  ]) {
    assert.deepEqual(readMilestones([bad], true), [], `"${bad}" reached the screen`);
  }
});

// 🔴 ONE BAD LINE COSTS ITS OWN LINE, NOT THE TURN'S WHOLE PREVIEW. Punishing the learner for a
// wording only we can see is the wrong trade.
test("a refused line does not take the good ones with it", () => {
  assert.deepEqual(readMilestones(["Reading your notes", "60% done", "Writing it up"], true), [
    "Reading your notes",
    "Writing it up",
  ]);
});

test("milestones are bounded, deduped and trimmed", () => {
  assert.equal(readMilestones(["x".repeat(MAX_MILESTONE_LENGTH + 1)], true).length, 0);
  assert.deepEqual(readMilestones(["  Reading   your notes  "], true), ["Reading your notes"]);
  assert.deepEqual(readMilestones(["Reading your notes", "reading YOUR notes"], true), ["Reading your notes"]);
  assert.equal(readMilestones(Array.from({ length: 9 }, (_, i) => `Doing thing number ${i}`), true).length, MAX_MILESTONES);
  assert.deepEqual(readMilestones("not an array", true), []);
  assert.deepEqual(readMilestones([1, null, {}], true), []);
});

// 🔴🔴 INDEXED BY STAGE, NOT CONSUMED IN ORDER, AND THIS IS THE HEART OF THE HONESTY. If the model
// wrote a line for searching and the turn never searched, `searching` is never entered — so that
// line never appears rather than sliding up to describe work that did not happen.
test("🔴 a stage that was never entered never shows its line", () => {
  const milestones = ["Reading your notes", "Checking the guidance online", "Comparing the two"];
  assert.equal(previewLine({ milestones, stage: "decided" }), "Reading your notes");
  assert.equal(previewLine({ milestones, stage: "searching" }), "Checking the guidance online");
  assert.equal(previewLine({ milestones, stage: "reading" }), "Comparing the two");
  // A turn that answers straight away goes decided → finishing, and there is no fourth line.
  assert.equal(previewLine({ milestones, stage: "finishing" }), null);
});

test("the system's own label fills a stage the model said nothing about", () => {
  assert.equal(previewLine({ milestones: [], stage: "searching", systemLabel: "Reading 4 pages" }), "Reading 4 pages");
  // 🔴 AND THE MODEL'S WORDS WIN WHEN IT HAS THEM. A milestone is conversational and about the
  // learner's subject; only the model can write that.
  assert.equal(
    previewLine({ milestones: ["Reading your notes"], stage: "decided", systemLabel: "Thinking" }),
    "Reading your notes",
  );
});

// 🔴 THE OWNER'S FIRST RULE, AND THE EASIEST ONE TO LOSE: "For a simple conversational response: do
// not show a thinking preview, answer immediately." A greeting that flashes a line about planning
// teaches a learner the slot means nothing, and then they stop reading it on the turn that mattered.
test("🔴 a turn with no work in it shows nothing at all", () => {
  assert.equal(previewWorthShowing({ milestones: [] }), false);
  assert.equal(previewWorthShowing({ milestones: [], systemLabel: null }), false);
  assert.equal(previewWorthShowing({ milestones: ["Building the lesson"] }), true);
  assert.equal(previewWorthShowing({ milestones: [], systemLabel: "Reading slides" }), true);
});

// 🔴 AND IT IS GONE THE MOMENT THE ANSWER STARTS. Nothing is "about to happen" once the thing it was
// about to do is on screen.
test("🔴 the preview stops the moment the answer begins", () => {
  assert.equal(previewLine({ answering: true, milestones: ["Reading your notes"], stage: "decided" }), null);
  assert.equal(previewLine({ answering: true, milestones: [], stage: "searching", systemLabel: "Reading 4 pages" }), null);
});

// 🔴 FOUR STAGES, FOUR LINES. A fifth milestone could never be reached, so accepting one would be
// storing something no learner can ever see.
test("the stage list and the milestone bound cannot drift apart", () => {
  assert.equal(TURN_STAGES.length, MAX_MILESTONES);
});
