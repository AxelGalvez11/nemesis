import assert from "node:assert/strict";
import { test } from "node:test";

import { compareTerms, courseTerm, groupByTerm, termFromCode, termFromText } from "../src/lms/term.ts";

test("the term is read from the word touching the year", () => {
  // The owner's own portal, verbatim.
  assert.equal(termFromText("Spring 2026: Integrated Pharmacotherapy 3"), "Spring 2026");
  assert.equal(termFromText("Fall 2026: Pharmacy Practice"), "Fall 2026");
});

test("🔴 A NON-ENGLISH PORTAL STILL GETS A TERM", () => {
  // The whole reason this reads by position rather than by a season word list.
  // None of these words appear anywhere in the source, and all of them work.
  assert.equal(termFromText("Otoño 2026 — Derecho Constitucional"), "Otoño 2026");
  assert.equal(termFromText("Automne 2026 - Chimie organique"), "Automne 2026");
  assert.equal(termFromText("Frühling 2026: Maschinenbau"), "Frühling 2026");
  assert.equal(termFromText("2026 秋"), "2026 秋");
});

test("year-first portals read the word on the other side", () => {
  assert.equal(termFromText("2026 Spring — Contract Law"), "2026 Spring");
});

test("a bare year is a usable term; no year is no term", () => {
  assert.equal(termFromText("BIOL 204 2026"), "2026");
  assert.equal(termFromText("Introduction to Welding"), null);
  assert.equal(termFromText(""), null);
  assert.equal(termFromText(undefined), null);
});

test("🔴 A COURSE NUMBER IS NOT A YEAR", () => {
  // "PSYC 2100" would otherwise file every psychology student under the year
  // 2100, and a room number would invent a term out of nothing.
  assert.equal(termFromText("PSYC 2100 Cognition"), null);
  assert.equal(termFromText("Seminar, Room 1204"), null);
  // 1984 is a plausible year but not a plausible TERM for a live portal; the
  // window starts at 1980 so a genuinely old archive still reads.
  assert.equal(termFromText("History 1984"), "History 1984");
});

test("the digits beside a year are not a term name", () => {
  // A registrar's code has digits on both sides of the year. Requiring letters
  // is what stops "24951 2026" being offered to a student as a heading.
  assert.equal(termFromText("PHCY1216_24951_202620"), null);
});

test("a registrar code yields the year, and keeps periods distinct", () => {
  assert.deepEqual(termFromCode("PHCY1216_24951_202620"), { period: "20", year: "2026" });
  assert.deepEqual(termFromCode("PHCY2112_44997_202640"), { period: "40", year: "2026" });
  assert.deepEqual(termFromCode("CHEM111"), null);
  assert.deepEqual(termFromCode(undefined), null);
});

test("the visible name beats the code", () => {
  // The picker has to read this back to a student, and "Spring 2026" is a
  // heading they recognise where "202620" is not.
  assert.equal(courseTerm({ code: "PHCY1216_24951_202620", name: "Spring 2026: Pharmacotherapy" }), "Spring 2026");
  // Falling back to the code still beats no grouping at all.
  assert.equal(courseTerm({ code: "PHCY1216_24951_202620", name: "Pharmacotherapy" }), "2026");
  assert.equal(courseTerm({ name: "Pharmacotherapy" }), null);
});

test("terms sort newest first, whatever the season is called", () => {
  const sorted = ["Spring 2025", "Fall 2026", "Spring 2026"].sort(compareTerms);
  // Alphabetically "Fall 2026" < "Spring 2025"; by year it must not be.
  assert.deepEqual(sorted, ["Fall 2026", "Spring 2026", "Spring 2025"]);
});

test("grouping puts the newest term first and the unknowns last", () => {
  const groups = groupByTerm([
    { name: "Spring 2025: Anatomy" },
    { name: "Independent Study" },
    { name: "Spring 2026: Pharmacotherapy" },
    { name: "Spring 2026: Ethics" },
  ]);
  assert.deepEqual(
    groups.map((group) => [group.term, group.courses.length]),
    [["Spring 2026", 2], ["Spring 2025", 1], [null, 1]],
  );
});
