// Health-score engine — the deterministic roll-up from metric percentiles to pillar scores and
// one composite rank. PURE, like the §9 evidence-tier core: it does math on numbers the percentile
// layer produced; it never diagnoses, never names a disease, and never calls an LLM.
//
// The `weight` on each metric is the EVIDENCE WEIGHT — the hook the "living score" turns. When new
// literature changes how strongly a metric (or an intervention behind it) matters, monitoring nudges
// the weight and the affected pillar re-scores. That re-scoring is what powers the "your rank changed
// because the science changed" notification — the moat. Here we just consume the weights.

import type { MetricKey } from "./percentile.ts";

export type Pillar =
  | "metabolic"
  | "cardiovascular"
  | "recovery"
  | "strength"
  | "pace_of_aging";

// Wellness framings ONLY — never disease-named ("Diabetes Risk" / "Cardiac Risk" are device claims).
export type PillarSpec = {
  readonly pillar: Pillar;
  readonly label: string;
  readonly metrics: readonly { readonly key: MetricKey; readonly weight: number }[];
};

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
    // Pace of Aging stands alone (epigenetic clock); locked until the user adds that test.
    pillar: "pace_of_aging",
    label: "Pace of Aging",
    metrics: [],
  },
];

// Wellness tiers — optimization language, never clinical ("normal/abnormal").
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

// One metric's contribution: its already-oriented percentile (from percentile.ts) keyed by metric.
export type MetricInput = {
  readonly key: MetricKey;
  readonly percentile: number;
};

export type PillarScore = {
  readonly pillar: Pillar;
  readonly label: string;
  // null = locked (no contributing metric entered yet) — the "add data to unlock" state.
  readonly percentile: number | null;
  readonly tier: Tier | null;
  readonly contributing: readonly MetricKey[];
};

export type ScoreResult = {
  // null when nothing has been entered yet.
  readonly composite: number | null;
  readonly tier: Tier | null;
  readonly pillars: readonly PillarScore[];
};

const round = (n: number): number => Math.round(n);

/** Weighted average of available metric percentiles for one pillar; null if none are present. */
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

/**
 * Roll metric percentiles up into pillar scores and one composite rank. The composite is the
 * simple average of the scored (non-locked) pillars, so adding a new pillar's data refines —
 * never penalizes — the overall rank.
 */
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
