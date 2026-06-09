// Lab-interpretation calculators — electrolyte/osmolality corrections that change how a result is
// read (and therefore how a drug is dosed or a diagnosis framed). Each formula is the published
// reference; reference test cases live in labs.test.ts. US units throughout (see types.ts UNITS),
// normal albumin assumed 4.0 g/dL for albumin-based corrections.

import { type CalcArgs, CalcError, type CalculatorDef, type CalcResult, enumArg, num, round } from "./types.ts";

const NORMAL_ALBUMIN = 4.0; // g/dL — reference albumin used by both albumin-correction formulas

// ── Albumin-corrected calcium (mg/dL) ──
// Corrected Ca = measured Ca + 0.8 × (4.0 − albumin_g/dL).
// ~45% of serum calcium is albumin-bound, so total calcium falls ~0.8 mg/dL per 1 g/dL drop in
// albumin while the physiologically active ionized fraction is unchanged. Unmasks true calcium
// status in hypoalbuminemia (and the reverse in hyperalbuminemia).
// Source: Payne RB et al., BMJ 1973; MDCalc "Calcium Correction for Hypoalbuminemia".
export const correctedCalcium: CalculatorDef = {
  id: "corrected-calcium-albumin",
  name: "Albumin-corrected calcium",
  category: "labs",
  description: "Adjusts total serum calcium for albumin so hypo-/hyperalbuminemia doesn't mask true calcium status.",
  source: "Payne et al., BMJ 1973; MDCalc",
  inputs: [
    { key: "calcium", label: "Measured total calcium", type: "number", unit: "mg/dL", min: 2, max: 20, required: true },
    { key: "albumin", label: "Serum albumin", type: "number", unit: "g/dL", min: 0.5, max: 7, required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const calcium = num(args, "calcium", { min: 2, max: 20 });
    const albumin = num(args, "albumin", { min: 0.5, max: 7 });
    const corrected = calcium + 0.8 * (NORMAL_ALBUMIN - albumin);
    return {
      value: round(corrected, 2),
      unit: "mg/dL",
      label: "Albumin-corrected calcium",
      category: calciumBand(corrected),
      interpretation: corrected < 8.5
        ? "corrected value still low — evaluate for true hypocalcemia"
        : corrected > 10.5
        ? "corrected value high — evaluate for hypercalcemia"
        : "corrected calcium within normal range (8.5–10.5 mg/dL)",
      formula: "measured Ca (mg/dL) + 0.8 × (4.0 − albumin g/dL)",
      inputsEcho: { calcium, albumin },
      source: "Payne et al., BMJ 1973; MDCalc (Calcium Correction for Hypoalbuminemia)",
      warnings: [
        "Assumes normal albumin = 4.0 g/dL and US units (Ca mg/dL, albumin g/dL).",
        "Unreliable in critical illness, abnormal pH, or paraproteinemia — measure ionized calcium when accuracy matters.",
      ],
    };
  },
};

function calciumBand(ca: number): string {
  if (ca < 8.5) return "low (<8.5 mg/dL)";
  if (ca > 10.5) return "high (>10.5 mg/dL)";
  return "normal (8.5–10.5 mg/dL)";
}

// ── Sodium correction for hyperglycemia (mEq/L) ──
// Corrected Na = measured Na + factor × (glucose_mg/dL − 100) / 100.
// factor = 1.6 (Katz 1973) or 2.4 (Hillier 1999). Hyperglycemia draws water osmotically into the
// vascular space, diluting measured sodium; the correction estimates the true (water-deficit) Na.
// Source: Katz MA, NEJM 1973; Hillier TA et al., Am J Med 1999; MDCalc "Sodium Correction for Hyperglycemia".
const NA_METHOD = ["katz", "hillier"] as const;
export const correctedSodium: CalculatorDef = {
  id: "corrected-sodium-hyperglycemia",
  name: "Sodium correction for hyperglycemia",
  category: "labs",
  description: "Estimates true serum sodium in hyperglycemia (DKA/HHS) using the Katz 1.6 or Hillier 2.4 factor per 100 mg/dL glucose above 100.",
  source: "Katz NEJM 1973; Hillier Am J Med 1999; MDCalc",
  inputs: [
    { key: "sodium", label: "Measured sodium", type: "number", unit: "mEq/L", min: 100, max: 200, required: true },
    { key: "glucose", label: "Serum glucose", type: "number", unit: "mg/dL", min: 0, max: 2000, required: true },
    { key: "method", label: "Correction factor", type: "enum", options: [...NA_METHOD], required: false },
  ],
  run(args: CalcArgs): CalcResult {
    const sodium = num(args, "sodium", { min: 100, max: 200 });
    const glucose = num(args, "glucose", { min: 0, max: 2000 });
    const method = args["method"] === undefined || args["method"] === ""
      ? "katz"
      : enumArg(args, "method", NA_METHOD);
    const factor = method === "hillier" ? 2.4 : 1.6;
    const corrected = sodium + factor * (glucose - 100) / 100;
    const warnings = [
      "Katz factor 1.6 is the classic value; Hillier 2.4 may estimate better at glucose >400 mg/dL.",
    ];
    if (glucose <= 100) {
      warnings.push("Glucose ≤ 100 mg/dL — correction is intended for hyperglycemia; result equals (or falls below) measured sodium.");
    }
    return {
      value: round(corrected, 1),
      unit: "mEq/L",
      label: `Corrected sodium (${method === "hillier" ? "Hillier 2.4" : "Katz 1.6"})`,
      category: corrected < 135 ? "hyponatremia (<135)" : corrected > 145 ? "hypernatremia (>145)" : "normal (135–145)",
      interpretation: "true sodium once glucose-driven dilution is accounted for; guides free-water deficit and sodium trajectory in DKA/HHS.",
      formula: `measured Na + ${factor} × (glucose mg/dL − 100) ÷ 100`,
      inputsEcho: { sodium, glucose, method },
      source: method === "hillier" ? "Hillier et al., Am J Med 1999; MDCalc" : "Katz, NEJM 1973; MDCalc",
      warnings,
    };
  },
};

// ── Anion gap (mEq/L) ──
// AG = Na − (Cl + HCO3). The "unmeasured anion" gap; an elevated gap localizes a metabolic acidosis.
// (Potassium is conventionally omitted — this is the common serum anion gap.)
// Source: MDCalc "Anion Gap"; standard acid-base physiology.
export const anionGap: CalculatorDef = {
  id: "anion-gap",
  name: "Anion gap",
  category: "labs",
  description: "Serum anion gap Na − (Cl + HCO3); screens for and classifies metabolic acidosis.",
  source: "MDCalc (Anion Gap); standard acid-base physiology",
  inputs: [
    { key: "sodium", label: "Sodium", type: "number", unit: "mEq/L", min: 100, max: 200, required: true },
    { key: "chloride", label: "Chloride", type: "number", unit: "mEq/L", min: 50, max: 160, required: true },
    { key: "bicarbonate", label: "Bicarbonate (HCO3)", type: "number", unit: "mEq/L", min: 1, max: 60, required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const sodium = num(args, "sodium", { min: 100, max: 200 });
    const chloride = num(args, "chloride", { min: 50, max: 160 });
    const bicarbonate = num(args, "bicarbonate", { min: 1, max: 60 });
    const ag = sodium - (chloride + bicarbonate);
    return {
      value: round(ag, 1),
      unit: "mEq/L",
      label: "Anion gap",
      category: ag > 12 ? "high anion gap (>12)" : ag < 3 ? "low anion gap (<3)" : "normal (3–12)",
      interpretation: ag > 12
        ? "elevated gap — consider MUDPILES causes (lactate, ketones, toxins, uremia)"
        : "gap not elevated; a normal gap does not exclude acidosis in hypoalbuminemia (use albumin-corrected gap)",
      formula: "Na − (Cl + HCO3)",
      inputsEcho: { sodium, chloride, bicarbonate },
      source: "MDCalc (Anion Gap); standard acid-base physiology",
      warnings: [
        "Normal range is assay-dependent (commonly ~3–12 mEq/L); potassium is omitted in this common form.",
        "Hypoalbuminemia lowers the measured gap by ~2.5 mEq/L per 1 g/dL albumin — use the albumin-corrected anion gap.",
      ],
    };
  },
};

// ── Albumin-corrected anion gap (mEq/L) ──
// Corrected AG = AG + 2.5 × (4.0 − albumin_g/dL), where AG = Na − (Cl + HCO3).
// Albumin is the dominant unmeasured anion (~75% of the gap); each 1 g/dL below 4.0 lowers the
// apparent gap ~2.5 mEq/L, so hypoalbuminemia can mask a true high-gap acidosis.
// Source: Figge J et al., Crit Care Med 1998; MDCalc "Anion Gap" (albumin-corrected).
export const correctedAnionGap: CalculatorDef = {
  id: "anion-gap-albumin-corrected",
  name: "Albumin-corrected anion gap",
  category: "labs",
  description: "Anion gap adjusted for albumin so hypoalbuminemia doesn't hide a high-gap metabolic acidosis.",
  source: "Figge et al., Crit Care Med 1998; MDCalc",
  inputs: [
    { key: "sodium", label: "Sodium", type: "number", unit: "mEq/L", min: 100, max: 200, required: true },
    { key: "chloride", label: "Chloride", type: "number", unit: "mEq/L", min: 50, max: 160, required: true },
    { key: "bicarbonate", label: "Bicarbonate (HCO3)", type: "number", unit: "mEq/L", min: 1, max: 60, required: true },
    { key: "albumin", label: "Serum albumin", type: "number", unit: "g/dL", min: 0.5, max: 7, required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const sodium = num(args, "sodium", { min: 100, max: 200 });
    const chloride = num(args, "chloride", { min: 50, max: 160 });
    const bicarbonate = num(args, "bicarbonate", { min: 1, max: 60 });
    const albumin = num(args, "albumin", { min: 0.5, max: 7 });
    const ag = sodium - (chloride + bicarbonate);
    const corrected = ag + 2.5 * (NORMAL_ALBUMIN - albumin);
    return {
      value: round(corrected, 1),
      unit: "mEq/L",
      label: "Albumin-corrected anion gap",
      category: corrected > 12 ? "high corrected gap (>12)" : "normal (≤12)",
      interpretation: corrected > 12
        ? "corrected gap elevated — high-gap metabolic acidosis (may be masked on the uncorrected gap)"
        : "corrected gap not elevated",
      formula: "[Na − (Cl + HCO3)] + 2.5 × (4.0 − albumin g/dL)",
      inputsEcho: { sodium, chloride, bicarbonate, albumin },
      source: "Figge et al., Crit Care Med 1998; MDCalc",
      warnings: [
        "Assumes normal albumin = 4.0 g/dL and US units (albumin g/dL).",
        `Uncorrected anion gap here is ${round(ag, 1)} mEq/L; the correction adds the albumin term.`,
      ],
    };
  },
};

// ── Calculated serum osmolality (mOsm/kg) ──
// Calc Osm = 2 × Na + glucose/18 + BUN/2.8. (2×Na for paired anions; /18 and /2.8 convert mg/dL of
// glucose [MW 180] and BUN to mmol/L.) Compared with a measured osmolality, the osmolar gap
// (measured − calculated; normal < 10) flags unmeasured osmoles such as toxic alcohols.
// Source: MDCalc "Serum Osmolality/Osmolarity"; standard formula.
export const serumOsmolality: CalculatorDef = {
  id: "serum-osmolality-calculated",
  name: "Calculated serum osmolality",
  category: "labs",
  description: "Calculated serum osmolality 2×Na + glucose/18 + BUN/2.8; with a measured value, reports the osmolar gap.",
  source: "MDCalc (Serum Osmolality/Osmolarity)",
  inputs: [
    { key: "sodium", label: "Sodium", type: "number", unit: "mEq/L", min: 100, max: 200, required: true },
    { key: "glucose", label: "Glucose", type: "number", unit: "mg/dL", min: 0, max: 2000, required: true },
    { key: "bun", label: "BUN", type: "number", unit: "mg/dL", min: 0, max: 300, required: true },
    { key: "measuredOsm", label: "Measured osmolality (optional, for osmolar gap)", type: "number", unit: "mOsm/kg", min: 100, max: 500, required: false },
  ],
  run(args: CalcArgs): CalcResult {
    const sodium = num(args, "sodium", { min: 100, max: 200 });
    const glucose = num(args, "glucose", { min: 0, max: 2000 });
    const bun = num(args, "bun", { min: 0, max: 300 });
    const calc = 2 * sodium + glucose / 18 + bun / 2.8;

    const hasMeasured = args["measuredOsm"] !== undefined && args["measuredOsm"] !== "";
    const inputsEcho: CalcArgs = { sodium, glucose, bun };
    let category: string;
    let interpretation: string;
    const warnings = [
      "Add ethanol/3.7 (or /4.6 per local convention) to the formula if blood ethanol is known.",
      "Osmolar gap = measured − calculated; normal < 10 mOsm/kg. A high gap suggests unmeasured osmoles (methanol, ethylene glycol, isopropanol, mannitol).",
    ];
    if (hasMeasured) {
      const measured = num(args, "measuredOsm", { min: 100, max: 500 });
      const gap = measured - calc;
      inputsEcho.measuredOsm = measured;
      category = gap >= 10 ? "elevated osmolar gap (≥10)" : "normal osmolar gap (<10)";
      interpretation = `osmolar gap = measured − calculated = ${round(measured, 1)} − ${round(calc, 1)} = ${round(gap, 1)} mOsm/kg${gap >= 10 ? "; elevated — consider toxic alcohols/unmeasured osmoles" : ""}`;
    } else {
      category = calc >= 275 && calc <= 295 ? "normal (275–295)" : calc < 275 ? "low (<275)" : "high (>295)";
      interpretation = "calculated osmolality; supply a measured value to compute the osmolar gap";
    }

    return {
      value: round(calc, 1),
      unit: "mOsm/kg",
      label: "Calculated serum osmolality",
      category,
      interpretation,
      formula: "2 × Na + glucose/18 + BUN/2.8",
      inputsEcho,
      source: "MDCalc (Serum Osmolality/Osmolarity); standard formula",
      warnings,
    };
  },
};

// ── Fractional excretion of sodium, FENa (%) ──
// FENa = (UNa × PCr) / (PNa × UCr) × 100. The fraction of filtered sodium that is excreted; a low
// value (<1%) means avid tubular sodium reabsorption (prerenal/volume depletion), a high value
// (>2%) suggests tubular injury (ATN). Invalid on diuretics or in CKD.
// Source: Espinel CH, JAMA 1976; MDCalc "Fractional Excretion of Sodium (FENa)".
export const fena: CalculatorDef = {
  id: "fena",
  name: "Fractional excretion of sodium (FENa)",
  category: "labs",
  description: "Fraction of filtered sodium excreted; distinguishes prerenal (<1%) from intrinsic/ATN (>2%) acute kidney injury.",
  source: "Espinel, JAMA 1976; MDCalc",
  inputs: [
    { key: "urineNa", label: "Urine sodium", type: "number", unit: "mEq/L", min: 0.1, max: 400, required: true },
    { key: "serumNa", label: "Serum/plasma sodium", type: "number", unit: "mEq/L", min: 100, max: 200, required: true },
    { key: "urineCr", label: "Urine creatinine", type: "number", unit: "mg/dL", min: 1, max: 600, required: true },
    { key: "serumCr", label: "Serum/plasma creatinine", type: "number", unit: "mg/dL", min: 0.1, max: 25, required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const urineNa = num(args, "urineNa", { min: 0.1, max: 400 });
    const serumNa = num(args, "serumNa", { min: 100, max: 200 });
    const urineCr = num(args, "urineCr", { min: 1, max: 600 });
    const serumCr = num(args, "serumCr", { min: 0.1, max: 25 });
    const fenaPct = (urineNa * serumCr) / (serumNa * urineCr) * 100;
    return {
      value: round(fenaPct, 2),
      unit: "%",
      label: "Fractional excretion of sodium (FENa)",
      category: fenaPct < 1 ? "FENa <1% (prerenal pattern)" : fenaPct > 2 ? "FENa >2% (ATN/intrinsic pattern)" : "FENa 1–2% (indeterminate)",
      interpretation: fenaPct < 1
        ? "avid sodium retention — consistent with prerenal azotemia/volume depletion"
        : fenaPct > 2
        ? "sodium wasting — consistent with acute tubular necrosis / intrinsic AKI"
        : "indeterminate zone — correlate with clinical context",
      formula: "(urine Na × serum Cr) ÷ (serum Na × urine Cr) × 100",
      inputsEcho: { urineNa, serumNa, urineCr, serumCr },
      source: "Espinel, JAMA 1976; MDCalc (Fractional Excretion of Sodium)",
      warnings: [
        "Invalid on diuretics, in CKD, or with recent contrast — use fractional excretion of urea (FEUrea) instead.",
        "No single cutoff is diagnostic; interpret with history, exam, and urine sediment.",
      ],
    };
  },
};

export const labsCalculators: CalculatorDef[] = [
  correctedCalcium,
  correctedSodium,
  anionGap,
  correctedAnionGap,
  serumOsmolality,
  fena,
];
