import assert from "node:assert/strict";
import test from "node:test";

import type { CalendarEvent } from "./calendar-model";
import { findCalendarIssues } from "./calendar-conflicts";

const event = (overrides: Partial<CalendarEvent> & { id: string; title: string; date: string }): CalendarEvent => ({
  kind: "other",
  ...overrides,
});

test("exact duplicates: the same title on the same date, grouped with every id", () => {
  const issues = findCalendarIssues([
    event({ date: "2026-10-14", id: "a", kind: "exam", title: "Exam 2" }),
    event({ date: "2026-10-14", id: "b", kind: "exam", title: "exam 2" }),
    event({ date: "2026-10-14", id: "c", kind: "class", title: "Lecture" }),
  ]);
  assert.equal(issues.exact_duplicates.length, 1);
  assert.deepEqual(issues.exact_duplicates[0]?.events.map((ref) => ref.id), ["a", "b"]);
});

test("probable duplicates: near-identical titles on one date, with the reason named", () => {
  const issues = findCalendarIssues([
    event({ date: "2026-10-14", id: "a", kind: "exam", title: "Exam 2 - Cardiovascular" }),
    event({ date: "2026-10-14", id: "b", kind: "exam", title: "Cardiovascular Exam 2 review" }),
  ]);
  assert.equal(issues.exact_duplicates.length, 0);
  assert.equal(issues.probable_duplicates.length, 1);
  assert.ok(issues.probable_duplicates[0]?.reason);
});

test("🔴 conflicting versions: one exam, two dates — the Oct 12 vs Oct 14 case", () => {
  const issues = findCalendarIssues([
    event({ course: "PHCY 1218", date: "2026-10-12", id: "old", kind: "exam", title: "Exam 2" }),
    event({ course: "PHCY 1218", date: "2026-10-14", id: "new", kind: "exam", title: "Exam 2" }),
  ]);
  assert.equal(issues.conflicting_versions.length, 1);
  assert.deepEqual(issues.conflicting_versions[0]?.events.map((ref) => ref.date), ["2026-10-12", "2026-10-14"]);
});

test("the same exam name in two DIFFERENT courses is two real exams, not a conflict", () => {
  const issues = findCalendarIssues([
    event({ course: "PHCY 1218", date: "2026-10-12", id: "a", kind: "exam", title: "Exam 2" }),
    event({ course: "PHCY 1215", date: "2026-10-14", id: "b", kind: "exam", title: "Exam 2" }),
  ]);
  assert.equal(issues.conflicting_versions.length, 0);
});

test("a weekly class repeating under one name is never a 'conflicting version'", () => {
  const issues = findCalendarIssues([
    event({ date: "2026-10-12", id: "a", kind: "class", title: "Pharm lecture" }),
    event({ date: "2026-10-14", id: "b", kind: "class", title: "Pharm lecture" }),
    event({ date: "2026-10-16", id: "c", kind: "class", title: "Pharm lecture" }),
  ]);
  assert.equal(issues.conflicting_versions.length, 0);
});

test("dates a term apart are different events, not versions", () => {
  const issues = findCalendarIssues([
    event({ date: "2026-03-10", id: "spring", kind: "exam", title: "Final exam" }),
    event({ date: "2026-12-10", id: "fall", kind: "exam", title: "Final exam" }),
  ]);
  assert.equal(issues.conflicting_versions.length, 0);
});

test("🔴 two unrelated events at the same time are an OVERLAP, never a duplicate", () => {
  const issues = findCalendarIssues([
    event({ date: "2026-10-14", id: "a", kind: "class", time: "09:00", title: "Pharm lecture" }),
    event({ date: "2026-10-14", id: "b", kind: "other", time: "09:30", title: "Advising appointment" }),
  ]);
  assert.equal(issues.exact_duplicates.length, 0);
  assert.equal(issues.probable_duplicates.length, 0);
  assert.equal(issues.overlaps.length, 1);
  assert.equal(issues.overlaps[0]?.first.id, "a");
});

test("a probable-duplicate pair is not double-reported as an overlap", () => {
  const issues = findCalendarIssues([
    event({ date: "2026-10-14", id: "a", kind: "exam", time: "09:00", title: "Exam 2 - Cardiovascular" }),
    event({ date: "2026-10-14", id: "b", kind: "exam", time: "09:00", title: "Cardiovascular Exam 2 review" }),
  ]);
  assert.equal(issues.probable_duplicates.length, 1);
  assert.equal(issues.overlaps.length, 0);
});

// ── Repeating classes, expanded before anything is compared ─────────────────
//
// Owner 2026-08-05, Phase 2 item 1: "Expand recurring rules into actual
// occurrences before duplicate, overlap, and conflict detection."
//
// Before this, a repeating rule was audited as its single stored row. A weekly
// lecture is one row dated the first Monday of term — so a one-off event on the
// third Monday was compared against nothing, and every clash a student would
// actually notice went unreported.

/** Mon/Wed/Fri 9-10 AM, the term's ordinary shape. */
const lecture = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  date: "2026-08-24",
  endTime: "10:00",
  id: "lecture",
  kind: "class",
  recurrence: { days: [1, 3, 5], until: "2026-09-25" },
  time: "09:00",
  title: "Pharmacology Lecture",
  ...overrides,
});

test("🔴 a one-off event on a LATER meeting of a weekly class is found", () => {
  const issues = findCalendarIssues([
    lecture(),
    // The third Monday — not the rule's own stored date, which is the only day
    // the unexpanded audit could ever have looked at.
    event({ date: "2026-09-07", endTime: "10:00", id: "clash", kind: "exam", time: "09:30", title: "Midterm 1" }),
  ]);
  assert.equal(issues.overlaps.length, 1);
  assert.equal(issues.overlaps[0]?.date, "2026-09-07");
});

test("a duplicate landing on one meeting of the series is an exact duplicate", () => {
  const issues = findCalendarIssues([
    lecture(),
    event({ date: "2026-09-02", id: "stray", kind: "class", time: "09:00", title: "Pharmacology Lecture" }),
  ]);
  assert.equal(issues.exact_duplicates.length, 1);
  assert.deepEqual(issues.exact_duplicates[0]?.events.map((ref) => ref.id).sort(), ["lecture", "stray"]);
});

test("🔴 every id is a REAL row id, never an expanded occurrence id", () => {
  const issues = findCalendarIssues([
    lecture(),
    event({ date: "2026-09-07", endTime: "10:00", id: "clash", kind: "exam", time: "09:30", title: "Midterm 1" }),
  ]);
  const ids = [issues.overlaps[0]?.first.id, issues.overlaps[0]?.second.id];
  // `lecture@2026-09-07` exists nowhere in the database — a finding carrying it
  // would hand the model a handle every update and delete then fails on.
  for (const id of ids) assert.doesNotMatch(String(id), /@/);
  assert.deepEqual(ids.slice().sort(), ["clash", "lecture"]);
  assert.equal(issues.overlaps[0]?.first.recurring ?? issues.overlaps[0]?.second.recurring, true);
});

test("🔴 a lab clashing with a lecture every week is ONE finding, with a count", () => {
  // Two repeating rules meeting at the same hour collide on ~14 dates. The
  // student has one problem to solve, and reporting fourteen would both bury it
  // and push the tool result past its serialization budget.
  const issues = findCalendarIssues([
    lecture(),
    lecture({ id: "lab", recurrence: { days: [1, 3, 5], until: "2026-09-25" }, title: "Pharmacology Lab" }),
  ]);
  assert.equal(issues.overlaps.length, 1);
  assert.ok((issues.overlaps[0]?.repeats?.occurrences ?? 0) > 10);
  assert.equal(issues.overlaps[0]?.repeats?.dates.length, 3);
  assert.equal(issues.overlaps[0]?.date, "2026-08-24");
});

test("two meetings of the SAME rule never report against each other", () => {
  const issues = findCalendarIssues([lecture()]);
  assert.deepEqual(issues, { conflicting_versions: [], exact_duplicates: [], overlaps: [], probable_duplicates: [] });
});

test("a repeating exam is not mistaken for sources disagreeing about its date", () => {
  // conflicting_versions means TWO ROWS claim different dates for one exam.
  // One rule landing on many dates is a schedule, not a disagreement — saying
  // otherwise sends the student hunting for an exam that does not exist.
  const issues = findCalendarIssues([
    lecture({ id: "quiz", kind: "exam", recurrence: { days: [5], until: "2026-09-25" }, title: "Weekly Quiz" }),
  ]);
  assert.equal(issues.conflicting_versions.length, 0);
});

test("two separate rows for one exam still read as conflicting versions", () => {
  const issues = findCalendarIssues([
    event({ course: "PHCY 2114", date: "2026-10-12", id: "old", kind: "exam", title: "Exam 2" }),
    event({ course: "PHCY 2114", date: "2026-10-14", id: "new", kind: "exam", title: "Exam 2" }),
  ]);
  assert.equal(issues.conflicting_versions.length, 1);
  assert.deepEqual(issues.conflicting_versions[0]?.events.map((ref) => ref.date), ["2026-10-12", "2026-10-14"]);
});

// ── Cancellations and exceptions ────────────────────────────────────────────

test("🔴 a cancelled meeting is not compared against anything", () => {
  const issues = findCalendarIssues([
    lecture({ recurrence: { days: [1, 3, 5], except: ["2026-09-07"], until: "2026-09-25" } }),
    event({ date: "2026-09-07", endTime: "10:00", id: "clash", kind: "exam", time: "09:30", title: "Midterm 1" }),
  ]);
  // The class does not meet that Monday, so the exam clashes with nothing.
  assert.equal(issues.overlaps.length, 0);
});

test("cancelling one meeting leaves the rest of the series intact", () => {
  const issues = findCalendarIssues([
    lecture({ recurrence: { days: [1, 3, 5], except: ["2026-09-07"], until: "2026-09-25" } }),
    event({ date: "2026-09-09", endTime: "10:00", id: "clash", kind: "exam", time: "09:30", title: "Midterm 1" }),
  ]);
  assert.equal(issues.overlaps.length, 1);
  assert.equal(issues.overlaps[0]?.date, "2026-09-09");
});

test("a reading week — several cancellations at once — is honoured", () => {
  const readingWeek = ["2026-09-07", "2026-09-09", "2026-09-11"];
  const issues = findCalendarIssues([
    lecture({ recurrence: { days: [1, 3, 5], except: readingWeek, until: "2026-09-25" } }),
    ...readingWeek.map((date) =>
      event({ date, endTime: "10:00", id: `trip-${date}`, kind: "other", time: "09:30", title: "Conference travel" })),
  ]);
  assert.equal(issues.overlaps.length, 0);
});

// ── Daylight saving ─────────────────────────────────────────────────────────
//
// US daylight saving ends 1 November 2026. A weekly rule expanded by adding
// 86,400,000 ms at a time drifts an hour on that date and starts landing on the
// wrong weekday; addDays() builds each date from (year, month, day + n) in
// local time instead, which is why this holds. The test runs under a real
// DST-observing zone so a regression to millisecond arithmetic goes red.

test("🔴 a weekly class keeps its weekday across the daylight-saving change", () => {
  const original = process.env.TZ;
  process.env.TZ = "America/Chicago";
  try {
    const issues = findCalendarIssues([
      // Every Sunday, straddling the 1 November change.
      lecture({ date: "2026-10-25", id: "sunday-lab", recurrence: { days: [0], until: "2026-11-15" }, title: "Sunday Lab" }),
      // The Sunday AFTER the clocks change.
      event({ date: "2026-11-08", endTime: "10:00", id: "clash", kind: "other", time: "09:30", title: "Study group" }),
    ]);
    assert.equal(issues.overlaps.length, 1, "the series lost a meeting to the clock change");
    assert.equal(issues.overlaps[0]?.date, "2026-11-08");
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
