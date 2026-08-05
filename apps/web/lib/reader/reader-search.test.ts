import assert from "node:assert/strict";
import { test } from "node:test";

import { findInDocument, findInUnit, foldForSearch, highlightRuns, stepMatch } from "./reader-search";
import { at } from "./test-helpers";

test("folding never changes the length of the text", () => {
  for (const sample of ["café", "ÄÖÜ", "naïve", "Ω", "日本語", "مرحبا", "é"]) {
    // 🔴 Measured in UTF-16 code units — `.length`, NOT `[...sample].length`.
    // Offsets index code units, so that is the invariant that actually matters.
    // Counting code points let this test pass while the fold silently shortened
    // every astral character, shifting later highlights by one and drifting
    // further with each one. Every sample on the line above is basic-plane,
    // where the two counts agree, so nothing here could ever have caught it —
    // the astral cases live in the dedicated test further down.
    assert.equal(foldForSearch(sample).length, sample.length, `length changed for ${sample}`);
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

// --- Typography a student cannot type ------------------------------------
// Every case below was measured on the owner's real Fall 2026 course files
// (2026-08-05 acceptance pass): 6 of 7 real PDFs set apostrophes curly, so
// searching "patient's" — the single most ordinary thing to search for —
// matched nothing at all before this.

test("a straight apostrophe finds the curly one the typesetter used", () => {
  const matches = findInUnit("the patient’s chart", "patient's", 1);
  assert.equal(matches.length, 1);
  assert.equal("the patient’s chart".slice(at(matches, 0).start, at(matches, 0).end), "patient’s");
});

test("a hyphen finds an en dash, and straight quotes find curly ones", () => {
  assert.equal(findInUnit("pages 10–12 today", "10-12", 1).length, 1);
  assert.equal(findInUnit("he said “yes” loudly", '"yes"', 1).length, 1);
});

test("a ligature answers to the letters it stands for, and highlights the glyph", () => {
  const text = "the ﬁrst dose";
  const matches = findInUnit(text, "first", 1);
  assert.equal(matches.length, 1);
  // The whole ligature is covered — a highlight cannot end inside one glyph.
  assert.equal(text.slice(at(matches, 0).start, at(matches, 0).end), "ﬁrst");
  assert.equal(findInUnit("Encyclopædia", "encyclopaedia", 1).length, 1);
  assert.equal(findInUnit("Straße 5", "strasse", 1).length, 1);
});

test("characters that are in the text but not on the page are ignored", () => {
  // A soft hyphen left by the typesetter must not stop the word matching.
  assert.equal(findInUnit("co­operate now", "cooperate", 1).length, 1);
  assert.equal(findInUnit("zero​width", "zerowidth", 1).length, 1);
});

test("folding never changes the length of the text it folds", () => {
  // 🔴 The regression this pins: a character outside the basic plane occupies
  // TWO code units. Folding it to one shifted every later highlight by one and
  // drifted further with each one — invisible until an engineering PDF full of
  // mathematical italics lands in the reader.
  for (const sample of ["patient’s", "10–12", "ﬁrst", "\u{1D465} energy", "İstanbul", "\u{1F600}x", "café"]) {
    assert.equal(foldForSearch(sample).length, sample.length, `length changed for ${JSON.stringify(sample)}`);
  }
});

test("a match after an astral character lands on the real characters", () => {
  const text = "\u{1D465}\u{1D466}\u{1D467} then mass";
  const matches = findInUnit(text, "mass", 1);
  assert.equal(at(matches, 0).start, text.indexOf("mass"));
  assert.equal(text.slice(at(matches, 0).start, at(matches, 0).end), "mass");
});

test("a compound broken across a line still matches when typed as one word", () => {
  // Real: the Fall 2026 micro syllabus reads "the three-\nextension limit", and
  // "three-extension" found nothing. Four of the seven real course PDFs in the
  // 2026-08-05 pass had a compound split this way.
  const text = "the three-\nextension limit";
  const matches = findInUnit(text, "three-extension", 1);
  assert.equal(matches.length, 1);
  assert.equal(text.slice(at(matches, 0).start, at(matches, 0).end), "three-\nextension");
  // The break is examined as a whole run, so indentation after it is fine.
  assert.equal(findInUnit("a self-\r\n   assessment form", "self-assessment", 1).length, 1);
  assert.equal(findInUnit("end-\nof-\nline chain", "end-of-line", 1).length, 1);
});

test("only a line break closes a hyphen — a spaced dash is left alone", () => {
  // Without this, "break- here" would silently become "break-here".
  assert.equal(findInUnit("no break- here", "break- here", 1).length, 1);
  assert.equal(findInUnit("commerce\nclause", "commerce clause", 1).length, 1);
});
