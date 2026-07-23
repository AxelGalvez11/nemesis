import assert from "node:assert/strict";
import { test } from "node:test";

import { composeImportedNote, findRelatedTitles, importedTitleFrom } from "./library-import";

const notes = (...titles: string[]) => titles.map((title) => ({ title }));

test("finds an existing note title that appears as a whole phrase in the text", () => {
  const text = "Today we covered ACE inhibitors and their renal effects.";
  assert.deepEqual(findRelatedTitles(text, notes("ACE inhibitors", "Beta blockers")), ["ACE inhibitors"]);
});

test("matching is case-insensitive but returns the note's exact title", () => {
  assert.deepEqual(findRelatedTitles("notes on ace inhibitors", notes("ACE inhibitors")), ["ACE inhibitors"]);
});

test("ignores titles shorter than the minimum length (too generic)", () => {
  assert.deepEqual(findRelatedTitles("the pH and Na levels", notes("pH", "Na")), []);
});

test("requires a whole-word match, not a substring inside a word", () => {
  assert.deepEqual(findRelatedTitles("Betamax recorder", notes("Beta")), []);
  assert.deepEqual(findRelatedTitles("a Beta blocker", notes("Beta")), ["Beta"]);
});

test("orders matches by first appearance in the text and dedupes", () => {
  const text = "Immunology precedes Pharmacology here.";
  assert.deepEqual(findRelatedTitles(text, notes("Pharmacology", "Immunology")), ["Immunology", "Pharmacology"]);
});

test("caps the number of related links", () => {
  const titles = Array.from({ length: 20 }, (_, i) => `Concept number ${i}`);
  assert.equal(findRelatedTitles(titles.join(" "), notes(...titles)).length, 12);
});

test("ignores blank titles and empty inputs", () => {
  assert.deepEqual(findRelatedTitles("anything", notes("", "   ")), []);
  assert.deepEqual(findRelatedTitles("", notes("ACE inhibitors")), []);
});

test("composeImportedNote appends a Related section of raw wiki-links", () => {
  const out = composeImportedNote("Body text.", ["ACE inhibitors", "Beta blockers"]);
  assert.equal(out, "Body text.\n\n## Related\n- [[ACE inhibitors]]\n- [[Beta blockers]]\n");
});

test("composeImportedNote returns the trimmed body unchanged when nothing is related", () => {
  assert.equal(composeImportedNote("  Body text.  ", []), "Body text.");
});

test("importedTitleFrom prefers the extracted title, then the filename, then a fallback", () => {
  assert.equal(importedTitleFrom("lecture-3.pdf", "Cardiac Pharmacology"), "Cardiac Pharmacology");
  assert.equal(importedTitleFrom("lecture-3.pdf", ""), "lecture-3");
  assert.equal(importedTitleFrom("lecture-3.pdf", null), "lecture-3");
  assert.equal(importedTitleFrom(".pdf"), "Imported document");
});
