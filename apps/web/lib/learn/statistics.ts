// Distributions and simulation, with the randomness pinned (§45).
//
// 🔴 A SIMULATION THAT GIVES A DIFFERENT ANSWER EACH TIME CANNOT BE A TEACHING OBJECT. Every other
// representation on this Canvas is deterministic: the same equation draws the same picture, the same
// SMILES draws the same molecule, and a learner returning to a question sees what they saw before.
// Sampling would break that — so every sample here comes from a SEEDED generator and the seed is
// part of the request. Two learners on the same question see the same 500 points, and so does the
// same learner tomorrow.
//
// 🔴 THE DISTRIBUTIONS ARE IMPLEMENTED HERE AND THE SUMMARY STATISTICS ARE NOT. `simple-statistics`
// is a well-tested library and is used for mean, deviation, quantiles and regression — the functions
// where a subtle mistake is easy and hard to spot. The density functions below are four lines each
// and are exact, and writing them here means the shape drawn on screen and the numbers checked
// against it come from the same place rather than from two libraries' conventions.
//
// PURE, and no I/O. `Math.random` is never called — see `mulberry32`.

import { linearRegression, mean, quantile, standardDeviation } from "simple-statistics";

/**
 * A small, fast, deterministic generator.
 *
 * 🔴 `Math.random` IS NEVER USED IN THIS FILE AND MUST NOT BE. It cannot be seeded, so a plot built
 * from it is a different plot on every render — the learner's screen would change under them on a
 * re-render, and no evidence could be attributed to what they actually saw. mulberry32 is a few
 * lines, has no dependency, and is more than good enough for teaching-scale simulation; it is not
 * cryptographic and nothing here needs it to be.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type DistributionKind = "binomial" | "normal" | "poisson" | "uniform";

/**
 * Which parameters each distribution takes.
 *
 * 🔴 NAMED PARAMETERS RATHER THAN A POSITIONAL LIST, because a model writing `[5, 2]` for a normal
 * has a fifty-fifty chance of meaning the wrong one and nothing downstream could tell. `mean` and
 * `sd` cannot be swapped by accident.
 */
export interface DistributionSpec {
  readonly kind: DistributionKind;
  /** normal: centre. uniform: lower bound. */
  readonly mean?: number;
  /** normal: spread. Must be positive. */
  readonly sd?: number;
  /** uniform: bounds. */
  readonly from?: number;
  readonly to?: number;
  /** binomial: trials and per-trial probability. */
  readonly trials?: number;
  readonly probability?: number;
  /** poisson: expected count. */
  readonly rate?: number;
}

export type DistributionRefusal =
  | "unknown-distribution"
  | "parameter-missing"
  | "parameter-out-of-range"
  /** More draws than a teaching simulation needs. */
  | "too-many-samples";

export type DistributionResult<T> = { ok: true; value: T } | { detail: string; ok: false; reason: DistributionRefusal };

/**
 * The most draws one simulation may take.
 *
 * A teaching point about sampling variability lands at a few hundred; past this the learner is
 * watching a progress bar rather than a distribution, and the picture stops changing anyway.
 */
export const MAX_SAMPLES = 2000;

function fail<T>(reason: DistributionRefusal, detail: string): DistributionResult<T> {
  return { detail, ok: false, reason };
}

function positive(value: unknown, name: string): DistributionResult<number> {
  if (typeof value !== "number" || !Number.isFinite(value)) return fail("parameter-missing", `${name} is required`);
  if (value <= 0) return fail("parameter-out-of-range", `${name} must be greater than zero`);
  return { ok: true, value };
}

/**
 * The density (or probability) of a distribution at one point.
 *
 * Continuous distributions return a density and discrete ones return a probability. That difference
 * is real and is the caller's to know: a normal curve's height is not a probability, and a plot
 * axis labelled "probability" over a normal is wrong.
 */
export function densityAt(spec: DistributionSpec, at: number): DistributionResult<number> {
  if (spec.kind === "normal") {
    const sd = positive(spec.sd, "sd");
    if (!sd.ok) return sd;
    const centre = typeof spec.mean === "number" && Number.isFinite(spec.mean) ? spec.mean : 0;
    const z = (at - centre) / sd.value;
    return { ok: true, value: Math.exp(-0.5 * z * z) / (sd.value * Math.sqrt(2 * Math.PI)) };
  }

  if (spec.kind === "uniform") {
    const from = typeof spec.from === "number" ? spec.from : NaN;
    const to = typeof spec.to === "number" ? spec.to : NaN;
    if (!Number.isFinite(from) || !Number.isFinite(to)) return fail("parameter-missing", "uniform needs from and to");
    if (to <= from) return fail("parameter-out-of-range", "uniform needs to greater than from");
    return { ok: true, value: at >= from && at <= to ? 1 / (to - from) : 0 };
  }

  if (spec.kind === "binomial") {
    const trials = spec.trials;
    const probability = spec.probability;
    if (typeof trials !== "number" || !Number.isInteger(trials) || trials < 1) {
      return fail("parameter-missing", "binomial needs a whole number of trials of at least one");
    }
    if (trials > 1000) return fail("parameter-out-of-range", "binomial is bounded at 1000 trials");
    if (typeof probability !== "number" || probability < 0 || probability > 1) {
      return fail("parameter-out-of-range", "binomial needs a probability between 0 and 1");
    }
    if (!Number.isInteger(at) || at < 0 || at > trials) return { ok: true, value: 0 };
    // 🔴 COMPUTED IN LOGS. `choose(1000, 500)` overflows a double long before the probability does,
    // so the naive factorial form returns Infinity times zero for exactly the interesting cases.
    const logChoose = logFactorial(trials) - logFactorial(at) - logFactorial(trials - at);
    const logP = logChoose + at * Math.log(probability || Number.MIN_VALUE) + (trials - at) * Math.log(1 - probability || Number.MIN_VALUE);
    return { ok: true, value: Math.exp(logP) };
  }

  if (spec.kind === "poisson") {
    const rate = positive(spec.rate, "rate");
    if (!rate.ok) return rate;
    if (!Number.isInteger(at) || at < 0) return { ok: true, value: 0 };
    return { ok: true, value: Math.exp(-rate.value + at * Math.log(rate.value) - logFactorial(at)) };
  }

  return fail("unknown-distribution", `${JSON.stringify(spec.kind)} is not a distribution this Canvas draws`);
}

/** log(n!) via lgamma, so large binomials stay finite. */
function logFactorial(n: number): number {
  if (n < 2) return 0;
  // Stirling with the standard correction series — accurate to well past what a plot can show.
  const x = n + 1;
  return (
    (x - 0.5) * Math.log(x) -
    x +
    0.5 * Math.log(2 * Math.PI) +
    1 / (12 * x) -
    1 / (360 * x ** 3) +
    1 / (1260 * x ** 5)
  );
}

/**
 * Draw from a distribution, reproducibly.
 *
 * 🔴 THE SEED IS AN ARGUMENT, NOT AN OPTION. There is no default and no fallback to the clock: a
 * caller that forgets it cannot accidentally get an unrepeatable simulation, because it will not
 * compile.
 */
export function sample(spec: DistributionSpec, count: number, seed: number): DistributionResult<number[]> {
  if (!Number.isInteger(count) || count < 1) return fail("parameter-out-of-range", "count must be a whole number of at least one");
  if (count > MAX_SAMPLES) return fail("too-many-samples", `${count} draws, past the ${MAX_SAMPLES} a teaching simulation takes`);

  const random = mulberry32(seed);
  const drawn: number[] = [];

  if (spec.kind === "normal") {
    const sd = positive(spec.sd, "sd");
    if (!sd.ok) return sd;
    const centre = typeof spec.mean === "number" && Number.isFinite(spec.mean) ? spec.mean : 0;
    // Box–Muller, taking one of the two values it produces. Taking both would halve the calls and
    // couple consecutive draws, which is exactly the kind of subtle non-independence a statistics
    // lesson would then be teaching by accident.
    for (let index = 0; index < count; index += 1) {
      const u1 = Math.max(random(), Number.MIN_VALUE);
      const u2 = random();
      drawn.push(centre + sd.value * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
    }
    return { ok: true, value: drawn };
  }

  if (spec.kind === "uniform") {
    const from = typeof spec.from === "number" ? spec.from : NaN;
    const to = typeof spec.to === "number" ? spec.to : NaN;
    if (!Number.isFinite(from) || !Number.isFinite(to)) return fail("parameter-missing", "uniform needs from and to");
    if (to <= from) return fail("parameter-out-of-range", "uniform needs to greater than from");
    for (let index = 0; index < count; index += 1) drawn.push(from + random() * (to - from));
    return { ok: true, value: drawn };
  }

  if (spec.kind === "binomial") {
    const trials = spec.trials;
    const probability = spec.probability;
    if (typeof trials !== "number" || !Number.isInteger(trials) || trials < 1 || trials > 1000) {
      return fail("parameter-out-of-range", "binomial needs 1–1000 whole trials");
    }
    if (typeof probability !== "number" || probability < 0 || probability > 1) {
      return fail("parameter-out-of-range", "binomial needs a probability between 0 and 1");
    }
    for (let index = 0; index < count; index += 1) {
      let successes = 0;
      for (let trial = 0; trial < trials; trial += 1) if (random() < probability) successes += 1;
      drawn.push(successes);
    }
    return { ok: true, value: drawn };
  }

  if (spec.kind === "poisson") {
    const rate = positive(spec.rate, "rate");
    if (!rate.ok) return rate;
    const limit = Math.exp(-rate.value);
    for (let index = 0; index < count; index += 1) {
      let count_ = 0;
      let product = random();
      while (product > limit && count_ < 10_000) {
        product *= random();
        count_ += 1;
      }
      drawn.push(count_);
    }
    return { ok: true, value: drawn };
  }

  return fail("unknown-distribution", `${JSON.stringify(spec.kind)} cannot be sampled`);
}

/** Counts per bin, for drawing what was sampled. */
export function histogram(values: readonly number[], bins: number): Array<{ from: number; to: number; count: number }> {
  if (values.length === 0 || bins < 1) return [];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const width = (high - low) / bins || 1;
  const counts = Array.from({ length: bins }, (_, index) => ({
    count: 0,
    from: low + index * width,
    to: low + (index + 1) * width,
  }));
  for (const value of values) {
    // The last bin is closed at the top, so the maximum value lands somewhere rather than being
    // silently dropped — an off-by-one that loses exactly the extreme a lesson is pointing at.
    const index = Math.min(bins - 1, Math.floor((value - low) / width));
    const bin = counts[index];
    if (bin) bin.count += 1;
  }
  return counts;
}

/**
 * What a sample turned out to be.
 *
 * Straight from `simple-statistics` — these are the functions where a subtle mistake is easy and
 * hard to spot, and a tested library is worth more than four lines of our own.
 */
export function summarise(values: readonly number[]): {
  mean: number;
  median: number;
  sd: number;
  q1: number;
  q3: number;
} | null {
  if (values.length < 2) return null;
  const list = [...values];
  return {
    mean: mean(list),
    median: quantile(list, 0.5),
    q1: quantile(list, 0.25),
    q3: quantile(list, 0.75),
    sd: standardDeviation(list),
  };
}

/** The best-fit line through paired data, for a regression lesson. */
export function fitLine(points: readonly { x: number; y: number }[]): { intercept: number; slope: number } | null {
  if (points.length < 2) return null;
  const { b, m } = linearRegression(points.map((point) => [point.x, point.y]));
  return Number.isFinite(m) && Number.isFinite(b) ? { intercept: b, slope: m } : null;
}
