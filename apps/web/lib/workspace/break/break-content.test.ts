import assert from "node:assert/strict";
import test from "node:test";

import { validateBeePuzzle } from "./bee";
import { BEE_PUZZLES } from "./bee-puzzles";
import { validateConnectionsPuzzle } from "./connections";
import { CONNECTIONS_PUZZLES } from "./connections-puzzles";
import { WORDLE_ANSWERS, wordleAllowedSet } from "./wordle-words";

// The content banks are hand-curated; these tests are the mechanical safety
// net that keeps an authoring slip (bad letter, overlap, missing pangram,
// short list, duplicate day word) from ever shipping.

test("every bee puzzle in the bank validates clean", () => {
  assert.ok(BEE_PUZZLES.length >= 12);
  for (const [index, puzzle] of BEE_PUZZLES.entries()) {
    assert.deepEqual(validateBeePuzzle(puzzle), [], `bee puzzle #${index} (center ${puzzle.center})`);
  }
});

test("every connections puzzle in the bank validates clean", () => {
  assert.ok(CONNECTIONS_PUZZLES.length >= 12);
  for (const [index, puzzle] of CONNECTIONS_PUZZLES.entries()) {
    assert.deepEqual(validateConnectionsPuzzle(puzzle), [], `connections puzzle #${index}`);
  }
});

test("wordle answers are clean five-letter words, unique, and all typeable", () => {
  assert.ok(WORDLE_ANSWERS.length >= 300, `only ${WORDLE_ANSWERS.length} answers`);
  assert.equal(new Set(WORDLE_ANSWERS).size, WORDLE_ANSWERS.length, "duplicate answers");
  const allowed = wordleAllowedSet();
  for (const answer of WORDLE_ANSWERS) {
    assert.match(answer, /^[a-z]{5}$/, `bad answer "${answer}"`);
    assert.ok(allowed.has(answer), `answer "${answer}" not in allowed set`);
  }
});

test("the accepted-guess list is big and well-formed", () => {
  const allowed = wordleAllowedSet();
  assert.ok(allowed.size >= 8000, `only ${allowed.size} allowed guesses`);
  for (const word of ["which", "there", "about"]) {
    assert.ok(allowed.has(word), `everyday word "${word}" missing`);
  }
});
