import assert from "node:assert/strict";
import { test } from "node:test";

import { extractNoteOutline, stripLeadingTitleHeading } from "./note-outline";

test("collects ATX headings 1-4 in document order with depths", () => {
  const outline = extractNoteOutline("# One\n\ntext\n\n## Two\n\n### Three\n\n#### Four\n");
  assert.deepEqual(outline, [
    { depth: 1, label: "One" },
    { depth: 2, label: "Two" },
    { depth: 3, label: "Three" },
    { depth: 4, label: "Four" },
  ]);
});

test("ignores # lines inside code fences (the old regex counted them)", () => {
  const outline = extractNoteOutline("# Real\n\n```bash\n# not a heading\n## also not\n```\n\n## Also real\n");
  assert.deepEqual(
    outline.map((entry) => entry.label),
    ["Real", "Also real"],
  );
});

test("excludes depth 5-6 — the reader neither styles nor queries them", () => {
  const outline = extractNoteOutline("# Keep\n\n##### Drop\n\n###### Drop too\n");
  assert.deepEqual(outline.map((entry) => entry.label), ["Keep"]);
});

test("setext headings count as depth 1 and 2", () => {
  const outline = extractNoteOutline("Big title\n=========\n\nSection\n-------\n");
  assert.deepEqual(outline, [
    { depth: 1, label: "Big title" },
    { depth: 2, label: "Section" },
  ]);
});

test("finds headings nested in blockquotes — they render as real h elements", () => {
  const outline = extractNoteOutline("> ## Quoted heading\n> body\n");
  assert.deepEqual(outline, [{ depth: 2, label: "Quoted heading" }]);
});

test("cleans wiki links and highlights out of labels", () => {
  const outline = extractNoteOutline("## [[Contract Law|Contracts]] review\n\n### ==Key== [[Torts]]\n");
  assert.deepEqual(
    outline.map((entry) => entry.label),
    ["Contracts review", "Key Torts"],
  );
});

test("keeps inline code and drops trailing hashes", () => {
  const outline = extractNoteOutline("## The `useState` hook ##\n");
  assert.deepEqual(outline, [{ depth: 2, label: "The useState hook" }]);
});

test("bold and italic text stays in the label", () => {
  const outline = extractNoteOutline("## **Exam** _dates_\n");
  assert.deepEqual(outline, [{ depth: 2, label: "Exam dates" }]);
});

test("empty and heading-free notes produce an empty outline", () => {
  assert.deepEqual(extractNoteOutline(""), []);
  assert.deepEqual(extractNoteOutline("   \n"), []);
  assert.deepEqual(extractNoteOutline("Just a paragraph.\n\n- and a list\n"), []);
});

test("skips headings inside footnote definitions — GFM renders those at the end", () => {
  const outline = extractNoteOutline("# Main[^1]\n\n[^1]: ## Sneaky\n    detail\n\n## After\n");
  assert.deepEqual(
    outline.map((entry) => entry.label),
    ["Main", "After"],
  );
});

test("an empty heading still occupies its slot so indexes stay aligned", () => {
  const outline = extractNoteOutline("##  \n\n## Real\n");
  assert.equal(outline.length, 2);
  assert.equal(outline[0]?.label, "Untitled section");
  assert.equal(outline[1]?.label, "Real");
});

test("stripLeadingTitleHeading removes only an exact-duplicate opening h1", () => {
  assert.equal(stripLeadingTitleHeading("# Entropy\n\nBody text.", "Entropy"), "Body text.");
  assert.equal(stripLeadingTitleHeading("\n\n# entropy ##\nBody.", "Entropy"), "Body.");
  assert.equal(stripLeadingTitleHeading("Entropy\n=======\n\nBody.", "Entropy"), "Body.");
});

test("stripLeadingTitleHeading leaves everything else alone", () => {
  const differentText = "# Second law\n\nBody.";
  assert.equal(stripLeadingTitleHeading(differentText, "Entropy"), differentText);
  const deeper = "## Entropy\n\nBody.";
  assert.equal(stripLeadingTitleHeading(deeper, "Entropy"), deeper);
  const bodyFirst = "Intro line.\n\n# Entropy\n\nBody.";
  assert.equal(stripLeadingTitleHeading(bodyFirst, "Entropy"), bodyFirst);
  const blankTitle = "# Entropy\n\nBody.";
  assert.equal(stripLeadingTitleHeading(blankTitle, "   "), blankTitle);
});
