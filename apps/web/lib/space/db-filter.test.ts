import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultOp,
  describeFilter,
  filterReady,
  filterRows,
  operatorsFor,
  searchRows,
  seedFromFilters,
  type SchemaProp,
  type ViewFilter,
} from "./db-filter";

const schema: Record<string, SchemaProp> = {
  title: { name: "Name", type: "title" },
  notes: { name: "Notes", type: "text" },
  pts: { name: "Points", type: "number" },
  status: { name: "Status", type: "status", options: [{ value: "Not started" }, { value: "In progress" }, { value: "Done" }] },
  tags: { name: "Tags", type: "multi_select", options: [{ value: "Essay" }, { value: "Exam" }] },
  who: { name: "Assignee", type: "person" },
  due: { name: "Due", type: "date" },
  done: { name: "Submitted", type: "checkbox" },
  made: { name: "Created", type: "created_time" },
};

const rows = [
  { id: "r1", title: "Contract law essay", notes: "Offer and acceptance", pts: 10, status: "Done", tags: ["Essay"], who: ["u1"], due: "2026-09-10", done: true, created: Date.UTC(2026, 8, 1, 12) },
  { id: "r2", title: "Evidence reading", notes: "", pts: 3, status: "In progress", tags: ["Exam", "Essay"], who: ["u2"], due: "2026-09-14", done: false, created: Date.UTC(2026, 8, 5, 12) },
  { id: "r3", title: "Circuits lab", tags: [], created: Date.UTC(2026, 8, 9, 12) },
];
const utcDay = { dayOf: (ms: number) => new Date(ms).toISOString().slice(0, 10) };
const f = (pid: string, op: ViewFilter["op"], value?: unknown): ViewFilter => ({ id: `${pid}-${op}`, pid, op, value });
const ids = (...filters: ViewFilter[]) => filterRows(rows, filters, schema, utcDay).map((r) => r.id);

test("🔴 words match in any case, ignoring the spaces around them", () => {
  assert.deepEqual(ids(f("title", "contains", "LAW ")), ["r1"]);
  assert.deepEqual(ids(f("title", "does_not_contain", "law")), ["r2", "r3"]);
  assert.deepEqual(ids(f("title", "is", "evidence reading")), ["r2"]);
  assert.deepEqual(ids(f("title", "is_not", "Evidence reading")), ["r1", "r3"]);
  assert.deepEqual(ids(f("title", "starts_with", "circ")), ["r3"]);
  assert.deepEqual(ids(f("title", "ends_with", "READING")), ["r2"]);
  assert.deepEqual(ids(f("notes", "is_empty")), ["r2", "r3"]);
  assert.deepEqual(ids(f("notes", "is_not_empty")), ["r1"]);
});

test("numbers compare as numbers, and a blank one only passes ≠", () => {
  assert.deepEqual(ids(f("pts", "gt", 5)), ["r1"]);
  assert.deepEqual(ids(f("pts", "lte", "3")), ["r2"]);
  assert.deepEqual(ids(f("pts", "eq", "3")), ["r2"]);
  assert.deepEqual(ids(f("pts", "ne", 3)), ["r1", "r3"]);
  assert.deepEqual(ids(f("pts", "is_empty")), ["r3"]);
});

test("🔴 a status keeps any chosen option; tags and people keep rows holding any chosen one", () => {
  assert.deepEqual(ids(f("status", "is", ["Done", "In progress"])), ["r1", "r2"]);
  assert.deepEqual(ids(f("status", "is_not", ["Done"])), ["r2", "r3"], "a row with no status is not Done");
  assert.deepEqual(ids(f("status", "is_empty")), ["r3"]);
  assert.deepEqual(ids(f("tags", "contains", ["Exam"])), ["r2"]);
  assert.deepEqual(ids(f("tags", "does_not_contain", ["Essay"])), ["r3"]);
  assert.deepEqual(ids(f("who", "contains", ["u1"])), ["r1"]);
  assert.deepEqual(ids(f("who", "is_empty")), ["r3"]);
});

test("dates compare by day, a created time by the viewer's day", () => {
  assert.deepEqual(ids(f("due", "is", "2026-09-10")), ["r1"]);
  assert.deepEqual(ids(f("due", "before", "2026-09-14")), ["r1"]);
  assert.deepEqual(ids(f("due", "after", "2026-09-10")), ["r2"]);
  assert.deepEqual(ids(f("due", "on_or_before", "2026-09-14")), ["r1", "r2"]);
  assert.deepEqual(ids(f("due", "on_or_after", "2026-09-14")), ["r2"]);
  assert.deepEqual(ids(f("due", "is_empty")), ["r3"]);
  assert.deepEqual(ids(f("made", "after", "2026-09-04")), ["r2", "r3"]);
  assert.deepEqual(ids(f("made", "is", "2026-09-01")), ["r1"]);
  assert.equal(filterRows([{ id: "x", due: "2026-09-10T09:00" }], [f("due", "is", "2026-09-10")], schema).length, 1, "a date with a time is that day");
});

test("a checkbox filter keeps checked rows or unchecked ones", () => {
  assert.deepEqual(ids(f("done", "is", true)), ["r1"]);
  assert.deepEqual(ids(f("done", "is", false)), ["r2", "r3"]);
});

test("🔴 every filter must hold, and one with no value yet, or on a deleted property, changes nothing", () => {
  assert.deepEqual(ids(f("status", "is", ["Done", "In progress"]), f("tags", "contains", ["Essay"])), ["r1", "r2"]);
  assert.deepEqual(ids(f("status", "is", ["Done", "In progress"]), f("tags", "contains", ["Essay"]), f("pts", "gt", 5)), ["r1"]);
  for (const idle of [f("title", "contains", "  "), f("status", "is", []), f("gone", "is", ["x"]), f("status", "gt", 3), f("done", "is")]) {
    assert.equal(filterReady(idle, schema[idle.pid]), false, `${idle.pid} ${idle.op} is not ready`);
    assert.deepEqual(ids(idle), ["r1", "r2", "r3"]);
  }
  const all = filterRows(rows, undefined, schema);
  assert.notEqual(all, rows, "a copy, so a view cannot reorder the database by sorting what it got");
  assert.deepEqual(all.map((r) => r.id), ["r1", "r2", "r3"]);
});

test("search finds every word in the title, text and options, never in people's ids", () => {
  assert.deepEqual(searchRows(rows, "essay CONTRACT", schema).map((r) => r.id), ["r1"]);
  assert.deepEqual(searchRows(rows, "exam", schema).map((r) => r.id), ["r2"]);
  assert.deepEqual(searchRows(rows, "acceptance", schema).map((r) => r.id), ["r1"]);
  assert.deepEqual(searchRows(rows, "   ", schema).map((r) => r.id), ["r1", "r2", "r3"]);
  assert.deepEqual(searchRows(rows, "u1", schema), []);
});

test("a chip reads as the property, then what it keeps", () => {
  const names = (id: string) => ({ u1: "Ana" })[id] ?? "Someone";
  assert.equal(describeFilter(f("status", "is", ["Done", "In progress"]), schema.status), "Status: Done, In progress");
  assert.equal(describeFilter(f("status", "is_not", ["Done"]), schema.status), "Status: is not Done");
  assert.equal(describeFilter(f("title", "contains", " law "), schema.title), "Name: law");
  assert.equal(describeFilter(f("pts", "gt", "5"), schema.pts), "Points: > 5");
  assert.equal(describeFilter(f("due", "before", "2026-09-14"), schema.due), "Due: is before Sep 14, 2026");
  assert.equal(describeFilter(f("notes", "is_empty"), schema.notes), "Notes: is empty");
  assert.equal(describeFilter(f("done", "is", false), schema.done), "Submitted: Unchecked");
  assert.equal(describeFilter(f("who", "contains", ["u1"]), schema.who, names), "Assignee: Ana");
  assert.equal(describeFilter(f("status", "is", []), schema.status), "Status", "no value yet: just the property");
  assert.equal(describeFilter(f("gone", "is", ["x"]), undefined), "Deleted property");
});

test("each type starts with its usual condition, and formulas offer none", () => {
  assert.deepEqual(
    ["text", "number", "status", "multi_select", "person", "date", "checkbox", "formula"].map(defaultOp),
    ["contains", "eq", "is", "contains", "contains", "is", "is", null],
  );
  assert.deepEqual(operatorsFor("checkbox"), ["is"]);
  assert.deepEqual(operatorsFor("formula"), []);
  assert.deepEqual(operatorsFor("files"), ["is_empty", "is_not_empty"], "files are there or not");
  assert.deepEqual(filterRows([{ id: "a", att: [{ name: "brief.pdf", ref: "ws-file:s/p/1-brief.pdf" }] }, { id: "b", att: [] }], [f("att", "is_not_empty")], { att: { name: "Files", type: "files" } }).map((r) => r.id), ["a"]);
});

test("🔴 a row made while filters are on starts with values that keep it in view", () => {
  const seed = seedFromFilters(
    [
      f("status", "is", ["In progress", "Done"]),
      f("tags", "contains", ["Exam"]),
      f("done", "is", true),
      f("pts", "gte", "4"),
      f("due", "on_or_after", "2026-09-12"),
      f("notes", "contains", " draft "),
      f("title", "contains", "law"),
      f("who", "is_empty"),
      f("status", "is", []),
    ],
    schema,
  );
  assert.deepEqual(seed, { status: "In progress", tags: ["Exam"], done: true, pts: 4, due: "2026-09-12", notes: "draft" });
});
