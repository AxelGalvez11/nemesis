import assert from "node:assert/strict";
import { test } from "node:test";

import { findInDocument, findInUnit, foldForSearch, highlightRuns, stepMatch } from "./reader-search";
import { at } from "./test-helpers";

test("folding never changes the length of the text", () => {
  for (const sample of ["café", "ÄÖÜ", "naïve", "Ω", "日本語", "مرحبا", "é"]) {
    assert.equal(foldForSearch(sample).length, [...sample].length, `length changed for ${sample}`);
  }
});

test("search ignores case and accents", () => {
  assert.deepEqual(findInUnit("The Café is open", "cafe", 1), [{ unit: 1, start: 4, end: 8 }]);
  assert.deepEqual(findInUnit("RÉSUMÉ", "resume", 2), [{ unit: 2, start: 0, end: 6 }]);
});

test("offsets point back at the ORIGINAL text, not the folded copy", () => {
  const text = "Über allen Gipfeln";
  const match = at(findInUnit(text, "gipfeln", 1), 0);
  assert.equal(text.slice(match.start, match.end), "Gipfeln");
});

test("a line break inside the source still matches a space in the query", () => {
  const text = "the commerce\nclause applies";
  const match = at(findInUnit(text, "commerce clause", 1), 0);
  assert.equal(text.slice(match.start, match.end), "commerce\nclause");
});

test("runs of whitespace collapse for matching but keep their place", () => {
  const text = "one    two";
  const match = at(findInUnit(text, "one two", 1), 0);
  assert.equal(text.slice(match.start, match.end), "one    two");
});

test("every occurrence is found, not just the first", () => {
  assert.equal(findInUnit("ab ab ab", "ab", 1).length, 3);
});

test("overlapping repeats do not loop forever", () => {
  assert.equal(findInUnit("aaaa", "aa", 1).length, 2);
});

test("search works the same for scripts with no spaces", () => {
  const text = "電気工学の基礎";
  const match = at(findInUnit(text, "工学", 1), 0);
  assert.equal(text.slice(match.start, match.end), "工学");
});

test("right-to-left text matches by content, not by direction", () => {
  const text = "القانون الدستوري";
  const matches = findInUnit(text, "الدستوري", 1);
  assert.equal(matches.length, 1);
  assert.equal(text.slice(at(matches, 0).start, at(matches, 0).end), "الدستوري");
});

test("an empty or whitespace query finds nothing rather than everything", () => {
  assert.deepEqual(findInUnit("anything", "", 1), []);
  assert.deepEqual(findInUnit("anything", "   ", 1), []);
});

test("document search reports the page each hit is on, in reading order", () => {
  const matches = findInDocument(
    [
      { unit: 1, text: "alpha beta" },
      { unit: 2, text: "beta gamma" },
      { unit: 3, text: "nothing here" },
    ],
    "beta",
  );
  assert.deepEqual(matches.map((match) => match.unit), [1, 2]);
});

test("next and previous wrap around", () => {
  assert.equal(stepMatch(-1, 3, 1), 0);
  assert.equal(stepMatch(2, 3, 1), 0);
  assert.equal(stepMatch(0, 3, -1), 2);
  assert.equal(stepMatch(-1, 3, -1), 2);
  assert.equal(stepMatch(0, 0, 1), -1);
});

test("highlight runs cover the text exactly once", () => {
  const text = "the quick brown fox";
  const runs = highlightRuns(text, [{ start: 4, end: 9 }]);
  assert.equal(runs.map((run) => run.text).join(""), text);
  assert.deepEqual(
    runs.filter((run) => run.highlighted).map((run) => run.text),
    ["quick"],
  );
});

test("overlapping highlights merge instead of nesting", () => {
  const text = "abcdefgh";
  const runs = highlightRuns(text, [
    { start: 1, end: 4 },
    { start: 3, end: 6 },
  ]);
  assert.equal(runs.map((run) => run.text).join(""), text);
  assert.equal(runs.filter((run) => run.highlighted).length, 1);
  assert.equal(runs.find((run) => run.highlighted)?.text, "bcdef");
});

test("out-of-range highlights are clipped, not crashed on", () => {
  const runs = highlightRuns("short", [{ start: -5, end: 99 }]);
  assert.equal(runs.map((run) => run.text).join(""), "short");
  assert.equal(runs.length, 1);
  assert.equal(at(runs, 0).highlighted, true);
});
