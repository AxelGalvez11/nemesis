// A formula becoming points, and the algebra checker that came with it.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `1/x comes back as two segments`. Dropping the undefined
// point and carrying on joins −0.01 to +0.01 with a straight line across the asymptote — a picture
// of a function passing through the origin, which is the opposite of what the lesson is about. It
// is the kind of wrong that looks completely fine.

import assert from "node:assert/strict";
import { at, present } from "@/lib/test-support";
import test from "node:test";

import { curve, DEFAULT_SAMPLES, distributionCurve, sampledHistogram } from "./computed-series";
import { verifyEquivalence, verifyExpressionValue } from "./visual-verification";

function segments(expression: string, from: number, to: number, samples?: number) {
  const result = curve({ expression, from, to, ...(samples ? { samples } : {}) });
  assert.equal(result.ok, true, `${expression} was refused: ${result.ok === false ? result.detail : ""}`);
  return result.ok ? result.value : [];
}

// ─────────────────────────────────────────────────────────────── curves

test("a parabola comes back as one smooth run of points", () => {
  const drawn = segments("x^2", -3, 3);
  assert.equal(drawn.length, 1);
  assert.equal(at(drawn).points.length, DEFAULT_SAMPLES);
  // The maths is the maths: f(-3) = 9 and f(0) = 0.
  assert.ok(Math.abs(at(at(drawn).points).y - 9) < 1e-9);
  const middle = at(drawn).points.find((point) => Math.abs(point.x) < 0.05);
  assert.ok(middle && middle.y < 0.01);
});

test("🔴 1/x comes back as two segments, so no line is drawn across the asymptote", () => {
  const drawn = segments("1/x", -5, 5);
  assert.equal(drawn.length, 2, "the discontinuity did not split the curve");
  // Everything left of the gap is negative x, everything right is positive.
  assert.ok(at(drawn).points.every((point) => point.x < 0));
  assert.ok(at(drawn, 1).points.every((point) => point.x > 0));
});

test("a curve defined over only part of the range yields only that part", () => {
  const drawn = segments("sqrt(x)", -4, 4);
  assert.equal(drawn.length, 1);
  assert.ok(at(drawn).points.every((point) => point.x >= 0));
});

test("🔴 a formula with no value anywhere is refused rather than drawn empty", () => {
  // An empty chart looks like a rendering failure. The real fact is that the question was asked
  // about a region where the function does not exist.
  const result = curve({ expression: "sqrt(x)", from: -10, to: -1 });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "nothing-to-plot");
});

test("an unusable domain or sample count is refused by name", () => {
  assert.equal(curve({ expression: "x", from: 2, to: 2 }).ok === false, true);
  assert.equal(curve({ expression: "x", from: 0, samples: 2, to: 1 }).ok === false, true);
  assert.equal(curve({ expression: "x", from: 0, samples: 5000, to: 1 }).ok === false, true);
});

test("🔴 a refused expression carries its own reason out of the plotting layer", () => {
  const result = curve({ expression: "config({})", from: 0, to: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "expression-unknown-function");
});

test("a curve can use a variable that is not x", () => {
  const result = curve({ expression: "2*t + 1", from: 0, to: 5, variable: "t" });
  assert.equal(result.ok, true);
  // And the same expression is refused when the variable was not declared.
  assert.equal(curve({ expression: "2*t + 1", from: 0, to: 5 }).ok, false);
});

// ─────────────────────────────────────────────────────────────── distributions

test("a normal density curve is smooth and peaks at the mean", () => {
  const result = distributionCurve({ kind: "normal", mean: 5, sd: 1 }, 0, 10);
  assert.equal(result.ok, true);
  const points = result.ok ? at(result.value).points : [];
  const peak = points.reduce((best, point) => (point.y > best.y ? point : best), at(points));
  assert.ok(Math.abs(peak.x - 5) < 0.2, `the peak landed at ${peak.x}`);
});

test("🔴 a discrete distribution is sampled at whole numbers only", () => {
  // A binomial has no value at 3.5, and drawing one would invent a shape the mathematics lacks.
  const result = distributionCurve({ kind: "binomial", probability: 0.5, trials: 10 }, 0, 10);
  assert.equal(result.ok, true);
  const points = result.ok ? at(result.value).points : [];
  assert.equal(points.length, 11);
  assert.ok(points.every((point) => Number.isInteger(point.x)));
});

test("a distribution with bad parameters refuses through the plotting layer", () => {
  const result = distributionCurve({ kind: "normal", sd: -2 }, 0, 10);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "parameter-out-of-range");
});

// ─────────────────────────────────────────────────────────────── simulation

test("🔴 a simulation is reproducible, and says which seed produced it", () => {
  const first = sampledHistogram({ kind: "normal", mean: 0, sd: 1 }, 400, 99);
  const again = sampledHistogram({ kind: "normal", mean: 0, sd: 1 }, 400, 99);
  assert.equal(first.ok && again.ok, true);
  assert.deepEqual(first.ok ? first.value.points : null, again.ok ? again.value.points : undefined);
  assert.equal(first.ok && first.value.seed, 99);
});

test("a histogram keeps every draw it was given", () => {
  const result = sampledHistogram({ kind: "uniform", from: 0, to: 1 }, 300, 5, 10);
  assert.equal(result.ok, true);
  const total = result.ok ? result.value.points.reduce((sum, point) => sum + point.y, 0) : 0;
  assert.equal(total, 300);
});

// ─────────────────────────────────────────────────────────────── the algebra checker

test("a stated value of a formula is checked", () => {
  assert.equal(verifyExpressionValue("x^2 + 1", { x: 3 }, 10).ok, true);
  const wrong = verifyExpressionValue("x^2 + 1", { x: 3 }, 9);
  assert.equal(wrong.ok === false && wrong.reason, "value-mismatch");
  assert.match(wrong.ok === false ? wrong.detail : "", /evaluates to 10.*stated value is 9/);
});

test("🔴 a wrong expansion is caught, and the point that caught it is reported", () => {
  assert.equal(verifyEquivalence("(x+1)^2", "x^2 + 2*x + 1").ok, true);
  const wrong = verifyEquivalence("(x+1)^2", "x^2 + 1");
  assert.equal(wrong.ok, false);
  assert.equal(wrong.ok === false && wrong.reason, "not-equivalent");
  // "These are not equivalent" is an assertion; naming the point is a lesson.
  assert.match(wrong.ok === false ? wrong.detail : "", /at x = -?\d/);
});

test("🔴 a correct simplification with a hole in it still passes", () => {
  // `x/x` and `1` agree everywhere both are defined. Counting the hole at zero as a disagreement
  // would refuse a correct simplification.
  assert.equal(verifyEquivalence("x/x", "1").ok, true);
});

test("a trigonometric identity holds and a near-miss does not", () => {
  assert.equal(verifyEquivalence("sin(x)^2 + cos(x)^2", "1").ok, true);
  assert.equal(verifyEquivalence("sin(2*x)", "2*sin(x)").ok, false);
});

test("an unusable expression on either side is its own reason", () => {
  const left = verifyEquivalence("config({})", "1");
  assert.equal(left.ok === false && left.reason, "expression-refused");
  assert.match(left.ok === false ? left.detail : "", /^left:/);
  const right = verifyEquivalence("1", "a[0]");
  assert.equal(right.ok === false && right.reason, "expression-refused");
  assert.match(right.ok === false ? right.detail : "", /^right:/);
});

test("comparing where neither side exists is nothing-to-check, not agreement", () => {
  const result = verifyEquivalence("sqrt(x)", "sqrt(x)", "x", { from: -10, to: -5 });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "nothing-to-check");
});
