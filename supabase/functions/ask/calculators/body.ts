// Body-size calculators — BMI, body surface area, and the body-weight estimators (IBW/ABW/LBW)
// that drive weight-based and BSA-based dosing (chemo mg/m², aminoglycoside dosing weight, etc.).
// Each formula is the published reference; reference test cases live in body.test.ts.
//
// UNITS follow the shared US/metric convention (types.ts): weight kg, height cm, age years.
// The Devine IBW formula is defined per inch over 60 in (5 ft); we convert cm → inches (÷2.54)
// internally so callers only ever supply centimeters.

import { type CalcArgs, type CalculatorDef, type CalcResult, enumArg, num, round } from "./types.ts";

const SEX = ["male", "female"] as const;
const CM_PER_INCH = 2.54;

// ── shared, UNROUNDED building blocks (never round inside a chained calc — see round() contract) ──

/** Devine (1974) ideal body weight in kg. Male base 50, female base 45.5; +2.3 kg per inch >60 in. */
function devineIBW(heightCm: number, sex: string): number {
  const inchesOver60 = heightCm / CM_PER_INCH - 60;
  const base = sex === "female" ? 45.5 : 50;
  return base + 2.3 * inchesOver60;
}

// ── Body mass index (kg/m²) → WHO weight class ──
// BMI = weight_kg ÷ (height_m)². WHO adult cutoffs: <18.5 underweight, 18.5–24.9 normal,
// 25–29.9 overweight, 30–34.9 obese I, 35–39.9 obese II, ≥40 obese III.
// Source: WHO. Obesity: preventing and managing the global epidemic. WHO Technical Report Series 894.
export const bmi: CalculatorDef = {
  id: "bmi",
  name: "Body mass index (BMI)",
  category: "body",
  description: "Weight-for-height index with WHO weight classification; screens for under/overweight and obesity.",
  source: "WHO Technical Report Series 894 (2000)",
  inputs: [
    { key: "weight", label: "Weight", type: "number", unit: "kg", min: 1, max: 500, required: true },
    { key: "height", label: "Height", type: "number", unit: "cm", min: 50, max: 260, required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const weight = num(args, "weight", { min: 1, max: 500 });
    const height = num(args, "height", { min: 50, max: 260 });
    const heightM = height / 100;
    const value = weight / (heightM * heightM);
    return {
      value: round(value, 1),
      unit: "kg/m²",
      label: "Body mass index (BMI)",
      category: whoBmiClass(value),
      interpretation: value < 18.5
        ? "underweight — assess nutrition"
        : value < 25
        ? "normal weight"
        : value < 30
        ? "overweight — elevated cardiometabolic risk"
        : "obese — high cardiometabolic risk",
      formula: "BMI = weight_kg ÷ (height_m)²",
      inputsEcho: { weight, height },
      source: "WHO Technical Report Series 894 (2000)",
      warnings: [
        "BMI does not distinguish fat from lean mass; it over-reads in muscular builds and under-reads with low muscle mass.",
        "Adult cutoffs only; pediatric BMI uses age/sex percentiles, and lower Asian-population cutoffs are sometimes applied.",
      ],
    };
  },
};

function whoBmiClass(b: number): string {
  if (b < 18.5) return "Underweight (<18.5)";
  if (b < 25) return "Normal weight (18.5–24.9)";
  if (b < 30) return "Overweight (25–29.9)";
  if (b < 35) return "Obese class I (30–34.9)";
  if (b < 40) return "Obese class II (35–39.9)";
  return "Obese class III (≥40)";
}

// ── Body surface area — Mosteller (m²) ──
// BSA = √(height_cm × weight_kg ÷ 3600).
// Source: Mosteller RD. Simplified calculation of body-surface area. N Engl J Med. 1987;317(17):1098.
export const bsaMosteller: CalculatorDef = {
  id: "bsa-mosteller",
  name: "Body surface area (Mosteller)",
  category: "body",
  description: "BSA for body-size-adjusted dosing (e.g. chemotherapy mg/m²) via the Mosteller equation.",
  source: "Mosteller, N Engl J Med 1987",
  inputs: [
    { key: "height", label: "Height", type: "number", unit: "cm", min: 50, max: 260, required: true },
    { key: "weight", label: "Weight", type: "number", unit: "kg", min: 1, max: 500, required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const height = num(args, "height", { min: 50, max: 260 });
    const weight = num(args, "weight", { min: 1, max: 500 });
    const value = Math.sqrt((height * weight) / 3600);
    return {
      value: round(value, 2),
      unit: "m²",
      label: "Body surface area (Mosteller)",
      interpretation: "BSA used as the multiplier for mg/m² dosing and the divisor for body-size-indexed values (e.g. cardiac index).",
      formula: "BSA = √(height_cm × weight_kg ÷ 3600)",
      inputsEcho: { height, weight },
      source: "Mosteller, N Engl J Med 1987",
      warnings: ["Mosteller and Du Bois agree closely for typical adults but diverge at extremes of body habitus; institutional protocols may specify one."],
    };
  },
};

// ── Body surface area — Du Bois & Du Bois (m²) ──
// BSA = 0.007184 × weight_kg^0.425 × height_cm^0.725.
// Source: Du Bois D, Du Bois EF. A formula to estimate the approximate surface area if height and
// weight be known. Arch Intern Med. 1916;17:863-871.
export const bsaDuBois: CalculatorDef = {
  id: "bsa-dubois",
  name: "Body surface area (Du Bois)",
  category: "body",
  description: "BSA via the original 1916 Du Bois equation; still cited by many dosing references.",
  source: "Du Bois & Du Bois, Arch Intern Med 1916",
  inputs: [
    { key: "height", label: "Height", type: "number", unit: "cm", min: 50, max: 260, required: true },
    { key: "weight", label: "Weight", type: "number", unit: "kg", min: 1, max: 500, required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const height = num(args, "height", { min: 50, max: 260 });
    const weight = num(args, "weight", { min: 1, max: 500 });
    const value = 0.007184 * Math.pow(weight, 0.425) * Math.pow(height, 0.725);
    return {
      value: round(value, 2),
      unit: "m²",
      label: "Body surface area (Du Bois)",
      interpretation: "BSA used as the multiplier for mg/m² dosing and the divisor for body-size-indexed values (e.g. cardiac index).",
      formula: "BSA = 0.007184 × weight_kg^0.425 × height_cm^0.725",
      inputsEcho: { height, weight },
      source: "Du Bois & Du Bois, Arch Intern Med 1916",
      warnings: ["Derived from a small 1916 cohort; can under-read BSA in obese patients relative to Mosteller. Institutional protocols may specify one formula."],
    };
  },
};

// ── Ideal body weight — Devine (kg) ──
// Male 50 + 2.3×(in over 60); female 45.5 + 2.3×(in over 60). Height converted cm → inches.
// Source: Devine BJ. Gentamicin therapy. Drug Intell Clin Pharm. 1974;8:650-655.
export const idealBodyWeight: CalculatorDef = {
  id: "ibw-devine",
  name: "Ideal body weight (Devine)",
  category: "body",
  description: "Devine IBW — the default dosing weight for several drugs and a common renal-estimation input.",
  source: "Devine, Drug Intell Clin Pharm 1974",
  inputs: [
    { key: "height", label: "Height", type: "number", unit: "cm", min: 90, max: 260, required: true },
    { key: "sex", label: "Sex", type: "enum", options: [...SEX], required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const height = num(args, "height", { min: 90, max: 260 });
    const sex = enumArg(args, "sex", SEX);
    const value = devineIBW(height, sex);
    return {
      value: round(value, 1),
      unit: "kg",
      label: "Ideal body weight (Devine)",
      interpretation: "Height-based dosing weight; used directly for some drugs and as the basis for adjusted body weight.",
      formula: "IBW = (50 kg male / 45.5 kg female) + 2.3 × (height_in − 60); height_in = height_cm ÷ 2.54",
      inputsEcho: { height, sex },
      source: "Devine, Drug Intell Clin Pharm 1974",
      warnings: [
        "The Devine equation is linear and unbounded; below ~152 cm (5 ft) it is extrapolated and can yield implausibly low or negative weights — interpret with caution.",
        "IBW is a dosing construct, not a body-composition target.",
      ],
    };
  },
};

// ── Adjusted body weight (kg) ──
// AdjBW = IBW + 0.4 × (actual weight − IBW). Used when actual weight exceeds IBW (obesity).
// Source: Standard pharmacokinetic dosing convention built on Devine IBW (Devine 1974).
export const adjustedBodyWeight: CalculatorDef = {
  id: "abw-adjusted",
  name: "Adjusted body weight",
  category: "body",
  description: "Dosing weight that adds 40% of the excess over IBW; common for aminoglycoside and other dosing in obesity.",
  source: "Devine IBW (1974) + standard 0.4 adjustment-factor convention",
  inputs: [
    { key: "height", label: "Height", type: "number", unit: "cm", min: 90, max: 260, required: true },
    { key: "weight", label: "Actual weight", type: "number", unit: "kg", min: 1, max: 500, required: true },
    { key: "sex", label: "Sex", type: "enum", options: [...SEX], required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const height = num(args, "height", { min: 90, max: 260 });
    const weight = num(args, "weight", { min: 1, max: 500 });
    const sex = enumArg(args, "sex", SEX);
    const ibw = devineIBW(height, sex); // unrounded — chained into the adjustment
    const value = ibw + 0.4 * (weight - ibw);
    const overIbw = ibw > 0 ? (weight - ibw) / ibw : 0;
    const warnings = [
      "The 0.4 adjustment is intended for patients above ideal body weight (typically >20–30% over IBW); below IBW the formula returns a weight above actual and is not the appropriate dosing weight.",
      "Adjustment factor and applicable drugs vary by protocol; confirm against the specific drug's dosing guidance.",
    ];
    if (weight < ibw) {
      warnings.unshift(`Actual weight (${round(weight, 1)} kg) is below IBW (${round(ibw, 1)} kg); adjusted body weight is generally not used here — use actual or ideal body weight per protocol.`);
    }
    return {
      value: round(value, 1),
      unit: "kg",
      label: "Adjusted body weight",
      category: overIbw >= 0.2 ? "≥20% over IBW (adjustment typically indicated)" : "<20% over IBW",
      interpretation: "Dosing weight = IBW + 40% of the amount actual weight exceeds IBW.",
      formula: "AdjBW = IBW + 0.4 × (actual_weight − IBW); IBW by Devine",
      inputsEcho: { height, weight, sex },
      source: "Devine IBW (1974) + 0.4 adjustment-factor convention",
      warnings,
    };
  },
};

// ── Lean body weight — Boer (kg) ──
// Male  LBW = 0.407×weight_kg + 0.267×height_cm − 19.2
// Female LBW = 0.252×weight_kg + 0.473×height_cm − 48.3
// Source: Boer P. Estimated lean body mass as an index for normalization of body fluid volumes
// in humans. Am J Physiol. 1984;247(4 Pt 2):F632-F636.
export const leanBodyWeight: CalculatorDef = {
  id: "lbw-boer",
  name: "Lean body weight (Boer)",
  category: "body",
  description: "Estimates fat-free mass from height and weight via the Boer equation; used to normalize some dosing.",
  source: "Boer, Am J Physiol 1984",
  inputs: [
    { key: "weight", label: "Weight", type: "number", unit: "kg", min: 1, max: 500, required: true },
    { key: "height", label: "Height", type: "number", unit: "cm", min: 90, max: 260, required: true },
    { key: "sex", label: "Sex", type: "enum", options: [...SEX], required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const weight = num(args, "weight", { min: 1, max: 500 });
    const height = num(args, "height", { min: 90, max: 260 });
    const sex = enumArg(args, "sex", SEX);
    const value = sex === "female"
      ? 0.252 * weight + 0.473 * height - 48.3
      : 0.407 * weight + 0.267 * height - 19.2;
    return {
      value: round(value, 1),
      unit: "kg",
      label: "Lean body weight (Boer)",
      interpretation: "Estimated fat-free mass; used as a dosing weight for drugs that distribute into lean tissue.",
      formula: "Male: 0.407×weight_kg + 0.267×height_cm − 19.2;  Female: 0.252×weight_kg + 0.473×height_cm − 48.3",
      inputsEcho: { weight, height, sex },
      source: "Boer, Am J Physiol 1984",
      warnings: [
        "Height/weight estimate of lean mass; underestimates in very muscular and overestimates in high-body-fat individuals (DEXA is the reference standard).",
        "Validated for adults; not for pediatric use.",
      ],
    };
  },
};

export const bodyCalculators: CalculatorDef[] = [
  bmi,
  bsaMosteller,
  bsaDuBois,
  idealBodyWeight,
  adjustedBodyWeight,
  leanBodyWeight,
];
