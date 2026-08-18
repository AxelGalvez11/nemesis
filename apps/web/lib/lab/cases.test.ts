import assert from "node:assert/strict";
import { test } from "node:test";

import { CASE_ROOT, deleteCase, newCaseId, readCase, readCaseFile } from "./cases";

test("🔴 a traversing id is refused by every reader, not only by delete", () => {
  // The id is a URL segment on `[id]` and `[id]/rerun`. Holding delete to one standard and the two
  // reads to another is exactly the gap that gets found from the outside.
  for (const id of ["../../etc/passwd", "..", "a/../../b", "foo/bar"]) {
    assert.equal(readCase(id), null, `readCase must refuse ${id}`);
    assert.equal(deleteCase(id), false, `deleteCase must refuse ${id}`);
  }
});

test("a case that does not exist reads as absent rather than throwing", () => {
  assert.equal(readCase(`definitely-not-a-case-${Date.now()}`), null);
  assert.equal(deleteCase(`definitely-not-a-case-${Date.now()}`), false);
});

test("🔴 a case file outside the case root is refused", () => {
  // `case.json` is a file on disk, so its `path` is data rather than something this module just
  // computed. A hand-edited case must not be able to make a rerun read anything it likes.
  const outside = readCaseFile({
    file: { bytes: 1, name: "passwd", path: "/etc/passwd", type: "" },
    id: "x",
    kind: "parser",
    note: "n",
    observed: {},
    savedAt: new Date(0).toISOString(),
  });
  assert.equal(outside, null);
});

test("ids are readable, chronological, and contain nothing path-shaped", () => {
  const id = newCaseId("parser", new Date("2026-08-18T18:26:56Z"), "Page 4 has a 6-column table / Nemesis flattened it");
  assert.match(id, /^\d{8}-\d{6}-parser-/);
  assert.ok(!id.includes("/"), "a slash in an id would be a directory");
  assert.ok(!id.includes(".."));
  assert.ok(CASE_ROOT.endsWith("/"), "the root is a directory prefix, so startsWith() means inside it");
});
