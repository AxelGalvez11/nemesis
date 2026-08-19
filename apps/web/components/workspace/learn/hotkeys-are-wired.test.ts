import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The decisions are tested in `lib/learn/canvas-hotkeys.test.ts`. These are the WIRING facts that
// a pure test cannot see, and each is a way a shortcut ships doing nothing — or doing something
// the visible control cannot.

const canvas = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
const composer = readFileSync(new URL("./canvas-composer.tsx", import.meta.url), "utf8");

/** Comments stripped, because a guard that matches its own warning proves nothing. */
function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const canvasCode = code(canvas);
const composerCode = code(composer);

// ── Command-Enter and the button press the same thing ───────────────────────

test("🔴🔴 the keyboard and the visible control call ONE function", () => {
  // Calibration: give `ContinueHotkey` its own `policy.acknowledge()` instead of `advance`, and
  // this reddens. Without it the shortcut is a second way to advance the canvas, free to keep
  // working after the button's own conditions change.
  assert.match(canvasCode, /const advance = continueBelongsTo\(continueRegion, "policy"\)/);
  assert.match(canvasCode, /<ContinueHotkey onContinue=\{advance\} \/>/, "the hotkey is not given the shared handler");
  assert.match(
    canvasCode,
    /onContinue=\{continueBelongsTo\(continueRegion, "policy"\) \? advance : null\}/,
    "the policy's Continue button no longer routes through the shared handler",
  );
  assert.match(
    canvasCode,
    /onFinishReading=\{advance \?\? session\.finishReadingChunk\}/,
    "the document's Continue button no longer routes through the shared handler",
  );
});

test("🔴🔴 the hotkey never re-derives whether the learner may move on", () => {
  // `advance` is null exactly when `continueOwner` refused — while a demonstration is owed (N3: a
  // control that moves the learner on while an answer is owed is a way to press past the question)
  // and while the canvas is busy. Reading `policy.awaitingAnswer` here instead would be a second
  // answer to that question, free to disagree.
  const hotkey = canvasCode.slice(canvasCode.indexOf("function ContinueHotkey"));
  const body = hotkey.slice(0, hotkey.indexOf("\n  return null;"));
  assert.match(body, /available: latest\.current !== null/);
  assert.ok(!/awaitingAnswer|policy\./.test(body), "the hotkey is reading policy state for itself");
});

test("🔴 the listener lives where the canvas is fully rendered", () => {
  // `continueRegion` is computed below the canvas's early return, so a hook in the canvas body
  // would sit after a conditional return. Mounting a component also gives it the right lifetime:
  // no listener while a canvas is still loading.
  assert.match(canvasCode, /function ContinueHotkey\(\{ onContinue \}/);
  assert.match(canvasCode, /window\.addEventListener\("keydown", onKey\)/);
  assert.match(canvasCode, /window\.removeEventListener\("keydown", onKey\)/, "the listener is never removed");
});

// ── Hold space to talk ──────────────────────────────────────────────────────

test("🔴 space is prevented on the way down AND the way up", () => {
  // Down stops the page scrolling. Up stops a focused button's `click`, which browsers synthesise
  // from keyup — including the Continue the learner just pressed with the mouse.
  const region = composerCode.slice(composerCode.indexOf("const heldByKey"));
  const body = region.slice(0, region.indexOf("}, [dictation.supported"));
  const down = body.slice(body.indexOf("const onDown"), body.indexOf("const onUp"));
  const up = body.slice(body.indexOf("const onUp"), body.indexOf("const onHidden"));
  assert.match(down, /event\.preventDefault\(\)/, "space still scrolls the page");
  assert.match(up, /event\.preventDefault\(\)/, "space still fires a focused button on release");
});

test("🔴🔴 releasing only stops a microphone this key opened", () => {
  // Without the flag, letting go of space also closes a microphone the learner opened with the
  // button and was still talking into.
  const region = composerCode.slice(composerCode.indexOf("const heldByKey"));
  const body = region.slice(0, region.indexOf("}, [dictation.supported"));
  assert.match(body, /if \(!heldByKey\.current\) return;/);
  assert.match(body, /heldByKey\.current = true;/);
});

test("🔴🔴 a hold that never gets its keyup still releases", () => {
  // Hold space, press Cmd-Tab: no keyup is ever delivered and the microphone stays open. That is
  // the one failure here that costs money and privacy rather than a click.
  const region = composerCode.slice(composerCode.indexOf("const heldByKey"));
  const body = region.slice(0, region.indexOf("}, [dictation.supported"));
  assert.match(body, /window\.addEventListener\("blur", release\)/, "losing the window leaves the microphone open");
  assert.match(body, /visibilitychange/, "hiding the tab leaves the microphone open");
  const teardown = body.slice(body.indexOf("return () => {"));
  assert.match(teardown, /release\(\);/, "unmounting leaves the microphone open");
});

test("🔴 releasing does not submit", () => {
  // `dictation.stop()` is what ✓ does — the transcript lands as editable text. Speech recognition
  // mishears, and auto-submitting would make a transcription error indistinguishable from a wrong
  // answer in the evidence.
  const region = composerCode.slice(composerCode.indexOf("const release = () => {"));
  const body = region.slice(0, region.indexOf("const onDown"));
  assert.match(body, /dictation\.stop\(\)/);
  assert.ok(!/submit\(\)/.test(body), "letting go of the key submits an answer nobody checked");
});
