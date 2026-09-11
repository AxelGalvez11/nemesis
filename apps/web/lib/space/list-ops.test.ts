import assert from "node:assert/strict";
import test from "node:test";

import { applyList, diffList, rebaseList } from "./list-ops";

test("no change is no operation", () => {
  assert.equal(diffList(["a", "b"], ["a", "b"]), null);
  assert.equal(diffList([], []), null);
});

test("appends, prepends, removals and moves round-trip through applyList", () => {
  const cases: Array<[string[], string[]]> = [
    [["a", "b"], ["a", "b", "c"]],
    [["a", "b"], ["c", "a", "b"]],
    [["a", "b", "c"], ["a", "c"]],
    [["a", "b", "c", "d"], ["d", "a", "b", "c"]],
    [["a", "b", "c", "d"], ["b", "a", "d", "c"]],
    [["a", "b", "c"], ["x", "c", "y", "a"]],
    [[], ["a", "b", "c"]],
    [["a", "b", "c"], []],
  ];
  for (const [base, local] of cases) {
    assert.deepEqual(applyList(base, diffList(base, local)), local, `${base} -> ${local}`);
  }
});

test("a move is one insert, not a delete of everything after it", () => {
  const op = diffList(["a", "b", "c", "d"], ["d", "a", "b", "c"]);
  assert.deepEqual(op, { ins: [["d", null]] });
});

/**
 * 🔴 THE CASE THE WHOLE DESIGN EXISTS FOR, and the same one the SQL self-test runs against ws_list_apply.
 * A adds a block after b1 while B, from the same starting point, deletes b2 and drags the sub-page link to the top.
 * Arrays would keep only whoever saved last. Operations keep both.
 */
test("two people changing one page's blocks at once both keep their edits", () => {
  const base = ["b1", "b2", "l2"];
  const afterA = applyList(base, diffList(base, ["b1", "b3", "b2", "l2"]));
  const afterB = applyList(afterA, diffList(base, ["l2", "b1"]));
  assert.deepEqual(afterB, ["l2", "b1", "b3"]);
  assert.deepEqual(rebaseList(base, ["l2", "b1"], afterA), ["l2", "b1", "b3"]);
});

test("an insert whose anchor someone else removed lands at the end instead of failing", () => {
  assert.deepEqual(applyList(["a", "c"], { ins: [["d", "b"]] }), ["a", "c", "d"]);
});

test("mirrors ws_list_apply on the self-test's fixture", () => {
  // select public.ws_list_apply('["a","b","c"]', '{"del":["b"],"ins":[["d","a"],["e",null],["f","zz"]]}')
  assert.deepEqual(applyList(["a", "b", "c"], { del: ["b"], ins: [["d", "a"], ["e", null], ["f", "zz"]] }), ["e", "a", "d", "c", "f"]);
});

test("junk in a stored list never reaches the page", () => {
  assert.deepEqual(applyList(["a", 3, null, "b"] as unknown[], null), ["a", "b"]);
});
