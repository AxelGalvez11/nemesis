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
