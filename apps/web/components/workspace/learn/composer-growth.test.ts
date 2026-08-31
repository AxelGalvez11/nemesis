import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// ── the composer when there is more than a sentence in it ────────────────────
//
// Owner, 2026-08-31: *"when the chat composer expands because of the lot of text
// … the composer buttons stay fixed to, like, the bottom, like in ChatGPT"*,
// plus markdown lists in the box and long pastes becoming files.
//
// The rules themselves are pure and value-tested in `lib/learn/composer-text.test.ts`.
// What is left here is the wiring and the geometry, which live in a component
// that wraps a textarea, dictation and a file lane — hence source assertions.

const composer = readFileSync(new URL("./canvas-composer.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("./canvas-home.tsx", import.meta.url), "utf8");

// MEASURED, not reasoned about — real Chromium at 1000x700 over this row's exact classes with
// Tailwind compiled from this app's own config, growing the textarea the way the autosize effect
// does (lines → row height / textarea height / gap from each control's bottom to the row's floor):
//
//    1 line    52 / 36 / 8        ← 52 is `--composer-min-height` exactly, 36 is the control box
//    2 lines   78 / 62 / 8
//    3 lines  104 / 88 / 8
//    6 lines  176 / 160 / 8       ← MAX_COMPOSER_HEIGHT reached; it scrolls from here
//   12 lines  176 / 160 / 8
//
// The gap is 8px at every height, which IS the owner's ask: the controls do not move.

test("🔴🔴 the controls sit on the floor of the box, so they do not drift as it grows", () => {
  // Calibration: put `items-center` back and every button slides down the pill
  // while somebody is still typing toward it.
  assert.match(
    composer,
    /className="flex min-h-\[var\(--composer-min-height\)\] items-end gap-0 px-\[var\(--composer-pad-x\)\] py-\[8px\]"/,
    "the input row no longer bottom-aligns its controls",
  );
  assert.ok(!/items-center gap-0 px-\[var\(--composer-pad-x\)\]/.test(composer), "a centred input row is back");
});

test("🔴 one line still looks exactly as it did: the text box is the height of a control", () => {
  // 26px of line + 5px above and below = 36px, which is the button box. That
  // equality is what makes bottom-aligning invisible until the box grows.
  // Calibration: return this to `py-1` (4.5px at this root size) and the words
  // sit half a pixel off the controls they are aligned with.
  assert.match(composer, /resize-none overflow-hidden bg-transparent py-\[5px\]"/, "the one-line height no longer matches the controls");
  assert.match(composer, /"text-\[16px\] leading-\[26px\]/, "the line height the padding is tuned against moved");
  assert.match(composer, /h-\[36px\] w-\[36px\]/, "the control box the padding is tuned against moved");
});

test("🔴 a list continues on the key that makes a newline, and the caret follows the text", () => {
  // Enter sends on this composer, so Shift+Enter is where a newline — and
  // therefore a list item — happens.
  assert.match(composer, /if \(event\.key === "Enter" && event\.shiftKey\) \{/, "the newline key no longer continues a list");
  assert.match(composer, /continueList\(field\.value, field\.selectionStart, field\.selectionEnd\)/, "the continuation no longer reads the real caret");
  // 🔴 The caret is restored after the commit, never beside setText: a controlled
  // box would drop a selection set against the value React is about to replace.
  assert.match(composer, /pendingCaret\.current = next\.caret;/, "the caret is no longer carried to the commit");
  assert.match(composer, /useLayoutEffect\(\(\) => \{\s*const at = pendingCaret\.current;/, "the caret is no longer applied after the text lands");
});

test("🔴 a pasted document goes through the file door, on BOTH composers, from one function", () => {
  // Calibration: hand-roll a File in either handler and the two doors are free
  // to disagree about what counts as long — the drift this repo keeps being
  // bitten by (see ACCEPTED_MATERIAL in canvas-composer.tsx).
  for (const [name, source, sink] of [
    ["canvas composer", composer, "onFiles"],
    ["front door", home, "stageFiles"],
  ] as const) {
    assert.match(source, /pastedTextFile\(event\.clipboardData\.getData\("text\/plain"\)\)/, `${name} no longer files a long paste`);
    assert.match(source, new RegExp(`${sink}\\(\\[file\\]\\);`), `${name} does not send the paste through its own file door`);
    // A clipboard carrying real files belongs to the file lane, not this one.
    assert.match(source, /if \(event\.clipboardData\.files\.length > 0\) return;/, `${name} would swallow a real file paste`);
  }
});
