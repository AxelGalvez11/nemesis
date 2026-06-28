import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { METRICS, percentileFor } from "./percentile.ts";

Deno.test("a value at the reference median lands at the 50th percentile", () => {
  assertEquals(percentileFor(METRICS.vo2max, 45, "male", "30-39"), 50);
});

Deno.test("higher-is-better metric: a higher value ranks higher", () => {
  const low = percentileFor(METRICS.vo2max, 39, "male", "30-39");
  const high = percentileFor(METRICS.vo2max, 51, "male", "30-39");
  assertEquals(low, 25);
  assertEquals(high, 75);
  assert(high > low);
});

Deno.test("lower-is-better metric is inverted", () => {
  assertEquals(percentileFor(METRICS.hba1c, 5.0, "male", "30-39"), 75);
  assertEquals(percentileFor(METRICS.hba1c, 5.5, "male", "30-39"), 25);
});

Deno.test("piecewise interpolation between anchors is monotonic", () => {
  const a = percentileFor(METRICS.apob, 74, "male", "30-39");
  const mid = percentileFor(METRICS.apob, 81, "male", "30-39");
  const b = percentileFor(METRICS.apob, 88, "male", "30-39");
  assertEquals(a, 75);
  assertEquals(b, 50);
  assert(a > mid && mid > b);
});

Deno.test("values are clamped to the 1-99 range at the extremes", () => {
  const veryFit = percentileFor(METRICS.vo2max, 200, "male", "30-39");
  const veryUnfit = percentileFor(METRICS.vo2max, 5, "male", "30-39");
  assert(veryFit <= 99 && veryFit >= 90);
  assert(veryUnfit >= 1 && veryUnfit <= 10);
});

Deno.test("sex-specific references differ", () => {
  const female = percentileFor(METRICS.grip_strength, 31, "female", "30-39");
  const male = percentileFor(METRICS.grip_strength, 31, "male", "30-39");
  assertEquals(female, 50);
  assert(male < female);
});

Deno.test("unknown age band falls back to the seed 30-39 band", () => {
  const banded = percentileFor(METRICS.vo2max, 45, "male", "30-39");
  const fallback = percentileFor(METRICS.vo2max, 45, "male", "70+");
  assertEquals(banded, fallback);
});
