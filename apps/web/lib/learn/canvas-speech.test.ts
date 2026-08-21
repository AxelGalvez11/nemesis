import assert from "node:assert/strict";
import test from "node:test";

import {
  isMostlyNotation,
  isSpokenAction,
  shouldSpeakAction,
  speechChunks,
  speechFor,
  SPEECH_CHAR_LIMIT,
  SPOKEN_EXPLANATION_LIMIT,
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

test("explanations are read only when short enough to be a remark", () => {
  const short = "Blood leaves faster than it arrives, so pressure inside the tuft falls.";
  const long = "x".repeat(SPOKEN_EXPLANATION_LIMIT + 1);

  assert.equal(shouldSpeakAction({ actionType: "teach", text: short }), true);
  assert.equal(shouldSpeakAction({ actionType: "teach", text: long }), false, "a paragraph stays on screen");
  assert.equal(shouldSpeakAction({ actionType: "simplify", text: short }), true);

  // An explicit request outranks the length rule: somebody who asked to be read to has stated the
  // preference the rule exists to guess at.
  assert.equal(shouldSpeakAction({ actionType: "teach", requested: true, text: long }), true);

  // Questions and corrections are always read, whatever their length.
  assert.equal(shouldSpeakAction({ actionType: "retrieve", text: long }), true);
  assert.equal(shouldSpeakAction({ actionType: "show_correction", text: long }), true);

  // 🔴 Contrast is spatial and stays absent even when short — flattening two things placed side by
  // side into one sentence loses the whole reason it was chosen.
  assert.equal(shouldSpeakAction({ actionType: "contrast", requested: true, text: short }), false);
});

test("the explanation bound is much tighter than the hard cap, and that gap is deliberate", () => {
  assert.ok(SPOKEN_EXPLANATION_LIMIT < SPEECH_CHAR_LIMIT / 2);
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


// ───────────────────────────────────── a long answer is several requests, not silence
//
// 🔴🔴 REPORTED 2026-08-21: *"it wouldn't play the whole passage."* Both synthesisers answer 413
// above SPEECH_CHAR_LIMIT and "Read aloud" sent the whole answer as one request, so every answer
// over 600 characters was a control that looked fine and did nothing.

const LONG = Array.from({ length: 40 }, (_, i) => `This is sentence number ${i} in a long answer.`).join(" ");

test("🔴 a passage over the limit comes back as several pieces, none of them over it", () => {
  const parts = speechChunks(LONG);
  assert.ok(parts.length > 1, "a long passage still went out as one request");
  for (const part of parts) assert.ok(part.length <= SPEECH_CHAR_LIMIT, `${part.length} > ${SPEECH_CHAR_LIMIT}`);
});

test("🔴 nothing is dropped — every word of the answer is still spoken", () => {
  assert.equal(speechChunks(LONG).join(" ").replace(/\s+/g, " "), LONG.replace(/\s+/g, " "));
});

test("a passage that already fits is one piece, so the ordinary case sends one request", () => {
  assert.deepEqual(speechChunks("Short enough to say."), ["Short enough to say."]);
});

test("empty text asks for nothing at all", () => {
  assert.deepEqual(speechChunks("   "), []);
});

test("the seam lands at a sentence end, where a reader would pause anyway", () => {
  const parts = speechChunks("One. Two. Three.", 10);
  assert.deepEqual(parts, ["One. Two.", "Three."]);
});

test("a single token longer than the whole limit is broken up rather than lost", () => {
  const parts = speechChunks("x".repeat(25), 10);
  assert.deepEqual(parts, ["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
});

test("line breaks are seams too, so a list does not run together", () => {
  assert.deepEqual(speechChunks("alpha\nbeta\ngamma", 12), ["alpha beta", "gamma"]);
});
