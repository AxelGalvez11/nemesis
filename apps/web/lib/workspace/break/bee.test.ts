import assert from "node:assert/strict";
import test from "node:test";

import {
  BEE_RANKS,
  beeMaxScore,
  beePointsToNextRank,
  beeRank,
  beeScore,
  beeWordScore,
  checkBeeWord,
  isPangram,
  validateBeePuzzle,
  type BeePuzzle,
} from "./bee";

const PUZZLE: BeePuzzle = {
  center: "n",
  outer: ["o", "t", "a", "i", "c", "v"],
  words: [
    "action", "anoint", "anon", "attain", "avian", "avocation", "cannot", "canon", "cotton",
    "icon", "innovation", "into", "naan", "nation", "notion", "nova", "octant", "onion",
    "onto", "taint", "titan", "vacation",
  ],
};

test("pangram detection needs all seven letters", () => {
  const letters = ["n", "o", "t", "a", "i", "c", "v"];
  assert.equal(isPangram("vacation", letters), true);
  assert.equal(isPangram("nation", letters), false);
  assert.equal(isPangram("innovation", letters), false); // long, but no c
});

test("word scores: 4-letter = 1 point, longer = length, pangram +7", () => {
  const letters = ["n", "o", "t", "a", "i", "c", "v"];
  assert.equal(beeWordScore("onto", letters), 1);
  assert.equal(beeWordScore("nation", letters), 6);
  assert.equal(beeWordScore("innovation", letters), 10);
  assert.equal(beeWordScore("vacation", letters), 15); // 8 letters + 7 pangram bonus
});

test("check rejects in the right order and accepts curated words", () => {
  assert.equal(checkBeeWord(PUZZLE, [], "ant"), "too-short");
  assert.equal(checkBeeWord(PUZZLE, [], "cotta"), "missing-center");
  assert.equal(checkBeeWord(PUZZLE, [], "notes"), "bad-letter");
  assert.equal(checkBeeWord(PUZZLE, [], "canto"), "not-in-list");
  assert.equal(checkBeeWord(PUZZLE, ["onto"], "onto"), "already-found");
  assert.equal(checkBeeWord(PUZZLE, [], "NATION"), "ok");
});

test("score and rank ladder", () => {
  assert.equal(beeScore(PUZZLE, ["onto", "nation"]), 7);
  const max = beeMaxScore(PUZZLE);
  assert.ok(max > 0);
  assert.equal(beeRank(0, max).label, "Beginner");
  assert.equal(beeRank(max, max).label, "Genius");
  assert.equal(BEE_RANKS.at(-1)!.label, "Genius");
  assert.equal(beePointsToNextRank(0, 100), 2); // Good Start sits at 2%
  assert.equal(beePointsToNextRank(100, 100), null);
});

test("bank validation passes the fixture and catches authoring slips", () => {
  assert.deepEqual(validateBeePuzzle(PUZZLE), []);
  const broken = validateBeePuzzle({ center: "n", outer: ["o", "t", "a", "i", "c"], words: ["ant", "onto", "onto"] });
  assert.ok(broken.some((problem) => problem.includes("6 outer")));
  assert.ok(broken.some((problem) => problem.includes("duplicate")));
  assert.ok(broken.some((problem) => problem.includes("pangram")));
  assert.ok(broken.some((problem) => problem.includes("shorter than 4")));
});
