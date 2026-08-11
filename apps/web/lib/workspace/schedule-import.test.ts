import assert from "node:assert/strict";
import { test } from "node:test";

import type { ScheduleCandidate } from "@/lib/learn/schedule-candidates";

import { calendarEventFromRow } from "./calendar-agent-range";
import { decodeCalendarEvent, encodeCalendarEvent } from "./calendar-codec";
import { approve, calendarEventId, planCalendarImport } from "./schedule-import";
import { isRefusal, toCalendarEvent } from "./schedule-to-calendar";

const SOURCE = "src-syllabus-1";

function candidate(over: Partial<ScheduleCandidate> = {}): ScheduleCandidate {
  return {
    canvasId: "canvas-1",
    confidence: 0.85,
    id: "c1",
    kind: "exam",
    origin: "source_extraction",
    originalExpression: "8-17 | - | Exam 1 (George 24/ Moore 12 = 36 questions)",
    sourceRefs: [{
      blockIds: ["b41"],
      excerptId: "b41",
      headingPath: ["Date | Time | Topic"],
      parsedDocumentId: "parse-9",
      sourceId: SOURCE,
      unitIndex: 12,
    }],
    startAt: "2026-08-17T13:00:00",
    status: "candidate",
    title: "Exam 1",
    ...over,
  };
}

// ── Gate E — a refusal is a stated reason, not a shorter list ────────────────

test("a candidate with no provenance is refused, and the reason travels", () => {
  // 🔴 THE POINT IS THE REASON REACHING THE CALLER. `toCalendarEvent` has always returned one and
  // every caller threw it away, so a row that produced no calendar entry produced no explanation
  // either — indistinguishable, from the outside, from an extraction that never ran.
  const plan = planCalendarImport([candidate({ sourceRefs: [] })], { sourceId: SOURCE });
  assert.equal(plan.events.length, 0);
  assert.equal(plan.refused.length, 1);
  assert.equal(plan.refused[0]!.reason, "no_provenance");
  assert.ok(plan.refused[0]!.evidence?.includes("Exam 1"), "the row as written comes back with it");
});

test("a candidate with no date is refused rather than placed on an invented day", () => {
  const plan = planCalendarImport([candidate({ startAt: undefined })], { sourceId: SOURCE });
  assert.equal(plan.refused[0]!.reason, "no_date");
});

test("a hedged row is offered for approval, not silently dropped", () => {
  const plan = planCalendarImport(
    [candidate({ confidence: 0.4, originalExpression: "we will probably have the final sometime in December" })],
    { sourceId: SOURCE },
  );
  assert.equal(plan.events.length, 0, "not placed unasked");
  assert.equal(plan.needsApproval.length, 1, "but shown, because it was extracted and has a date");
  assert.equal(plan.refused.length, 0);
});

// ── Gate F — recurrence is ONE series ───────────────────────────────────────

test("a weekly class becomes one recurring event, not one per occurrence", () => {
  const klass = candidate({
    confidence: 0.7,
    endTime: "11:20",
    kind: "class",
    meetsOn: [2, 4],
    startAt: undefined,
    startTime: "10:00",
    resolvedAgainst: "2026-08-06T00:00:00",
    title: "Integrated Pharmacotherapy 4",
  });
  const plan = planCalendarImport([klass], { seriesEnd: "2026-12-04", sourceId: SOURCE });
  assert.equal(plan.events.length + plan.needsApproval.length, 1, "ONE entry for the whole series");
  const event = plan.events[0] ?? plan.needsApproval[0]!.event;
  assert.deepEqual(event.recurrence?.days, [2, 4]);
  assert.equal(event.recurrence?.until, "2026-12-04");
  assert.equal(event.time, "10:00");
  assert.equal(event.endTime, "11:20");
});

test("🔴 a series whose END the document never states is REFUSED, never guessed", () => {
  // The tempting fill-in is "the latest dated thing in this document". On a real syllabus that is
  // the final EXAM — so a Tue/Thu class would stop on exam day and every meeting after it would
  // vanish. Missing work the student was never shown is the worst failure this pipeline has.
  const klass = candidate({ kind: "class", meetsOn: [2, 4], startAt: undefined, startTime: "10:00" });
  const plan = planCalendarImport([klass], { sourceId: SOURCE });   // no seriesEnd
  assert.equal(plan.events.length, 0);
  assert.equal(plan.refused[0]!.reason, "no_series_end");
});

// ── Gate G — approval ───────────────────────────────────────────────────────

test("approving a proposal is what lets it past the automatic bar", () => {
  const unsure = candidate({ confidence: 0.5 });
  assert.ok(isRefusal(toCalendarEvent(unsure, "e1")), "below the bar, it is not placed");
  const said_yes = approve(unsure);
  assert.equal(said_yes.status, "confirmed");
  const result = toCalendarEvent(said_yes, "e1");
  assert.ok(!isRefusal(result), "a learner who looked at it and said yes beats any threshold");
});

// ── Gate I — idempotency ────────────────────────────────────────────────────

test("importing the same syllabus twice yields the same ids", () => {
  const first = planCalendarImport([candidate(), candidate({ id: "c2", startAt: "2026-08-31T13:00:00", title: "Exam 2" })], { sourceId: SOURCE });
  // A RE-PARSE: a new parsed_documents row, new block ids, same document.
  const reparsed = [
    candidate({ id: "x9", sourceRefs: [{ blockIds: ["b77"], excerptId: "b77", parsedDocumentId: "parse-11", sourceId: SOURCE, unitIndex: 12 }] }),
    candidate({ id: "x10", startAt: "2026-08-31T13:00:00", title: "Exam 2" }),
  ];
  const second = planCalendarImport(reparsed, { sourceId: SOURCE });
  assert.deepEqual(second.events.map((e) => e.id), first.events.map((e) => e.id));
});

test("the id survives a re-parse but NOT a different source", () => {
  const a = calendarEventId(candidate(), SOURCE);
  const b = calendarEventId(candidate({ sourceRefs: [{ excerptId: "z", parsedDocumentId: "parse-99", sourceId: SOURCE }] }), SOURCE);
  assert.equal(a, b, "parsedDocumentId changes on every re-read and must not be in the key");
  assert.notEqual(a, calendarEventId(candidate(), "another-source"));
});

test("two rows describing the same obligation collapse to one entry", () => {
  const plan = planCalendarImport([candidate(), candidate({ id: "dup" })], { sourceId: SOURCE });
  assert.equal(plan.events.length, 1);
});

test("KNOWN LIMIT, stated rather than hidden: a renamed event re-imports as a second entry", () => {
  // The title is part of the key. Dropping it would collapse every undated row of one document
  // onto a single id, which is worse; the trade is deliberate.
  assert.notEqual(calendarEventId(candidate(), SOURCE), calendarEventId(candidate({ title: "Exam One" }), SOURCE));
});

// ── Gate H/J — the write path, and provenance surviving it ──────────────────

test("🔴 recurrence and time survive the round trip to storage and back", () => {
  // `calendar-model.ts` records that this column once had TWO independent decoders that each
  // named their own keys, drifted, and lost a field on one path with no error anywhere.
  // `calendarEventFromRow` now delegates to `decodeCalendarEvent`, and this reads BOTH entry
  // points so that if anyone re-inlines the second one, recurrence is what breaks first.
  const klass = candidate({
    confidence: 0.9,
    endTime: "11:20",
    kind: "class",
    meetsOn: [2, 4],
    resolvedAgainst: "2026-08-06T00:00:00",
    startAt: undefined,
    startTime: "10:00",
  });
  const plan = planCalendarImport([klass], { seriesEnd: "2026-12-04", sourceId: SOURCE });
  const event = plan.events[0]!;

  const encoded = encodeCalendarEvent(event, "user-1", "agent");
  const throughCodec = decodeCalendarEvent(JSON.parse(JSON.stringify(encoded)));
  assert.ok(throughCodec, "the codec must read back what it wrote");
  assert.deepEqual(throughCodec!.recurrence?.days, [2, 4]);
  assert.equal(throughCodec!.recurrence?.until, "2026-12-04");
  assert.equal(throughCodec!.time, "10:00");

  // The cloud path reads the stored ROW, column by column, not a payload blob.
  const throughRow = calendarEventFromRow(JSON.parse(JSON.stringify(encoded)) as never);
  assert.ok(throughRow, "the cloud reader must read back what the codec wrote");
  assert.deepEqual(throughRow!.recurrence?.days, [2, 4], "recurrence must not die on the cloud path");
  assert.equal(throughRow!.time, "10:00");
});

test("a written event still points at the page and blocks it came from", () => {
  const plan = planCalendarImport([candidate()], { sourceId: SOURCE });
  const ref = plan.events[0]!.sourceRefs?.[0];
  assert.equal(ref?.sourceId, SOURCE);
  assert.equal(ref?.parsedDocumentId, "parse-9");
  assert.equal(ref?.unitIndex, 12, "page 13, one-based, resolvable in the stored parse");
  assert.deepEqual(ref?.blockIds, ["b41"]);
  assert.equal(plan.events[0]!.origin, "source_extraction");
});

test("🔴 the codec must return the WHOLE locator, not just the two fields it used to know", () => {
  // THE DEFECT, MEASURED: `refs()` rebuilt each SourceRef from `sourceId` and `excerptId` alone.
  // The writer stored `parsedDocumentId`, `unitIndex`, `blockIds` and `headingPath`; the reader
  // returned two of six. So 48 of 48 events on a real syllabus came back pointing at a
  // canvas-local string with no page and no blocks — "show me where this came from" answerable
  // going in and unanswerable coming out, with no error on either side.
  const event = planCalendarImport([candidate()], { sourceId: SOURCE }).events[0]!;
  const row = JSON.parse(JSON.stringify(encodeCalendarEvent(event, "user-1", "agent")));
  const ref = decodeCalendarEvent(row)!.sourceRefs![0]!;
  assert.equal(ref.parsedDocumentId, "parse-9");
  assert.equal(ref.unitIndex, 12);
  assert.deepEqual(ref.blockIds, ["b41"]);
  assert.deepEqual(ref.headingPath, ["Date | Time | Topic"]);
});

test("an absent locator stays absent — never a default of page 1", () => {
  const bare = planCalendarImport([candidate({ sourceRefs: [{ excerptId: "e1", sourceId: SOURCE }] })], { sourceId: SOURCE }).events[0]!;
  const ref = decodeCalendarEvent(JSON.parse(JSON.stringify(encodeCalendarEvent(bare, "u", "agent"))))!.sourceRefs![0]!;
  assert.equal(ref.unitIndex, undefined);
  assert.equal(ref.blockIds, undefined);
});
