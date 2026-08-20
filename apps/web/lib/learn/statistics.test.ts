// Distributions, and the seed that makes a simulation a teaching object.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `the same seed gives the same sample`. Without it, a
// statistics lesson changes under the learner on every re-render, evidence cannot be attributed to
// what they actually saw, and a question they return to tomorrow is a different question.

import assert from "node:assert/strict";
import test from "node:test";

import { densityAt, fitLine, histogram, MAX_SAMPLES, sample, summarise } from "./statistics";

function drawn(spec: Parameters<typeof sample>[0], count: number, seed: number): number[] {
  const result = sample(spec, count, seed);
  assert.equal(result.ok, true, `sampling failed: ${result.ok === false ? result.detail : ""}`);
  return result.ok ? result.value : [];
}

// ───────────────────────────────────────────────────────────────── determinism

test("🔴 the same seed gives the same sample, and a different seed does not", () => {
  const a = drawn({ kind: "normal", mean: 0, sd: 1 }, 50, 42);
  const b = drawn({ kind: "normal", mean: 0, sd: 1 }, 50, 42);
  const c = drawn({ kind: "normal", mean: 0, sd: 1 }, 50, 43);
  assert.deepEqual(a, b, "the same seed produced a different sample");
  assert.notDeepEqual(a, c, "two seeds produced identical samples");
});

test("🔴 Math.random is never reached, so nothing here can drift between renders", () => {
  const original = Math.random;
  Math.random = () => {
    throw new Error("Math.random was called");
  };
  try {
    for (const kind of ["normal", "uniform", "binomial", "poisson"] as const) {
      const spec = { from: 0, kind, mean: 0, probability: 0.5, rate: 3, sd: 1, to: 1, trials: 10 };
      assert.equal(sample(spec, 20, 7).ok, true, `${kind} reached Math.random`);
    }
  } finally {
    Math.random = original;
  }
});

// ───────────────────────────────────────────────────────────────── the distributions are right

test("a normal density peaks at its mean and is symmetric", () => {
  const at = (x: number) => {
    const result = densityAt({ kind: "normal", mean: 10, sd: 2 }, x);
    return result.ok ? result.value : NaN;
  };
  assert.ok(at(10) > at(11) && at(11) > at(14));
  assert.ok(Math.abs(at(8) - at(12)) < 1e-12);
  // The standard normal's peak is a known constant, so this is a real check rather than a shape one.
  const standard = densityAt({ kind: "normal", mean: 0, sd: 1 }, 0);
  assert.ok(standard.ok && Math.abs(standard.value - 1 / Math.sqrt(2 * Math.PI)) < 1e-12);
});

test("a binomial sums to one across its support, including where factorials would overflow", () => {
  for (const trials of [10, 200, 1000]) {
    let total = 0;
    for (let k = 0; k <= trials; k += 1) {
      const p = densityAt({ kind: "binomial", probability: 0.5, trials }, k);
      assert.equal(p.ok, true);
      if (p.ok) total += p.value;
    }
    // 🔴 THE 1000-TRIAL CASE IS THE POINT. `choose(1000, 500)` overflows a double, so a naive
    // factorial implementation returns Infinity here and the whole curve becomes NaN.
    assert.ok(Math.abs(total - 1) < 1e-6, `binomial(${trials}) summed to ${total}`);
  }
});

test("a poisson sums to one and is centred near its rate", () => {
  let total = 0;
  for (let k = 0; k <= 60; k += 1) {
    const p = densityAt({ kind: "poisson", rate: 8 }, k);
    if (p.ok) total += p.value;
  }
  assert.ok(Math.abs(total - 1) < 1e-6, `poisson summed to ${total}`);
});

test("a uniform density is flat inside its bounds and zero outside", () => {
  const spec = { from: 2, kind: "uniform" as const, to: 6 };
  const inside = densityAt(spec, 3);
  const alsoInside = densityAt(spec, 5);
  const outside = densityAt(spec, 9);
  assert.ok(inside.ok && alsoInside.ok && Math.abs(inside.value - alsoInside.value) < 1e-12);
  assert.ok(inside.ok && Math.abs(inside.value - 0.25) < 1e-12);
  assert.ok(outside.ok && outside.value === 0);
});

test("samples land where the distribution says they should", () => {
  const normal = summarise(drawn({ kind: "normal", mean: 100, sd: 15 }, 2000, 1));
  assert.ok(normal && Math.abs(normal.mean - 100) < 2, `mean drifted to ${normal?.mean}`);
  assert.ok(normal && Math.abs(normal.sd - 15) < 2, `sd drifted to ${normal?.sd}`);

  const binomial = summarise(drawn({ kind: "binomial", probability: 0.5, trials: 20 }, 2000, 2));
  assert.ok(binomial && Math.abs(binomial.mean - 10) < 1);

  const poisson = summarise(drawn({ kind: "poisson", rate: 4 }, 2000, 3));
  assert.ok(poisson && Math.abs(poisson.mean - 4) < 0.5);
});

// ───────────────────────────────────────────────────────────────── bounds and refusals

test("missing or impossible parameters are refused by name", () => {
  assert.equal(densityAt({ kind: "normal" }, 0).ok, false);
  assert.equal(densityAt({ kind: "normal", sd: -1 }, 0).ok === false && (densityAt({ kind: "normal", sd: -1 }, 0) as { reason: string }).reason, "parameter-out-of-range");
  assert.equal(densityAt({ from: 5, kind: "uniform", to: 5 }, 5).ok, false);
  assert.equal(densityAt({ kind: "binomial", probability: 2, trials: 5 }, 1).ok, false);
  assert.equal(densityAt({ kind: "chi-squared" as never }, 1).ok === false && (densityAt({ kind: "chi-squared" as never }, 1) as { reason: string }).reason, "unknown-distribution");
});

test("a runaway simulation is bounded", () => {
  const result = sample({ kind: "normal", mean: 0, sd: 1 }, MAX_SAMPLES + 1, 1);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "too-many-samples");
  assert.equal(sample({ kind: "normal", mean: 0, sd: 1 }, MAX_SAMPLES, 1).ok, true);
});

// ───────────────────────────────────────────────────────────────── histogram and regression

test("🔴 the largest value lands in a bin rather than being dropped", () => {
  // The off-by-one that loses exactly the extreme a lesson is pointing at.
  const bins = histogram([1, 2, 3, 4, 5], 4);
  assert.equal(bins.reduce((total, bin) => total + bin.count, 0), 5);
  assert.equal(bins.length, 4);
});

test("a histogram of nothing is nothing rather than a crash", () => {
  assert.deepEqual(histogram([], 5), []);
  assert.deepEqual(histogram([1, 2], 0), []);
});

test("a line fits through points that lie on one", () => {
  const fit = fitLine([
    { x: 0, y: 1 },
    { x: 1, y: 3 },
    { x: 2, y: 5 },
  ]);
  assert.ok(fit && Math.abs(fit.slope - 2) < 1e-9 && Math.abs(fit.intercept - 1) < 1e-9);
  assert.equal(fitLine([{ x: 1, y: 1 }]), null);
});

test("summarising fewer than two values is null rather than a fake statistic", () => {
  assert.equal(summarise([]), null);
  assert.equal(summarise([5]), null);
});
