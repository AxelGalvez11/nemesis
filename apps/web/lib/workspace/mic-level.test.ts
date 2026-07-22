import assert from "node:assert/strict";
import { test } from "node:test";

import {
  currentMicLevel,
  normalizeMicLevel,
  publishMicLevel,
  resetMicLevel,
  subscribeMicLevel,
} from "./mic-level";

test("normalize clamps to 0..1 and survives junk from the audio callback", () => {
  assert.equal(normalizeMicLevel(0.5), 0.5);
  assert.equal(normalizeMicLevel(0), 0);
  assert.equal(normalizeMicLevel(1), 1);
  // Out of range clamps rather than throwing — this rides a live audio stream.
  assert.equal(normalizeMicLevel(-0.3), 0);
  assert.equal(normalizeMicLevel(4), 1);
  // Non-finite readings are junk, not "maximum volume" — they must read as
  // silence rather than slamming the meter to full scale. Matches mobile's
  // normalizeMicLevel, which guards finiteness before the ceiling too.
  assert.equal(normalizeMicLevel(Number.NaN), 0);
  assert.equal(normalizeMicLevel(Number.POSITIVE_INFINITY), 0);
  assert.equal(normalizeMicLevel(Number.NEGATIVE_INFINITY), 0);
});

test("subscribers receive the normalized level, not the raw reading", () => {
  const seen: number[] = [];
  const unsubscribe = subscribeMicLevel((level) => seen.push(level));
  publishMicLevel(0.4);
  publishMicLevel(9);
  publishMicLevel(Number.NaN);
  unsubscribe();
  publishMicLevel(0.9);
  assert.deepEqual(seen, [0.4, 1, 0]);
  resetMicLevel();
});

test("unsubscribing stops delivery so an unmounted waveform cannot leak", () => {
  let calls = 0;
  const unsubscribe = subscribeMicLevel(() => { calls += 1; });
  publishMicLevel(0.2);
  unsubscribe();
  publishMicLevel(0.8);
  assert.equal(calls, 1);
  resetMicLevel();
});

test("reset silences the meter so a stopped recorder cannot leave bars frozen", () => {
  publishMicLevel(0.75);
  assert.equal(currentMicLevel(), 0.75);
  resetMicLevel();
  assert.equal(currentMicLevel(), 0);
});
