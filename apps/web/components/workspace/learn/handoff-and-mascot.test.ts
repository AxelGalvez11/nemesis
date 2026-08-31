// The front door → canvas handoff, and the character being present for every wait in the canvas.
//
// 🔴 SOURCE ASSERTIONS, AND THE LIMIT IS STATED RATHER THAN HIDDEN. These read the files and match
// text, exactly like `send-is-acknowledged.test.ts` beside them. That catches a line being deleted
// or reverted; it cannot catch the handoff looking wrong. The handoff was ALSO measured in real
// headless Chrome while this was written — the character leaves the front door at (754, 351) at
// 64px, arrives at 126px, and the canvas's dock settles on the surface centre (728, 378) — and the
// numbers behind each fix are recorded in the tests below so the next person can re-run them
// instead of re-deriving them. A green suite here is not a claim that the animation is smooth.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const HOME = read("./canvas-home.tsx");
const CANVAS = read("./learning-canvas.tsx");
const THINKING = read("./canvas-thinking.tsx");
const COMPOSER = read("./canvas-composer.tsx");
const DOCK = read("../../character/character-dock.tsx");
const CSS = read("../../../app/globals.css");

test("🔴🔴 both ends of the handoff measure the SAME rectangle", () => {
  // The whole glitch was two different centres. This page measured against `window`; the canvas's
  // dock measures against its `offsetParent` — the surface inside the shell's second grid column.
  // They differ by the nav rail's width whenever the rail is up, which on the front door is always.
  assert.match(
    HOME,
    /const surface = scroller\.current\?\.getBoundingClientRect\(\)/,
    "the front door stopped measuring the surface it is about to hand over to",
  );
  assert.match(HOME, /const middle = centreStation\(surface\)/, "the character's target left the shared rectangle");
  // 🔴 THE NEGATIVE HALF, which is what makes the positive half mean anything: the old code read
  // `window.innerWidth` / `window.innerHeight` for these two targets, and either one coming back
  // reintroduces the 26px disagreement.
  assert.equal(
    /x: Math\.round\(window\.innerWidth \/ 2/.test(HOME),
    false,
    "the composer is aiming at the viewport again, not at the surface it lands in",
  );
  assert.equal(
    /centreStation\(\{ left: 0, top: 0, width: window\.innerWidth/.test(HOME),
    false,
    "the character is aiming at the viewport again, not at the surface it lands in",
  );
});

test("🔴🔴 the character never stands in the corner during the handover", () => {
  // Two separate holes put it there, and both are one line each.
  //
  // 1. The pre-ready branch passed no `station`, so it fell through to `stationOf(shown)` — and
  //    `stations.ts` says in its own header that the derived station broke on purpose the day the
  //    working poses stopped being unique to working. `thinking` resolves to `curious`, which is
  //    not in `CENTRE`, so that dock scored `corner`.
  assert.match(
    CANVAS,
    /<CharacterDock bottom=\{0\} contain left=\{0\} station="centre"/,
    "the pre-ready dock is deriving its station again, which puts it in the bottom-left corner",
  );
  // 2. Between `session.ready` and the turn actually starting, both terms of the main dock's
  //    station are false. Measured: the character appeared at (493, 648) and walked to (728, 378).
  // 🔴 REPOINTED 2026-08-27, AND THE HANDOVER TERM IS THE HALF THAT DID NOT MOVE. Owner: *"when in
  // chat mode, the mascot should not be in the middle for thinking, it should be in the left side
  // like in a regular chat."* So the THINKING terms are now gated on the view — but `handedOver` is
  // not, and must never be: it is the front door's own character arriving, already at the centre on
  // the previous screen. Gating it would reproduce the measured walk above, mirrored, for every
  // learner in the chat. Calibration: move `handedOver` inside the `!threadOpen` group and this
  // reddens.
  assert.match(
    CANVAS,
    /station=\{handedOver \|\| \(!threadOpen && \(turnInFlight \|\| presence === "preparing"\)\) \? "centre" : "corner"\}/,
    "the handover window stopped holding the centre",
  );
  assert.match(CANVAS, /const \[handedOver, setHandedOver\] = useState\(Boolean\(openingAsk\)\)/);
});

test("🔴🔴🔴 the character's FIRST painted frame is where it belongs, not a swoop into it", () => {
  // 🔴 THE THIRD ROUND ON "the transition is glitchy", AND THE ONE THAT WAS HIDING BEHIND CODE THAT
  // LOOKED CORRECT. `durationFor` has always returned 0 for the first move and `character.css` has
  // documented that intent since the override existed — "the very first placement wants none at
  // all". It never reached the screen.
  //
  // Measured on 2026-08-26 in real headless Chrome at 1456x900, sampling the dock's computed style
  // every frame across the route swap:
  //
  //   before   frame 0: transform matrix(1,0,0,1,0,0), transition-duration 0.14s
  //            → the character appeared at REST SIZE at its resting spot and eased 400px into the
  //              middle over 140ms, a beat after the greeter had finished flying to that exact
  //              spot at that exact size. Two arrivals, opposite directions, one send.
  //   after    frame 0: transform matrix(2.1,0,0,2.1,346,-400), transition-duration 0s
  //            → greeter's last frame (754, 378, w 159) against the dock's first (752, 378, w 164).
  //
  // The cause: `measure()` runs TWICE inside one commit, because the placement effect's
  // `setInset`/`setOffset` force a synchronous re-render before the browser paints. The second run
  // sees `placed === true` and returns the 140ms follow duration, so the 0ms style was never the
  // one painted. `placed` means "a measurement has landed"; several of those land between frames.
  //
  // 🔴 SO THE FLAG HAS TO BE THE BROWSER'S, NOT REACT'S — two nested animation frames, because a
  // single frame fires BEFORE the paint it is meant to be waiting for.
  assert.match(
    DOCK,
    /if \(!paintedRef\.current \|\| !placed \|\| !anchoredRef\.current\) return 0;/,
    "the first move can ease again, and the character swoops into the middle it was already at",
  );
  assert.match(
    DOCK,
    /requestAnimationFrame\(\(\) => \{\s*second = window\.requestAnimationFrame\(\(\) => \{\s*paintedRef\.current = true;/,
    "the painted flag is set on one frame instead of two, which fires before the paint it waits for",
  );
});

test("🔴🔴 the character holds its place when the composer is swapped for another control", () => {
  // Found by reading the surface rather than by looking at it: the canvas renders
  // `{showComposer && !recording && <CanvasComposer/>}`, so pressing record removes the element the
  // character is anchored to for as long as a lecture is being captured, and a completed canvas
  // renders no composer at all. Without this the character walks to the bottom-left of the window
  // and back for a control swap in the same slot.
  assert.match(CANVAS, /\{showComposer && !recording && \(/, "the composer's render condition changed; re-check the anchor's lifetime");
  assert.match(DOCK, /if \(everPlacedRef\.current\) return;/, "a missing anchor re-corners a character that has already been placed");
});

test("a correction is not a journey — the dock has a follow duration at last", () => {
  // `character.css` documented ~140ms for following the anchor from the day the override existed,
  // and nothing ever passed it: `--character-travel-ms` was only ever `0ms` or unset, so every
  // micro-correction eased over the stylesheet's 680ms walk.
  assert.match(DOCK, /const FOLLOW_MS = 140;/);
  assert.match(DOCK, /return from === null \|\| from === station \? FOLLOW_MS : null;/);
  // A station CHANGE must still take the long walk, which is why the last station is remembered in
  // a ref rather than in the effect — the effect re-runs on exactly the event it needs to recall.
  assert.match(DOCK, /const placedAtRef = useRef<Station \| null>\(null\)/);
});

test("the dock stops re-rendering eight times a second while standing still", () => {
  // `setTravel` allocated a fresh object every 120ms tick whether or not a number had changed, so
  // React could never bail out — and each tick forces synchronous layout, during the exact window
  // that has to look smooth.
  assert.match(DOCK, /const SETTLED_PX = 0\.5;/);
  assert.match(DOCK, /\? was\n?\s*: \{ dx, dy, k: centreScale, ms, placed: anchoredRef\.current \}/);
  // Placement lands before paint, so there is no frame with the character hidden.
  assert.match(DOCK, /import \{ useEffect, useLayoutEffect, useRef, useState \} from "react";/);
});

test("🔴🔴 the policy wait has the character, and it is the ONLY character on screen", () => {
  // Owner 2026-08-26: "when there's any kind of thinking state, the mascot should be there to show
  // that it's thinking". A judgement resolves to the presence `task`, not `preparing`, and
  // `turnInFlight` is the SESSION's busy flag — so this wait scored `corner` on both terms and a
  // 6px pulsing dot did the talking. `canvas-thinking.tsx` said outright that the dot was "a
  // placeholder … standing where the morphing Nemesis object will go".
  assert.match(THINKING, /<NemesisAvatar/, "the policy wait went back to a placeholder");
  assert.equal(
    /animate-pulse rounded-full/.test(THINKING),
    false,
    "the placeholder dot is back beside the character",
  );
  // The dock stands down for exactly that span, or the canvas shows two characters at once.
  //
  // 🔴 A SECOND REASON JOINED IT ON 2026-08-26 AND THIS GUARD IS PHRASED FOR BOTH. The dock also
  // stands down while the learner is reading a rewound moment, because `CanvasHistoryView` is an
  // overlay over a live surface that stays mounted, so the character was resting 24px under a
  // paragraph nobody could see. What this test protects is unchanged: `judgingPhase` must still be
  // one of the conditions, so a judgement can never put two characters on one screen.
  assert.match(CANVAS, /hidden=\{judgingPhase !== null(?: \|\| [^}]+)?\}/);
  assert.match(CANVAS, /const judgingPhase = regions\.policy && policy\.thinking \? policy\.phase : null;/);
  assert.match(CANVAS, /\{judgingPhase && <CanvasThinking phase=\{judgingPhase\} \/>\}/);
});

test("the character is not re-mounted every time the step changes", () => {
  // The caption is keyed on the phase so its entry fade runs. Keying the character too would
  // restart the engine, its clock and the gaze on every phase change — a flicker exactly where
  // continuity is the entire point of standing there.
  const avatar = THINKING.slice(THINKING.indexOf("<NemesisAvatar"), THINKING.indexOf("</span>", THINKING.indexOf("<NemesisAvatar")));
  assert.equal(/key=/.test(avatar), false, "the thinking character is keyed, so it restarts on every step");
});

test("🔴 the two composers are one shape, so the swap shows nothing", () => {
  // The front door flies its composer into the canvas composer's place. Any difference between the
  // two pills is a pop at the instant of the route swap. These were `rounded-[26px]` and
  // `px-[12px]` against tokens of 28px and 8px — a 2px corner and a 4px control shift.
  assert.match(COMPOSER, /"rounded-\[var\(--composer-radius\)\]"/);
  // 🔴 ASSERTED OF BOTH FILES NOW, WHICH IS WHAT "ONE SHAPE" ACTUALLY MEANS. This pinned the canvas
  // composer's row alone, so when the controls moved to the floor of the box on 2026-08-31 (owner:
  // *"the composer buttons stay fixed to… the bottom, like in ChatGPT"*) the guard could be made
  // green again by editing this line and leaving the front door centred — the pop it exists to
  // catch, shipped past the test that names it. The invariant is that the two rows agree.
  const ROW = /min-h-\[var\(--composer-min-height\)\] items-end/;
  assert.match(COMPOSER, ROW, "the canvas pill's input row changed shape");
  assert.match(HOME, ROW, "the front door's departing pill no longer matches the one it flies into");
  // 🔴 THE QUOTED FORM, NOT THE BARE STRING. Both literals are NAMED in the comment above the fix,
  // as the removal record; matching them anywhere in the file would make this test fail on its own
  // explanation. A class only ever reaches the DOM inside a quoted string.
  assert.equal(/"rounded-\[26px\]"/.test(COMPOSER), false, "the canvas composer went back to a literal corner");
  assert.equal(/px-\[12px\]"/.test(COMPOSER), false, "the canvas composer went back to a literal padding");
});

test("nothing is left behind at full opacity when the front door departs", () => {
  // The help line sits outside `composerBox`, so the departure neither carried it nor faded it: it
  // stood at full opacity while the composer flew out from under it, then hard-cut at the route
  // swap. It shares the greeting's fade now.
  //
  // 🔴 THIS USED TO PIN `TodayStrip` INTO THE SAME GROUP AND THE STRIP IS GONE (owner 2026-08-26:
  // *"the landing page has some previous chats in there, which I don't want that in there. It's
  // the things that are below the chat composer, which I don't want."*). The negative assertion
  // below is what is left of that: the front door must not grow a second thing under the composer
  // by re-importing the component that was deleted.
  assert.match(
    HOME,
    /LEAVE[SW]? WITH THE GREETING[\s\S]{0,1400}opacity: departing \? 0 : 1/,
    "the help line stopped departing with the greeting",
  );
  assert.equal(/<TodayStrip/.test(HOME), false, "the day's strip is back under the composer");
  assert.equal(/from "\.\/today-strip"/.test(HOME), false, "the day's strip is back under the composer");
});

test("🔴 an answer arrives block by block, and the drill is untouched", () => {
  // Owner 2026-08-26: "make sure that the output of DeepSeek fades in nicely". The reply does not
  // stream — `canvas-chat.ts` passes no `onDelta`, so the whole answer lands in one setState — and
  // its only animation was a flat 140ms opacity step shared with the drill.
  assert.match(CSS, /@keyframes canvas-answer-block/);
  assert.match(CSS, /\.canvas-answer-in > \* \{ animation: canvas-answer-block 240ms/);
  // 🔴 THE CAP IS THE POINT: past the eighth block every remaining one shares the last delay, so a
  // forty-paragraph answer finishes in the same budget a three-paragraph one does.
  assert.match(CSS, /\.canvas-answer-in > :nth-child\(n\+8\) \{ animation-delay: 250ms; \}/);
  // The drill boundary keeps its opacity-only 140ms — someone doing fifty facts crosses it fifty
  // times, which is the reasoning written above `.canvas-swap` and the reason this is a new class.
  assert.match(CSS, /\.canvas-swap \{ animation: canvas-swap-in 140ms ease-out both; \}/);
  assert.match(CANVAS, /className="canvas-answer-in text-\[length:var\(--canvas-text-body\)\]/);
  // Keyed on the answer, or the reveal plays exactly once per session and never again.
  assert.match(CANVAS, /key=\{`p\$\{index\}:\$\{replyText\}`\}/);
  // Reduced motion turns it off with everything else.
  assert.match(CSS, /\.canvas-answer-in > \*,/);
});
