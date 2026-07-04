import assert from "node:assert/strict";
import { capText, guessTitle } from "./extract";

// capText: caps at the limit and reports truncation honestly.
{
  const short = capText("hello world", 100);
  assert.equal(short.text, "hello world");
  assert.equal(short.truncated, false);
}
{
  const long = capText("abcdefghij", 5);
  assert.equal(long.text, "abcde");
  assert.equal(long.truncated, true);
}
{
  // Exactly at the cap is NOT truncated.
  const exact = capText("abcde", 5);
  assert.equal(exact.truncated, false);
}

// guessTitle: first non-trivial line, trimmed; null when nothing plausible.
{
  const t = guessTitle("  \n\nEffect of Drug X on Mortality: A Randomized Trial\nAuthors et al.\nAbstract...");
  assert.equal(t, "Effect of Drug X on Mortality: A Randomized Trial");
}
{
  // A very short first line (page header noise) is skipped in favor of the next plausible line.
  const t = guessTitle("1\nPMID: 12345\nA Well-Formed Study Title That Is Clearly The Paper Name\n");
  assert.equal(t, "A Well-Formed Study Title That Is Clearly The Paper Name");
}
{
  assert.equal(guessTitle("   \n \n "), null);
}

// Regression guard: unpdf's per-page extraction (mergePages: false, the default) returns one string per
// page, each with internal newlines from PDF.js's per-line hasEOL markers. extractPdfText joins those
// pages with "\n" before calling guessTitle. Simulate that shape directly — an array of per-page strings,
// each multi-line — and confirm the join+guessTitle composition still finds the real title on line 1, not
// a giant blob of prose. This is the exact shape that mergePages: true would have destroyed (it runs
// `texts.join("\n").replace(/\s+/g, " ")`, collapsing every newline before guessTitle ever runs).
{
  const pages = [
    "Effect of Drug X on Mortality: A Randomized Trial\nJane Doe, MD; John Smith, PhD\nBackground: This study examines a very long stretch of body prose that would blow past the 12-character short-line skip filter if newlines were collapsed into one line ahead of time.\nMethods: We enrolled patients across twelve centers.",
    "Results continue on page two with more flowing body text that must not be mistaken for the title.\nDiscussion: further analysis follows.",
  ];
  const joined = pages.join("\n");
  const t = guessTitle(joined);
  assert.equal(t, "Effect of Drug X on Mortality: A Randomized Trial");
}

console.log("extract.test.ts: all assertions passed");
