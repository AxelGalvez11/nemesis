import assert from "node:assert/strict";
import test from "node:test";

import { breakLexicon } from "./break-lexicon";
import {
  checkLetterBoxWord,
  letterBoxLetters,
  letterBoxSolved,
  lettersUsed,
  sideOfLetter,
  validateLetterBoxPuzzle,
  type LetterBoxPuzzle,
} from "./letterboxed";
import { LETTERBOX_PUZZLES } from "./letterboxed-puzzles";

const PUZZLE: LetterBoxPuzzle = {
  sides: ["tse", "oua", "wig", "cpn"],
  solution: ["octopus", "sweating"],
};

test("word checks enforce every rule in order", () => {
  const dictionary = new Set(["octopus", "sweating", "gag", "cat", "cats", "toes", "note", "eat"]);
  assert.equal(checkLetterBoxWord(PUZZLE, [], "at", dictionary), "too-short");
  assert.equal(checkLetterBoxWord(PUZZLE, [], "cab", dictionary), "bad-letter");
  // t→o hops sides fine, but e→s stays on the "tse" side.
  assert.equal(checkLetterBoxWord(PUZZLE, [], "toes", dictionary), "same-side");
  assert.equal(checkLetterBoxWord(PUZZLE, [], "octopus", dictionary), "ok");
  assert.equal(checkLetterBoxWord(PUZZLE, ["octopus"], "note", dictionary), "bad-chain");
  assert.equal(checkLetterBoxWord(PUZZLE, ["octopus"], "sweating", dictionary), "ok");
  // The chain rule runs before the repeat check, so the repeat must also
  // chain legally ("gag" ends and starts with g).
  assert.equal(checkLetterBoxWord(PUZZLE, ["octopus", "sweating", "gag"], "gag", dictionary), "already-used");
  assert.equal(checkLetterBoxWord(PUZZLE, [], "tow", dictionary), "not-a-word");
});

test("letters-used tracking and the win condition", () => {
  assert.equal(letterBoxSolved(PUZZLE, ["octopus"]), false);
  assert.equal(letterBoxSolved(PUZZLE, ["octopus", "sweating"]), true);
  const used = lettersUsed(PUZZLE, ["octopus"]);
  assert.ok(used.has("c") && used.has("t") && !used.has("w"));
  assert.equal(letterBoxLetters(PUZZLE).length, 12);
  assert.equal(sideOfLetter(PUZZLE, "w"), 2); // "wig" is the third side
  assert.equal(sideOfLetter(PUZZLE, "z"), -1);
});

test("every banked board validates against the shipping dictionary", () => {
  const dictionary = breakLexicon();
  assert.ok(LETTERBOX_PUZZLES.length >= 10);
  for (const [index, puzzle] of LETTERBOX_PUZZLES.entries()) {
    assert.deepEqual(validateLetterBoxPuzzle(puzzle, dictionary), [], `board #${index}`);
  }
});

test("the shipping dictionary is large and sane", () => {
  const dictionary = breakLexicon();
  assert.ok(dictionary.size >= 15000);
  for (const word of ["about", "which", "network", "eclipse"]) assert.ok(dictionary.has(word), word);
});
