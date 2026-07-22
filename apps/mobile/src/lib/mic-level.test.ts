// Deno unit tests (repo convention) for the live microphone-level channel.
// Run: deno test --no-check apps/mobile/src/lib/mic-level.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  currentMicLevel,
  normalizeMicLevel,
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
