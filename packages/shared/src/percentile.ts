// Percentile lookup against a reference population (the "where do you stand" core).
//
// This is the data-visualization primitive the whole Score feature is built on: given a
// raw metric value for a person (age band + sex), return the percentile they sit at in the
// reference population. It is INTENTIONALLY non-diagnostic — it compares you to a population,
// never to a clinical threshold, and emits no disease state.
//
// ┌─ HONESTY NOTE (load-bearing) ───────────────────────────────────────────────────────────┐
// │ The `REFERENCE` breakpoints below are ILLUSTRATIVE SEED VALUES, not authoritative data.   │
// │ They make the engine runnable end to end so the product can be seen and felt. Before any  │
// │ user-facing launch they MUST be replaced with real distributions:                         │
// │   • blood markers, grip strength, body composition  → NHANES (CDC public dataset)         │
// │   • VO2 max, HRV, sleep efficiency                   → published age/sex cohort norms      │
// │ The MATH here is final; only the numbers change. Age-banding is also collapsed to a single │
// │ seed band for now (lookup falls back to "30-39") — real data restores per-band curves.    │
// └────────────────────────────────────────────────────────────────────────────────────────────┘

export type Sex = "male" | "female";
export type AgeBand = "18-29" | "30-39" | "40-49" | "50-59" | "60-69" | "70+";

// Whether a higher raw value is better (VO2 max, grip strength) or worse (HbA1c, resting HR).
// This is what lets one engine rank "more is better" and "less is better" metrics on one 0-100 scale.
export type Direction = "higher_better" | "lower_better";

export type MetricKey =
  | "vo2max"
  | "hba1c"
  | "apob"
  | "hscrp"
  | "resting_hr"
  | "hrv"
  | "grip_strength"
  | "lean_mass_index"
  | "sleep_efficiency";

// Raw values at the 10/25/50/75/90th percentile of the reference population, on the metric's
// natural scale (always ascending in raw value; `direction` decides which end is "good").
export type Breakpoints = {
  readonly p10: number;
  readonly p25: number;
  readonly p50: number;
  readonly p75: number;
  readonly p90: number;
};

export type MetricSpec = {
  readonly key: MetricKey;
  readonly label: string;
  readonly unit: string;
  readonly direction: Direction;
  // Reference distribution keyed by `${sex}:${ageBand}`. Seed data currently fills only the
  // "30-39" band per sex; `referenceFor` falls back to it for any age until real data lands.
  readonly ref: Readonly<Record<string, Breakpoints>>;
};

// ── Seed reference distributions (ILLUSTRATIVE — see HONESTY NOTE above) ─────────────────────
const seed = (
  key: MetricKey,
  label: string,
  unit: string,
  direction: Direction,
  male: Breakpoints,
  female: Breakpoints,
): MetricSpec => ({
  key,
  label,
  unit,
  direction,
  ref: { "male:30-39": male, "female:30-39": female },
});

export const METRICS: Readonly<Record<MetricKey, MetricSpec>> = {
  vo2max: seed("vo2max", "VO₂ max", "ml/kg/min", "higher_better",
    { p10: 33, p25: 39, p50: 45, p75: 51, p90: 56 },
    { p10: 28, p25: 33, p50: 38, p75: 44, p90: 49 }),
  hba1c: seed("hba1c", "HbA1c", "%", "lower_better",
    { p10: 4.8, p25: 5.0, p50: 5.2, p75: 5.5, p90: 5.8 },
    { p10: 4.8, p25: 5.0, p50: 5.2, p75: 5.5, p90: 5.8 }),
  apob: seed("apob", "ApoB", "mg/dL", "lower_better",
    { p10: 62, p25: 74, p50: 88, p75: 104, p90: 120 },
    { p10: 58, p25: 70, p50: 83, p75: 98, p90: 114 }),
  hscrp: seed("hscrp", "hs-CRP", "mg/L", "lower_better",
    { p10: 0.3, p25: 0.6, p50: 1.1, p75: 2.2, p90: 4.0 },
    { p10: 0.3, p25: 0.7, p50: 1.3, p75: 2.6, p90: 4.6 }),
  resting_hr: seed("resting_hr", "Resting HR", "bpm", "lower_better",
    { p10: 52, p25: 57, p50: 63, p75: 70, p90: 77 },
    { p10: 55, p25: 60, p50: 66, p75: 73, p90: 80 }),
  hrv: seed("hrv", "HRV (RMSSD)", "ms", "higher_better",
    { p10: 24, p25: 33, p50: 45, p75: 60, p90: 78 },
    { p10: 26, p25: 35, p50: 47, p75: 62, p90: 80 }),
  grip_strength: seed("grip_strength", "Grip strength", "kg", "higher_better",
    { p10: 38, p25: 44, p50: 50, p75: 56, p90: 62 },
    { p10: 23, p25: 27, p50: 31, p75: 35, p90: 40 }),
  lean_mass_index: seed("lean_mass_index", "Lean mass index", "kg/m²", "higher_better",
    { p10: 16.5, p25: 17.6, p50: 18.8, p75: 20.0, p90: 21.2 },
    { p10: 13.5, p25: 14.4, p50: 15.4, p75: 16.5, p90: 17.6 }),
  sleep_efficiency: seed("sleep_efficiency", "Sleep efficiency", "%", "higher_better",
    { p10: 78, p25: 83, p50: 88, p75: 92, p90: 95 },
    { p10: 79, p25: 84, p50: 89, p75: 93, p90: 96 }),
};

/** Resolve the reference distribution for a person, falling back to the seed band when needed. */
export function referenceFor(spec: MetricSpec, sex: Sex, ageBand: AgeBand): Breakpoints {
  const ref = spec.ref[`${sex}:${ageBand}`] ?? spec.ref[`${sex}:30-39`] ?? spec.ref["male:30-39"];
  if (!ref) throw new Error(`no reference distribution for metric "${spec.key}"`);
  return ref;
}

// Anchor percentiles for the breakpoints, ascending.
const ANCHORS: readonly (readonly [number, keyof Breakpoints])[] = [
  [10, "p10"],
  [25, "p25"],
  [50, "p50"],
  [75, "p75"],
  [90, "p90"],
];

const clampPercentile = (p: number): number => Math.max(1, Math.min(99, Math.round(p)));

/**
 * Map a raw value to a 0-100 "raw percentile" (before directionality) by piecewise-linear
 * interpolation across the five anchor breakpoints, extrapolating linearly beyond the ends.
 */
function rawPercentile(value: number, bp: Breakpoints): number {
  const points = ANCHORS.map(([pct, key]): [number, number] => [pct, bp[key]]);

  // Below the lowest anchor: extrapolate down using the first segment's slope.
  const [firstPct, firstVal] = points[0]!;
  const [secondPct, secondVal] = points[1]!;
  if (value <= firstVal) {
    const slope = (secondPct - firstPct) / (secondVal - firstVal);
    return firstPct + (value - firstVal) * slope;
  }

  // Within the known range: find the bracketing segment and interpolate.
  for (let i = 0; i < points.length - 1; i++) {
    const [pLo, vLo] = points[i]!;
    const [pHi, vHi] = points[i + 1]!;
    if (value <= vHi) {
      const t = (value - vLo) / (vHi - vLo);
      return pLo + t * (pHi - pLo);
    }
  }

  // Above the highest anchor: extrapolate up using the last segment's slope.
  const [lastPct, lastVal] = points[points.length - 1]!;
  const [prevPct, prevVal] = points[points.length - 2]!;
  const slope = (lastPct - prevPct) / (lastVal - prevVal);
  return lastPct + (value - lastVal) * slope;
}

/**
 * The percentile a person sits at for a metric, 1-99. Applies directionality so the returned
 * number always means "higher is better" (e.g. low HbA1c → high percentile). Non-diagnostic.
 */
export function percentileFor(spec: MetricSpec, value: number, sex: Sex, ageBand: AgeBand): number {
  const bp = referenceFor(spec, sex, ageBand);
  const raw = rawPercentile(value, bp);
  const oriented = spec.direction === "higher_better" ? raw : 100 - raw;
  return clampPercentile(oriented);
}
