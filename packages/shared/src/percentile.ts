export type Sex = "male" | "female";
export type AgeBand = "18-29" | "30-39" | "40-49" | "50-59" | "60-69" | "70+";
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

export interface Breakpoints {
  readonly p10: number;
  readonly p25: number;
  readonly p50: number;
  readonly p75: number;
  readonly p90: number;
}

export interface MetricSpec {
  readonly key: MetricKey;
  readonly label: string;
  readonly unit: string;
  readonly direction: Direction;
  readonly ref: Readonly<Record<string, Breakpoints>>;
}

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
  vo2max: seed("vo2max", "VO2 max", "ml/kg/min", "higher_better",
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
  lean_mass_index: seed("lean_mass_index", "Lean mass index", "kg/m2", "higher_better",
    { p10: 16.5, p25: 17.6, p50: 18.8, p75: 20.0, p90: 21.2 },
    { p10: 13.5, p25: 14.4, p50: 15.4, p75: 16.5, p90: 17.6 }),
  sleep_efficiency: seed("sleep_efficiency", "Sleep efficiency", "%", "higher_better",
    { p10: 78, p25: 83, p50: 88, p75: 92, p90: 95 },
    { p10: 79, p25: 84, p50: 89, p75: 93, p90: 96 }),
};

export function referenceFor(spec: MetricSpec, sex: Sex, ageBand: AgeBand): Breakpoints {
  const ref = spec.ref[`${sex}:${ageBand}`] ?? spec.ref[`${sex}:30-39`] ?? spec.ref["male:30-39"];
  if (!ref) throw new Error(`no reference distribution for metric "${spec.key}"`);
  return ref;
}

const ANCHORS: readonly (readonly [number, keyof Breakpoints])[] = [
  [10, "p10"],
  [25, "p25"],
  [50, "p50"],
  [75, "p75"],
  [90, "p90"],
];

const clampPercentile = (p: number): number => Math.max(1, Math.min(99, Math.round(p)));

function rawPercentile(value: number, bp: Breakpoints): number {
  const points = ANCHORS.map(([pct, key]): [number, number] => [pct, bp[key]]);
  const [firstPct, firstVal] = points[0]!;
  const [secondPct, secondVal] = points[1]!;
  if (value <= firstVal) {
    const slope = (secondPct - firstPct) / (secondVal - firstVal);
    return firstPct + (value - firstVal) * slope;
  }

  for (let i = 0; i < points.length - 1; i++) {
    const [pLo, vLo] = points[i]!;
    const [pHi, vHi] = points[i + 1]!;
    if (value <= vHi) {
      const t = (value - vLo) / (vHi - vLo);
      return pLo + t * (pHi - pLo);
    }
  }

  const [lastPct, lastVal] = points[points.length - 1]!;
  const [prevPct, prevVal] = points[points.length - 2]!;
  const slope = (lastPct - prevPct) / (lastVal - prevVal);
  return lastPct + (value - lastVal) * slope;
}

export function percentileFor(spec: MetricSpec, value: number, sex: Sex, ageBand: AgeBand): number {
  const bp = referenceFor(spec, sex, ageBand);
  const raw = rawPercentile(value, bp);
  const oriented = spec.direction === "higher_better" ? raw : 100 - raw;
  return clampPercentile(oriented);
}
