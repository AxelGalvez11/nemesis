import assert from "node:assert/strict";
import test from "node:test";

import { barHeight, emptyWaveform, pushWaveBar, WAVEFORM_BARS } from "./waveform-history";

test("the strip starts full, so the canvas never flashes empty", () => {
  const bars = emptyWaveform();
  assert.equal(bars.length, WAVEFORM_BARS);
  assert.ok(bars.every((bar) => bar.level === 0 && !bar.captured));
});

test("pushing past the width drops the oldest and keeps the newest", () => {
  let bars = emptyWaveform(4);
  for (const level of [0.1, 0.2, 0.3, 0.4, 0.5]) bars = pushWaveBar(bars, { captured: true, level }, 4);
  assert.equal(bars.length, 4);
  assert.deepEqual(bars.map((bar) => bar.level), [0.2, 0.3, 0.4, 0.5]);
});

// The canvas reads this from an animation frame while the recorder writes it
// from a timer. Mutating in place would let it paint a half-updated history.
test("pushing returns a new array and leaves the old one alone", () => {
  const before = emptyWaveform(3);
  const after = pushWaveBar(before, { captured: true, level: 0.7 }, 3);
  assert.notEqual(before, after);
  assert.ok(before.every((bar) => bar.level === 0), "the array handed in was mutated");
});

test("a bad level is clamped rather than drawn off the top of the canvas", () => {
  const bars = pushWaveBar([], { captured: true, level: Number.NaN }, 4);
  assert.equal(bars[0]?.level, 0);
  assert.equal(pushWaveBar([], { captured: true, level: 9 }, 4)[0]?.level, 1);
  assert.equal(pushWaveBar([], { captured: true, level: -3 }, 4)[0]?.level, 0);
});

// A bar of zero height reads as "broken", and proving something is still
// running is the entire reason this component exists.
test("silence still draws a line, never nothing", () => {
  assert.ok(barHeight(0, 60) >= 2);
  assert.ok(barHeight(Number.NaN, 60) >= 2);
});

test("bar height is perceptual, so ordinary speech uses the middle of the box", () => {
  const quiet = barHeight(0.04, 100);
  const speech = barHeight(0.25, 100);
  const loud = barHeight(1, 100);
  assert.ok(speech > quiet && loud > speech);
  assert.equal(loud, 100, "the loudest sample fills the box");
  // Linear would leave 0.25 at a quarter height; the square root lifts it to
  // half, which is where a talking voice should sit.
  assert.equal(speech, 50);
});

test("whether a slice was captured survives the push", () => {
  const bars = pushWaveBar(emptyWaveform(2), { captured: false, level: 0.02 }, 2);
  assert.equal(bars.at(-1)?.captured, false);
  assert.equal(pushWaveBar(bars, { captured: true, level: 0.4 }, 2).at(-1)?.captured, true);
});
