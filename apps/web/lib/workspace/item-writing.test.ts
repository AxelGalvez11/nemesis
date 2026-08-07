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
