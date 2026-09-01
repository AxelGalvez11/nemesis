// Arriving in a canvas, and the four things that made it read as a cut.
//
// Owner, 2026-08-30: *"entering a chat/canvas... the mascot seems to move to the bottom then back
// to the middle then back to the chat composer super quickly, i want a smooth fade in of
// everything."*
//
// Traced frame by frame in headless Chrome at 1440x900 from the press of Enter, BEFORE this change:
//
// |  ms | the character |
// |-----|---------------|
// | 14-315 | front door: grows 80px to 159px, drifts down 27px |
// | **409** | **cut** — (746,378) at 159px becomes (400,778) at 76px in ONE frame |
// | 409-512 | walks 50px left while the dock finds its anchor |
// | **530** | jumps 24px right as the nav rail finishes collapsing |
//
// AFTER: the front door's character fades out as it travels (0.78 at 294ms, 0.06 at 366ms); the
// dock's walk and jump both happen at **opacity 0**; it becomes visible at 542ms already standing
// at (373,778) and never moves again.
//
// 🔴🔴 SUPERSEDED ON ONE ENTRY PATH, 2026-09-01, AND STILL LOAD-BEARING ON EVERY OTHER ONE. Hiding
// the walk was the best available answer while the two surfaces could not be made continuous, and
// it is why the numbers above improved. It was not enough: filmed on production, the SURFACE was
// blank for 300ms (this fade's own 120ms delay plus most of its 320ms), and the owner reported that
// blank as the app feeling broken. Direction A (owner's pick off the motion study) makes the
// furniture actually travel, so on a send from the front door there is nothing left to hide and
// fading would remove the continuity the travel creates.
//
// So `canvas-enter` is now conditional: OFF when `useArrival` has a staged rectangle, ON for every
// other way in — a deep link, a hard refresh, a return from sign-in, a row in the rail — where
// there is genuinely no previous frame to be continuous with. What this file guards is that second
// set of paths, which are still a dissolve and must stay one. The walk has its own guard in
// canvas-arrival-is-a-walk.test.ts.
//
// 🔴 SOURCE TEXT, BECAUSE NO TEST CAN SEE AN ANIMATION. What is pinned is the shape of the thing:
// which elements carry the fade, that the composer deliberately does not, that the delay is longer
// than the correction window it hides, and that the fade cannot fire a second time mid-session.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const CANVAS = readFileSync("components/workspace/learn/learning-canvas.tsx", "utf8");
const HOME = readFileSync("components/workspace/learn/canvas-home.tsx", "utf8");
const CSS = readFileSync("app/globals.css", "utf8");

const num = (re: RegExp, src: string) => Number(re.exec(src)?.[1]?.replace(/_/g, ""));

test("🔴🔴 the canvas fades in — the character and the answer region, on one timing", () => {
  assert.match(CSS, /@keyframes canvas-enter \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}/, "the arrival fade is gone or changed shape");
  // 🔴 OPACITY ONLY. `.canvas-chrome-in` lifts 4px as well, and this class is worn by the character
  // dock, which carries its own transform for where it stands. A transform here fights that.
  const rule = /\.canvas-enter \{ animation: canvas-enter (\d+)ms (\d+)ms ([^;]+); \}/.exec(CSS);
  assert.ok(rule, "the .canvas-enter rule is gone");
  // 🔴 THE CHARACTER'S CLASS IS NO LONGER BARE `arriving`, AND THAT IS THE ONE EXCEPTION IN THE
  // FILE. Under direction A the fade is switched OFF while the furniture walks, but the character
  // is the one piece that does not walk (three measured attempts; see use-arrival.ts), so it keeps
  // the fade on every path including that one. Without it, it appears at its corner in one frame.
  assert.match(CANVAS, /className=\{arrival\.from \? "canvas-enter" : arriving\}/, "the character no longer fades in with the canvas");
  // 🔴 AND `arriving` IS STILL THE ONLY THING THAT DECIDES IT. The walk turns the fade off by
  // emptying this one string, so every element wearing it stays in step. A second condition
  // written at a call site is how one of them ends up fading while the others walk.
  assert.match(
    CANVAS,
    /const arriving = arrival\.from \? "" : Date\.now\(\) - mountedAt < ARRIVING_MS \? "canvas-enter" : "";/,
    "the fade and the walk are no longer decided in one place",
  );
  assert.match(CANVAS, /className=\{`\$\{arriving\} relative h-full overflow-y-auto/, "the answer region no longer fades in with the character");
});

test("🔴🔴 the delay outlasts the correction window it exists to hide", () => {
  // The dock lands, walks 50px to its anchor and jumps 24px as the rail collapses — measured at
  // 409ms to 530ms after the press, so 121ms of movement. The delay is what keeps all of it at
  // zero. Shorten it and the walk and the jump come back into view, which IS the report.
  const rule = /\.canvas-enter \{ animation: canvas-enter (\d+)ms (\d+)ms/.exec(CSS)!;
  const delay = Number(rule[2]);
  assert.ok(delay >= 120, `${delay}ms is shorter than the 121ms of settling it has to cover`);
  assert.ok(delay <= 240, `${delay}ms leaves the canvas empty long enough to read as a stall`);
});

test("🔴🔴 the composer is deliberately NOT in the fade", () => {
  // It is the one thing that IS continuous across the swap: the front door's composer travels down
  // to where the canvas's own will be, and the canvas's takes over in place. Fading it would put a
  // blink into the single part of this transition that already worked.
  const composerLayer = /pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center/.exec(CANVAS);
  assert.ok(composerLayer, "the composer layer moved — check it is still outside the faded subtree");
  assert.ok(
    !/canvas-enter[^\n]*pointer-events-none absolute inset-x-0 bottom-0/.test(CANVAS),
    "the composer layer is inside the fade, so the one continuous element now blinks",
  );
});

test("🔴🔴 the front door no longer animates its own departure at all", () => {
  // 🔴 THIS TEST IS THE REVERSE OF WHAT IT ASSERTED UNTIL 2026-09-01, AND THE OLD TEXT IS KEPT ABOVE
  // BECAUSE IT RECORDS A REAL IMPROVEMENT THAT WAS STILL NOT ENOUGH. It used to require the greeter
  // to fade AND travel on the way out:
  //
  //     opacity: 0, transform: translate3d(${handoff.dx}px, ${handoff.dy}px, 0) scale(${handoff.k})
  //
  // That is now forbidden. Both halves depended on this page predicting the canvas's layout before
  // the canvas existed, and then unmounting before the prediction could be checked — which is why
  // the character kept needing corrections on the far side. The front door now MEASURES and leaves;
  // `learning-canvas.tsx` walks the real dock in from the measured rectangle. A travel here would
  // be a second character making the same journey.
  // 🔴 THE CODE, NOT THE WORD. "handoff" is still the right noun for what this page does and it
  // appears in several comments; an assertion on the word fails on prose. These match the two
  // mechanisms themselves.
  assert.ok(!/setHandoff|handoff\.(dx|dy|k)/.test(HOME), "the front door is flying its own character again — the journey belongs to the canvas");
  assert.ok(!/setTravel|\$\{travel\.[xy]\}/.test(HOME), "the front door is animating its own composer travel again");
  assert.match(HOME, /stageArrival\(\{/, "the front door stopped handing its rectangles over, so the canvas has nothing to walk from");
  // 🔴 ASSERTED AS AN ABSENCE. There are two `router.push(href)` calls in that file — this one and
  // the reduced-motion early return above it — so a positive match cannot tell an immediate push
  // from a deferred one: it finds the other call and passes either way.
  assert.ok(
    !/setTimeout\(\(\) => router\.push/.test(HOME),
    "the route push is deferred again — every ms held there is a ms the canvas has not started loading",
  );
});

test("🔴🔴 it cannot fire a second time in the middle of a session", () => {
  // `LearningCanvas` has two surfaces — one while the canvas is still being read from the database
  // and one after — and they are different trees, so React MOUNTS the second. Measured against the
  // dev seed: from the front door the real surface is up within tens of ms; on a deep link the
  // pre-ready one holds for FIVE TO NINE SECONDS first. An arrival animation there would play at
  // the learner nine seconds in.
  const ms = num(/const ARRIVING_MS = ([\d_]+);/, CANVAS);
  const anim = /\.canvas-enter \{ animation: canvas-enter (\d+)ms (\d+)ms/.exec(CSS)!;
  const runs = Number(anim[1]) + Number(anim[2]);
  assert.ok(ms > runs * 2, `${ms}ms is not clear enough of the animation's own ${runs}ms to drop the class safely`);
  assert.ok(ms < 4_000, `${ms}ms starts to overlap the five seconds a deep link spends pre-ready`);
  assert.match(CANVAS, /const \[mountedAt\] = useState\(\(\) => Date\.now\(\)\);/, "the mount time moved to a ref or an effect — an effect lands a frame late and flashes");
  assert.match(CANVAS, /Date\.now\(\) - mountedAt < ARRIVING_MS \? "canvas-enter" : ""/, "the arrival window is gone, so a slow canvas fades in mid-session");
  // The pre-ready surface only ever renders on the way in, so it needs no window — but it does need
  // the same walk exemption the real one has, or a send from the front door fades for the few tens
  // of ms it is up and then stops, which is a flicker in the middle of the walk.
  assert.match(
    CANVAS,
    /className=\{`flex h-full items-center justify-center\$\{arrival\.from \? "" : " canvas-enter"\}`\}/,
    "the pre-ready surface stopped fading in on the paths that need it, or started fading during the walk",
  );
});

test("🔴 somebody who asked the system to stop moving does not get it", () => {
  const reduced = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.canvas-enter,/, "the arrival fade ignores prefers-reduced-motion");
});
