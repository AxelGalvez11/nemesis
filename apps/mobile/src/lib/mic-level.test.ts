// Deno unit tests (repo convention) for the live microphone-level channel.
// Run: deno test --no-check apps/mobile/src/lib/mic-level.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  currentMicLevel,
  normalizeMicLevel,
  normalizeRmsLevel,
  publishMicLevel,
  resetMicLevel,
  subscribeMicLevel,
} from "./mic-level.ts";

Deno.test("silence and inaudible input map to zero", () => {
  assertEquals(normalizeMicLevel(0), 0);
  assertEquals(normalizeMicLevel(-2), 0);
  assertEquals(normalizeMicLevel(-0.5), 0);
});

Deno.test("loud input clamps to one", () => {
  assertEquals(normalizeMicLevel(10), 1);
  assertEquals(normalizeMicLevel(42), 1);
});

Deno.test("mid-range input scales linearly", () => {
  assertEquals(normalizeMicLevel(5), 0.5);
  assertEquals(normalizeMicLevel(2.5), 0.25);
});

// Junk reads silent, never full: a spurious full-height spike looks like real
// audio and would be the more misleading failure.
Deno.test("junk values from the native stream read as silence", () => {
  assertEquals(normalizeMicLevel(Number.NaN), 0);
  assertEquals(normalizeMicLevel(Number.POSITIVE_INFINITY), 0);
  assertEquals(normalizeMicLevel(Number.NEGATIVE_INFINITY), 0);
});

Deno.test("subscribers receive published levels until they unsubscribe", () => {
  const seen: number[] = [];
  const stop = subscribeMicLevel((level) => seen.push(level));
  publishMicLevel(0.25);
  publishMicLevel(0.75);
  stop();
  publishMicLevel(1);
  assertEquals(seen, [0.25, 0.75]);
  resetMicLevel();
});

Deno.test("the latest level is readable without subscribing", () => {
  publishMicLevel(0.4);
  assertEquals(currentMicLevel(), 0.4);
  resetMicLevel();
  assertEquals(currentMicLevel(), 0);
});

Deno.test("multiple subscribers all hear the same level", () => {
  const a: number[] = [];
  const b: number[] = [];
  const stopA = subscribeMicLevel((level) => a.push(level));
  const stopB = subscribeMicLevel((level) => b.push(level));
  publishMicLevel(0.6);
  stopA();
  stopB();
  assertEquals(a, [0.6]);
  assertEquals(b, [0.6]);
  resetMicLevel();
});

Deno.test("RMS silence and garbage read as zero", () => {
  assertEquals(normalizeRmsLevel(0), 0);
  assertEquals(normalizeRmsLevel(-1), 0);
  assertEquals(normalizeRmsLevel(Number.NaN), 0);
  // Non-finite is garbage off a native event stream, not "infinitely loud" —
  // it reads as silence, same as normalizeMicLevel treats it.
  assertEquals(normalizeRmsLevel(Number.POSITIVE_INFINITY), 0);
});

Deno.test("RMS is mapped by loudness, not amplitude", () => {
  // The bug this exists to prevent: conversational speech RMS is ~0.01..0.2
  // linear, so a linear map would draw an almost flat waveform. In decibels
  // the same range spans most of the dial.
  const quiet = normalizeRmsLevel(0.01);
  const talking = normalizeRmsLevel(0.05);
  const loud = normalizeRmsLevel(0.4);
  assert(quiet > 0.05, `quiet speech read as ${quiet}`);
  assert(talking > quiet && loud > talking, `not monotonic: ${quiet}/${talking}/${loud}`);
  assert(loud > 0.8, `loud speech read as ${loud}`);
  // A linear reading of the same value would be indistinguishable from silence.
  assert(talking - 0.05 > 0.3, "decibel mapping is not pulling the range apart");
});

Deno.test("RMS output never leaves 0..1", () => {
  for (const rms of [1e-9, 0.0001, 0.5, 1, 12]) {
    const level = normalizeRmsLevel(rms);
    assert(level >= 0 && level <= 1, `${rms} -> ${level}`);
  }
});
