import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AUTO_CONFIRM_AT,
  canAutoConfirm,
  canWriteToExternalCalendar,
  hasHedging,
  isReschedule,
  reconcile,
  resolveRelativeDate,
  type ScheduleCandidate,
} from "./schedule-candidates";

function candidate(over: Partial<ScheduleCandidate> = {}): ScheduleCandidate {
  return {
    id: "sc1",
    canvasId: "c1",
    kind: "exam",
    title: "Exam 1",
    startAt: "2026-09-12T00:00:00.000Z",
    sourceRefs: [{ sourceId: "s1", excerptId: "s1:e3" }],
    confidence: 0.9,
    status: "candidate",
    origin: "source_extraction",
    resolvedAgainst: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

// A Wednesday, so weekday arithmetic has something to be wrong about.
const ANCHOR = new Date("2026-08-05T15:00:00.000Z");

test("🔴 a relative date resolves against when it was SAID, not when it is read", () => {
  // A recording made three weeks ago saying "next Thursday" does not mean next Thursday from
  // today. This is the single most likely way the feature produces a confidently wrong date.
  const early = resolveRelativeDate("next Thursday", new Date("2026-08-05T00:00:00.000Z"));
  const later = resolveRelativeDate("next Thursday", new Date("2026-08-26T00:00:00.000Z"));
  assert.notEqual(early?.iso, later?.iso, "the same words said three weeks apart mean different days");
  assert.equal(early?.anchor, "2026-08-05T00:00:00.000Z", "the anchor is recorded, so it can be checked");
});

test("tomorrow, today and counted offsets resolve", () => {
  assert.equal(resolveRelativeDate("tomorrow", ANCHOR)?.iso.slice(0, 10), "2026-08-06");
  assert.equal(resolveRelativeDate("due today", ANCHOR)?.iso.slice(0, 10), "2026-08-05");
  assert.equal(resolveRelativeDate("in 3 days", ANCHOR)?.iso.slice(0, 10), "2026-08-08");
  assert.equal(resolveRelativeDate("in two weeks", ANCHOR)?.iso.slice(0, 10), "2026-08-19");
});

test("a weekday resolves forward, and the same weekday means the NEXT one", () => {
  // Anchor is a Wednesday.
  assert.equal(resolveRelativeDate("this Friday", ANCHOR)?.iso.slice(0, 10), "2026-08-07");
  // "Wednesday" said on a Wednesday cannot mean today.
  assert.equal(resolveRelativeDate("Wednesday", ANCHOR)?.iso.slice(0, 10), "2026-08-12");
});

test("🔴 'next Thursday' is admitted to be ambiguous rather than resolved confidently", () => {
  // Some English speakers mean the coming one, some mean the one after. We take the coming one
  // and say we are less sure — pretending the ambiguity is absent is what produces a wrong date
  // nobody questions.
  const next = resolveRelativeDate("next Thursday", ANCHOR)!;
  const thisOne = resolveRelativeDate("this Thursday", ANCHOR)!;
  assert.ok(next.confidence < thisOne.confidence, "the ambiguous phrasing is the less certain one");
});

test("🔴 an unresolvable expression returns null rather than a guess", () => {
  assert.equal(resolveRelativeDate("later in the term", ANCHOR), null);
  assert.equal(resolveRelativeDate("", ANCHOR), null);
  assert.equal(resolveRelativeDate("at some point", ANCHOR), null);
});

test("the original wording is always carried through", () => {
  const resolved = resolveRelativeDate("in two weeks", ANCHOR)!;
  // Storing only the resolved date throws away the evidence for the resolution.
  assert.equal(resolved.expression, "in two weeks");
});

test("hedged and rescheduling language is recognised structurally", () => {
  assert.ok(hasHedging("we'll probably test this sometime next month"));
  assert.ok(hasHedging("Exam date TBD"));
  assert.ok(!hasHedging("Exam 1 is on September 12"));
  assert.ok(isReschedule("Exam 1 has been moved to Sept 15"));
  assert.ok(isReschedule("the quiz is now on Friday"));
  assert.ok(!isReschedule("Exam 1 is on September 12"));
});

test("🔴 the same date from four sources is ONE event with four supports", () => {
  const { merged } = reconcile([
    candidate({ id: "a", sourceRefs: [{ sourceId: "syllabus", excerptId: "e1" }], confidence: 0.85 }),
    candidate({ id: "b", sourceRefs: [{ sourceId: "slides", excerptId: "e2" }], confidence: 0.8 }),
    candidate({ id: "c", sourceRefs: [{ sourceId: "recording", excerptId: "e3" }], confidence: 0.7 }),
    candidate({ id: "d", sourceRefs: [{ sourceId: "syllabus", excerptId: "e1" }], confidence: 0.85 }),
  ]);
  assert.equal(merged.length, 1, "one exam, not four");
  assert.equal(merged[0]!.sourceRefs.length, 3, "the duplicate ref is not counted twice");
  assert.ok(merged[0]!.confidence > 0.85, "independent support raises confidence");
  assert.ok(merged[0]!.confidence <= 0.99, "but never reaches certainty");
});

test("🔴 a moved date is surfaced as a conflict, never silently overwritten", () => {
  // The syllabus said the 12th; the professor later said it moved to the 15th. Keeping the 12th
  // quietly is how somebody sits an exam on the wrong day.
  const { conflicts } = reconcile([
    candidate({ id: "a", startAt: "2026-09-12T00:00:00.000Z", resolvedAgainst: "2026-08-01T00:00:00.000Z" }),
    candidate({
      id: "b",
      startAt: "2026-09-15T00:00:00.000Z",
      resolvedAgainst: "2026-09-02T00:00:00.000Z",
      originalExpression: "we moved Exam 1 to Sept 15",
    }),
  ]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]!.from.startAt?.slice(0, 10), "2026-09-12");
  assert.equal(conflicts[0]!.to.startAt?.slice(0, 10), "2026-09-15");
  assert.ok(conflicts[0]!.explicit, "the later source said it moved, which is what makes it authoritative");
});

test("conflicts are ordered by when the claim was made, not by the date claimed", () => {
  // A recording from last week saying "moved to the 15th" outranks a syllabus written in August,
  // even though the 15th is later than the 12th either way.
  const { conflicts } = reconcile([
    candidate({ id: "late-claim", startAt: "2026-09-15T00:00:00.000Z", resolvedAgainst: "2026-09-02T00:00:00.000Z" }),
    candidate({ id: "early-claim", startAt: "2026-09-12T00:00:00.000Z", resolvedAgainst: "2026-08-01T00:00:00.000Z" }),
  ]);
  assert.equal(conflicts[0]!.from.id, "early-claim");
  assert.equal(conflicts[0]!.to.id, "late-claim");
});

test("a single well-supported date is not a conflict with itself", () => {
  assert.deepEqual(reconcile([candidate()]).conflicts, []);
});

test("🔴 auto-confirm requires provenance, confidence AND unhedged wording", () => {
  assert.ok(canAutoConfirm(candidate()), "a plain, well-sourced syllabus date is fine");

  // Every one of these alone is disqualifying.
  assert.ok(!canAutoConfirm(candidate({ sourceRefs: [] })), "no provenance, no auto-confirm");
  assert.ok(!canAutoConfirm(candidate({ confidence: AUTO_CONFIRM_AT - 0.01 })), "below threshold");
  assert.ok(
    !canAutoConfirm(candidate({ originalExpression: "we'll probably test this sometime next month" })),
    "a confident reading of a hedged sentence is still a hedged sentence",
  );
  assert.ok(!canAutoConfirm(candidate({ startAt: undefined, dueAt: undefined })), "no date at all");
  assert.ok(
    !canAutoConfirm(candidate({ origin: "nemesis_plan" })),
    "a plan Nemesis invented is not an obligation and must not appear as one",
  );
});

test("🔴 nothing may write to an external calendar from extraction", () => {
  // Deliberately a function rather than an absence, so the rule can be grepped for and so a
  // future change has to delete a line that says what it is doing.
  assert.equal(canWriteToExternalCalendar(), false);
});
