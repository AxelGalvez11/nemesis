// Real meta-analysis statistics — PURE, deterministic, computed in code. This is the honesty
// cornerstone of the deliverables track: pooled estimates are NEVER guessed by an LLM. The LLM's
// only job (in a later, owner-gated wiring step) is to EXTRACT the per-arm event counts from a
// source and quote the sentence it read them from; this module turns those counts into a pooled
// risk ratio with inverse-variance fixed- and DerSimonian-Laird random-effects models, plus the
// Cochran Q / I^2 / tau^2 heterogeneity statistics.
//
// METRIC: log risk ratio (RR) from 2x2 event counts. One metric, end to end — the inverse-variance
// + DL machinery is metric-agnostic, so additional metrics (OR, RD) are a later, additive change.
//
// PROVENANCE CONTRACT: every StudyArm carries citation_tag + source_quote. The math ignores them,
// but they ride along so the faithfulness layer can verify each number against the cited source.
// An LLM-invented number must never reach a computed pool without a quote a reviewer can check.
//
// WORDING GATE: callers may describe the output as "pooled"/"meta-analysis" ONLY when this returns
// `poolable: true` (>= 2 valid studies produced a real estimate). When `poolable: false`, the
// honest report says the studies were NOT pooled and shows no pooled number.
//
// Validated against the BCG vaccine meta-analysis (Colditz et al. 1994; metafor reports
// Q(df=12) = 152.2330) — see meta-analysis.test.ts.

/** One study arm-pair: 2x2 event counts plus the provenance the faithfulness layer checks. */
export interface StudyArm {
  label: string;
  /** The report-local [n] citation tag this study's numbers came from. */
  citation_tag: string;
  /** The exact source sentence the counts were read from (provenance; never used in the math). */
  source_quote: string;
  /** The outcome this 2x2 measures (e.g. "all-cause mortality") — used to cluster comparable studies. */
  outcome_label: string;
  events_treatment: number;
  total_treatment: number;
  events_control: number;
  total_control: number;
}

/** A pooled point estimate on both the log scale and the back-transformed RR scale. */
export interface PooledEstimate {
  /** Pooled effect on the log-RR scale (the scale the math runs on). */
  estimate_log: number;
  /** Variance of the pooled log-RR estimate. */
  variance: number;
  /** Back-transformed point estimate (risk ratio). */
  estimate: number;
  /** 95% CI on the RR scale (z = 1.96 on the log scale, exponentiated). */
  ci_low: number;
  ci_high: number;
}

/** Per-study contribution shown in a forest-table row. */
export interface PooledStudy {
  label: string;
  citation_tag: string;
  /** The exact source sentence the counts were read from — shown so a reader can audit each number. */
  source_quote: string;
  /** The outcome this row measures (every pooled row shares the same clustered outcome). */
  outcome_label: string;
  /** The raw 2x2 counts the effect was computed from — carried through so a "characteristics of
   *  included studies" table can show the actual extracted data (auditable against source_quote). */
  events_treatment: number;
  total_treatment: number;
  events_control: number;
  total_control: number;
  effect_log: number;
  effect: number;
  variance: number;
  ci_low: number;
  ci_high: number;
  /** Fixed-effect weight as a percentage of the total (sums to 100 across studies). */
  weight_percent: number;
  /** True when a 0.5 continuity correction was applied because an event cell was zero. */
  continuity_corrected: boolean;
}

export interface Heterogeneity {
  /** Cochran's Q. */
  q: number;
  df: number;
  /** I^2 as a percentage in [0,100], or null when undefined (fewer than 2 studies). */
  i2: number | null;
  /** DerSimonian-Laird between-study variance estimate (>= 0). */
  tau2: number;
}

export type MetaAnalysisResult =
  | { poolable: false; k: number; reason: string }
  | {
    poolable: true;
    measure: "risk_ratio";
    k: number;
    studies: PooledStudy[];
    fixed: PooledEstimate;
    random: PooledEstimate;
    heterogeneity: Heterogeneity;
  };

const Z95 = 1.959963984540054; // qnorm(0.975)

interface Effect {
  arm: StudyArm;
  y: number; // log RR
  v: number; // variance of log RR
  corrected: boolean;
}

/** A study is usable when both totals are positive and 0 <= events <= total (integers expected). */
function isValid(s: StudyArm): boolean {
  const ok = (e: number, n: number) => Number.isFinite(e) && Number.isFinite(n) && n > 0 && e >= 0 && e <= n;
  return ok(s.events_treatment, s.total_treatment) && ok(s.events_control, s.total_control);
}

/** log RR and its variance from a 2x2 table, with a 0.5 all-cell continuity correction when an
 *  event cell is zero (the standard Cochrane/metafor handling — keeps the log and its variance finite). */
function effectOf(s: StudyArm): Effect {
  let a = s.events_treatment;
  let n1 = s.total_treatment;
  let c = s.events_control;
  let n2 = s.total_control;
  const corrected = a === 0 || c === 0;
  if (corrected) {
    // +0.5 to all four cells -> each total grows by 1 (0.5 on events + 0.5 on non-events).
    a += 0.5;
    c += 0.5;
    n1 += 1;
    n2 += 1;
  }
  const riskT = a / n1;
  const riskC = c / n2;
  const y = Math.log(riskT / riskC);
  const v = 1 / a - 1 / n1 + 1 / c - 1 / n2;
  return { arm: s, y, v, corrected };
}

function estimate(estLog: number, variance: number): PooledEstimate {
  const half = Z95 * Math.sqrt(variance);
  return {
    estimate_log: estLog,
    variance,
    estimate: Math.exp(estLog),
    ci_low: Math.exp(estLog - half),
    ci_high: Math.exp(estLog + half),
  };
}

/**
 * Pool a set of studies into fixed- and random-effects risk-ratio estimates with Q / I^2 / tau^2.
 * PURE. Returns `poolable: false` when fewer than two studies have usable counts.
 */
export function poolRiskRatio(studies: StudyArm[]): MetaAnalysisResult {
  const valid = studies.filter(isValid);
  if (valid.length < 2) {
    const dropped = studies.length - valid.length;
    const reason = studies.length < 2
      ? "Pooling needs at least 2 studies with extractable event counts."
      : `Only ${valid.length} of ${studies.length} studies had usable 2x2 counts (${dropped} excluded); pooling needs at least 2.`;
    return { poolable: false, k: valid.length, reason };
  }

  const effects = valid.map(effectOf);
  const w = effects.map((e) => 1 / e.v); // fixed-effect (inverse-variance) weights
  const sumW = w.reduce((a, b) => a + b, 0);
  const sumWY = effects.reduce((acc, e, i) => acc + w[i]! * e.y, 0);

  const fixedLog = sumWY / sumW;
  const fixedVar = 1 / sumW;

  // Cochran's Q about the fixed-effect mean.
  const q = effects.reduce((acc, e, i) => acc + w[i]! * (e.y - fixedLog) ** 2, 0);
  const df = effects.length - 1;

  // DerSimonian-Laird tau^2 = max(0, (Q - df) / C), C = sumW - sumW2/sumW.
  const sumW2 = w.reduce((a, b) => a + b * b, 0);
  const c = sumW - sumW2 / sumW;
  const tau2 = c > 0 ? Math.max(0, (q - df) / c) : 0;

  // I^2 = (Q - df)/Q, pinned to [0,100]; undefined (null) only with < 2 studies (df < 1).
  const i2 = df < 1 ? null : q <= 0 ? 0 : Math.max(0, (q - df) / q) * 100;

  // Random-effects: inflate each variance by tau^2, re-weight.
  const wStar = effects.map((e) => 1 / (e.v + tau2));
  const sumWStar = wStar.reduce((a, b) => a + b, 0);
  const sumWStarY = effects.reduce((acc, e, i) => acc + wStar[i]! * e.y, 0);
  const randomLog = sumWStarY / sumWStar;
  const randomVar = 1 / sumWStar;

  const pooledStudies: PooledStudy[] = effects.map((e, i) => {
    const half = Z95 * Math.sqrt(e.v);
    return {
      label: e.arm.label,
      citation_tag: e.arm.citation_tag,
      source_quote: e.arm.source_quote,
      outcome_label: e.arm.outcome_label,
      events_treatment: e.arm.events_treatment,
      total_treatment: e.arm.total_treatment,
      events_control: e.arm.events_control,
      total_control: e.arm.total_control,
      effect_log: e.y,
      effect: Math.exp(e.y),
      variance: e.v,
      ci_low: Math.exp(e.y - half),
      ci_high: Math.exp(e.y + half),
      weight_percent: (w[i]! / sumW) * 100,
      continuity_corrected: e.corrected,
    };
  });

  return {
    poolable: true,
    measure: "risk_ratio",
    k: effects.length,
    studies: pooledStudies,
    fixed: estimate(fixedLog, fixedVar),
    random: estimate(randomLog, randomVar),
    heterogeneity: { q, df, i2, tau2 },
  };
}
