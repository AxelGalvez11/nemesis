import assert from "node:assert/strict";
import { test } from "node:test";

import { calcLabel, calcsFor, calculate, type CalcProp } from "./db-calc";

const schema: Record<string, CalcProp> = {
  title: { name: "Name", type: "title" },
  pts: { name: "Points", type: "number" },
  tags: { name: "Tags", type: "multi_select" },
  st: { name: "Status", type: "status" },
  due: { name: "Due", type: "date" },
  done: { name: "Submitted", type: "checkbox" },
  made: { name: "Created", type: "created_time" },
};
const rows = [
  { title: "Contract law essay", pts: 10, tags: ["Essay"], st: "Done", due: "2026-09-10", done: true, created: Date.UTC(2026, 8, 1, 12) },
  { title: "Evidence reading", pts: 3, tags: ["Exam", "Essay"], st: "In progress", due: "2026-09-14T09:00", done: false, created: Date.UTC(2026, 8, 5, 12) },
  { title: "Circuits lab", pts: "5", tags: [], st: "done", created: Date.UTC(2026, 8, 9, 12) },
];
const utc = { dayOf: (ms: number) => new Date(ms).toISOString().slice(0, 10) };
const calc = (fn: Parameters<typeof calculate>[0], pid: string, list: Array<Record<string, unknown>> = rows) => calculate(fn, list, pid, schema[pid]!, utc);

test("🔴 counts: every row, the values in them, the empty ones and the distinct values, in any case", () => {
  assert.deepEqual(calc("count_all", "title"), { label: "Count", value: "3" });
  assert.deepEqual(calc("count_values", "tags"), { label: "Values", value: "3" }, "each tag counts");
  assert.deepEqual(calc("count_empty", "due"), { label: "Empty", value: "1" });
  assert.deepEqual(calc("count_unique", "st"), { label: "Unique", value: "2" }, "Done and done are one value");
  assert.deepEqual(calc("count_unique", "tags"), { label: "Unique", value: "2" });
});

test("files count one each, and the same file twice is one unique value", () => {
  const att = { name: "Files", type: "files" };
  const list = [{ att: [{ name: "a.pdf", ref: "ws-file:s/p/1-a.pdf" }, { name: "b.pdf", ref: "ws-file:s/p/2-b.pdf" }] }, { att: [{ name: "a.pdf", ref: "ws-file:s/p/1-a.pdf" }] }, { att: [] }];
  assert.deepEqual(calculate("count_values", list, "att", att), { label: "Values", value: "3" });
  assert.deepEqual(calculate("count_unique", list, "att", att), { label: "Unique", value: "2" });
  assert.deepEqual(calculate("count_empty", list, "att", att), { label: "Empty", value: "1" });
});

test("shares round to one decimal and read 0% over no rows", () => {
  assert.deepEqual(calc("percent_empty", "due"), { label: "Empty", value: "33.3%" });
  assert.deepEqual(calc("percent_not_empty", "due"), { label: "Not empty", value: "66.7%" });
  assert.deepEqual(calc("percent_empty", "due", []), { label: "Empty", value: "0%" });
});

test("🔴 numbers: sum, average, median, min, max and range, reading numbers typed as text", () => {
  assert.deepEqual(calc("sum", "pts"), { label: "Sum", value: "18" });
  assert.deepEqual(calc("average", "pts"), { label: "Average", value: "6" });
  assert.deepEqual(calc("median", "pts"), { label: "Median", value: "5" });
  assert.deepEqual(calc("median", "pts", rows.slice(0, 2)), { label: "Median", value: "6.5" });
  assert.deepEqual(calc("min", "pts"), { label: "Min", value: "3" });
  assert.deepEqual(calc("max", "pts"), { label: "Max", value: "10" });
  assert.deepEqual(calc("range", "pts"), { label: "Range", value: "7" });
  assert.deepEqual(calc("average", "pts", [{ pts: 1 }, { pts: 2 }, { pts: 2 }]), { label: "Average", value: "1.67" });
  assert.deepEqual(calc("sum", "pts", []), { label: "Sum", value: "0" });
  assert.deepEqual(calc("average", "pts", []), { label: "Average", value: "" });
});

test("dates: the earliest, the latest and the days between, created times by the viewer's day", () => {
  assert.deepEqual(calc("earliest", "due"), { label: "Earliest", value: "Sep 10, 2026" });
  assert.deepEqual(calc("latest", "due"), { label: "Latest", value: "Sep 14, 2026" }, "a date with a time is that day");
  assert.deepEqual(calc("date_range", "due"), { label: "Range", value: "4 days" });
  assert.deepEqual(calc("date_range", "made"), { label: "Range", value: "8 days" });
  assert.deepEqual(calc("date_range", "due", [{ due: "2026-09-10" }, { due: "2026-09-11" }]), { label: "Range", value: "1 day" });
  assert.deepEqual(calc("earliest", "due", [{}]), { label: "Earliest", value: "" });
});

test("checkboxes count and share what is checked", () => {
  assert.deepEqual(calc("checked", "done"), { label: "Checked", value: "1" });
  assert.deepEqual(calc("unchecked", "done"), { label: "Unchecked", value: "2" }, "a row with no value is unchecked");
  assert.deepEqual(calc("percent_checked", "done"), { label: "Checked", value: "33.3%" });
  assert.deepEqual(calc("percent_unchecked", "done"), { label: "Unchecked", value: "66.7%" });
});

test("🔴 each type offers its own calculations and nothing else", () => {
  assert.equal(calc("sum", "title"), null, "no sum of titles");
  assert.equal(calc("count_empty", "done"), null, "a checkbox is never empty");
  assert.deepEqual(calcsFor("number").slice(-6), ["sum", "average", "median", "min", "max", "range"]);
  assert.deepEqual(calcsFor("created_time").slice(-3), ["earliest", "latest", "date_range"]);
  assert.deepEqual(calcsFor("formula"), ["count_all"]);
  assert.equal(calcLabel("count_unique"), "Count unique values");
});
