import assert from "node:assert/strict";
import { test } from "node:test";

import {
  describeSpec,
  expandSpec,
  formatRecurrenceLines,
  parseRecurrenceLines,
  type RecurrenceSpec,
  specFromLegacy,
  specToLegacy,
} from "./rrule";

const parse = (lines: string[]): RecurrenceSpec => {
  const spec = parseRecurrenceLines(lines);
  assert.ok(spec, `could not parse ${lines.join(" | ")}`);
  return spec;
};

// ---------------------------------------------------------------- parsing

test("a plain weekly rule", () => {
  const spec = parse(["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20260612"]);
  assert.equal(spec.rule.freq, "WEEKLY");
  assert.equal(spec.rule.interval, 1);
  assert.deepEqual(spec.rule.byDay, [{ day: 1 }, { day: 3 }, { day: 5 }]);
  assert.equal(spec.rule.until, "2026-06-12");
});

test("🔴 every OTHER Tuesday, which the old shape could not say at all", () => {
  const spec = parse(["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;UNTIL=20260331"]);
  const dates = expandSpec(spec, "2026-03-03");
  // 3rd, then skip the 10th, 17th, skip the 24th, 31st.
  assert.deepEqual(dates, ["2026-03-03", "2026-03-17", "2026-03-31"]);
});

test("the first Monday of each month", () => {
  const spec = parse(["RRULE:FREQ=MONTHLY;BYDAY=1MO;COUNT=4"]);
  assert.deepEqual(expandSpec(spec, "2026-03-02"), ["2026-03-02", "2026-04-06", "2026-05-04", "2026-06-01"]);
});

test("the LAST Friday of each month", () => {
  const spec = parse(["RRULE:FREQ=MONTHLY;BYDAY=-1FR;COUNT=3"]);
  assert.deepEqual(expandSpec(spec, "2026-01-30"), ["2026-01-30", "2026-02-27", "2026-03-27"]);
});

test("EXDATE and RDATE both survive the round trip", () => {
  const spec = parse([
    "RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20260331",
    "EXDATE:20260317",
    "RDATE:20260318",
  ]);
  assert.deepEqual(spec.exceptDates, ["2026-03-17"]);
  assert.deepEqual(spec.extraDates, ["2026-03-18"]);
  const dates = expandSpec(spec, "2026-03-03");
  assert.ok(!dates.includes("2026-03-17"), "a cancelled meeting is still being drawn");
  assert.ok(dates.includes("2026-03-18"), "the moved meeting was dropped");
});

test("a parameterised EXDATE line still parses", () => {
  // Google writes EXDATE;TZID=Europe/London:20260317T090000
  const spec = parse(["RRULE:FREQ=WEEKLY;BYDAY=TU", "EXDATE;TZID=Europe/London:20260317T090000"]);
  assert.deepEqual(spec.exceptDates, ["2026-03-17"]);
});

test("nonsense is refused rather than half-understood", () => {
  assert.equal(parseRecurrenceLines([]), null);
  assert.equal(parseRecurrenceLines(["EXDATE:20260317"]), null, "an EXDATE with no rule is not a schedule");
  assert.equal(parseRecurrenceLines(["RRULE:BYDAY=MO"]), null, "a rule with no FREQ cannot be expanded");
  assert.equal(parseRecurrenceLines(["RRULE:FREQ=FORTNIGHTLY;BYDAY=MO"]), null, "FORTNIGHTLY is not a frequency");
});

// ---------------------------------------------------------------- counting

test("🔴 COUNT is measured from the series start, not from the window", () => {
  const spec = parse(["RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4"]);
  const all = expandSpec(spec, "2026-03-02");
  assert.equal(all.length, 4);
  // Asking only about the last fortnight must not hand back four MORE.
  const late = expandSpec(spec, "2026-03-02", { from: "2026-03-16" });
  assert.deepEqual(late, ["2026-03-16", "2026-03-23"], "the window restarted the count");
});

test("a skipped date is still counted, the way every calendar counts it", () => {
  // "12 lectures, one cancelled" is 11 lectures, not 12 with an extra week bolted on.
  const spec = parse(["RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4", "EXDATE:20260309"]);
  assert.deepEqual(expandSpec(spec, "2026-03-02"), ["2026-03-02", "2026-03-16", "2026-03-23"]);
});

test("a rule with no end still stops", () => {
  const spec = parse(["RRULE:FREQ=WEEKLY;BYDAY=MO"]);
  const dates = expandSpec(spec, "2026-03-02");
  assert.ok(dates.length > 50, "an open-ended weekly class should reach well past this term");
  assert.ok(dates.length < 100, "an open-ended rule ran past its stated horizon");
});

// ---------------------------------------------------------------- shapes

test("daily, monthly by date, and yearly all behave", () => {
  assert.deepEqual(expandSpec(parse(["RRULE:FREQ=DAILY;INTERVAL=3;COUNT=3"]), "2026-03-02"),
    ["2026-03-02", "2026-03-05", "2026-03-08"]);
  assert.deepEqual(expandSpec(parse(["RRULE:FREQ=MONTHLY;COUNT=3"]), "2026-03-15"),
    ["2026-03-15", "2026-04-15", "2026-05-15"]);
  assert.deepEqual(expandSpec(parse(["RRULE:FREQ=YEARLY;COUNT=2"]), "2026-03-15"),
    ["2026-03-15", "2027-03-15"]);
});

test("🔴 a monthly series starting on the 31st skips the short months", () => {
  // Sliding it to the 30th would invent a meeting on a day nobody scheduled.
  const dates = expandSpec(parse(["RRULE:FREQ=MONTHLY;COUNT=3"]), "2026-01-31");
  assert.deepEqual(dates, ["2026-01-31", "2026-03-31", "2026-05-31"]);
});

test("BYMONTHDAY counts back from the end of the month", () => {
  assert.deepEqual(expandSpec(parse(["RRULE:FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=3"]), "2026-01-31"),
    ["2026-01-31", "2026-02-28", "2026-03-31"]);
});

// ---------------------------------------------------------------- formatting

test("a rule survives being written out and read back", () => {
  const lines = ["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=20260612", "EXDATE:20260317"];
  const once = parse(lines);
  const twice = parse(formatRecurrenceLines(once));
  assert.deepEqual(twice, once);
});

test("COUNT and UNTIL are never written together", () => {
  const spec = parse(["RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4"]);
  spec.rule.until = "2026-06-12";
  const out = formatRecurrenceLines(spec).join(" ");
  assert.ok(out.includes("COUNT=4"), "the count went missing");
  assert.ok(!out.includes("UNTIL="), "RFC 5545 forbids COUNT and UNTIL in one rule");
});

// ---------------------------------------------------------------- the old shape

test("🔴 every row already in the database still expands", () => {
  const legacy = { days: [1, 3, 5], except: ["2026-03-18"], until: "2026-06-12" };
  const spec = specFromLegacy(legacy);
  const dates = expandSpec(spec, "2026-03-02", { from: "2026-03-16", to: "2026-03-22" });
  assert.deepEqual(dates, ["2026-03-16", "2026-03-20"], "Wednesday the 18th was cancelled");
});

test("a legacy rule round-trips back to the old shape unchanged", () => {
  const legacy = { days: [1, 3], except: ["2026-03-18"], until: "2026-06-12" };
  assert.deepEqual(specToLegacy(specFromLegacy(legacy)), legacy);
});

test("🔴 a rule the old shape cannot hold refuses to be flattened into it", () => {
  // This is the whole guard. Writing "every other Tuesday" back as "every
  // Tuesday" would put a student in a lab that is not running, and nothing
  // about the result would look wrong.
  for (const line of [
    "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;UNTIL=20260612",
    "RRULE:FREQ=MONTHLY;BYDAY=1MO;UNTIL=20260612",
    "RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=12",
    "RRULE:FREQ=DAILY;UNTIL=20260612",
    "RRULE:FREQ=WEEKLY;BYDAY=TU",
  ]) {
    assert.equal(specToLegacy(parse([line])), null, `${line} was flattened into the old shape`);
  }
});

// ---------------------------------------------------------------- words

test("a rule can say what it is in English", () => {
  assert.match(describeSpec(parse(["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU"])), /Every 2 weeks on Tue/);
  assert.match(describeSpec(parse(["RRULE:FREQ=MONTHLY;BYDAY=1MO"])), /the 1st Mon/);
  assert.match(describeSpec(parse(["RRULE:FREQ=MONTHLY;BYDAY=-1FR"])), /the last Fri/);
  assert.match(describeSpec(parse(["RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4"])), /4 times/);
  assert.match(describeSpec(parse(["RRULE:FREQ=WEEKLY;BYDAY=MO", "EXDATE:20260309"])), /1 skipped/);
});

test("🔴 the walk does not stall on the day the clocks go back", () => {
  // Stepping by 24h lands on 23:00 of the SAME day that morning; normalising
  // that back to midnight returns the day it started on, so the loop never
  // advances. It hung for three minutes and died with "Invalid array length".
  const spec = parse(["RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=20261115"]);
  const dates = expandSpec(spec, "2026-10-18");
  assert.deepEqual(dates, ["2026-10-18", "2026-10-25", "2026-11-01", "2026-11-08", "2026-11-15"]);
});

test("a daily rule crosses both clock changes without dropping or repeating a day", () => {
  for (const [start, until] of [["2026-03-06", "20260312"], ["2026-10-29", "20261104"]] as const) {
    const dates = expandSpec(parse([`RRULE:FREQ=DAILY;UNTIL=${until}`]), start);
    assert.equal(dates.length, 7, `${start} → ${until}`);
    assert.equal(new Set(dates).size, 7, "a day was produced twice");
  }
});
