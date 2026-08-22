/**
 * Highlighting something gives the learner a place to SAY what they want.
 *
 * 🔴🔴 THE FIVE BUTTONS WERE THE DEFECT, NOT THE STARTING POINT. Define / Explain / Simpler /
 * Example / Why? were five guesses at what somebody might want, made by us, in advance, in English,
 * for every field at once — and a learner whose question was not one of the five had to abandon the
 * highlight and describe in the composer where they had been looking. Owner, 2026-08-21: *"remove
 * the 'define, explain, simpler, example, why?' and replace with the 'ask nemesis'."*
 *
 * 🔴 SO THIS ASSERTS THE DOOR AND THE GHOSTS TOGETHER. Deleting the buttons does not stop the next
 * person adding three "quick actions" back under exactly the pressure that created them — a real
 * learner wanting a shortcut, at 2am, in a PR that looks like a kindness. Same argument as
 * `no-scripted-intent.test.ts` makes on the chat side, and the same argument that deleted
 * `learning-intent.ts` from the front door.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const MENU = readFileSync(new URL("./canvas-selection-menu.tsx", import.meta.url), "utf8");
const CANVAS = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
const SESSION = readFileSync(new URL("./use-canvas-session.ts", import.meta.url), "utf8");
const HOOK = readFileSync(new URL("./use-canvas-selection.ts", import.meta.url), "utf8");
const API = readFileSync(new URL("../../../lib/learn/canvas-api.ts", import.meta.url), "utf8");

/** Comments stripped, because this file necessarily names the very words it forbids. */
function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

test("🔴 the toolbar offers somewhere to type, and it is wired to the session", () => {
  const menu = code(MENU);
  assert.match(menu, /<input/, "the ask box has no input — there is nothing to type into");
  assert.match(menu, /Ask Nemesis/, "the control does not say what it is");
  assert.match(menu, /onAsk\(request\)/, "what was typed never leaves the component");
  assert.match(code(CANVAS), /onAsk=\{\(request\) => void ask\(request\)\}/, "the canvas does not receive the request");
  assert.match(code(SESSION), /askSelection\(id, latest\.current, selection, request\)/, "the request never reaches the model");
});

test("🔴🔴 the five deleted verbs are not offered anywhere on this surface again", () => {
  // The action union itself is pinned in canvas-selection.test.ts. This is the other half: a label
  // on a button is how they would come back, and a label needs no type to exist.
  // 🔴 A WHOLE-WORD SEARCH OF THE STRIPPED SOURCE, NOT `>Label<`. This repo's JSX puts a button's
  // text on its own line, so the obvious `menu.includes(">Define<")` would have matched nothing and
  // passed for ever. Calibration: paste `<button>Define</button>` anywhere below and this reddens.
  const menu = code(MENU);
  for (const label of ["Define", "Explain", "Simpler", "Simplify", "Example", "Why", "deeper"]) {
    assert.doesNotMatch(menu, new RegExp(`\\b${label}\\b`), `${label} is a button again`);
  }
});

test("🔴 nothing between the learner and the model reads what they typed", () => {
  // The whole point of replacing the menu is that the CODE stopped deciding what somebody meant.
  // A `request.includes("simpler")` anywhere on this path would be the toolbar growing back inside
  // the thing that replaced it — a branch on vocabulary, in English, in a field-agnostic product.
  for (const [name, source] of [["the menu", MENU], ["the canvas", CANVAS], ["the session", SESSION], ["the api", API]] as const) {
    const path = code(source);
    for (const pattern of [/request\.(?:includes|match|test|startsWith|toLowerCase)\b/, /\/[^/\n]+\/[gimsuy]*\.test\(request\)/]) {
      assert.ok(!pattern.test(path), `${name} reads the learner's words instead of forwarding them`);
    }
  }
});

test("🔴🔴 typing in the ask box does not count as dropping the highlight", () => {
  // Clicking into the input moves focus and the browser collapses the document selection, so the
  // settled-selection watcher read null and unmounted the menu from under the cursor. The five
  // buttons never hit this: a <button> takes no text caret, so nothing collapsed. Calibration:
  // delete the guard and the ask box closes the instant it is clicked.
  assert.match(
    code(HOOK),
    /if \(!next && document\.activeElement\?\.closest\("\[data-canvas-selection-menu\]"\)\) return;/,
    "the selection is dropped the moment the learner clicks into the box",
  );
});

test("🔴 a rewrite still cannot land where there is no block, however it was asked for", () => {
  // Free text does not widen what may be written. The model is TOLD there is nowhere to write, and
  // the code refuses regardless of what comes back — both halves, because either alone is a
  // control that fails at the moment of use.
  assert.match(code(API), /outcome\.kind === "rewrite" && block && rewritable/, "askSelection writes without checking there is a block");
  assert.match(code(API), /scopeBlockIds: \[block\.id\]/, "the rewrite is no longer scoped to the one block");
});
