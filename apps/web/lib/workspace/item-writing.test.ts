import assert from "node:assert/strict";
import test from "node:test";

import { EXAM_ITEM_RULES, EXAM_ITEM_RULES_SHORT } from "./item-writing";

/**
 * 🔴 THE FIELD-NEUTRALITY TEST FROM `CLAUDE.md`, MADE MECHANICAL.
 *
 * "Would this work for a law student and a mechanical engineering student?" is
 * the standing design rule, and until 2026-08-07 this file failed it: the rules
 * told the model to build stems from patients and lab values. Nothing caught it
 * because nothing was looking, and a prompt is not typechecked.
 *
 * The word list below is NOT a keyword filter on student content — that would be
 * the same mistake one level up. It is a check on OUR OWN PROMPT, which we
 * control, and it fails loudly if someone reaches for a familiar example again.
 */
const FIELD_SPECIFIC = [
  "patient",
  "clinical",
  "diagnos",
  "lab value",
  "lab result",
  "dose",
  "drug",
  "symptom",
  "pharmac",
  // Other fields, so this does not merely trade medicine for law.
  "plaintiff",
  "defendant",
  "statute",
  "beam",
  "circuit",
];

test("the item-writing rules name no discipline", () => {
  const lowered = EXAM_ITEM_RULES.toLowerCase();
  for (const word of FIELD_SPECIFIC) {
    assert.ok(
      !lowered.includes(word),
      `EXAM_ITEM_RULES mentions "${word}". A law student and a mechanical ` +
        `engineering student both use this prompt; an example from one field ` +
        `tells the model to write that field's exam for everyone.`,
    );
  }
});

test("the short form names no discipline either", () => {
  const lowered = EXAM_ITEM_RULES_SHORT.toLowerCase();
  for (const word of FIELD_SPECIFIC) {
    assert.ok(!lowered.includes(word), `EXAM_ITEM_RULES_SHORT mentions "${word}"`);
  }
});

test("the craft survived the neutralising", () => {
  // Removing the medical examples must not have removed the rules they
  // illustrated. These are the NBME's substantive constraints, and a rewrite
  // that dropped one would read as cleaner and measure worse.
  const lowered = EXAM_ITEM_RULES.toLowerCase();
  for (const rule of [
    "one-best-answer",
    "before the options are read",
    "same category",
    "all of the above",
    "never by letter",
  ]) {
    assert.ok(lowered.includes(rule), `the rule about "${rule}" was lost`);
  }
});

test("specifics come from the student's material, never from the model", () => {
  // The strongest of the nine, and the one most easily lost in a rewrite: an
  // invented measurement is indistinguishable from a real one to the student
  // revising from it.
  assert.match(EXAM_ITEM_RULES, /Never invent a specific/);
  assert.match(EXAM_ITEM_RULES, /student's own material/);
});

// 🔴🔴 THE ONE THING ON THE OWNER'S LIST THESE RULES DID NOT COVER (2026-09-03: questions must
// "vary in difficulty"). Every rule above makes a single item sound; none of them said anything
// about the SET. Nine items pitched identically measure one point on the scale, so a student who
// scores 6/9 learns that they got six right and nothing about where they actually stand.
//
// 🔴 AND THE SECOND HALF IS WHAT STOPS THE RULE BEING CHEATED. The easiest way to make an item
// "harder" is to word it vaguely, run it long, or bury the question in the middle of the stem.
// All three make it harder to ANSWER without making it harder to KNOW, which punishes the careful
// reader and rewards the guesser: the exact flaw the rest of the file exists to prevent.
test("🔴 the paper is asked for a spread of difficulty, earned by structure", () => {
  assert.match(EXAM_ITEM_RULES, /Spread the difficulty across the paper/, "nothing asks the paper to vary in difficulty");
  assert.match(EXAM_ITEM_RULES, /more steps between the stem and the answer/, "difficulty is no longer defined by the item's structure");
  assert.match(EXAM_ITEM_RULES, /near miss rather than an obvious error/, "the distractor half of difficulty was lost");
  assert.match(EXAM_ITEM_RULES, /Never make an item harder by making it vaguer/, "an item may be made hard by being unclear again");
  // The short form rides in every tool description, so it carries the rule too or the two drift.
  assert.match(EXAM_ITEM_RULES_SHORT, /difficulty spread across the paper/, "the short form lost the difficulty rule");
  // A difficulty rule is the easiest place to smuggle in a subject: "a hard pharmacology item"
  // reads naturally and is wrong. The two tests above already scan the whole constant, and this
  // states the intent at the point it would break.
  assert.doesNotMatch(EXAM_ITEM_RULES, /easy, medium|three easy|label each question/i, "difficulty became a label to sort items into rather than a property of them");
});
