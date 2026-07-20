import assert from "node:assert/strict";
import test from "node:test";

import { rangeSelectionKeys, toggleSelectionKey } from "./library-selection";

test("toggleSelectionKey adds a missing key and removes a present one", () => {
  const empty = new Set<string>();
  const added = toggleSelectionKey(empty, "note:a");
  assert.deepEqual([...added], ["note:a"]);
  assert.equal(empty.size, 0, "input set is not mutated");

  const removed = toggleSelectionKey(added, "note:a");
  assert.equal(removed.size, 0);
  assert.equal(added.size, 1, "input set is not mutated");
});

test("rangeSelectionKeys selects the visible span in either direction", () => {
  const order = ["note:a", "folder:f", "note:b", "note:c", "note:d"];
  assert.deepEqual([...rangeSelectionKeys(order, "note:b", "note:d")], ["note:b", "note:c", "note:d"]);
  assert.deepEqual([...rangeSelectionKeys(order, "note:d", "folder:f")], ["folder:f", "note:b", "note:c", "note:d"]);
});

test("rangeSelectionKeys handles a missing anchor or no anchor", () => {
  const order = ["note:a", "note:b", "note:c"];
  assert.deepEqual([...rangeSelectionKeys(order, null, "note:b")], ["note:b"]);
  assert.deepEqual([...rangeSelectionKeys(order, "note:gone", "note:b")], ["note:b"]);
  assert.deepEqual([...rangeSelectionKeys(order, "note:a", "note:gone")], ["note:gone"]);
});
