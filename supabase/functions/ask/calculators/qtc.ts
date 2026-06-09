// QTc — heart-rate-corrected QT interval. Drug-safety-critical: many drugs (antiarrhythmics,
// macrolides, fluoroquinolones, azole antifungals, ondansetron, methadone, several antipsychotics)
// prolong the QT interval, and a markedly prolonged QTc raises the risk of torsades de pointes.
// These calculators apply the four standard rate-correction formulas so a clinician can compare
// them (they diverge most at non-physiologic heart rates) and read the prolongation band.
//
// Each formula is the published reference; reference test cases live in qtc.test.ts.
//
// UNITS: QT interval and the resulting QTc are in milliseconds (ms). Heart rate is in beats/min
// (bpm); the RR interval is in seconds (s). The user supplies EITHER heart rate OR RR interval —
// we derive whichever the formula needs (RR = 60 / HR; HR = 60 / RR).
//
// FRAMINGHAM UNITS NOTE: the published Framingham (Sagie 1992) formula is QTc = QT + 0.154 × (1 − RR)
// with QT in SECONDS and RR in seconds. To keep our public unit as ms we compute it in seconds
// internally (qt_ms ÷ 1000) and convert back, so the code constant 0.154 matches the published
// formula exactly (0.154 s = 154 ms; adding 154 ms directly to a ms QT is mathematically identical).

import { type CalcArgs, CalcError, type CalculatorDef, type CalcResult, enumArg, num, round } from "./types.ts";

const SEX = ["male", "female"] as const;

// Sanity bounds shared by every QTc input (validate so we fail loudly, never silently wrong).
const QT_MIN = 200; // ms — below this is implausible for a real measured QT
const QT_MAX = 800; // ms — above this is implausible/measurement error
const HR_MIN = 20; // bpm
const HR_MAX = 300; // bpm
const RR_MIN = 0.2; // s  (≈ 300 bpm)
const RR_MAX = 3.0; // s  (≈ 20 bpm)

// ── shared helpers (kept UNROUNDED — never round inside a chained calc, per round() contract) ──

/**
 * Resolve the RR interval (seconds) and heart rate (bpm) from the args. The user supplies EITHER
 * heart rate OR RR interval; we derive the other. Throws CalcError if neither (or an out-of-range
 * value) is supplied — `num()` alone cannot express "one of two", so this gate is manual.
 */
function resolveRate(args: CalcArgs): { rr: number; hr: number } {
  const hasHr = args["hr"] !== undefined && args["hr"] !== null && args["hr"] !== "";
  const hasRr = args["rr"] !== undefined && args["rr"] !== null && args["rr"] !== "";
  if (!hasHr && !hasRr) {
    throw new CalcError("provide either heart rate (hr, bpm) or RR interval (rr, s)");
  }
  if (hasHr) {
    const hr = num(args, "hr", { min: HR_MIN, max: HR_MAX });
    return { hr, rr: 60 / hr };
  }
  const rr = num(args, "rr", { min: RR_MIN, max: RR_MAX });
  return { rr, hr: 60 / rr };
}

/**
 * Prolongation band + sex-specific abnormal flag. Thresholds (AHA/ACC, MDCalc calc/48):
 *   abnormal QTc > 450 ms (men) / > 470 ms (women); > 500 ms = markedly prolonged (torsades risk).
 * Sex is OPTIONAL: when unknown we flag against the lower (450 ms) bound and note sex-specificity.
 * The > 500 ms torsades flag applies regardless of sex.
 */
function prolongationBand(qtc: number, sex: string | undefined): { category: string; warnings: string[] } {
  const warnings: string[] = [];
  if (qtc > 500) {
    warnings.push(
      "QTc > 500 ms is markedly prolonged and carries an increased risk of torsades de pointes — review QT-prolonging drugs, electrolytes (K⁺, Mg²⁺, Ca²⁺), and seek cardiology input.",
    );
  }
  let category: string;
  if (sex === "male") {
    category = qtc > 500 ? "markedly prolonged (> 500 ms; torsades risk)" : qtc > 450 ? "prolonged for men (> 450 ms)" : "normal (≤ 450 ms, men)";
  } else if (sex === "female") {
    category = qtc > 500 ? "markedly prolonged (> 500 ms; torsades risk)" : qtc > 470 ? "prolonged for women (> 470 ms)" : "normal (≤ 470 ms, women)";
  } else {
    // Sex unknown — use the lower (men's) abnormal threshold as the conservative flag.
    category = qtc > 500 ? "markedly prolonged (> 500 ms; torsades risk)" : qtc > 470 ? "prolonged (> 470 ms; abnormal for either sex)" : qtc > 450 ? "borderline/prolonged (> 450 ms; abnormal for men, borderline for women)" : "normal (≤ 450 ms)";
    warnings.push("Sex not provided — flagged against the men's threshold (> 450 ms). Abnormal cutoffs are > 450 ms (men) and > 470 ms (women); supply sex for a sex-specific band.");
  }
  return { category, warnings };
}

/** The optional-sex input (shared by all four calculators). */
const SEX_INPUT = { key: "sex", label: "Sex (for prolongation threshold)", type: "enum" as const, options: [...SEX], required: false };

/** The QT + (HR or RR) input set shared by all four calculators. */
const RATE_INPUTS = [
  { key: "qt", label: "Measured QT interval", type: "number" as const, unit: "ms", min: QT_MIN, max: QT_MAX, required: true },
  { key: "hr", label: "Heart rate (provide HR or RR)", type: "number" as const, unit: "bpm", min: HR_MIN, max: HR_MAX, required: false },
  { key: "rr", label: "RR interval (provide HR or RR)", type: "number" as const, unit: "s", min: RR_MIN, max: RR_MAX, required: false },
];

const TORSADES_WARNING =
  "QTc correction formulas diverge most at non-physiologic heart rates; compare formulas before acting on a single value. Drug-induced QT prolongation risk is also affected by hypokalemia, hypomagnesemia, hypocalcemia, bradycardia, and concomitant QT-prolonging drugs.";

// ── Bazett (1920) — QTc = QT ÷ √RR ──
// The most widely used formula; over-corrects at high heart rates and under-corrects at low ones.
// Source: Bazett HC. An analysis of the time-relations of electrocardiograms. Heart. 1920;7:353-370.
export const qtcBazett: CalculatorDef = {
  id: "qtc-bazett",
  name: "Corrected QT interval (Bazett)",
  category: "risk-score",
  description: "Heart-rate-corrected QT by the Bazett formula (QT ÷ √RR); the most widely used, but it over-corrects in tachycardia and under-corrects in bradycardia.",
  source: "Bazett, Heart 1920",
  inputs: [...RATE_INPUTS, SEX_INPUT],
  run(args: CalcArgs): CalcResult {
    const qt = num(args, "qt", { min: QT_MIN, max: QT_MAX });
    const { rr, hr } = resolveRate(args);
    const sex = args["sex"] !== undefined && args["sex"] !== "" ? enumArg(args, "sex", SEX) : undefined;
    const qtc = qt / Math.sqrt(rr);
    const band = prolongationBand(qtc, sex);
    return {
      value: round(qtc, 0),
      unit: "ms",
      label: "Corrected QT interval (Bazett)",
      category: band.category,
      interpretation: "Bazett QTc. Reliable near 60 bpm; at rates well above/below 60 bpm prefer Fridericia or Framingham, which are less rate-dependent.",
      formula: "QTc = QT ÷ √RR  (QT in ms; RR in s = 60 ÷ HR)",
      inputsEcho: { qt, hr: round(hr, 1), rr: round(rr, 3), ...(sex ? { sex } : {}) },
      source: "Bazett, Heart 1920; thresholds & method per MDCalc calc/48 (AHA/ACC)",
      warnings: [...band.warnings, TORSADES_WARNING, "Bazett systematically over-corrects QTc in tachycardia and under-corrects in bradycardia — interpret with caution outside 60–100 bpm."],
    };
  },
};

// ── Fridericia (1920) — QTc = QT ÷ RR^(1/3) (cube root) ──
// The FDA-preferred correction for thorough-QT studies; more accurate than Bazett at extreme rates.
// Source: Fridericia LS. Die Systolendauer im Elektrokardiogramm bei normalen Menschen und bei
// Herzkranken. Acta Med Scand. 1920;53:469-486.
export const qtcFridericia: CalculatorDef = {
  id: "qtc-fridericia",
  name: "Corrected QT interval (Fridericia)",
  category: "risk-score",
  description: "Heart-rate-corrected QT by the Fridericia formula (QT ÷ ∛RR); the FDA-preferred correction and more reliable than Bazett at non-physiologic heart rates.",
  source: "Fridericia, Acta Med Scand 1920",
  inputs: [...RATE_INPUTS, SEX_INPUT],
  run(args: CalcArgs): CalcResult {
    const qt = num(args, "qt", { min: QT_MIN, max: QT_MAX });
    const { rr, hr } = resolveRate(args);
    const sex = args["sex"] !== undefined && args["sex"] !== "" ? enumArg(args, "sex", SEX) : undefined;
    const qtc = qt / Math.cbrt(rr);
    const band = prolongationBand(qtc, sex);
    return {
      value: round(qtc, 0),
      unit: "ms",
      label: "Corrected QT interval (Fridericia)",
      category: band.category,
      interpretation: "Fridericia QTc (cube-root correction). FDA-preferred for thorough-QT analysis; less rate-dependent than Bazett.",
      formula: "QTc = QT ÷ RR^(1/3)  (QT in ms; RR in s = 60 ÷ HR)",
      inputsEcho: { qt, hr: round(hr, 1), rr: round(rr, 3), ...(sex ? { sex } : {}) },
      source: "Fridericia, Acta Med Scand 1920; thresholds & method per MDCalc calc/48 (AHA/ACC)",
      warnings: [...band.warnings, TORSADES_WARNING],
    };
  },
};

// ── Framingham (Sagie 1992) — QTc = QT + 0.154 × (1 − RR) ──
// Linear correction from the Framingham Heart Study; computed in SECONDS per the published formula
// then converted to ms (see FRAMINGHAM UNITS NOTE at top of file).
// Source: Sagie A, Larson MG, Goldberg RJ, Bengtson JR, Levy D. An improved method for adjusting the
// QT interval for heart rate (the Framingham Heart Study). Am J Cardiol. 1992;70(7):797-801.
export const qtcFramingham: CalculatorDef = {
  id: "qtc-framingham",
  name: "Corrected QT interval (Framingham)",
  category: "risk-score",
  description: "Heart-rate-corrected QT by the Framingham linear formula (QT + 0.154 × (1 − RR)); well-behaved across a broad range of heart rates.",
  source: "Sagie et al. (Framingham), Am J Cardiol 1992",
  inputs: [...RATE_INPUTS, SEX_INPUT],
  run(args: CalcArgs): CalcResult {
    const qt = num(args, "qt", { min: QT_MIN, max: QT_MAX });
    const { rr, hr } = resolveRate(args);
    const sex = args["sex"] !== undefined && args["sex"] !== "" ? enumArg(args, "sex", SEX) : undefined;
    // Published formula is in seconds: QTc_s = QT_s + 0.154 × (1 − RR_s). Convert ms→s and back.
    const qtc = (qt / 1000 + 0.154 * (1 - rr)) * 1000;
    const band = prolongationBand(qtc, sex);
    return {
      value: round(qtc, 0),
      unit: "ms",
      label: "Corrected QT interval (Framingham)",
      category: band.category,
      interpretation: "Framingham linear QTc. Stable across a wide heart-rate range; a good cross-check on Bazett at extreme rates.",
      formula: "QTc = QT + 0.154 × (1 − RR), all in seconds (QT_s = QT_ms ÷ 1000; RR in s = 60 ÷ HR), then ×1000 → ms",
      inputsEcho: { qt, hr: round(hr, 1), rr: round(rr, 3), ...(sex ? { sex } : {}) },
      source: "Sagie et al., Am J Cardiol 1992; thresholds & method per MDCalc calc/48 (AHA/ACC)",
      warnings: [...band.warnings, TORSADES_WARNING],
    };
  },
};

// ── Hodges (1983) — QTc = QT + 1.75 × (HR − 60) ──
// Linear correction in heart rate; QT and the 1.75 ms/bpm coefficient are in ms (so QTc is in ms).
// Equivalent to QT + 105 × (1/RR − 1) since HR = 60/RR. Source: Hodges M, Salerno D, Erlien D.
// Bazett's QT correction reviewed: evidence that a linear QT correction for heart rate is better.
// J Am Coll Cardiol. 1983;1:694.
export const qtcHodges: CalculatorDef = {
  id: "qtc-hodges",
  name: "Corrected QT interval (Hodges)",
  category: "risk-score",
  description: "Heart-rate-corrected QT by the Hodges linear formula (QT + 1.75 × (HR − 60)); the least rate-dependent of the common corrections.",
  source: "Hodges et al., J Am Coll Cardiol 1983",
  inputs: [...RATE_INPUTS, SEX_INPUT],
  run(args: CalcArgs): CalcResult {
    const qt = num(args, "qt", { min: QT_MIN, max: QT_MAX });
    const { rr, hr } = resolveRate(args);
    const sex = args["sex"] !== undefined && args["sex"] !== "" ? enumArg(args, "sex", SEX) : undefined;
    const qtc = qt + 1.75 * (hr - 60);
    const band = prolongationBand(qtc, sex);
    return {
      value: round(qtc, 0),
      unit: "ms",
      label: "Corrected QT interval (Hodges)",
      category: band.category,
      interpretation: "Hodges linear QTc. Empirically the least correlated with heart rate of the common corrections.",
      formula: "QTc = QT + 1.75 × (HR − 60)  (QT in ms; HR in bpm = 60 ÷ RR)",
      inputsEcho: { qt, hr: round(hr, 1), rr: round(rr, 3), ...(sex ? { sex } : {}) },
      source: "Hodges et al., J Am Coll Cardiol 1983; thresholds & method per MDCalc calc/48 (AHA/ACC)",
      warnings: [...band.warnings, TORSADES_WARNING],
    };
  },
};

export const qtcCalculators: CalculatorDef[] = [qtcBazett, qtcFridericia, qtcFramingham, qtcHodges];
