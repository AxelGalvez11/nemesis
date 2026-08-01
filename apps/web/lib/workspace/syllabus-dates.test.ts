import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyLabels,
  buildCensusPrompt,
  censusEntries,
  findDateMentions,
  resolveMentions,
  resolveYear,
} from "./syllabus-dates";

/**
 * Verbatim from the owner's real syllabus, as the PDF extractor actually
 * flattens it — line breaks and all, including the source's own typo
 * ("September 7st") and its en dash.
 *
 * Invented fixtures would have been tidier and would have proved nothing: the
 * whole failure this module fixes came from a table that does NOT flatten
 * tidily. These strings are the measurement.
 */
const REAL = [
  "Course ScheduleCourse Schedule",
  "Date Time Topic PPCP Lecturer UT-5",
  "Page 14 of 30",
  "Week 1",
  "Tuesday,",
  "August",
  "11th",
  "1-2:50 CT",
  "2-3:50 ET",
  "Course Introduction",
  "Introduction to AESA",
  "AESA Quiz",
  "IntroductionDr. Farrar",
  "(Memphis)",
  "1.1.10,",
  "3.1.4,",
  "3.5.2",
  "August 17, 2026 Exam 1",
  "Week 4",
  "Tuesday,",
  "September",
  "1st",
  "Heart failure case",
  "Monday, September 7st LABOR DAY – NO CLASS",
  "Week 10",
  "October 12, 2026 Exam 5",
  "Thursday October 15th – Friday October 16th",
  "Fall Break – No Class",
  "Week 13",
  "Tuesday,",
  "November",
  "3rd &",
  "Wednesday,",
  "November",
  "4th",
  "OSCE (Entire Class)",
].join("\n");

/** The prose deadline, 14,000 characters before the schedule table — a real
 *  due date that lives in a paragraph, not a row. */
const PROSE = "upload to Blackboard by\nthe assigned deadline of November 13th, 2026. The immunization form must be";

const TODAY = new Date(2026, 6, 31); // 2026-07-31, the day the owner reported this.

test("finds dates split across lines by the table flattener", () => {
  const found = findDateMentions(REAL);
  const raw = found.map((m) => m.raw.replace(/\s+/g, " "));
  assert.ok(raw.includes("Tuesday,\nAugust\n11th".replace(/\s+/g, " ")), `got ${JSON.stringify(raw)}`);
  assert.ok(raw.includes("Tuesday,\nSeptember\n1st".replace(/\s+/g, " ")));
  assert.ok(raw.includes("Tuesday,\nNovember\n3rd".replace(/\s+/g, " ")));
});

test("reads through the source's own ordinal typo", () => {
  // "September 7st" is what the syllabus says. The ordinal is decoration; the
  // number is the date. A parser that insisted on "7th" would lose Labor Day.
  const found = findDateMentions("Monday, September 7st LABOR DAY – NO CLASS");
  assert.equal(found.length, 1);
  assert.equal(found[0]?.month, 9);
  assert.equal(found[0]?.day, 7);
  assert.equal(found[0]?.statedWeekday, 1);
});

test("finds both ends of a range and both halves of an ampersand pair", () => {
  const range = findDateMentions("Thursday October 15th – Friday October 16th");
  assert.deepEqual(range.map((m) => m.day), [15, 16]);

  const pair = findDateMentions("Tuesday,\nNovember\n3rd &\nWednesday,\nNovember\n4th");
  assert.deepEqual(pair.map((m) => m.day), [3, 4]);
});

test("finds a deadline stated in prose, not in the schedule table", () => {
  const found = findDateMentions(PROSE);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.year, 2026);
  assert.equal(found[0]?.day, 13);
});

test("the stated weekday settles the year, and rules out the wrong ones", () => {
  // August 11 is a Tuesday in 2026 only: 2025 Monday, 2027 Wednesday. This is
  // the check that replaces guessing-then-tolerating-18-months.
  const [mention] = findDateMentions("Tuesday,\nAugust\n11th");
  const resolved = resolveYear(mention!, TODAY);
  assert.equal(resolved?.date, "2026-08-11");
  assert.equal(resolved?.basis, "weekday");
});

test("a stated year wins over inference", () => {
  const [mention] = findDateMentions("August 17, 2026 Exam 1");
  const resolved = resolveYear(mention!, TODAY);
  assert.equal(resolved?.date, "2026-08-17");
  assert.equal(resolved?.basis, "stated");
});

test("a bare date with no weekday still resolves, and says it guessed", () => {
  const [mention] = findDateMentions("Final paper due October 14");
  const resolved = resolveYear(mention!, TODAY);
  assert.equal(resolved?.date, "2026-10-14");
  assert.equal(resolved?.basis, "nearest");
});

test("a mis-stated weekday falls back to the near year, not a far one that agrees", () => {
  // The syllabus is wrong: Aug 11 2026 is a Tuesday, not a Friday. Aug 11 2028
  // IS a Friday — so a wide search window would "confirm" the typo and file the
  // event two years out, confidently and wrongly. The near window matches
  // nothing and falls through, which is the right kind of wrong.
  const [mention] = findDateMentions("Friday, August 11th");
  const resolved = resolveYear(mention!, TODAY);
  assert.equal(resolved?.basis, "nearest");
  assert.equal(resolved?.date, "2026-08-11");
});

test("February 30 is not a date", () => {
  assert.deepEqual(findDateMentions("due February 30th"), []);
});

test("a leap day resolves only to a leap year", () => {
  const [mention] = findDateMentions("February 29");
  assert.equal(resolveYear(mention!, TODAY)?.date, "2028-02-29");
});

test("a month name is not matched inside a longer word", () => {
  assert.deepEqual(findDateMentions("marching 12 students"), []);
  assert.deepEqual(findDateMentions("Januaryish 4"), []);
});

test("a month cannot pair with a number pages away", () => {
  // Unlimited whitespace would let a month at the foot of one column pair with
  // a digit from an unrelated row far below.
  assert.deepEqual(findDateMentions("August\n\n\n\n\n11th"), []);
});

test("numeric dates are read when the document has no named ones", () => {
  const [numeric] = findDateMentions("Quiz on 9/8/2026");
  assert.equal(numeric?.month, 9);
  assert.equal(numeric?.day, 8);
  assert.equal(numeric?.year, 2026);
  assert.deepEqual(findDateMentions("Week 1 10/22\nWeek 2 10/29").map((m) => m.day), [22, 29]);
});

test("grading-table fractions are not mistaken for dates", () => {
  // MEASURED on the owner's real syllabus: the SPECS grading table produced
  // FOURTEEN false dates out of forty-four before this rule — a third of the
  // census was junk the model would then have to reject one by one.
  const specs = [
    "Tuesday, August 11th Course Introduction",
    "Pass ≤5/10 in-class AESA quizzes with ≥50% score",
    "Completion of 2/7 pre-class assignments",
    "Completion of 3/6 in-class assignments",
  ].join("\n");
  const found = findDateMentions(specs);
  assert.equal(found.length, 1, `expected only the named date, got ${JSON.stringify(found.map((m) => m.raw))}`);
  assert.equal(found[0]?.month, 8);
});

test("a slash date with a year survives even beside named dates", () => {
  // Unambiguous, so the document-style rule does not apply to it.
  const found = findDateMentions("Midterm October 15th. Final 12/09/2026.");
  assert.deepEqual(found.map((m) => m.day), [15, 9]);
});

test("context reaches across the wall of competency codes to the topic", () => {
  // THE BUG THIS MODULE EXISTS FOR. In the flattened table the topic sits far
  // below the date, behind the UT-5 codes. The old approach needed one
  // contiguous quote covering both, which does not exist. A context window
  // does, and this proves it reaches.
  const resolved = resolveMentions(findDateMentions(REAL), TODAY);
  const entries = censusEntries(REAL, resolved);
  const week1 = entries.find((entry) => entry.resolved.date === "2026-08-11");
  assert.ok(week1, "Week 1 should be in the census");
  assert.match(week1.context, /Course Introduction/);
});

test("the prompt numbers every date and never asks the model for one", () => {
  const resolved = resolveMentions(findDateMentions(REAL), TODAY);
  const prompt = buildCensusPrompt(censusEntries(REAL, resolved));
  assert.match(prompt, /^\d+ dates were found/);
  for (const entry of censusEntries(REAL, resolved)) {
    assert.ok(prompt.includes(`${entry.ordinal}. [${entry.resolved.date}]`));
  }
  assert.ok(!prompt.includes('"date"'), "the model is never asked to return a date");
});

test("dates the model never answered for are counted, not lost", () => {
  // The original failure was invisible: rows the model skipped left no trace.
  // They are now a number the student can be shown.
  const resolved = resolveMentions(findDateMentions(REAL), TODAY);
  const entries = censusEntries(REAL, resolved);
  const outcome = applyLabels(entries, [{ kind: "class", n: 1, title: "Course Introduction" }]);
  assert.equal(outcome.labelled.length, 1);
  assert.equal(outcome.unlabelled.length, entries.length - 1);
  assert.equal(outcome.labelled.length + outcome.skipped.length + outcome.unlabelled.length, entries.length);
});

test("the model may decline a date that is not a scheduled item", () => {
  const text = "This policy was last revised August 3, 2021 and applies to all students.";
  const entries = censusEntries(text, resolveMentions(findDateMentions(text), TODAY));
  assert.equal(entries.length, 1);
  const outcome = applyLabels(entries, [{ n: 1, skip: true }]);
  assert.equal(outcome.labelled.length, 0);
  assert.equal(outcome.skipped.length, 1);
  assert.equal(outcome.unlabelled.length, 0);
});

test("an impossible date is rejected in code, before the model is asked", () => {
  // The owner's syllabus quotes "Statement of Aspirations (UT Board of Trustees,
  // Feb. 29, 2025)". 2025 is not a leap year, so that date does not exist — and
  // the old ±18-month window would have waved it straight through. Nothing
  // reaches the model to be judged, because there is nothing to judge.
  const text = "Statement of Aspirations (UT Board of Trustees, Feb. 29, 2025)";
  assert.equal(findDateMentions(text).length, 1, "the mention is seen");
  assert.deepEqual(resolveMentions(findDateMentions(text), TODAY), [], "but it resolves to no date");
});

test("a made-up ordinal is ignored and a repeat does not double-count", () => {
  const entries = censusEntries(REAL, resolveMentions(findDateMentions(REAL), TODAY));
  const outcome = applyLabels(entries, [
    { kind: "class", n: 1, title: "First" },
    { kind: "class", n: 1, title: "Duplicate" },
    { kind: "exam", n: 9999, title: "Nowhere" },
  ]);
  assert.equal(outcome.labelled.length, 1);
  assert.equal(outcome.labelled[0]?.title, "First");
});

test("a malformed reply loses no dates", () => {
  const entries = censusEntries(REAL, resolveMentions(findDateMentions(REAL), TODAY));
  for (const reply of [null, undefined, "not json", 42, [null, "x", {}]]) {
    const outcome = applyLabels(entries, reply);
    assert.equal(outcome.unlabelled.length, entries.length);
  }
});
