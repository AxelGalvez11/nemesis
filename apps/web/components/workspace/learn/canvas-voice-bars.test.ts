// 🔴 SOURCE ASSERTIONS, THE SAME LIMIT `handoff-and-mascot.test.ts` STATES ABOUT ITSELF. The bar
// heights come from a real microphone through `subscribeMicLevel`, which this test runner cannot
// open — there is no DOM here and no audio input device. What can be pinned down without either is
// the arithmetic: the tick length the strip scrolls at, and the smoothing constant that must move
// WITH it or responsiveness to real speech quietly changes underneath the owner's "just slow down
// the animation" ask.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const SOURCE = readFileSync(new URL("./canvas-voice-bars.tsx", import.meta.url), "utf8");

test("🔴 the sampling cadence slowed down, on purpose, and the old value is gone", () => {
  // Owner, 2026-08-26: "the dictation animation needs to be a little bit slower... a bit too fast
  // right now". 55ms was ~18 steps/second (109px/s of scroll at the 6px step). 100ms was chosen
  // over other candidates in the owner's suggested 90-110ms band because it matches
  // `WAVEFORM_SAMPLE_MS` in `@/lib/workspace/waveform-history.ts` — this app's own, independently
  // derived answer to "how often should a live mic-level reading move" for the recorder's
  // waveform, a different feature sampling the same kind of signal.
  assert.match(SOURCE, /const SAMPLE_MS = 100;/, "the sampling cadence is not the re-tuned 100ms");
  assert.equal(
    /const SAMPLE_MS = 55;/.test(SOURCE),
    false,
    "the original 55ms cadence is back — the owner asked for this to be slower, not reverted",
  );
});

test("🔴🔴 the smoothing constant was RE-DERIVED for the new cadence, not carried over from it", () => {
  // The blend `y = y*(1-a) + level*a`, run once per SAMPLE_MS, is a discrete first-order low-pass
  // filter whose real (wall-clock) time constant is `tau = -SAMPLE_MS / ln(1-a)`. At the original
  // 55ms tick with a=0.4, tau is ~108ms (`-55 / ln(0.6)`). Leaving a=0.4 in place while slowing
  // SAMPLE_MS to 100ms would silently push tau to ~216ms — the strip would take almost twice as
  // long to show a real word arriving, which is the "responsiveness to real speech" this repo's
  // task explicitly warned must not be "accidentally halved" by a cadence change alone. Solving
  // `1-a' = exp(-SAMPLE_MS / tau)` for the new 100ms cadence holds tau at ~108ms again: a=0.605,
  // 1-a=0.395 (`python3 -c "import math; print(1-math.exp(-100/(-55/math.log(0.6))))"` → 0.605).
  assert.match(
    SOURCE,
    /smoothed\.current = smoothed\.current \* 0\.395 \+ level \* 0\.605;/,
    "the smoothing blend is not the re-derived 0.395/0.605 pair for the 100ms cadence",
  );
  // The negative half: the old pair tuned for the 55ms tick must not survive under the new one,
  // where it would quietly cut the strip's responsiveness to real speech roughly in half.
  assert.equal(
    /smoothed\.current \* 0\.6 \+ level \* 0\.4/.test(SOURCE),
    false,
    "the 55ms-tuned smoothing constant (0.6/0.4) is still here under the slower 100ms cadence — " +
      "this halves how fast the strip notices real speech rather than only slowing its scroll",
  );
});

test("live microphone geometry is untouched — only the cadence moved", () => {
  // Constraints the owner named as non-negotiable: this stays a LIVE reading of the real
  // microphone (never a decorative loop), and the bar geometry is unchanged.
  assert.match(SOURCE, /subscribeMicLevel/, "the strip stopped reading the real microphone level");
  assert.match(SOURCE, /const MIN_BAR = 4;/);
  assert.match(SOURCE, /const MAX_BAR = 41;/);
  assert.match(SOURCE, /const IDLE_BAR = 3;/);
  assert.match(SOURCE, /w-\[3px\] shrink-0 rounded-full/, "the 3px bar width changed");
});

// ── the strip is smooth without being faster ────────────────────────────────────────────────

test("🔴🔴🔴 the strip is driven by ONE animation frame loop, and React is off the hot path", () => {
  // Owner, TWICE: *"make the dictation animation even more smooth… it should be, like, sixty
  // frames per second or more because it still looks a bit laggy."*
  //
  // 🔴 REPOINTED FROM A CSS TRANSITION, WHICH WAS THE FIRST ANSWER AND WAS NOT ENOUGH. That version
  // held the samples in `useState` and restarted a `transform` transition on every one — so ten
  // times a second React reconciled sixty-odd spans AND a transition was cancelled and re-declared
  // mid-flight. Both drop frames, and no easing curve fixes either. The samples now live in a ref,
  // the spans are a fixed pool rendered once, and a single `requestAnimationFrame` writes heights
  // and one transform per frame. While the microphone is open this component does not re-render.
  //
  // Calibration: put the samples back in `useState` and the first assertion reddens.
  assert.ok(!/useState<\{ height: number; id: number \}\[\]>|setSamples/.test(SOURCE), "the samples are React state again, so every tick reconciles the strip");
  assert.match(SOURCE, /const heights = useRef<number\[\]>\(\[\]\)/, "the samples are not held in a ref");
  assert.match(SOURCE, /frame\.current = requestAnimationFrame\(draw\)/, "there is no per-frame loop");
  assert.match(SOURCE, /bar\.style\.height =/, "heights are not written directly; they are going back through a render");
  assert.ok(!/transition: `transform/.test(SOURCE), "the per-sample CSS transition is back");
});

test("🔴🔴 the glide cancels the content shift, and the SIGN is the whole trick", () => {
  // A sample moves every bar one place LEFT, so at the instant it lands the track is pushed one
  // pitch RIGHT and eased to zero across exactly one sample period. Backwards, this doubles the
  // jump instead of cancelling it. Calibration: flip to `(t - 1)` and the strip stutters twice as
  // hard as it did before any of this.
  assert.match(SOURCE, /translate3d\(\$\{\(1 - t\) \* BAR_PITCH\}px, 0, 0\)/, "the glide is the wrong distance or the wrong direction");
  assert.match(SOURCE, /performance\.now\(\) - sampledAt\.current\) \/ SAMPLE_MS/, "the eased fraction is not measured against the sample period");
});

test("🔴🔴 the glide distance IS the bar pitch, read off the markup", () => {
  // If `BAR_PITCH` and the rendered bar stop agreeing, the strip slides the wrong distance every
  // sample and visibly creeps. Both numbers are read from the source rather than restated here.
  const pitch = /const BAR_PITCH = (\d+);/.exec(SOURCE);
  assert.ok(pitch, "BAR_PITCH is gone");
  const bar = /className="w-\[(\d+)px\] shrink-0 rounded-full/.exec(SOURCE);
  assert.ok(bar, "the bar's width moved; re-point this check");
  const gap = /className="flex min-w-0 items-center gap-\[(\d+)px\] will-change-transform"/.exec(SOURCE);
  assert.ok(gap, "the gliding track's gap moved; re-point this check");
  assert.equal(
    Number(pitch[1]),
    Number(bar[1]) + Number(gap[1]),
    `BAR_PITCH is ${pitch[1]} but a bar occupies ${bar[1]}+${gap[1]} — the strip will creep on every sample`,
  );
});

test("🔴🔴 only the newest bar eases, and that falls out of the transform", () => {
  // Because the track is pushed a FULL pitch right at t=0, every existing bar is drawn exactly
  // where its own value was already showing — so it needs no easing and gets none. The last bar is
  // the one slot that was off the right edge a moment ago, so it is the only thing that would pop.
  // Easing all of them would be a second animation fighting the first.
  assert.match(SOURCE, /const newest = spoken && index === heights\.current\.length - 1;/, "the newest bar is no longer singled out");
  assert.match(SOURCE, /newest \? IDLE_BAR \+ \(to - IDLE_BAR\) \* t : to/, "either every bar eases, or none does");
});

test("🔴 the fixed pool is keyed by position, which is now correct rather than a defect", () => {
  // 🔴 THIS INVERTS AN EARLIER GUARD, DELIBERATELY. When the list was a sliding window in React
  // state, `key={index}` was the bug: every index shifted each tick, so React kept the nodes and
  // rewrote all sixty heights. The pool never reorders, never grows and never shrinks while live —
  // its position IS its identity — and React does not touch it at all between capacity changes.
  assert.match(SOURCE, /key=\{index\}/, "the fixed pool is keyed by something other than its position");
  assert.ok(!/key=\{sample\.id\}/.test(SOURCE), "the identity key is back, and there are no sample objects to carry one");
});

test("🔴 reduced motion keeps the bars and drops only the easing", () => {
  // Somebody who asked the system to stop moving still has to see that it is listening.
  assert.match(SOURCE, /prefers-reduced-motion: reduce/, "the glide ignores a reduced-motion preference");
  assert.match(SOURCE, /still \? 1 :/, "reduced motion still eases between samples");
});

test("🔴 the loop is cancelled when the microphone closes", () => {
  // An orphaned rAF runs for the life of the page, writing styles onto detached nodes.
  assert.match(SOURCE, /cancelAnimationFrame\(frame\.current\)/, "the animation loop outlives the microphone");
});
