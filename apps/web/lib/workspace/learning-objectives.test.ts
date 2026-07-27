import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findLearningObjectives,
  MAX_OBJECTIVES,
  objectivesPromptBlock,
} from "./learning-objectives";

const deck = (body: string) => `Pharmacology 301\nUnit 3 — Antihypertensives\n\n${body}\n\nSlide 3\nACE inhibitors block conversion of angiotensin I to angiotensin II.`;

// ── The wordings a real deck actually uses ───────────────────────────────────

test("a plain 'Learning Objectives' heading with bullets", () => {
  const found = findLearningObjectives(deck("Learning Objectives\n• Describe the renin-angiotensin system\n• Explain how ACE inhibitors lower blood pressure"));
  assert.equal(found.heading, "Learning Objectives");
  assert.deepEqual(found.objectives, [
    "Describe the renin-angiotensin system",
    "Explain how ACE inhibitors lower blood pressure",
  ]);
});

test("'Objectives' on its own still counts", () => {
  const found = findLearningObjectives(deck("Objectives\n1. Identify the four classes of diuretic\n2. Compare loop and thiazide diuretics"));
  assert.equal(found.objectives.length, 2);
  assert.equal(found.objectives[0], "Identify the four classes of diuretic");
});

test("'By the end of this lecture you will be able to' with no separate heading", () => {
  const found = findLearningObjectives(deck("By the end of this lecture, students will be able to:\n- Calculate a creatinine clearance\n- Adjust a dose for renal impairment"));
  assert.deepEqual(found.objectives, ["Calculate a creatinine clearance", "Adjust a dose for renal impairment"]);
});

test("objectives listed inline on the heading line itself", () => {
  const found = findLearningObjectives(deck("Upon completion of this module: describe the mechanism of beta blockade; explain the contraindications in asthma"));
  assert.equal(found.objectives.length, 2);
  assert.match(found.objectives[0]!, /describe the mechanism/i);
});

test("'Learning Outcomes' and 'Course Goals' are the same thing", () => {
  for (const heading of ["Learning Outcomes", "Course Goals", "Session Objectives", "Module Outcomes"]) {
    const found = findLearningObjectives(deck(`${heading}\n• Explain the pharmacokinetics of warfarin`));
    assert.equal(found.objectives.length, 1, `${heading} was not recognised`);
  }
});

test("a slide-number prefix on the heading does not hide it", () => {
  const found = findLearningObjectives(deck("Slide 2 — Learning Objectives\n• Describe first-pass metabolism"));
  assert.equal(found.objectives.length, 1);
});

// ── Restraint: no objectives is a valid answer ───────────────────────────────

test("a deck with no objectives slide reports none rather than guessing", () => {
  const found = findLearningObjectives("Antibiotics\n\nPenicillins bind PBPs.\nCephalosporins are grouped by generation.");
  assert.deepEqual(found.objectives, []);
  assert.equal(found.heading, null);
});

test("empty and whitespace-only input are handled", () => {
  assert.deepEqual(findLearningObjectives("").objectives, []);
  assert.deepEqual(findLearningObjectives("   \n\n  ").objectives, []);
});

test("a heading with nothing usable under it reports none, not an empty heading", () => {
  const found = findLearningObjectives("Learning Objectives\n\n\nSlide 4\nPenicillins bind PBPs and are bactericidal.");
  assert.deepEqual(found.objectives, []);
});

test("body prose after the list ends the list", () => {
  const found = findLearningObjectives(
    "Learning Objectives\n• Describe the renin-angiotensin system\nThe kidney releases renin in response to reduced perfusion pressure, which then acts on angiotensinogen.",
  );
  assert.deepEqual(found.objectives, ["Describe the renin-angiotensin system"]);
});

test("a table of contents dressed as a list is capped, not swallowed whole", () => {
  const many = Array.from({ length: 40 }, (_, i) => `• Item number ${i} about pharmacology`).join("\n");
  const found = findLearningObjectives(`Learning Objectives\n${many}`);
  assert.equal(found.objectives.length, MAX_OBJECTIVES);
});

test("fragments too short to be an objective are dropped", () => {
  const found = findLearningObjectives("Objectives\n• 3\n• ok\n• Describe the mechanism of action of statins");
  assert.deepEqual(found.objectives, ["Describe the mechanism of action of statins"]);
});

test("a very long objective is truncated rather than dropped", () => {
  const long = `Describe ${"the pharmacokinetics of every agent in this class ".repeat(12)}`;
  const found = findLearningObjectives(`Objectives\n• ${long}`);
  assert.equal(found.objectives.length, 1);
  assert.ok(found.objectives[0]!.length <= 240);
  assert.ok(found.objectives[0]!.endsWith("…"));
});

test("the same objective repeated across slides appears once", () => {
  const found = findLearningObjectives("Objectives\n• Describe the renin-angiotensin system\n• describe the RENIN-ANGIOTENSIN system\n• Explain ACE inhibition fully");
  assert.equal(found.objectives.length, 2);
});

test("a second objectives heading stops the first list", () => {
  const found = findLearningObjectives(
    "Learning Objectives\n• Describe the renin-angiotensin system\nSession Objectives\n• Explain something else entirely",
  );
  assert.deepEqual(found.objectives, ["Describe the renin-angiotensin system"]);
});

// ── The prompt block ─────────────────────────────────────────────────────────

test("the prompt block is empty when nothing was found, so callers can concatenate blindly", () => {
  assert.equal(objectivesPromptBlock({ heading: null, objectives: [] }), "");
});

test("the prompt block numbers the objectives and says they come first", () => {
  const block = objectivesPromptBlock({ heading: "Objectives", objectives: ["Describe X", "Explain Y"] });
  assert.match(block, /1\. Describe X/);
  assert.match(block, /2\. Explain Y/);
  assert.match(block, /examined on/i);
});

// This is the whole point of extracting before clipping: a deck far longer than
// MATERIAL_CHAR_LIMIT still contributes its objectives to the prompt.
test("objectives survive a deck far longer than the generator's clip", () => {
  const filler = "Slide content about pharmacokinetics and drug metabolism. ".repeat(400);
  // A unique marker on the LAST slide, so "did the tail survive the clip" is a real
  // question and not one the repeated filler answers by accident.
  const full = `Learning Objectives\n• Describe the renin-angiotensin system\n• Explain ACE inhibition\n\n${filler}\nFinal slide: zafirlukast dosing table.`;
  assert.ok(full.length > 9_000, "the fixture must exceed MATERIAL_CHAR_LIMIT to be meaningful");
  const found = findLearningObjectives(full);
  assert.equal(found.objectives.length, 2);
  assert.ok(!full.slice(0, 9_000).includes("zafirlukast"), "the end of this deck genuinely does not survive the clip");
});
