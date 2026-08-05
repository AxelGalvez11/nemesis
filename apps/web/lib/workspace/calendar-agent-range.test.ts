import assert from "node:assert/strict";
import test from "node:test";

import type { CalendarEvent } from "./calendar-model";
import {
  calendarCoverage,
  calendarEventFromRow,
  eventsInWindow,
  localToday,
  resolveCalendarWindow,
} from "./calendar-agent-range";
import { findCalendarIssues } from "./calendar-conflicts";
import { parseRecurrence } from "./calendar-model";
import { serializeToolResult, TOOL_RESULT_CHAR_BUDGET } from "./chat-tool-result";

// ── The window contract ──────────────────────────────────────────────────────

test("no arguments means the next 30 days from today", () => {
  assert.deepEqual(resolveCalendarWindow({}, "2026-08-05"), { from: "2026-08-05", to: "2026-09-04" });
});

test("an explicit range wins, past dates included — 'show me everything this semester'", () => {
  assert.deepEqual(
    resolveCalendarWindow({ end_date: "2026-12-12", start_date: "2026-01-05" }, "2026-08-05"),
    { from: "2026-01-05", to: "2026-12-12" },
  );
});

test("start alone runs 180 days forward; end alone starts today", () => {
  assert.deepEqual(resolveCalendarWindow({ start_date: "2026-08-20" }, "2026-08-05"), { from: "2026-08-20", to: "2027-02-16" });
  assert.deepEqual(resolveCalendarWindow({ end_date: "2026-12-01" }, "2026-08-05"), { from: "2026-08-05", to: "2026-12-01" });
});

test("a backwards range is swapped, not rejected — the model meant the range", () => {
  assert.deepEqual(
    resolveCalendarWindow({ end_date: "2026-01-05", start_date: "2026-12-12" }, "2026-08-05"),
    { from: "2026-01-05", to: "2026-12-12" },
  );
});

test("days_ahead caps at a year and garbage falls back to the default", () => {
  assert.equal(resolveCalendarWindow({ days_ahead: 9999 }, "2026-08-05").to, "2027-08-06");
  assert.deepEqual(resolveCalendarWindow({ days_ahead: Number.NaN }, "2026-08-05"), { from: "2026-08-05", to: "2026-09-04" });
});

// ── 'today' is the student's LOCAL date ─────────────────────────────────────
// toISOString() reads tomorrow every evening in negative-UTC-offset zones,
// which silently hid same-day deadlines between 7 PM and midnight CDT.

test("🔴 localToday is built from local components, never UTC", () => {
  const now = new Date();
  const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  assert.equal(localToday(), expected);
});

// ── Row mapping ──────────────────────────────────────────────────────────────

test("a full row maps with end_time and recurrence; a malformed one drops", () => {
  const event = calendarEventFromRow({
    course: "PHCY 1218",
    date: "2026-08-25",
    end_time: "09:50",
    id: "row-1",
    kind: "class",
    note: "Room 204",
    recurrence: { days: [1, 3, 5, 9], until: "2026-12-12" },
    source: "manual",
    time: "09:00",
    title: "Pharmacotherapy lecture",
  });
  assert.ok(event);
  assert.equal(event.endTime, "09:50");
  assert.deepEqual(event.recurrence, { days: [1, 3, 5], until: "2026-12-12" });
  assert.equal(calendarEventFromRow({ date: "not-a-date", id: "x", title: "Bad" }), null);
  assert.equal(calendarEventFromRow({ date: "2026-08-25", id: "", title: "Bad" }), null);
});

test("an unknown kind degrades to 'other' instead of dropping the event", () => {
  const event = calendarEventFromRow({ date: "2026-08-25", id: "r", kind: "fiesta", title: "T" });
  assert.equal(event?.kind, "other");
});

// ── Recurrence expansion inside the window ───────────────────────────────────

const WEEKLY: CalendarEvent = {
  date: "2026-08-24", // a Monday
  id: "series-1",
  kind: "class",
  recurrence: { days: [1, 3], until: "2026-12-11" }, // Mon + Wed
  time: "09:00",
  title: "Pharm lecture",
};

test("🔴 'what do I have today' — a rule anchored WEEKS earlier still reports today's meeting", () => {
  // Window = one Wednesday in October, far from the anchor row's own date.
  const occurrences = eventsInWindow([WEEKLY], "2026-10-14", "2026-10-14");
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0]?.date, "2026-10-14");
  // The handle is ALWAYS the real row id, so update/delete always work.
  assert.equal(occurrences[0]?.id, "series-1");
  assert.equal(occurrences[0]?.recurring, true);
});

test("a week of the series yields exactly its meeting days, in order", () => {
  const week = eventsInWindow([WEEKLY], "2026-10-12", "2026-10-18");
  assert.deepEqual(week.map((event) => event.date), ["2026-10-12", "2026-10-14"]);
});

test("the rule's own end date is respected", () => {
  assert.deepEqual(eventsInWindow([WEEKLY], "2026-12-14", "2026-12-20"), []);
});

test("plain events filter to the window and sort by date then time", () => {
  const events: CalendarEvent[] = [
    { date: "2026-10-14", id: "b", kind: "exam", time: "14:00", title: "Exam 2" },
    { date: "2026-10-14", id: "a", kind: "class", time: "09:00", title: "Lecture" },
    { date: "2026-09-01", id: "c", kind: "assignment", title: "Too early" },
  ];
  const window = eventsInWindow(events, "2026-10-01", "2026-10-31");
  assert.deepEqual(window.map((event) => event.id), ["a", "b"]);
});

// ── Event notes travel as previews ──────────────────────────────────────────
// Owner 2026-08-05, acceptance test 3: 92 events each carrying a full
// "From your syllabus: …" paragraph blew past the 20,000-char tool-result
// budget, and the payload was clipped mid-object while still saying
// "complete": true.

test("a long syllabus note is shortened to a preview", () => {
  const long = `From your syllabus: ${"lorem ipsum ".repeat(80)}`;
  const events: CalendarEvent[] = [
    { course: "PHCY 2114", date: "2026-08-11", id: "e1", kind: "class", note: long, title: "Lecture 1" } as CalendarEvent,
  ];
  const event = eventsInWindow(events, "2026-08-01", "2026-08-31")[0];
  assert.ok(event?.note);
  assert.ok(event.note.length <= 91, `note still ${event.note.length} chars`);
  assert.match(event.note, /^From your syllabus:/);
  assert.match(event.note, /…$/, "a shortened note says so");
});

test("a short note is left exactly as written", () => {
  const events: CalendarEvent[] = [
    { date: "2026-08-11", id: "e1", kind: "exam", note: "Bring a calculator.", title: "Exam 1" } as CalendarEvent,
  ];
  assert.equal(eventsInWindow(events, "2026-08-01", "2026-08-31")[0]?.note, "Bring a calculator.");
});

test("a full semester of noted events fits inside one tool result", () => {
  // 92 is what the owner's real Aug–Dec range returned on 2026-08-05.
  const events: CalendarEvent[] = Array.from({ length: 92 }, (_, index) => ({
    course: "PHCY 2114",
    date: "2026-08-11",
    id: `e${index}`,
    kind: "class",
    note: `From your syllabus: ${"detail ".repeat(120)}`,
    title: `Lecture ${index}`,
  }) as CalendarEvent);
  const payload = JSON.stringify(eventsInWindow(events, "2026-08-01", "2026-08-31"));
  assert.ok(payload.length < 20_000, `payload was ${payload.length} chars`);
});

// ── Cancellations survive BOTH readers of the recurrence column ──────────────
//
// 🔴 There were two independent whitelists over the same jsonb: sanitizeEvent
// (the calendar page) and calendarEventFromRow (the agent). Both dropped keys
// they did not name, so a field added to one and missed in the other vanished
// on that path with no error anywhere — the page would honour a cancelled class
// that the chat could not see. They now share parseRecurrence, and this reads a
// row through both to keep it that way.

test("🔴 a cancelled meeting survives the agent's reader", () => {
  const parsed = calendarEventFromRow({
    date: "2026-08-24",
    id: "lecture",
    recurrence: { days: [1, 3, 5], except: ["2026-09-07"], until: "2026-09-25" },
    title: "Pharmacology Lecture",
  });
  assert.deepEqual(parsed?.recurrence?.except, ["2026-09-07"]);
});

test("both readers agree on the same stored rule", () => {
  const stored = { days: [1, 3], except: ["2026-09-07", "2026-09-07"], until: "2026-09-25" };
  const viaAgent = calendarEventFromRow({ date: "2026-08-24", id: "a", recurrence: stored, title: "Lecture" });
  assert.deepEqual(viaAgent?.recurrence, parseRecurrence(stored));
});

test("a junk cancellation date is dropped, not stored", () => {
  const parsed = parseRecurrence({ days: [1], except: ["nope", 7, "2026-09-07"], until: "2026-09-25" });
  assert.deepEqual(parsed?.except, ["2026-09-07"]);
});

test("a rule with no cancellations carries no empty list", () => {
  assert.equal("except" in (parseRecurrence({ days: [1], until: "2026-09-25" }) ?? {}), false);
});

test("a rule with no days or no end is not a schedule", () => {
  assert.equal(parseRecurrence({ days: [], until: "2026-09-25" }), null);
  assert.equal(parseRecurrence({ days: [1] }), null);
  assert.equal(parseRecurrence(null), null);
});

// ── How far back Nemesis can honestly speak (Phase 2 item 3) ────────────────
//
// The audit used to open its window at 0001-01-01 and report that window back,
// which told the model that the whole of history had been checked and was
// clean. Nothing exists there to check.

const RECORDS: CalendarEvent[] = [
  { date: "2026-01-05", id: "first", kind: "class", title: "Spring term begins" },
  { date: "2026-08-24", id: "lecture", kind: "class", recurrence: { days: [1], until: "2026-11-24" }, title: "Lecture" },
];

test("🔴 with no window asked for, coverage is the student's real records", () => {
  const coverage = calendarCoverage(RECORDS, {});
  assert.equal(coverage.from, "2026-01-05");
  assert.equal(coverage.earliest_record, "2026-01-05");
  // The latest date counts where a repeating rule runs to, not just row dates.
  assert.equal(coverage.to, "2026-11-24");
  assert.equal(coverage.partial, false);
});

test("🔴 asking about a period with no records says so instead of reporting it clean", () => {
  const coverage = calendarCoverage(RECORDS, { from: "2020-01-01" });
  assert.equal(coverage.partial, true);
  assert.equal(coverage.from, "2026-01-05", "the audit walked what exists, not what was asked for");
  assert.match(coverage.note, /nothing before 2026-01-05/);
});

test("a window inside the records is honoured exactly, and is not partial", () => {
  const coverage = calendarCoverage(RECORDS, { from: "2026-08-01", to: "2026-09-01" });
  assert.deepEqual([coverage.from, coverage.to], ["2026-08-01", "2026-09-01"]);
  assert.equal(coverage.partial, false);
});

test("asking past the end is partial in the other direction", () => {
  const coverage = calendarCoverage(RECORDS, { to: "2030-01-01" });
  assert.equal(coverage.partial, true);
  assert.match(coverage.note, /nothing after 2026-11-24/);
});

test("an empty calendar states that, rather than inventing a range", () => {
  const coverage = calendarCoverage([], { from: "2020-01-01" });
  assert.equal(coverage.earliest_record, null);
  assert.equal(coverage.partial, false, "there is no boundary to fall short of");
  assert.match(coverage.note, /no calendar events at all/);
});

// ── The audit still fits in one tool result ────────────────────────────────

test("🔴 auditing a real term of expanded events stays inside the tool budget", () => {
  // The production account: 175 events over ten months with two repeating
  // rules, every syllabus row carrying a long note. Expansion multiplies what
  // is compared; collapsing findings per pair of rows is what keeps the ANSWER
  // small. If this ever overflows, the result is clipped and the model is told
  // the audit was incomplete.
  const events: CalendarEvent[] = [
    { date: "2026-08-24", id: "lecture", kind: "class", recurrence: { days: [1, 3, 5], until: "2026-12-11" }, time: "09:00", title: "Pharmacology Lecture" },
    { date: "2026-08-25", id: "lab", kind: "class", recurrence: { days: [1, 3, 5], until: "2026-12-11" }, time: "09:00", title: "Pharmacology Lab" },
    ...Array.from({ length: 173 }, (_, index): CalendarEvent => ({
      course: "PHCY 2114",
      date: `2026-${String(1 + (index % 11)).padStart(2, "0")}-${String(1 + (index % 28)).padStart(2, "0")}`,
      id: `event-${index}`,
      kind: index % 3 === 0 ? "exam" : "assignment",
      note: `From your syllabus: ${"reading and objectives ".repeat(12)}`,
      time: "09:00",
      title: `Assessment ${index}`,
    })),
  ];
  const payload = serializeToolResult(findCalendarIssues(events));
  assert.ok(
    payload.length <= TOOL_RESULT_CHAR_BUDGET,
    `audit serialized to ${payload.length} chars — expansion is flooding the answer`,
  );
  assert.equal(JSON.parse(payload).complete, undefined, "the payload was clipped rather than returned whole");
});
