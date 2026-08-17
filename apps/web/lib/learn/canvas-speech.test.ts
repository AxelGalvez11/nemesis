import assert from "node:assert/strict";
import test from "node:test";

import {
  isMostlyNotation,
  isSpokenAction,
  speechFor,
  SPEECH_CHAR_LIMIT,
  type SpokenMoment,
} from "./canvas-speech";

const QUESTION = (text: string): SpokenMoment => ({ kind: "question", text });

test("voice mode reads questions and corrections, and nothing else", () => {
  assert.equal(isSpokenAction("retrieve"), true);
  assert.equal(isSpokenAction("show_correction"), true);
  // The explanations, deliberately left on screen where they can be skimmed and re-read.
  assert.equal(isSpokenAction("teach"), false);
  assert.equal(isSpokenAction("simplify"), false);
  // Two things side by side lose their whole shape flattened into a sentence.
  assert.equal(isSpokenAction("contrast"), false);
});

test("a question is spoken as written", () => {
  const choice = speechFor(QUESTION("Why does afferent arteriolar constriction lower GFR?"), "k1");
  assert.equal(choice.spoken?.text, "Why does afferent arteriolar constriction lower GFR?");
  assert.equal(choice.spoken?.key, "k1");
});

test("a correction carries the verdict, not only the answer", () => {
  // 🔴 Hearing only the answer loses whether they were right, which is the part that teaches.
  const choice = speechFor({ kind: "correction", lead: "You had part of this", answer: "It lowers it." }, "k2");
  assert.equal(choice.spoken?.text, "You had part of this. It lowers it.");
});

test("the lead-in is not given two full stops", () => {
  const choice = speechFor({ kind: "correction", lead: "Here's the one to fix.", answer: "Beta blockade." }, "k");
  assert.equal(choice.spoken?.text, "Here's the one to fix. Beta blockade.");
});

test("formatting a reader sees is never pronounced", () => {
  // "[3]" read aloud is "bracket three"; a URL read aloud is unusable.
  const choice = speechFor(QUESTION("What does **ACE** inhibition do [2]? See [the notes](https://x.test/a)."), "k");
  assert.equal(choice.spoken?.text, "What does ACE inhibition do ? See the notes.");
});

test("🔴 notation is refused rather than read aloud as symbols", () => {
  // A synthesiser handed this says "backslash f r a c" and the learner turns voice off for ever.
  assert.equal(speechFor(QUESTION("Solve \\frac{dy}{dx} = 3x^2"), "k").refused, "notation-not-speakable");
  assert.equal(speechFor(QUESTION("Evaluate $$\\int_0^1 x\\,dx$$"), "k").refused, "notation-not-speakable");
});

test("the notation test is a ratio, not a subject-matter keyword list", () => {
  // Field-agnostic: a formula fails, and an ordinary sentence containing a number does not.
  assert.equal(isMostlyNotation("(a+b)^2 = a^2+2ab+b^2"), true);
  assert.equal(isMostlyNotation("C6H12O6 + 6O2 -> 6CO2 + 6H2O"), true);
  assert.equal(isMostlyNotation("Name the enzyme that converts angiotensin I to angiotensin II."), false);
  assert.equal(isMostlyNotation("A 62-year-old presents with a potassium of 5.9."), false);
  // A law question and an engineering question are ordinary language and both pass.
  assert.equal(isMostlyNotation("What must a claimant show to establish promissory estoppel?"), false);
  assert.equal(isMostlyNotation("Why does a fillet weld fail in shear before the parent plate?"), false);
});

test("nothing is spoken when nothing survives cleanup", () => {
  assert.equal(speechFor(QUESTION("   "), "k").refused, "empty-after-cleanup");
  assert.equal(speechFor(QUESTION("**[1]**"), "k").refused, "empty-after-cleanup");
});

test("an over-long utterance is refused, and the boundary is exact", () => {
  // Plain letters, so nothing is stripped and nothing reads as notation — the length is the only
  // thing under test. Built to the cap exactly, because "somewhere past 600" would pass against an
  // off-by-one in either direction.
  const atLimit = "a".repeat(SPEECH_CHAR_LIMIT);
  assert.equal(atLimit.length, SPEECH_CHAR_LIMIT);
  assert.ok(speechFor(QUESTION(atLimit), "k").spoken, "exactly at the cap is still spoken");
  assert.equal(speechFor(QUESTION(`${atLimit}a`), "k").refused, "too-long-to-speak");
});

test("🔴 a refusal is a named reason, never silent", () => {
  // Same construction as `canvas_causal_refused`: a voice that produced nothing and a voice that
  // is BROKEN both sound like silence, and only a named reason tells them apart.
  for (const moment of [QUESTION("  "), QUESTION("\\sum_{i=1}^n i"), QUESTION("x".repeat(999))]) {
    const choice = speechFor(moment, "k");
    assert.equal(choice.spoken, undefined);
    assert.equal(typeof choice.refused, "string");
  }
});
