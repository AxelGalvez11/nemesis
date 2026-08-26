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
  assert.match(
    CANVAS,
    /station=\{handedOver \|\| turnInFlight \|\| presence === "preparing" \? "centre" : "corner"\}/,
    "the handover window stopped holding the centre",
  );
  assert.match(CANVAS, /const \[handedOver, setHandedOver\] = useState\(Boolean\(openingAsk\)\)/);
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
  assert.match(CANVAS, /hidden=\{judgingPhase !== null\}/);
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
  assert.match(COMPOSER, /min-h-\[var\(--composer-min-height\)\] items-center gap-0 px-\[var\(--composer-pad-x\)\]/);
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
