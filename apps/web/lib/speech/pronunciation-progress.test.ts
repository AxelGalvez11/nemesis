// Did the retry help?
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `a two-point rise is not improvement`. Azure's
// whole-utterance score moves by a few points between two identical attempts; reporting that as
// progress teaches a learner to trust a number that is mostly measurement noise, and the first time
// it drops on an identical attempt they stop trusting any of it.

import assert from "node:assert/strict";
import { at, present } from "@/lib/test-support";
import test from "node:test";

import type { PronunciationEvidence } from "@/lib/learn/pronunciation-evidence";
import { compareAttempts, MEANINGFUL_DELTA } from "./pronunciation-progress";
import { voiceProblems } from "@/lib/learn/learner-voice";

function attempt(
  words: readonly { word: string; accuracy?: number; errorType?: "none" | "omission" | "mispronunciation" }[],
  overall?: number,
): PronunciationEvidence {
  return {
    heard: words.map((word) => word.word).join(" "),
    locale: "es-MX",
    ...(overall !== undefined ? { overall: { overall } } : {}),
    provider: "azure",
    target: "el perro corre",
    words: words.map((word) => ({
      ...(word.accuracy !== undefined ? { accuracy: word.accuracy } : {}),
      errorType: word.errorType ?? "none",
      word: word.word,
    })),
  };
}

test("🔴 a movement smaller than the noise floor is unchanged, not improvement", () => {
  const before = attempt([{ accuracy: 0.7, word: "perro" }], 0.7);
  const after = attempt([{ accuracy: 0.7 + MEANINGFUL_DELTA / 2, word: "perro" }], 0.72);
  const comparison = compareAttempts(before, after);
  assert.equal(comparison.overall.change, "unchanged");
  assert.equal(at(comparison.words).change, "unchanged");
  assert.equal(comparison.says, "About the same as before.");
});

test("a real improvement clears it and is reported as one", () => {
  const comparison = compareAttempts(
    attempt([{ accuracy: 0.4, word: "perro" }], 0.5),
    attempt([{ accuracy: 0.9, word: "perro" }], 0.9),
  );
  assert.equal(comparison.overall.change, "improved");
  assert.equal(comparison.overall.delta, 0.4);
  assert.equal(at(comparison.words).change, "improved");
});

test("🔴 the headline is about the word the learner was told to fix, not the average", () => {
  // Otherwise the learner does the arithmetic themselves and reads noise as progress.
  const comparison = compareAttempts(
    attempt([{ accuracy: 0.9, word: "el" }, { accuracy: 0.3, word: "perro" }], 0.6),
    attempt([{ accuracy: 0.5, word: "el" }, { accuracy: 0.95, word: "perro" }], 0.72),
    { targetedWords: ["perro"] },
  );
  assert.equal(comparison.targeted.length, 1);
  assert.equal(at(comparison.targeted).word, "perro");
  assert.equal(comparison.says, '"perro" is fixed.');
  assert.equal(comparison.settled, true);
});

test("a targeted word that did not move keeps the drill open", () => {
  const comparison = compareAttempts(
    attempt([{ accuracy: 0.3, word: "perro" }], 0.4),
    attempt([{ accuracy: 0.31, word: "perro" }], 0.45),
    { targetedWords: ["perro"] },
  );
  assert.equal(comparison.settled, false);
  assert.equal(comparison.says, '"perro" is still the one.');
});

test("🔴 words are paired by what they are, not by where they are", () => {
  // A learner who omitted a word on the first try and said it on the second shifts every index after
  // it; an index-paired comparison would report every remaining word as changed.
  const before = attempt([{ errorType: "omission", word: "el" }, { accuracy: 0.8, word: "perro" }, { accuracy: 0.8, word: "corre" }]);
  const after = attempt([{ accuracy: 0.9, word: "el" }, { accuracy: 0.81, word: "perro" }, { accuracy: 0.79, word: "corre" }]);
  const comparison = compareAttempts(before, after);
  const perro = comparison.words.find((word) => word.word === "perro");
  const corre = comparison.words.find((word) => word.word === "corre");
  assert.equal(perro?.change, "unchanged");
  assert.equal(corre?.change, "unchanged");
  // And the word that went from skipped to said is "new", because it had no score to improve on.
  assert.equal(comparison.words.find((word) => word.word === "el")?.change, "new");
});

test("🔴 an omission is never scored as a zero on either side", () => {
  const comparison = compareAttempts(
    attempt([{ errorType: "omission", word: "corre" }]),
    attempt([{ accuracy: 0.6, word: "corre" }]),
  );
  assert.equal(at(comparison.words).before, undefined, "an omission was given a score it never had");
  assert.equal(at(comparison.words).delta, undefined, "a delta was computed against an invented zero");
});

test("repeated words match by occurrence", () => {
  const before = attempt([{ accuracy: 0.9, word: "la" }, { accuracy: 0.2, word: "la" }]);
  const after = attempt([{ accuracy: 0.9, word: "la" }, { accuracy: 0.9, word: "la" }]);
  const comparison = compareAttempts(before, after);
  assert.equal(comparison.words.length, 2);
  assert.equal(comparison.words.filter((word) => word.change === "improved").length, 1);
});

test("punctuation and case do not break the pairing", () => {
  const comparison = compareAttempts(
    attempt([{ accuracy: 0.4, word: "Perro," }]),
    attempt([{ accuracy: 0.9, word: "perro" }]),
  );
  assert.equal(comparison.words.length, 1);
  assert.equal(at(comparison.words).change, "improved");
});

test("a provider that reported no overall score does not fabricate one", () => {
  const comparison = compareAttempts(attempt([{ accuracy: 0.5, word: "x" }]), attempt([{ accuracy: 0.9, word: "x" }]));
  assert.equal(comparison.overall.before, undefined);
  assert.equal(comparison.overall.delta, undefined);
  assert.equal(comparison.overall.change, "unchanged");
});

test("🔴 every line obeys the teacher's voice", () => {
  const lines = [
    compareAttempts(attempt([{ accuracy: 0.4, word: "perro" }], 0.4), attempt([{ accuracy: 0.9, word: "perro" }], 0.9)).says,
    compareAttempts(attempt([{ accuracy: 0.9, word: "perro" }], 0.9), attempt([{ accuracy: 0.3, word: "perro" }], 0.3)).says,
    compareAttempts(
      attempt([{ accuracy: 0.3, word: "perro" }], 0.4),
      attempt([{ accuracy: 0.31, word: "perro" }], 0.42),
      { targetedWords: ["perro"] },
    ).says,
  ];
  for (const line of lines) assert.deepEqual(voiceProblems(line, { maxWords: 8 }), []);
});
