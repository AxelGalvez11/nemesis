/**
 * The subject-column rule, tested against the exact confusion it exists to resolve.
 *
 * 🔴 THE LOAD-BEARING TEST IS THE SCHEDULE ONE. `Drug | Class | Indication` and `Date | Topic |
 * Room` have the SAME structural shape — unique first column, repeating others — and the whole
 * value of this module is telling them apart. A version of these tests that only proved the drug
 * table works would pass while the calendar produced knowledge objects.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { isIndexShaped, subjectColumnOf } from "./table-subject-column";

// ── What an index looks like ───────────────────────────────────────────────

test("an index is recognised by its characters, never by its meaning", () => {
  for (const value of ["12", "12.5", "1,200", "-3", "8-17", "2026-08-14", "14/08/2026", "1.", "2)", "#3"]) {
    assert.equal(isIndexShaped(value), true, `${value} is written as an index`);
  }
});

test("🔴 `Week 3` is NOT a value-level index — it can only be judged as part of its column", () => {
  // The first version of this file caught `Week 3` with a value-level rule and destroyed
  // `Boeing 747` with the same regex. They are the same shape; only the column tells them apart.
  for (const value of ["Week 3", "Q1", "Lecture 12", "Exam 1"]) {
    assert.equal(isIndexShaped(value), false, `${value} is a word and a number, judged by its column`);
  }
});

test("🔴 a real subject that merely CONTAINS digits is not an index", () => {
  // Every one of these is a thing a student learns about, in a different field, and each would be
  // destroyed by a rule that simply looked for digits.
  for (const value of ["CYP2D6", "Article 5 of the Treaty", "Boeing 747", "1,3-butadiene", "Type 2 diabetes", "COVID-19", "R v Smith (1997)"]) {
    assert.equal(isIndexShaped(value), false, `${value} is a thing, not an index`);
  }
});

// ── Which column a grid is about ───────────────────────────────────────────

const rowsOf = (...rows: string[][]) => rows;

test("a grid of things and their properties has a subject column", () => {
  // The owner's own example, and the document that produced 0 knowledge objects.
  const rows = rowsOf(
    ["lisinopril", "ACE inhibitor", "hypertension", "cough"],
    ["losartan", "ARB", "hypertension", "dizziness"],
    ["metoprolol", "beta blocker", "angina", "fatigue"],
  );
  assert.deepEqual(subjectColumnOf(rows, 4), { index: 0, populated: 3 });
});

test("🔴 THE SAME SHAPE IN TWO OTHER FIELDS, because a rule that only reads medicine is the wrong rule", () => {
  const law = rowsOf(
    ["R v Smith", "Intent may be inferred", "England and Wales"],
    ["Donoghue v Stevenson", "Duty of care to the consumer", "Scotland"],
    ["Carlill v Carbolic", "A unilateral offer may bind", "England and Wales"],
  );
  assert.deepEqual(subjectColumnOf(law, 3), { index: 0, populated: 3 });

  const engineering = rowsOf(
    ["6061-T6 aluminium", "276", "2.70"],
    ["AISI 1045 steel", "530", "7.85"],
    ["Ti-6Al-4V", "880", "4.43"],
  );
  assert.deepEqual(subjectColumnOf(engineering, 3), { index: 0, populated: 3 });
});

test("🔴🔴 A SCHEDULE HAS NO SUBJECT COLUMN, and this is the test the whole module exists for", () => {
  // Structurally identical to the drug table: first column unique, later columns repeat. The only
  // thing that separates them is that a date is WRITTEN like an index.
  //
  // 🔴 If this ever goes green with a subject column, Nemesis will drill a student on "8-17 ↔ Exam
  // 1" — the layout of their timetable, presented as something to know.
  const schedule = rowsOf(
    ["8-17", "Exam 1", "Room 214"],
    ["8-24", "Lecture 4", "Room 214"],
    ["8-31", "Lab 2", "Room 118"],
  );
  assert.equal(subjectColumnOf(schedule, 3), null);

  // The same document a week later, written with full dates rather than short ones.
  const dated = rowsOf(
    ["2026-08-17", "Exam 1", "Room 214"],
    ["2026-08-24", "Lecture 4", "Room 214"],
    ["2026-08-31", "Lab 2", "Room 118"],
  );
  assert.equal(subjectColumnOf(dated, 3), null);

  // And numbered by week rather than dated.
  const weeks = rowsOf(
    ["Week 1", "Foundations", "Room 214"],
    ["Week 2", "Kinetics", "Room 214"],
    ["Week 3", "Dynamics", "Room 118"],
  );
  assert.equal(subjectColumnOf(weeks, 3), null);
});

test("🔴🔴 a prose first column refuses instead of moving the row onto its members", () => {
  const mechanism = `Dihydropyridine CCBs (calcium channel blockers) ${"Inhibit Ca from entering slow channels. ".repeat(12)}`;
  const chart = rowsOf([mechanism, "Amlodipine (Norvasc) Felodipine (Plendil)", "peripheral edema"]);
  assert.equal(subjectColumnOf(chart, 3, { headerStated: true }), null);
});

test("🔴 a single row is readable only when the author printed a header", () => {
  const oneRow = rowsOf(["lisinopril", "ACE inhibitor", "hypertension"]);
  assert.deepEqual(subjectColumnOf(oneRow, 3, { headerStated: true }), { index: 0, populated: 1 });
  assert.equal(subjectColumnOf(oneRow, 3), null);
  assert.equal(subjectColumnOf(rowsOf(["8-17", "Exam 1", "Room 214"]), 3, { headerStated: true }), null);
});

test("a matrix of numbers has no subject column", () => {
  const matrix = rowsOf(["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]);
  assert.equal(subjectColumnOf(matrix, 3), null);
});

test("a column that repeats is stating a property, so the subject is found further right", () => {
  // A grid grouped by category: the category repeats, the item does not.
  const grouped = rowsOf(
    ["Diuretics", "furosemide", "loop"],
    ["Diuretics", "hydrochlorothiazide", "thiazide"],
    ["Diuretics", "spironolactone", "potassium-sparing"],
  );
  assert.deepEqual(subjectColumnOf(grouped, 3), { index: 1, populated: 3 });
});

test("🔴 one data row proves nothing distinct, so it is refused rather than defaulted to column 0", () => {
  // With a single row every column is trivially unique and the leftmost would always win. That is
  // a default wearing the clothes of a signal.
  assert.equal(subjectColumnOf(rowsOf(["lisinopril", "ACE inhibitor", "hypertension"]), 3), null);
  assert.equal(subjectColumnOf([], 3), null);
});

test("a mostly-blank column is not a subject", () => {
  const sparse = rowsOf(
    ["", "ACE inhibitor", "hypertension"],
    ["", "ARB", "hypertension"],
    ["note", "beta blocker", "angina"],
  );
  // Column 0 is blank on two of three rows; column 1 carries a distinct value on every row.
  assert.deepEqual(subjectColumnOf(sparse, 3), { index: 1, populated: 3 });
});

test("a cell the length of a paragraph does not make a subject", () => {
  const essay = "x".repeat(400);
  const rows = rowsOf([essay, "a"], [`${essay}y`, "b"], [`${essay}z`, "c"]);
  // Column 0's values are distinct but each is a paragraph, so it cannot be the subject. The
  // invariant is that the essay column is never chosen — not that the grid is unreadable, since
  // column 1 is a perfectly ordinary set of distinct short values.
  assert.notEqual(subjectColumnOf(rows, 2)?.index, 0);
});

test("🔴 a column of model numbers is refused too, and that false refusal is the accepted cost", () => {
  // `Boeing 747` and `Week 3` are the same string shape. Catching the enumeration means losing the
  // aircraft, and the codebase's standing trade says a missed glossary beats a false one.
  const aircraft = rowsOf(["Boeing 747", "wide-body"], ["Cessna 172", "light"], ["Airbus 320", "narrow-body"]);
  assert.equal(subjectColumnOf(aircraft, 2), null);

  // But a single such value among ordinary ones does not make the column an enumeration.
  const mixed = rowsOf(["Boeing 747", "wide-body"], ["Concorde", "supersonic"], ["Spitfire", "fighter"]);
  assert.deepEqual(subjectColumnOf(mixed, 2), { index: 0, populated: 3 });
});
