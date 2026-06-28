import type { MetricKey } from "./percentile.ts";

export type Pillar =
  | "metabolic"
  | "cardiovascular"
  | "recovery"
  | "strength"
  | "pace_of_aging";

export interface PillarSpec {
  readonly pillar: Pillar;
  readonly label: string;
  readonly metrics: readonly { readonly key: MetricKey; readonly weight: number }[];
}

export const PILLARS: readonly PillarSpec[] = [
  {
    pillar: "metabolic",
    label: "Metabolic",
    metrics: [
      { key: "vo2max", weight: 1.0 },
      { key: "hba1c", weight: 1.0 },
    ],
  },
  {
    pillar: "cardiovascular",
    label: "Cardiovascular",
    metrics: [
      { key: "apob", weight: 1.0 },
      { key: "hscrp", weight: 0.8 },
      { key: "resting_hr", weight: 0.6 },
    ],
  },
  {
    pillar: "recovery",
    label: "Recovery",
    metrics: [
      { key: "hrv", weight: 1.0 },
      { key: "sleep_efficiency", weight: 0.8 },
    ],
  },
  {
    pillar: "strength",
    label: "Strength",
    metrics: [
      { key: "grip_strength", weight: 1.0 },
      { key: "lean_mass_index", weight: 0.9 },
    ],
  },
  {
    pillar: "pace_of_aging",
    label: "Pace of Aging",
    metrics: [],
  },
];

export type Tier = "building" | "solid" | "strong" | "optimized" | "elite";

export function tierFor(percentile: number): Tier {
  if (percentile >= 90) return "elite";
  if (percentile >= 75) return "optimized";
  if (percentile >= 60) return "strong";
  if (percentile >= 40) return "solid";
  return "building";
}

export const TIER_LABEL: Readonly<Record<Tier, string>> = {
  building: "Building",
  solid: "Solid",
  strong: "Strong",
  optimized: "Optimized",
  elite: "Elite",
};

export interface MetricInput {
  readonly key: MetricKey;
  readonly percentile: number;
}

export interface PillarScore {
  readonly pillar: Pillar;
  readonly label: string;
  readonly percentile: number | null;
  readonly tier: Tier | null;
  readonly contributing: readonly MetricKey[];
}

export interface ScoreResult {
  readonly composite: number | null;
  readonly tier: Tier | null;
  readonly pillars: readonly PillarScore[];
}

const round = (n: number): number => Math.round(n);

function scorePillar(spec: PillarSpec, byKey: ReadonlyMap<MetricKey, number>): PillarScore {
  const present = spec.metrics.filter((m) => byKey.has(m.key));
  if (present.length === 0) {
    return { pillar: spec.pillar, label: spec.label, percentile: null, tier: null, contributing: [] };
  }
  const totalWeight = present.reduce((sum, m) => sum + m.weight, 0);
  const weighted = present.reduce((sum, m) => sum + (byKey.get(m.key) as number) * m.weight, 0);
  const percentile = round(weighted / totalWeight);
  return {
    pillar: spec.pillar,
    label: spec.label,
    percentile,
    tier: tierFor(percentile),
    contributing: present.map((m) => m.key),
  };
}

export function scoreHealth(
  inputs: readonly MetricInput[],
  pillars: readonly PillarSpec[] = PILLARS,
): ScoreResult {
  const byKey = new Map<MetricKey, number>(inputs.map((i) => [i.key, i.percentile]));
  const pillarScores = pillars.map((spec) => scorePillar(spec, byKey));
  const scored = pillarScores.filter((p) => p.percentile !== null);
  if (scored.length === 0) {
    return { composite: null, tier: null, pillars: pillarScores };
  }
  const composite = round(
    scored.reduce((sum, p) => sum + (p.percentile as number), 0) / scored.length,
  );
  return { composite, tier: tierFor(composite), pillars: pillarScores };
}
