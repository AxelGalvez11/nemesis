// Grouping a book into chapters, and taking the numbering off a title without knowing the subject.

import assert from "node:assert/strict";
import { test } from "node:test";

import { chapterHolding, chaptersOf, objectivesOf, splitTitle } from "./reading";
import type { CourseSection } from "./catalogue";

const section = (over: Partial<CourseSection> & { ordinal: number }): CourseSection => ({
  number: null,
  title: "A section",
  unit: "Unit 1 Levels of Organization",
  chapter: "Chapter 1 An Introduction to the Human Body",
  objectives: [],
  ...over,
});

test("consecutive sections sharing a chapter become one chapter", () => {
  const chapters = chaptersOf([section({ ordinal: 0 }), section({ ordinal: 1 }), section({ ordinal: 2 })]);
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0]?.sections.length, 3);
});

// 🔴 Two chapters with the SAME NAME in different units are two chapters, not one. Merging them
// would splice a reader from unit 1 into unit 3 mid-rail.
test("a repeated chapter name in another unit is a second chapter", () => {
  const chapters = chaptersOf([
    section({ ordinal: 0, chapter: "Review" }),
    section({ ordinal: 1, chapter: "Review", unit: "Unit 2 Support and Movement" }),
  ]);
  assert.equal(chapters.length, 2);
  assert.notEqual(chapters[0]?.key, chapters[1]?.key);
});

test("chapters keep the book's order and never sort", () => {
  const chapters = chaptersOf([
    section({ ordinal: 0, chapter: "Zebras" }),
    section({ ordinal: 1, chapter: "Apples" }),
  ]);
  assert.deepEqual(chapters.map((c) => c.title), ["Zebras", "Apples"]);
});

test("a section finds the chapter holding it", () => {
  const chapters = chaptersOf([
    section({ ordinal: 0, chapter: "One" }),
    section({ ordinal: 7, chapter: "Two" }),
  ]);
  assert.equal(chapterHolding(chapters, 7)?.title, "Two");
  assert.equal(chapterHolding(chapters, 99), null);
});

test("a chapter's objectives come out in reading order", () => {
  const chapters = chaptersOf([
    section({ ordinal: 0, objectives: ["a", "b"] }),
    section({ ordinal: 1, objectives: ["c"] }),
  ]);
  assert.deepEqual(objectivesOf(chapters[0]!), ["a", "b", "c"]);
});

// 🔴 THE SPLIT IS STRUCTURAL. Every case below is a different discipline, and the rule never reads
// the subject — only "one optional word, then a number".
test("numbering comes off the front whatever the book calls its parts", () => {
  const cases: [string, string | null, string][] = [
    ["Chapter 1 An Introduction to the Human Body", "Chapter 1", "An Introduction to the Human Body"],
    ["Unit 2 Support and Movement", "Unit 2", "Support and Movement"],
    ["Part IV Remedies", "Part IV", "Remedies"],
    ["Module 12: Heat Transfer", "Module 12", "Heat Transfer"],
    ["Week 5 — Torts", "Week 5", "Torts"],
    ["3. Offer and Acceptance", "3", "Offer and Acceptance"],
    ["7 Thermodynamics", "7", "Thermodynamics"],
  ];
  for (const [raw, label, name] of cases) {
    assert.deepEqual(splitTitle(raw), { label, name }, raw);
  }
});

test("a title with no numbering is left whole", () => {
  for (const raw of ["Homeostasis", "The Chemical Level of Organization", "Appendix"]) {
    assert.deepEqual(splitTitle(raw), { label: null, name: raw });
  }
});

// 🔴 The trap this guards: the Roman-numeral branch will happily read letters as a number.
// "Chapter DNA Replication" must not become label "Chapter D" — and "CD" is a valid Roman numeral,
// so the test has to be shape-based rather than a blocklist.
test("letters that look like Roman numerals are not read as numbering", () => {
  assert.deepEqual(splitTitle("Chapter DNA Replication"), {
    label: null,
    name: "Chapter DNA Replication",
  });
  assert.equal(splitTitle("Reading MRI Scans").label, null);
});

test("numbering with nothing after it is not a split", () => {
  assert.deepEqual(splitTitle("Chapter 1"), { label: null, name: "Chapter 1" });
});
