import assert from "node:assert/strict";
import { test } from "node:test";

import { describeSorts, groupable, groupRows, sortRowsBy, sortsOf, type SortProp, type ViewSort } from "./db-sort";

const schema: Record<string, SortProp> = {
  title: { name: "Name", type: "title" },
  pts: { name: "Points", type: "number" },
  st: { name: "Status", type: "status", options: [{ value: "Not started" }, { value: "In progress" }, { value: "Done" }] },
  tags: { name: "Tags", type: "multi_select", options: [{ value: "Essay" }, { value: "Exam" }] },
  who: { name: "Owner", type: "person" },
  due: { name: "Due", type: "date" },
  done: { name: "Submitted", type: "checkbox" },
  made: { name: "Created", type: "created_time" },
};

const rows = [
  { id: "a", title: "Week 10 reading", pts: 3, st: "Done", tags: ["Exam"], who: ["u2"], due: "2026-09-14", done: true, created: 30 },
  { id: "b", title: "week 2 reading", pts: 10, st: "Not started", tags: ["Essay"], who: ["u1"], due: "2026-09-10", done: false, created: 10 },
  { id: "c", title: "Lab report", st: "Retired option", tags: [], created: 20 },
  { id: "d", title: "Problem set", pts: 10, st: "Done", due: "2026-09-12", done: true, created: 40 },
];
const s = (pid: string, dir: ViewSort["dir"] = "asc"): ViewSort => ({ id: pid, pid, dir });
const ids = (...sorts: ViewSort[]) => sortRowsBy(rows, sorts, schema, { nameOf: (u) => ({ u1: "Ana", u2: "Ben" })[u] ?? u }).map((r) => r.id);

test("🔴 numbers sort by value, and a blank sorts last whichever way", () => {
  assert.deepEqual(ids(s("pts")), ["a", "b", "d", "c"]);
  assert.deepEqual(ids(s("pts", "desc")), ["b", "d", "a", "c"], "equal values keep the database's order");
});

test("a status sorts by its option order; a value no longer offered comes after the options", () => {
  assert.deepEqual(ids(s("st")), ["b", "a", "d", "c"]);
  assert.deepEqual(ids(s("st", "desc")), ["c", "a", "d", "b"]);
});

test("titles sort naturally and ignore case; tags by their first option, people by name", () => {
  assert.deepEqual(ids(s("title")), ["c", "d", "b", "a"], "week 2 before Week 10");
  assert.deepEqual(ids(s("tags")), ["b", "a", "c", "d"]);
  assert.deepEqual(ids(s("who")), ["b", "a", "c", "d"], "Ana before Ben, nobody last");
});

test("dates, created times and checkboxes", () => {
  assert.deepEqual(ids(s("due")), ["b", "d", "a", "c"]);
  assert.deepEqual(ids(s("made", "desc")), ["d", "a", "c", "b"]);
  assert.deepEqual(ids(s("done")), ["b", "c", "a", "d"], "unchecked first");
});

test("🔴 several sorts apply in order, and a sort on a deleted property is skipped", () => {
  assert.deepEqual(ids(s("st", "desc"), s("pts")), ["c", "a", "d", "b"]);
  assert.deepEqual(ids(s("pts", "desc"), s("title")), ["d", "b", "a", "c"]);
  assert.deepEqual(ids(s("gone"), s("pts")), ["a", "b", "d", "c"]);
  assert.deepEqual(ids(s("gone")), ["a", "b", "c", "d"]);
  assert.notEqual(sortRowsBy(rows, [], schema), rows, "always a copy");
});

test("🔴 a view from before several sorts reads its one sort; a list wins and drops what is not a sort", () => {
  assert.deepEqual(sortsOf({ sort: { pid: "pts", dir: "desc" } }), [{ id: "sort", pid: "pts", dir: "desc" }]);
  assert.deepEqual(sortsOf({ sorts: [{ id: "x", pid: "st", dir: "asc" }, null, { dir: "desc" }, { pid: "due", dir: "sideways" }], sort: { pid: "pts" } }), [
    { id: "x", pid: "st", dir: "asc" },
    { id: "sort-1", pid: "due", dir: "asc" },
  ]);
  assert.deepEqual(sortsOf({}), []);
});

test("the sort chip names one sort and counts several", () => {
  assert.equal(describeSorts([s("pts")], schema), "Points");
  assert.equal(describeSorts([s("pts"), s("st")], schema), "2 sorts");
  assert.equal(describeSorts([s("gone"), s("st")], schema), "Status");
  assert.equal(describeSorts([], schema), "");
});

test("🔴 a table groups by options in their order, rows without one first, and checkboxes by checked", () => {
  const byStatus = groupRows(rows, "st", schema.st!);
  assert.deepEqual(byStatus.map((g) => [g.key, g.label, g.rows.map((r) => r.id)]), [
    ["", "No Status", ["c"]],
    ["Not started", "Not started", ["b"]],
    ["In progress", "In progress", []],
    ["Done", "Done", ["a", "d"]],
  ]);
  assert.deepEqual(groupRows(rows.slice(0, 2), "st", schema.st!).map((g) => g.key), ["Not started", "In progress", "Done"], "no empty No group");
  assert.deepEqual(groupRows(rows, "done", schema.done!).map((g) => [g.label, g.rows.map((r) => r.id)]), [
    ["Checked", ["a", "d"]],
    ["Unchecked", ["b", "c"]],
  ]);
  assert.deepEqual(["select", "status", "checkbox", "multi_select", "person", "text"].map(groupable), [true, true, true, false, false, false]);
});
