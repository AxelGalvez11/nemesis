// Walking into a canvas from the front door, and the four faults that made it read as a break.
//
// Owner, 2026-09-01: *"the sidebar should collapse, and then the composer moves downward, and the
// mascot just goes downward, and there will be flickering of my prompt message... it'll just be
// glitchy."* Then, choosing direction A off the motion study: one continuous move, nothing
// appearing and nothing vanishing. Then: *"make it all slower like 1.5 seconds slower."*
//
// Filmed on production at 1440x900 at full frame rate, BEFORE this change, tracking the real
// rectangle of every element on every frame:
//
// |        ms | what a person saw |
// |-----------|-------------------|
// |     0-210 | good: the box glides down with the sentence still in it |
// | **250-520** | **blank** — sentence, character and greeting all gone at once |
// |   520-770 | the canvas fades up from nothing |
// |       776 | the character is at (378,750), having never crossed from (700,246) |
// | **770-1290** | **the sentence jumps 160px up and back, five times**, at 10Hz |
//
// Each of those four has a test below. What is pinned is the SHAPE of the mechanism, because no
// test here can see an animation: that the journey is owned by the arriving side, that the first
// painted frame carries the departing side's coordinates, that the only things that fade are the
// only things with nowhere to go, and that the reservation under the prompt cannot grow back.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ARRIVAL_CHROME_DELAY_MS, ARRIVAL_LABEL_MS, ARRIVAL_MS, clearArrival, stageArrival, takeArrival } from "@/lib/learn/arrival";

const CANVAS = readFileSync("components/workspace/learn/learning-canvas.tsx", "utf8");
const HOME = readFileSync("components/workspace/learn/canvas-home.tsx", "utf8");
const HOOK = readFileSync("components/workspace/learn/use-arrival.ts", "utf8");
const TURN = readFileSync("components/workspace/learn/canvas-thread-turn.tsx", "utf8");
const COMPOSER = readFileSync("components/workspace/learn/canvas-composer.tsx", "utf8");

const box = { x: 10, y: 20, w: 30, h: 40 };
const staged = { character: box, composer: box, labels: [], say: box };

test("🔴🔴 fault 1: the screen is never blank — the arriving side paints before the browser does", () => {
  // The blank was `canvas-enter`'s own 120ms delay plus most of its 320ms fade, applied to a
  // surface that mounted on the frame the front door died. The fix is not a shorter fade: it is
  // that the first painted frame already shows the front door's arrangement.
  assert.match(HOOK, /useLayoutEffect/, "the arrival moved to a plain effect, which runs AFTER paint — that is the blank frame back");
  assert.ok(!/\buseEffect\(/.test(HOOK), "an ordinary effect crept in; a measurement that lands after paint is a teleport");
  // The start pose is written with the transition explicitly off, or the element animates in from
  // wherever the browser last saw it.
  assert.match(HOOK, /node\.style\.transition = "none";/, "the start pose is being written with a transition live, so it animates from the wrong place");
  assert.match(HOOK, /node\.style\.transform = `translate3d\(\$\{dx\}px, \$\{dy\}px, 0\)`;/, "the start pose is gone");
});

test("🔴🔴 fault 2: the walk is armed a frame later, and it takes two frames not one", () => {
  // A single requestAnimationFrame can be delivered inside the same paint that wrote the start
  // pose, in which case the browser never observes it and there is nothing to transition from —
  // the element simply appears at its destination. Nested frames are the fix and they look like a
  // mistake, so this is what stops someone flattening them.
  const nested = /requestAnimationFrame\(\(\) => \{\s*requestAnimationFrame\(\(\) => \{/.exec(HOOK);
  assert.ok(nested, "the double requestAnimationFrame was flattened — the walk will snap instead of easing");
});

test("🔴🔴 fault 3: the far side owns the whole journey, and the character fades rather than jumps", () => {
  // Three earlier answers all failed the same way: the front door computed where the canvas's
  // character was ABOUT to be, flew its own copy most of the way, and unmounted before the guess
  // could be checked. The measured result was a jump from (746,378) to (400,778) in one frame.
  assert.match(HOME, /stageArrival\(\{/, "the front door stopped handing its rectangles over");
  assert.match(HOOK, /selector: "#canvas-composer"/, "the arrival stopped moving the composer");
  // 🔴🔴 AND THE CHARACTER IS THE ONE PIECE THAT DOES NOT TRAVEL, ON PURPOSE, AFTER THREE MEASURED
  // ATTEMPTS IN THIS PASS. The dock re-measures the composer continuously and writes its own
  // transform from JSX, so it is already moving during the walk and has no stable untransformed
  // rectangle to be walked back from. Writing to `.character-dock` was overwritten on the next
  // render; a wrapper inside it put the first painted frame at (2584,-31); dropping the
  // compensation put it at (-165,480). It fades instead, which is not a jump.
  //
  // This test pins the DECISION, so that a fourth attempt has to move the journey into the dock
  // itself rather than adding another writer to its transform.
  assert.ok(!/selector: "\.character-(dock|arrival)"/.test(HOOK), "something is writing to the dock's transform from outside again");
  assert.match(CANVAS, /className=\{arrival\.from \? "canvas-enter" : arriving\}/, "the character stopped fading in, so it now appears in one frame");
});

test("🔴🔴 fault 4: the learner's own sentence flies, and the box it flies to is findable", () => {
  // This is the half of the report that said prompts "disappear": the sentence rode down inside the
  // composer, the front door died, and it reappeared as a bubble at the top right having never
  // travelled. Both ends of that journey are attributes, and both fail silently if renamed.
  assert.match(TURN, /data-learner-said[>\s]/, "the learner's sentence lost the hook the arrival flies it to");
  assert.match(HOOK, /selector: "\[data-learner-said\]"/, "the arrival stopped flying the sentence");
  assert.match(COMPOSER, /id="canvas-composer"/, "the composer lost the id both the dock and the arrival measure");
  // 🔴 EVERY COMMIT, NOT ONLY THE FIRST. The sentence does not exist on the mount — there is no turn
  // yet — so a first-commit-only measurement flies the furniture and lets the sentence appear out
  // of nowhere, which is this exact fault with two of three pieces fixed.
  const loop = HOOK.indexOf("for (const { key, selector } of PIECES)");
  assert.ok(loop > 0, "the piece-measuring loop is gone");
  const closesBare = HOOK.indexOf("\n  });", loop);
  const closesWithDeps = HOOK.indexOf("\n  }, [", loop);
  assert.ok(
    closesBare > 0 && (closesWithDeps < 0 || closesBare < closesWithDeps),
    "the piece-measuring effect gained a dependency array, so it stops running before the sentence exists",
  );
});

test("🔴🔴 the sentence cannot bounce: room already reserved is never handed back", () => {
  // Filmed: the reservation under the current turn flipped between 370px and 756px on alternating
  // ticks — a 386px change in the page's own height, ten times a second — because it was computed
  // from the turn's instantaneous height and `CanvasFade` collapses that node for a tick while it
  // swaps content. The pin then corrected the scroll each time, and the sentence jumped 160px.
  assert.match(CANVAS, /const held = parseFloat\(runway\.style\.height\) \|\| Infinity;/, "the reservation stopped remembering what it already gave");
  assert.match(CANVAS, /runway\.style\.height = `\$\{Math\.min\(held, want\)\}px`;/, "the reservation can grow back again, so the prompt will bounce");
  // 🔴 AND `release()` IS STILL THE ONLY THING THAT HANDS IT BACK. Monotonic-while-current is only
  // safe because something ends the turn; without this the runway is permanent and the thread keeps
  // a screenful of blank in the middle of it for ever.
  assert.match(CANVAS, /if \(runwayRef\.current\) runwayRef\.current\.style\.height = "0px";/, "nothing releases the reservation any more");
});

test("🔴🔴 only the things with nowhere to go fade, and they are redrawn so they can", () => {
  // The greeting and the hint have no counterpart in a canvas. Left alone they are cut on the frame
  // of the swap, in the middle of a two-second movement.
  assert.match(HOME, /labels: \[headingBox, hintBox\]/, "the front door stopped measuring the labels it is about to lose");
  assert.match(CANVAS, /<ArrivalLabels from=\{arrival\.from\} \/>/, "the canvas stopped redrawing the departing labels");
  assert.ok(ARRIVAL_LABEL_MS < ARRIVAL_MS, "the labels outlast the walk, so the greeting is still on screen after everything has settled");
});

test("🔴🔴 the handoff is one-shot and expires, so it cannot replay onto an unrelated canvas", () => {
  clearArrival();
  assert.equal(takeArrival(), null, "an unstaged read returned something");
  stageArrival(staged);
  assert.ok(takeArrival(), "a staged arrival could not be read back");
  assert.equal(takeArrival(), null, "the arrival was readable twice — a second mount will replay the walk");
  clearArrival();
});

test("🔴🔴 the walk is short again, and the curve moved back with it", () => {
  // 🔴🔴 REVERSED 2026-09-02, AND BOTH HALVES OF THE OLD TEST ARE WORTH KEEPING IN VIEW. It read
  // "the length is the owner's, and the curve is not the short one", and pinned 1,960ms with a
  // gentle S-curve, because on 2026-09-01 the owner picked direction A at 460ms and then said
  // *"make it all slower like 1.5 seconds slower"*. Having used it: *"the transition ... is super
  // slow ... everything should immediately move into place."* So it is back to the length direction
  // A was drawn at.
  assert.equal(ARRIVAL_MS, 460, "the walk is no longer the length the owner chose");

  const ARRIVAL = readFileSync("lib/learn/arrival.ts", "utf8");
  const ease = /export const ARRIVAL_EASE = "cubic-bezier\(([^)]+)\)";/.exec(ARRIVAL);
  assert.ok(ease, "the arrival curve is gone");
  const [x1 = 0, y1 = 0] = (ease[1] ?? "").split(",").map(Number);
  // 🔴 THE CURVE AND THE DURATION ARE ONE DECISION. A short move wants its distance spent early, so
  // it reads as landing rather than stopping; the S-curve that suited two seconds spends its
  // opening frames doing almost nothing, which at 460ms is exactly the sluggishness being fixed.
  // This is the OPPOSITE assertion to the one it replaces, deliberately.
  assert.ok(y1 >= 0.5, `${y1} spreads the distance evenly; over ${ARRIVAL_MS}ms that reads as sluggish`);
  assert.ok(x1 <= 0.4, `${x1} is a slow lead-in, which is what makes a short move feel late`);
});

test("🔴 nothing in the arrival outlasts the walk it belongs to", () => {
  // 🔴 THE CHROME DELAY WAS 1,280ms AGAINST A 1,960ms WALK AND WAS MOST OF WHY THE SCREEN FELT
  // EMPTY. Held as a FRACTION rather than a number so the two cannot drift apart again: the rule
  // was always "arrive behind furniture that has nearly stopped", which is a ratio, not a constant.
  assert.ok(ARRIVAL_CHROME_DELAY_MS < ARRIVAL_MS, "the canvas chrome now arrives after the walk has finished");
  assert.ok(ARRIVAL_CHROME_DELAY_MS <= ARRIVAL_MS * 0.75, "the chrome waits for most of the walk, which reads as an empty screen");
  // The labels are leaving; they must be gone before the furniture stops, or the last thing
  // settling is a word that no longer belongs to the screen.
  assert.ok(ARRIVAL_LABEL_MS < ARRIVAL_MS, "the departing labels outlast the walk");
});
