import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  buildAnchor,
  locateAnchor,
  selectionShape,
  surroundingSentence,
} from "./canvas-selection";

const PASSAGE =
  "At rest a ventricular myocyte sits near -90 mV. The sodium-potassium pump keeps the gradients loaded. Phase 0 is the upstroke.";

test("selection shape is read structurally, not by length", () => {
  assert.equal(selectionShape("myocyte"), "word");
  assert.equal(selectionShape("  conductance  "), "word");
  assert.equal(selectionShape("electrochemical gradient"), "phrase");
  assert.equal(selectionShape("potassium equilibrium potential"), "phrase");
  // Nine words is a passage even with no punctuation.
  assert.equal(selectionShape("one two three four five six seven eight nine"), "passage");
  // Three words is a passage if it is a whole statement.
  assert.equal(selectionShape("Sodium rushes in."), "passage");
});

test("a short phrase ending in a decimal point is not mistaken for a sentence", () => {
  // The boundary needs whitespace or the end of the string after it, or "-90 mV." style
  // fragments and abbreviations would all read as passages.
  assert.equal(selectionShape("near -90 mV"), "phrase");
});

test("🔴 there is no menu of fixed actions left to keep restrained", async () => {
  // Owner, 2026-08-21: *"remove the 'define, explain, simpler, example, why?' and replace with the
  // 'ask nemesis'."* The old assertions here pinned which two or three of five buttons each shape
  // offered, and they passed for months while the real defect was that there were buttons at all —
  // a learner whose question was not one of the five had nowhere to put it.
  //
  // 🔴 THE GHOST IS WHAT IS ASSERTED, NOT THE ABSENCE OF A CALL. Deleting `selectionActions` does
  // not stop the next person from adding `quickActions` under the same pressure, which is the
  // pattern `no-scripted-intent.test.ts` already guards on the chat side.
  const module: Record<string, unknown> = await import("./canvas-selection");
  for (const ghost of ["selectionActions", "SelectionActionOption", "quickActions", "selectionMenu"]) {
    assert.equal(module[ghost], undefined, `${ghost} is back — the ask box is the menu now`);
  }
});

test("🔴 the two actions left are the ones the SOFTWARE originates, not ones it offers", () => {
  // `define` is a click on a marked word; `simpler` is the turn router already having read a
  // sentence and returned `then: "rewrite"`. Neither is a guess at what somebody might want, and
  // neither is reachable from a button that says its name. Anything a learner wants to SAY goes
  // through `askSelection`, in their own words.
  const source = readFileSync(new URL("./canvas-selection.ts", import.meta.url), "utf8");
  const union = /export type SelectionAction = ([^;]+);/.exec(source)?.[1] ?? "";
  assert.equal(union.trim(), '"define" | "simpler"');
  for (const gone of ["explain", "example", "why"]) {
    assert.ok(!union.includes(`"${gone}"`), `${gone} is back in the action union`);
  }
});

test("an anchor keeps enough either side to disambiguate a repeat", () => {
  const text = "the gradient opens, then the gradient closes";
  const first = text.indexOf("gradient");
  const second = text.indexOf("gradient", first + 1);

  const anchorA = buildAnchor(text, first, first + 8);
  const anchorB = buildAnchor(text, second, second + 8);
  assert.equal(anchorA.exact, "gradient");
  assert.equal(anchorB.exact, "gradient");
  assert.notEqual(anchorA.prefix, anchorB.prefix);

  assert.deepEqual(locateAnchor(text, anchorA), { start: first, end: first + 8 });
  assert.deepEqual(locateAnchor(text, anchorB), { start: second, end: second + 8 });
});

test("an anchor survives an edit elsewhere in the block", () => {
  const before = "Sodium rushes in down its electrochemical gradient, quickly.";
  const start = before.indexOf("electrochemical gradient");
  const anchor = buildAnchor(before, start, start + "electrochemical gradient".length);

  const after = "Sodium moves in down its electrochemical gradient, within about a millisecond.";
  const found = locateAnchor(after, anchor);
  assert.ok(found, "the selected phrase is still present and should be findable");
  assert.equal(after.slice(found.start, found.end), "electrochemical gradient");
});

test("an anchor that can no longer be placed returns null rather than a guess", () => {
  const anchor = buildAnchor("the electrochemical gradient", 4, 28);
  // 🔴 The whole point. Placing a selection on the wrong words is worse than admitting we lost
  // it: the learner gets a confident answer about something they did not ask about.
  assert.equal(locateAnchor("nothing of the sort appears here", anchor), null);
  // Ambiguous with no surviving context is also a refusal.
  assert.equal(locateAnchor("gradient gradient", { exact: "gradient", prefix: "", suffix: "" }), null);
});

test("the surrounding sentence is what a definition gets, not the whole block", () => {
  const start = PASSAGE.indexOf("gradients");
  const sentence = surroundingSentence(PASSAGE, start, start + 9);
  assert.equal(sentence, "The sodium-potassium pump keeps the gradients loaded.");
  assert.ok(!sentence.includes("Phase 0"), "must not swallow the next sentence");
  assert.ok(!sentence.includes("-90 mV"), "must not swallow the previous sentence");
});

test("the first and last sentences of a block still resolve", () => {
  const first = surroundingSentence(PASSAGE, 3, 7);
  assert.ok(first.startsWith("At rest"), first);
  const lastStart = PASSAGE.indexOf("upstroke");
  assert.equal(surroundingSentence(PASSAGE, lastStart, lastStart + 8), "Phase 0 is the upstroke.");
});

test("a selection spanning sentences is its own context", () => {
  const start = PASSAGE.indexOf("The sodium");
  const end = PASSAGE.indexOf("upstroke") + 8;
  const context = surroundingSentence(PASSAGE, start, end);
  assert.ok(context.includes("sodium-potassium pump"));
  assert.ok(context.includes("upstroke"));
});
