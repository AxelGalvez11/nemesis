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

test("🔴🔴 the strip GLIDES between samples, and the sampling cadence is untouched", () => {
  // Owner, 2026-08-26: *"the dictation waveform is at a higher frames per second because right now
  // it just feels not smooth and laggy."* — hours after the opposite-sounding *"the dictation
  // animation needs to be a little bit slower."*
  //
  // 🔴 BOTH ARE SATISFIED BECAUSE THEY ARE ABOUT DIFFERENT THINGS: how often the strip LEARNS
  // something (10Hz, the measured integration window, asserted above and unchanged) versus how
  // often it PAINTS (the display's refresh). Raising SAMPLE_MS to smooth the motion would have
  // quietly reversed the earlier instruction — which is exactly what this pair of tests prevents.
  assert.match(SOURCE, /transform \$\{SAMPLE_MS\}ms linear/, "the glide no longer lasts exactly one sample period");
  assert.match(SOURCE, /translate3d\(\$\{BAR_PITCH\}px, 0, 0\)/, "the strip no longer starts a sample-width to the right");
  assert.match(SOURCE, /translate3d\(0, 0, 0\)/, "the strip never releases back to zero");
  // 🔴 TWO FRAMES, NOT ONE. A single rAF is sometimes coalesced with the style write and the
  // transition simply does not run — the strip would jump exactly as it did before.
  assert.match(SOURCE, /requestAnimationFrame\([\s\S]{0,200}requestAnimationFrame\(/, "the two-frame commit is gone; the transition may never fire");
});

test("🔴🔴 the glide distance IS the bar pitch, read off the markup", () => {
  // If `BAR_PITCH` and the rendered bar stop agreeing, the strip slides the wrong distance every
  // tick and visibly creeps. Both numbers are read from the source rather than restated here.
  const pitch = /const BAR_PITCH = (\d+);/.exec(SOURCE);
  assert.ok(pitch, "BAR_PITCH is gone");
  const bar = /className="w-\[(\d+)px\] shrink-0 rounded-full bg-\(--ui-text-tertiary\)"/.exec(SOURCE);
  assert.ok(bar, "the sampled bar's width moved; re-point this check");
  const gap = /className="flex min-w-0 items-center gap-\[(\d+)px\] will-change-transform"/.exec(SOURCE);
  assert.ok(gap, "the gliding track's gap moved; re-point this check");
  assert.equal(
    Number(pitch[1]),
    Number(bar[1]) + Number(gap[1]),
    `BAR_PITCH is ${pitch[1]} but a bar occupies ${bar[1]}+${gap[1]} — the strip will creep on every tick`,
  );
});

test("🔴 a sampled bar is keyed by identity, never by its index", () => {
  // The other half of "laggy", and it was not the animation. `samples` is a sliding window, so once
  // it is full every index shifts each tick — with `key={index}` React kept the nodes and REWROTE
  // every height, ten times a second. The strip morphed instead of moving.
  assert.match(SOURCE, /key=\{sample\.id\}/, "sampled bars are keyed by index again");
  assert.ok(!/key=\{`bar-\$\{index\}`\}/.test(SOURCE), "the index key is back");
});

test("🔴 reduced motion keeps the bars and drops only the glide", () => {
  // Somebody who asked the system to stop moving still has to see that it is listening.
  assert.match(SOURCE, /prefers-reduced-motion: reduce/, "the glide ignores a reduced-motion preference");
});
