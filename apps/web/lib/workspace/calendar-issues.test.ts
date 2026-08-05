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
