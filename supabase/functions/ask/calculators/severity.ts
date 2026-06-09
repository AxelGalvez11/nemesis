// Severity / risk-score calculators — point-and-score tools with standard risk interpretation.
// These are categorical/integer scores (not continuous lab math): each one validates raw clinical
// inputs, applies the published thresholds internally, and returns an integer `value` plus a risk
// `category`. Reference test cases (with authoritative expected values) live in severity.test.ts.

import { type CalcArgs, CalcError, type CalculatorDef, type CalcResult, boolArg, enumArg, num, round } from "./types.ts";

// ── MELD (Model for End-Stage Liver Disease), original ──
// MELD = 10 × [0.957·ln(SCr) + 0.378·ln(bilirubin) + 1.120·ln(INR) + 0.643]
// UNOS bounds: any of SCr/bilirubin/INR < 1.0 is set to 1.0 (ln 1 = 0, avoids negatives);
//   SCr is capped at 4.0 mg/dL, and forced to 4.0 if the patient had ≥2 dialysis sessions (or
//   24h CVVHD) in the prior week. Final score is rounded to the nearest integer and clamped 6–40.
// Source: Kamath PS et al., Hepatology 2001;33(2):464-470 (original MELD); UNOS/OPTN bounds.
const MELD_MIN = 6;
const MELD_MAX = 40;

/** Shared UNOS-bounded original-MELD core (integer, clamped 6–40). Used by MELD and MELD-Na. */
function meldCore(scr: number, bilirubin: number, inr: number, dialysis: boolean): number {
  // UNOS lower bound: floor each lab at 1.0.
  const cr0 = Math.max(scr, 1.0);
  const bili = Math.max(bilirubin, 1.0);
  const inr0 = Math.max(inr, 1.0);
  // UNOS creatinine handling: dialysis ≥2×/week → 4.0; otherwise cap at 4.0.
  const cr = dialysis ? 4.0 : Math.min(cr0, 4.0);
  const raw = 10 * (0.957 * Math.log(cr) + 0.378 * Math.log(bili) + 1.120 * Math.log(inr0) + 0.643);
  return Math.min(MELD_MAX, Math.max(MELD_MIN, Math.round(raw)));
}

function meldCategory(score: number): string {
  if (score <= 9) return "≤9 (low 3-mo mortality)";
  if (score <= 19) return "10–19";
  if (score <= 29) return "20–29";
  if (score <= 39) return "30–39";
  return "≥40 (highest 3-mo mortality)";
}

export const meld: CalculatorDef = {
  id: "meld-original",
  name: "MELD score (original)",
  category: "hepatic",
  description: "Model for End-Stage Liver Disease — ranks chronic liver disease severity / transplant priority and predicts 3-month mortality.",
  source: "Kamath et al., Hepatology 2001 (original MELD); UNOS/OPTN bounds",
  inputs: [
    { key: "scr", label: "Serum creatinine", type: "number", unit: "mg/dL", min: 0.1, max: 25, required: true },
    { key: "bilirubin", label: "Total bilirubin", type: "number", unit: "mg/dL", min: 0.1, max: 60, required: true },
    { key: "inr", label: "INR", type: "number", min: 0.5, max: 20, required: true },
    { key: "dialysis", label: "≥2 dialysis sessions (or 24h CVVHD) in prior week", type: "boolean", required: false },
  ],
  run(args: CalcArgs): CalcResult {
    const scr = num(args, "scr", { min: 0.1, max: 25 });
    const bilirubin = num(args, "bilirubin", { min: 0.1, max: 60 });
    const inr = num(args, "inr", { min: 0.5, max: 20 });
    const dialysis = boolArg(args, "dialysis");
    const score = meldCore(scr, bilirubin, inr, dialysis);
    return {
      value: round(score, 0),
      unit: "points",
      label: "MELD score (original)",
      category: meldCategory(score),
      interpretation: score >= 30
        ? "high short-term mortality — high transplant priority"
        : score >= 20
        ? "moderate-to-high 3-month mortality"
        : score >= 10
        ? "intermediate severity"
        : "low 3-month mortality",
      formula: "round(10 × [0.957·ln(SCr) + 0.378·ln(bilirubin) + 1.120·ln(INR) + 0.643]); labs floored at 1.0, SCr capped at 4.0 (or 4.0 if dialysis); clamped 6–40",
      inputsEcho: { scr, bilirubin, inr, dialysis },
      source: "Kamath et al., Hepatology 2001; UNOS/OPTN bounds",
      warnings: [
        "Uses the original MELD; UNOS replaced it with MELD-Na (2016) and later MELD 3.0 for allocation.",
        "Values <1.0 are floored to 1.0 and SCr is capped at 4.0 mg/dL per UNOS, so extreme labs do not change the score beyond those bounds.",
      ],
    };
  },
};

// ── MELD-Na (sodium-adjusted MELD, OPTN/UNOS 2016) ──
// MELD-Na = MELD + 1.32·(137 − Na) − [0.033 · MELD · (137 − Na)]
//   where MELD is the integer original MELD; serum sodium is clamped to 125–137 mEq/L.
//   The sodium correction is applied only when MELD > 11; otherwise MELD-Na = MELD. Result clamped 6–40.
// Source: OPTN/UNOS policy (Jan 2016); Kim WR et al., NEJM 2008;359:1018-1026.
const NA_MIN = 125;
const NA_MAX = 137;

function meldNaCategory(score: number): string {
  if (score <= 9) return "≤9 (low 3-mo mortality)";
  if (score <= 19) return "10–19";
  if (score <= 29) return "20–29";
  if (score <= 39) return "30–39";
  return "≥40 (highest 3-mo mortality)";
}

export const meldNa: CalculatorDef = {
  id: "meld-na",
  name: "MELD-Na score (sodium-adjusted)",
  category: "hepatic",
  description: "Sodium-adjusted MELD (OPTN/UNOS 2016) — improves mortality prediction in cirrhosis by incorporating hyponatremia.",
  source: "OPTN/UNOS policy 2016; Kim et al., NEJM 2008",
  inputs: [
    { key: "scr", label: "Serum creatinine", type: "number", unit: "mg/dL", min: 0.1, max: 25, required: true },
    { key: "bilirubin", label: "Total bilirubin", type: "number", unit: "mg/dL", min: 0.1, max: 60, required: true },
    { key: "inr", label: "INR", type: "number", min: 0.5, max: 20, required: true },
    { key: "sodium", label: "Serum sodium", type: "number", unit: "mEq/L", min: 100, max: 170, required: true },
    { key: "dialysis", label: "≥2 dialysis sessions (or 24h CVVHD) in prior week", type: "boolean", required: false },
  ],
  run(args: CalcArgs): CalcResult {
    const scr = num(args, "scr", { min: 0.1, max: 25 });
    const bilirubin = num(args, "bilirubin", { min: 0.1, max: 60 });
    const inr = num(args, "inr", { min: 0.5, max: 20 });
    const sodium = num(args, "sodium", { min: 100, max: 170 });
    const dialysis = boolArg(args, "dialysis");

    const meldInt = meldCore(scr, bilirubin, inr, dialysis); // integer original MELD
    let score = meldInt;
    if (meldInt > 11) {
      const na = Math.min(NA_MAX, Math.max(NA_MIN, sodium)); // clamp 125–137
      const adjusted = meldInt + 1.32 * (137 - na) - 0.033 * meldInt * (137 - na);
      score = Math.min(MELD_MAX, Math.max(MELD_MIN, Math.round(adjusted)));
    }
    return {
      value: round(score, 0),
      unit: "points",
      label: "MELD-Na score",
      category: meldNaCategory(score),
      interpretation: score >= 30
        ? "high short-term mortality — high transplant priority"
        : score >= 20
        ? "moderate-to-high 3-month mortality"
        : score >= 10
        ? "intermediate severity"
        : "low 3-month mortality",
      formula: "MELD-Na = MELD + 1.32·(137 − Na) − [0.033·MELD·(137 − Na)]; Na clamped 125–137; sodium term applied only if integer MELD > 11; result clamped 6–40",
      inputsEcho: { scr, bilirubin, inr, sodium, dialysis },
      source: "OPTN/UNOS policy 2016; Kim et al., NEJM 2008",
      warnings: [
        "Sodium correction is applied only when the underlying MELD > 11.",
        "OPTN later adopted MELD 3.0 (adds albumin, sex); MELD-Na remains a widely used standard.",
      ],
    };
  },
};

// ── CURB-65 (community-acquired pneumonia severity) ──
// 1 point each for: Confusion (new disorientation); Urea > 7 mmol/L (≈ BUN > 19 mg/dL);
//   Respiratory rate ≥ 30/min; systolic BP < 90 mmHg OR diastolic BP ≤ 60 mmHg; Age ≥ 65.
// Total 0–5. 0–1 low (outpatient), 2 intermediate (consider admission), ≥3 high (inpatient ± ICU).
// Source: Lim WS et al., Thorax 2003;58(5):377-382; MDCalc CURB-65.
const BUN_THRESHOLD = 19; // mg/dL; criterion is urea > 7 mmol/L ≈ BUN > 19 mg/dL

function curb65Category(score: number): string {
  if (score <= 1) return "low risk";
  if (score === 2) return "intermediate risk";
  return "high risk";
}

export const curb65: CalculatorDef = {
  id: "curb-65",
  name: "CURB-65 (pneumonia severity)",
  category: "pulmonary",
  description: "Estimates mortality in community-acquired pneumonia to guide outpatient vs inpatient (± ICU) care.",
  source: "Lim et al., Thorax 2003; MDCalc CURB-65",
  inputs: [
    { key: "confusion", label: "Confusion (new disorientation)", type: "boolean", required: true },
    { key: "bun", label: "BUN", type: "number", unit: "mg/dL", min: 1, max: 300, required: true },
    { key: "resp_rate", label: "Respiratory rate", type: "number", unit: "breaths/min", min: 0, max: 80, required: true },
    { key: "sbp", label: "Systolic BP", type: "number", unit: "mmHg", min: 30, max: 300, required: true },
    { key: "dbp", label: "Diastolic BP", type: "number", unit: "mmHg", min: 10, max: 200, required: true },
    { key: "age", label: "Age", type: "number", unit: "years", min: 0, max: 120, required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const confusion = boolArg(args, "confusion");
    const bun = num(args, "bun", { min: 1, max: 300 });
    const resp = num(args, "resp_rate", { min: 0, max: 80 });
    const sbp = num(args, "sbp", { min: 30, max: 300 });
    const dbp = num(args, "dbp", { min: 10, max: 200 });
    const age = num(args, "age", { min: 0, max: 120 });

    let score = 0;
    if (confusion) score += 1;
    if (bun > BUN_THRESHOLD) score += 1;
    if (resp >= 30) score += 1;
    if (sbp < 90 || dbp <= 60) score += 1;
    if (age >= 65) score += 1;

    const cat = curb65Category(score);
    return {
      value: score,
      unit: "points",
      label: "CURB-65 score",
      category: cat,
      interpretation: score <= 1
        ? "low risk (~1.5% 30-day mortality) — usually outpatient"
        : score === 2
        ? "intermediate risk (~9% mortality) — consider inpatient/observation admission"
        : "high risk (~22% mortality) — inpatient admission, assess for ICU (score 4–5)",
      formula: "1 pt each: Confusion; BUN > 19 mg/dL (urea > 7 mmol/L); RR ≥ 30; SBP < 90 or DBP ≤ 60; Age ≥ 65 (total 0–5)",
      inputsEcho: { confusion, bun, resp_rate: resp, sbp, dbp, age },
      source: "Lim et al., Thorax 2003; MDCalc CURB-65",
      warnings: [
        "Urea criterion is > 7 mmol/L; this calculator uses BUN > 19 mg/dL as the equivalent (BUN mg/dL ÷ 2.8 ≈ urea mmol/L).",
        "Clinical judgment overrides the score; CURB-65 may under-triage younger patients with significant comorbidity or hypoxemia.",
      ],
    };
  },
};

// ── qSOFA (quick Sequential Organ Failure Assessment, Sepsis-3) ──
// 1 point each for: Respiratory rate ≥ 22/min; altered mentation (GCS < 15); systolic BP ≤ 100 mmHg.
// Total 0–3. Score ≥ 2 = high risk of poor outcome (in-hospital mortality / prolonged ICU stay).
// Source: Seymour CW et al. (Sepsis-3), JAMA 2016;315(8):762-774; MDCalc qSOFA.
function qsofaCategory(score: number): string {
  return score >= 2 ? "high risk" : "not high risk";
}

export const qsofa: CalculatorDef = {
  id: "qsofa",
  name: "qSOFA (quick SOFA, Sepsis-3)",
  category: "risk-score",
  description: "Bedside screen flagging suspected-infection patients at higher risk of poor outcome (Sepsis-3).",
  source: "Seymour et al. (Sepsis-3), JAMA 2016; MDCalc qSOFA",
  inputs: [
    { key: "resp_rate", label: "Respiratory rate", type: "number", unit: "breaths/min", min: 0, max: 80, required: true },
    { key: "gcs", label: "Glasgow Coma Scale", type: "number", min: 3, max: 15, required: true },
    { key: "sbp", label: "Systolic BP", type: "number", unit: "mmHg", min: 30, max: 300, required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const resp = num(args, "resp_rate", { min: 0, max: 80 });
    const gcs = num(args, "gcs", { min: 3, max: 15 });
    const sbp = num(args, "sbp", { min: 30, max: 300 });

    let score = 0;
    if (resp >= 22) score += 1;
    if (gcs < 15) score += 1; // altered mentation
    if (sbp <= 100) score += 1;

    const cat = qsofaCategory(score);
    return {
      value: score,
      unit: "points",
      label: "qSOFA score",
      category: cat,
      interpretation: score >= 2
        ? "high risk (≥2) — associated with 3- to 14-fold higher in-hospital mortality; assess for organ dysfunction (full SOFA)"
        : "not high risk (<2) — does not rule out sepsis; re-assess if clinical concern persists",
      formula: "1 pt each: RR ≥ 22; altered mentation (GCS < 15); SBP ≤ 100 mmHg (total 0–3); ≥2 = high risk",
      inputsEcho: { resp_rate: resp, gcs, sbp },
      source: "Seymour et al. (Sepsis-3), JAMA 2016; MDCalc qSOFA",
      warnings: [
        "qSOFA is a risk screen, not a sepsis diagnosis; a positive score should prompt a full SOFA assessment, not by itself trigger sepsis-directed treatment.",
        "Lower sensitivity than SIRS/NEWS for early sepsis; do not use to rule out infection.",
      ],
    };
  },
};

export const severityCalculators: CalculatorDef[] = [meld, meldNa, curb65, qsofa];