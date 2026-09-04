import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The conversation keeps your place when its column changes width.
//
// 🔴🔴 THIS FIX SHIPPED TWICE BEFORE IT WORKED, AND BOTH FAILURES WERE SILENT. There is no DOM in
// this test runner, so the behaviour itself was verified by driving the live production page; what
// is held here is the two mistakes, because each one leaves a fix that runs, passes review, and
// does nothing at all.
//
//   1. ANCHORING ON A DIRECT CHILD. The scroller has three, and one of them is the entire
//      conversation — so "restore that block" was arithmetically identical to leaving `scrollTop`
//      alone. Measured live with it shipped: the top of the viewport still went from "FEV₁/FVC
//      ratio…" to "Happy to help you learn this…", thousands of pixels back.
//   2. HOLDING THE ELEMENT. Opening the pane re-renders the conversation, so React replaces the
//      node before the width settles and `contains()` is false by the time the restore runs.
//      Measured live: the anchor found the right `<li>`, and `restored` came back false.
//
// Both produce a fix that looks correct in a diff.

const SOURCE = readFileSync(new URL("./use-anchored-scroll.ts", import.meta.url), "utf8");
const code = SOURCE.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");

test("🔴 the anchor is the deepest block at the probe line, not a direct child", () => {
  // Calibration: swap `elementFromPoint` for a scan of `scroller.children` and the fix silently
  // stops working, exactly as it did the first time.
  assert.match(code, /document\.elementFromPoint/u, "the anchor is back to a scan that lands on the whole conversation");
  // The probe cannot sit at the top edge: the scroller carries `pt-[48px]` for the floating chrome,
  // so a point there hits the scroller itself every time.
  assert.match(code, /const PROBE_INSET = \d+;/u, "the probe line lost its inset and lands in the padding");
  const inset = Number(/const PROBE_INSET = (\d+);/u.exec(code)?.[1]);
  assert.ok(inset > 48, `the probe at ${inset}px is inside the scroller's own 48px of top padding`);
  // And an inline hit is climbed out of — inline boxes move between lines when the column narrows.
  assert.match(code, /display\.startsWith\("inline"\)/u, "an inline element can be the anchor again");
});

test("🔴🔴 the anchor survives the conversation being re-rendered", () => {
  // Calibration: store `element` instead of `path` and the restore becomes a no-op the moment
  // React re-creates the node — which it does on every open of the reading pane.
  assert.match(code, /path: readonly number\[\]/u, "the anchor holds a node reference again, which the re-render invalidates");
  assert.match(code, /function pathTo\(/u, "there is no way to record where the block was");
  assert.match(code, /function resolve\(/u, "there is no way to find the block again after the re-render");
  assert.ok(!/anchor\.element/.test(code), "the restore still reaches for a node it no longer holds");
});

test("🔴 being at the bottom is its own case, and is checked first", () => {
  // "The last block, offset 0" stops meaning "the bottom" as soon as the content below it grows,
  // and the newest answer is where a reader usually is.
  assert.match(code, /pinned = node\.scrollHeight - node\.scrollTop - node\.clientHeight <= AT_BOTTOM_PX/u, "the bottom is no longer pinned");
  assert.ok(code.indexOf("if (pinned)") < code.indexOf("resolve(node, anchor.path)"), "the anchor is consulted before the pin");
});

test("🔴 corrections do not feed themselves back in as the learner's position", () => {
  // Setting `scrollTop` fires `scroll` asynchronously. Without the flag, our own correction is
  // recorded as a place the learner chose, and the next resize restores to a position we invented.
  assert.match(code, /if \(restoring \|\| queued\) return;/u, "our own scroll writes are recorded as the learner's");
  assert.match(code, /requestAnimationFrame\(\(\) => \{\s*restoring = false;/u, "the flag clears before the scroll event it guards against");
});

test("🔴🔴🔴 the hook is TOLD when the column appears, because it appears late", () => {
  // The third and worst of the three mistakes, and the one that made the other two invisible.
  //
  // The hook took a `RefObject` and read `.current` inside an effect keyed on the ref object and a
  // boolean — both stable for the component's life, so the effect ran exactly once, at mount. And
  // at mount the column does not exist: `learning-canvas.tsx` returns a loading surface while
  // `session.ready` is false and the scroller is not in that branch. `.current` was null, the
  // effect returned, and nothing ever re-ran it. The observer was NEVER attached, on any canvas.
  //
  // That is why two rounds of correcting the anchor changed nothing on screen. Measured on
  // production with the second round live: opening the pane left `scrollTop` at 1313 exactly —
  // untouched, not restored to the wrong place.
  //
  // Calibration: take a `RefObject` again and this reddens.
  assert.ok(!/RefObject/.test(code), "the hook is back to reading a ref that is null when it mounts");
  assert.match(code, /useState<HTMLElement \| null>\(null\)/u, "the hook has no way to learn that the column appeared");
  assert.match(code, /\}, \[node\]\);/u, "the effect no longer re-runs when the column appears");

  const CANVAS = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
  // 🔴 AND THE CALLER HAS TO ATTACH IT. A hook returning a ref nobody puts on an element is the
  // same defect wearing a different shape.
  assert.match(CANVAS, /ref=\{attachThread\}/u, "the scrolling column is not wired to the anchor");
  assert.match(CANVAS, /const attachThread = useCallback\(/u, "the ref callback is inline, so React detaches it every render");
  assert.match(CANVAS, /threadRef\.current = node;\s*anchorThread\(node\);/u, "the other effects lost the ref they read");
});
