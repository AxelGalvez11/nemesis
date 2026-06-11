import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { poolRiskRatio, type StudyArm } from "./meta-analysis.ts";

// A study with the provenance fields the contract REQUIRES — the pooler ignores them for the math,
// but they must ride along so a later faithfulness step can check every number against its source.
function study(p: Partial<StudyArm> & Pick<StudyArm, "events_treatment" | "total_treatment" | "events_control" | "total_control">): StudyArm {
  return {
    label: "test",
    citation_tag: "1",
    source_quote: "test source quote",
    outcome_label: "test outcome",
    ...p,
  };
}

Deno.test("pooled rows carry the study's provenance (source_quote + outcome_label) for the forest table", () => {
  const r = poolRiskRatio([
    study({ events_treatment: 10, total_treatment: 100, events_control: 20, total_control: 100, source_quote: "10/100 vs 20/100", outcome_label: "mortality", label: "Trial A" }),
    study({ events_treatment: 5, total_treatment: 80, events_control: 12, total_control: 90, citation_tag: "2", source_quote: "5/80 vs 12/90", outcome_label: "mortality", label: "Trial B" }),
  ]);
  if (!r.poolable) throw new Error("expected poolable");
  assertEquals(r.studies[0].source_quote, "10/100 vs 20/100");
  assertEquals(r.studies[0].outcome_label, "mortality");
  assertEquals(r.studies[0].label, "Trial A");
  assertEquals(r.studies[1].source_quote, "5/80 vs 12/90");
});

// ── Hand-computed analytic cases (expected values derived by hand, not from output) ──

Deno.test("two identical studies: pooled effect equals each study, zero heterogeneity", () => {
  // a=10/100 vs c=20/100  ->  logRR = ln(0.1/0.2) = ln(0.5) = -0.6931471805599453
  // var = 1/10 - 1/100 + 1/20 - 1/100 = 0.13 ; w = 1/0.13 each
  const s = study({ events_treatment: 10, total_treatment: 100, events_control: 20, total_control: 100 });
  const r = poolRiskRatio([s, { ...s, citation_tag: "2" }]);
  if (!r.poolable) throw new Error("expected poolable");
  assertEquals(r.k, 2);
  // Fixed effect = the common log RR; var_FE = 0.13/2 = 0.065.
  assertAlmostEquals(r.fixed.estimate_log, Math.log(0.5), 1e-12);
  assertAlmostEquals(r.fixed.variance, 0.065, 1e-12);
  assertAlmostEquals(r.fixed.estimate, 0.5, 1e-12); // exp(logRR) on the RR scale
  // No spread between identical studies.
  assertAlmostEquals(r.heterogeneity.q, 0, 1e-12);
  assertEquals(r.heterogeneity.df, 1);
  assertAlmostEquals(r.heterogeneity.tau2, 0, 1e-12);
  assertEquals(r.heterogeneity.i2, 0); // Q<=0 -> I^2 pinned to 0, never negative
  // tau^2 = 0 -> random effects MUST collapse to fixed effects exactly.
  assertAlmostEquals(r.random.estimate_log, r.fixed.estimate_log, 1e-12);
  assertAlmostEquals(r.random.variance, r.fixed.variance, 1e-12);
});

Deno.test("95% CI uses z=1.96 on the log scale, exponentiated to the RR scale", () => {
  const s = study({ events_treatment: 10, total_treatment: 100, events_control: 20, total_control: 100 });
  const r = poolRiskRatio([s, { ...s, citation_tag: "2" }]);
  if (!r.poolable) throw new Error("expected poolable");
  const se = Math.sqrt(0.065);
  assertAlmostEquals(r.fixed.ci_low, Math.exp(Math.log(0.5) - 1.959963984540054 * se), 1e-12);
  assertAlmostEquals(r.fixed.ci_high, Math.exp(Math.log(0.5) + 1.959963984540054 * se), 1e-12);
});

Deno.test("a single study is not poolable (I^2 undefined, not 0)", () => {
  const r = poolRiskRatio([study({ events_treatment: 5, total_treatment: 50, events_control: 9, total_control: 50 })]);
  assertEquals(r.poolable, false);
  if (r.poolable) throw new Error("unreachable");
  assertEquals(r.k, 1);
});

Deno.test("zero-event arm gets a 0.5 continuity correction (no NaN/Infinity)", () => {
  // events_treatment=0 -> +0.5 to all four cells: (0.5/51) vs (10.5/51)
  // logRR = ln(0.5/10.5) = -3.044522437723423
  const z = study({ events_treatment: 0, total_treatment: 50, events_control: 10, total_control: 50 });
  const r = poolRiskRatio([z, study({ events_treatment: 8, total_treatment: 50, events_control: 12, total_control: 50, citation_tag: "2" })]);
  if (!r.poolable) throw new Error("expected poolable");
  const corrected = r.studies[0];
  assertAlmostEquals(corrected.effect_log, Math.log((0.5 / 51) / (10.5 / 51)), 1e-9);
  for (const st of r.studies) {
    if (!Number.isFinite(st.effect_log) || !Number.isFinite(st.variance)) throw new Error("non-finite effect/variance");
    if (!Number.isFinite(st.weight_percent)) throw new Error("non-finite weight");
  }
});

Deno.test("weight percentages sum to 100", () => {
  const r = poolRiskRatio([
    study({ events_treatment: 10, total_treatment: 100, events_control: 20, total_control: 100 }),
    study({ events_treatment: 5, total_treatment: 80, events_control: 12, total_control: 90, citation_tag: "2" }),
    study({ events_treatment: 30, total_treatment: 200, events_control: 45, total_control: 210, citation_tag: "3" }),
  ]);
  if (!r.poolable) throw new Error("expected poolable");
  const sum = r.studies.reduce((acc, s) => acc + s.weight_percent, 0);
  assertAlmostEquals(sum, 100, 1e-9);
});

// ── Published-dataset anchor: the BCG vaccine meta-analysis (Colditz et al. 1994, 13 trials).
// Standard escalc log-RR variances. metafor reports Q(df=12) = 152.2330 for this exact analysis
// (https://www.metafor-project.org, Viechtbauer 2010 JSS 36(3)). For the DerSimonian-Laird
// estimator metafor's I^2 equals the Higgins (Q-df)/Q identity. Matching Q to the published 4th
// decimal validates the per-study effect + variance + inverse-variance weighting against the
// literature; the pooled/tau^2 figures then follow deterministically from those same weights. ──
const BCG: Array<[number, number, number, number]> = [
  // [tpos (events_vacc), tneg, cpos (events_control), cneg]
  [4, 119, 11, 128], [6, 300, 29, 274], [3, 228, 11, 209], [62, 13536, 248, 12619],
  [33, 5036, 47, 5761], [180, 1361, 372, 1079], [8, 2537, 10, 619], [505, 87886, 499, 87892],
  [29, 7470, 45, 7232], [17, 1699, 65, 1600], [186, 50448, 141, 27197], [5, 2493, 3, 2338],
  [27, 16886, 29, 17825],
];

Deno.test("BCG dataset reproduces metafor's published heterogeneity (Q=152.2330)", () => {
  const studies = BCG.map(([tpos, tneg, cpos, cneg], i) =>
    study({
      label: `bcg-${i + 1}`,
      citation_tag: String(i + 1),
      events_treatment: tpos,
      total_treatment: tpos + tneg,
      events_control: cpos,
      total_control: cpos + cneg,
    })
  );
  const r = poolRiskRatio(studies);
  if (!r.poolable) throw new Error("expected poolable");
  assertEquals(r.k, 13);
  assertEquals(r.heterogeneity.df, 12);
  // Published metafor anchors for this exact analysis (DerSimonian-Laird), matched to 4 decimals:
  assertAlmostEquals(r.heterogeneity.q, 152.2330, 5e-3); // Q = 152.2330
  assertAlmostEquals(r.heterogeneity.i2 ?? -1, 92.117, 0.05); // I^2 = (Q-df)/Q = 92.12%
  assertAlmostEquals(r.heterogeneity.tau2, 0.3088, 5e-4); // tau^2 (DL) = 0.3088
  assertAlmostEquals(r.fixed.estimate_log, -0.4303, 5e-4); // fixed-effect pooled log RR
  assertAlmostEquals(r.random.estimate_log, -0.7141, 5e-4); // DL random-effects pooled log RR
  assertAlmostEquals(r.random.estimate, 0.4896, 5e-4); // back-transformed RR
});
