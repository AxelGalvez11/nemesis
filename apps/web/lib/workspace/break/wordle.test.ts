import assert from "node:assert/strict";
import test from "node:test";

import { guessProblem, keyboardStates, scoreGuess, wordleStatus } from "./wordle";

test("scoring marks exact, misplaced, and absent letters", () => {
  assert.deepEqual(scoreGuess("crane", "crane"), ["correct", "correct", "correct", "correct", "correct"]);
  assert.deepEqual(scoreGuess("stone", "notes"), ["present", "present", "present", "present", "present"]);
  assert.deepEqual(scoreGuess("aaaaa", "bbbbb"), ["absent", "absent", "absent", "absent", "absent"]);
});

test("duplicate letters never over-mark", () => {
  // Answer has ONE e, already consumed by the green at the end — the two
  // early e's stay grey while the r still lights up.
  assert.deepEqual(scoreGuess("eerie", "brace"), ["absent", "absent", "present", "absent", "correct"]);
  // Correct placements consume the letter budget before present marks.
  assert.deepEqual(scoreGuess("geese", "those"), ["absent", "absent", "absent", "correct", "correct"]);
  // Two Ls in the answer allow two L marks in the guess.
  assert.deepEqual(scoreGuess("llama", "hello"), ["present", "present", "absent", "absent", "absent"]);
});

test("scoring is case-insensitive", () => {
  assert.deepEqual(scoreGuess("CRANE", "crane"), ["correct", "correct", "correct", "correct", "correct"]);
});

test("keyboard keeps the best state seen for each letter", () => {
  const states = keyboardStates(["crate", "crane"], "crane");
  assert.equal(states.c, "correct");
  assert.equal(states.t, "absent");
  assert.equal(states.e, "correct");
  // A letter that was green once stays green even after a wrong placement later.
  const sticky = keyboardStates(["crane", "necks"], "crane");
  assert.equal(sticky.n, "correct");
});

test("status derives from guesses alone", () => {
  assert.equal(wordleStatus([], "crane"), "playing");
  assert.equal(wordleStatus(["stone", "crane"], "crane"), "won");
  assert.equal(wordleStatus(["aback", "abase", "abate", "abbey", "abbot", "abhor"], "crane"), "lost");
});

test("guess validation reports the exact problem", () => {
  const allowed = new Set(["crane", "stone"]);
  assert.equal(guessProblem("cra", allowed), "Not enough letters");
  assert.equal(guessProblem("cran1", allowed), "Letters only");
  assert.equal(guessProblem("zzzzz", allowed), "Not in word list");
  assert.equal(guessProblem("CRANE", allowed), null);
});
