import assert from "node:assert/strict";
import { test } from "node:test";

import { isOrderedRun, orderedRunsIn, type ListUnit } from "./procedure-sequence";

function item(id: string, marker: string, text: string, heading = "Filing a motion", depth = 0): ListUnit {
  return { anchor: { headingPath: [heading] }, depth, id, marker, text, type: "listItem" };
}

test("a consecutively numbered run is a procedure", () => {
  assert.equal(isOrderedRun(["1.", "2.", "3."]), true);
  assert.equal(isOrderedRun(["a)", "b)", "c)"]), true);
  assert.equal(isOrderedRun(["i.", "ii.", "iii."]), true);
});

test("a bulleted run is a set, and is never read as a sequence", () => {
  // No bullet parses as an ordinal under any scheme, so order is refused before it is considered.
  assert.equal(isOrderedRun(["•", "•", "•"]), false);
  assert.equal(isOrderedRun(["-", "-"]), false);
});

test("markers that parse but do not run are refused", () => {
  // 🔴 A TEMPLATE NOBODY RENUMBERED. Every marker is a valid ordinal and the order is a fiction.
  assert.equal(isOrderedRun(["1.", "1.", "1."]), false);
  // 🔴 REFERENCES INTO A NUMBERING THAT LIVES ELSEWHERE — a gap means these are not the sequence.
  assert.equal(isOrderedRun(["3.", "7.", "12."]), false);
  // Descending is not ascending.
  assert.equal(isOrderedRun(["3.", "2.", "1."]), false);
});

test("one item is not a sequence", () => {
  assert.equal(isOrderedRun(["1."]), false);
});

test("roman numerals are read as roman, not as the letters they are spelled with", () => {
  // 🔴 `i` IS BOTH THE NINTH LETTER AND THE FIRST ROMAN NUMERAL, so the scheme cannot be read off
  // one marker. As letters this run is i, j, k — not consecutive; as roman it is 1, 2, 3.
  assert.equal(isOrderedRun(["i.", "ii.", "iii."]), true);
  // And a genuine letter run still works, which is what proves the roman pass did not swallow it.
  assert.equal(isOrderedRun(["b)", "c)", "d)"]), true);
});

test("a numbered run under a heading becomes one procedure named by that heading", () => {
  const runs = orderedRunsIn([
    item("b1", "1.", "1. Serve the opposing party."),
    item("b2", "2.", "2. File proof of service."),
    item("b3", "3.", "3. Notice the hearing date."),
  ]);

  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.heading, "Filing a motion");
  assert.deepEqual(runs[0]?.steps.map((step) => step.marker), ["1.", "2.", "3."]);
  // The step resolves back to a place in the document.
  assert.deepEqual(runs[0]?.steps.map((step) => step.unitId), ["b1", "b2", "b3"]);
});

test("a bullet sitting under the same heading does not join the procedure", () => {
  const runs = orderedRunsIn([
    item("b1", "1.", "1. Serve the opposing party."),
    item("b2", "2.", "2. File proof of service."),
    item("b3", "•", "• Local rules may vary."),
  ]);

  // 🔴 THE ASIDE IS NOT A THIRD STEP. Joining it would teach that noting local rules FOLLOWS
  // filing proof of service, which the document never said.
  assert.equal(runs.length, 0);
});

test("a paragraph between two numbered lists keeps them two lists", () => {
  const runs = orderedRunsIn([
    item("b1", "1.", "1. Serve."),
    item("b2", "2.", "2. File."),
    { anchor: { headingPath: ["Filing a motion"] }, id: "b3", text: "In the alternative:", type: "paragraph" },
    item("b4", "1.", "1. Move to strike."),
    item("b5", "2.", "2. Request a stay."),
  ]);

  // Splicing across the paragraph would read four steps in one sequence where there are two of two.
  assert.equal(runs.length, 2);
  assert.deepEqual(runs.map((run) => run.steps.length), [2, 2]);
});

test("runs at different nesting depths are different lists", () => {
  const runs = orderedRunsIn([
    item("b1", "1.", "1. Prepare the filing.", "Filing a motion", 0),
    item("b2", "1.", "1. Check the caption.", "Filing a motion", 1),
    item("b3", "2.", "2. Check the service list.", "Filing a motion", 1),
  ]);

  // The nested pair is its own procedure; the outer single item is not a sequence on its own.
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.depth, 1);
  assert.deepEqual(runs[0]?.steps.map((step) => step.unitId), ["b2", "b3"]);
});

test("a bulleted document produces nothing, which is the common case", () => {
  const runs = orderedRunsIn([
    item("b1", "•", "• Offer."),
    item("b2", "•", "• Acceptance."),
    item("b3", "•", "• Consideration."),
  ]);

  assert.deepEqual(runs, []);
});
