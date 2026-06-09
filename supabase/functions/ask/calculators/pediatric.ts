// Pediatric dosing & fluid calculators — the highest-stakes group in this app (they drive IV doses
// and infusion rates in children, where a unit slip is a tenfold overdose). Every value is computed
// in real code from the published formula; reference test cases live in pediatric.test.ts.
//
// UNITS follow the shared US/metric convention (types.ts): weight kg, height cm, serum creatinine
// mg/dL. Dose calculators are drug-agnostic — the caller supplies the per-kg or per-m² rate from the
// label; these functions only do the deterministic arithmetic (and the max-dose cap) on top of it.
//
// CAP-RECOMPUTE INVARIANT: when a maximum daily dose caps the total, the per-dose amount is ALWAYS
// recomputed from the capped daily total, so perDose × frequency == daily (never an over-dose).
// METHOD-INDEPENDENCE INVARIANT (Holliday-Segar): the 4-2-1 hourly rate and the 100-50-20 daily
// volume are two independent estimates; one is NEVER derived as 24× the other (65 mL/hr ≠ 1560 = 1600).

import { type CalcArgs, type CalculatorDef, type CalcResult, enumArg, num, round } from "./types.ts";

const DOSE_BASIS = ["per-day", "per-dose"] as const;

// ── shared, UNROUNDED building blocks (never round inside a chained calc — see round() contract) ──

/** Holliday-Segar daily maintenance volume (mL/day) via the 100-50-20 tiers. */
function hollidaySegarDailyMl(weightKg: number): number {
  if (weightKg <= 10) return 100 * weightKg;
  if (weightKg <= 20) return 1000 + 50 * (weightKg - 10);
  return 1500 + 20 * (weightKg - 20);
}

/** Holliday-Segar hourly maintenance rate (mL/hr) via the independent 4-2-1 tiers. */
function hollidaySegarHourlyMl(weightKg: number): number {
  if (weightKg <= 10) return 4 * weightKg;
  if (weightKg <= 20) return 40 + 2 * (weightKg - 10);
  return 60 + 1 * (weightKg - 20);
}

// ── Pediatric weight-based dose (mg/kg/day or mg/kg/dose → total + per-dose, with max-dose cap) ──
// day-mode:  daily = weight_kg × dose_per_kg_per_day
// dose-mode: daily = (weight_kg × dose_per_kg_per_dose) × frequency
// Then, if a maximum daily dose is given: daily = min(daily, max_daily); perDose = daily ÷ frequency.
// `value` is the total DAILY dose (mg/day) — the quantity the cap acts on; per-dose is in the output.
// Source: standard weight-based dosing arithmetic; dose mode/frequency/cap per Lexicomp/AAP dosing
// convention. Worked example (amoxicillin 25 mg/kg/day, 14.2 kg, q12h): 355 mg/day → 177.5 mg/dose.
export const pediatricWeightDose: CalculatorDef = {
  id: "peds-weight-based-dose",
  name: "Pediatric weight-based dose (mg/kg)",
  category: "body",
  description:
    "Converts a label's mg/kg/day or mg/kg/dose rate into a total daily dose and a per-dose amount for a given dosing frequency, applying an optional maximum-daily-dose cap.",
  source: "Weight-based dosing arithmetic; cap per Lexicomp/AAP pediatric dosing convention",
  inputs: [
    { key: "weight", label: "Weight", type: "number", unit: "kg", min: 0.5, max: 150, required: true },
    { key: "dose_per_kg", label: "Dose rate", type: "number", unit: "mg/kg (per day or per dose)", min: 0, max: 1000, required: true },
    { key: "basis", label: "Dose basis", type: "enum", options: [...DOSE_BASIS], required: true },
    { key: "frequency", label: "Doses per day", type: "number", unit: "doses/day", min: 1, max: 6, required: true },
    { key: "max_dose_per_day", label: "Maximum dose per day (cap)", type: "number", unit: "mg/day", min: 0, max: 100000, required: false },
  ],
  run(args: CalcArgs): CalcResult {
    const weight = num(args, "weight", { min: 0.5, max: 150 });
    const dosePerKg = num(args, "dose_per_kg", { min: 0, max: 1000 });
    const basis = enumArg(args, "basis", DOSE_BASIS);
    const frequency = num(args, "frequency", { min: 1, max: 6 });
    // Cap is optional: only validate/apply when supplied (undefined/"" means "no cap").
    const capRaw = args["max_dose_per_day"];
    const hasCap = capRaw !== undefined && capRaw !== null && capRaw !== "";
    const maxDaily = hasCap ? num(args, "max_dose_per_day", { min: 0, max: 100000 }) : Infinity;

    // Compute the daily total unrounded from whichever basis was supplied.
    const dailyUncapped = basis === "per-day"
      ? weight * dosePerKg
      : weight * dosePerKg * frequency;
    const capped = hasCap && dailyUncapped > maxDaily;
    const daily = capped ? maxDaily : dailyUncapped; // cap acts on the DAILY total
    const perDose = daily / frequency; // recompute per-dose from the (possibly capped) daily total

    const warnings = [
      "Drug-agnostic arithmetic: the mg/kg rate, dosing frequency, and any maximum must come from the specific drug's label/reference — this tool does not know the drug.",
      "Confirm the formulation strength and the volume to administer separately; this returns a mass (mg), not a volume.",
    ];
    if (weight < 3) {
      warnings.unshift("Weight <3 kg (neonate/preterm): many drugs use neonatal-specific regimens and postmenstrual-age dosing — verify against a neonatal reference.");
    }
    if (capped) {
      warnings.unshift(`Maximum daily dose cap applied: uncapped ${round(dailyUncapped, 1)} mg/day exceeded the ${round(maxDaily, 1)} mg/day cap; per-dose recomputed from the capped total.`);
    }

    return {
      value: round(daily, 1),
      unit: "mg/day",
      label: "Pediatric weight-based dose",
      category: capped ? "max daily dose cap applied" : "within weight-based dose",
      interpretation: `${round(daily, 1)} mg/day total ÷ ${frequency} dose(s)/day = ${round(perDose, 1)} mg/dose.`,
      formula: basis === "per-day"
        ? "daily = weight_kg × dose_mg/kg/day; per-dose = daily ÷ doses-per-day; daily capped at max (per-dose then recomputed from capped daily)"
        : "daily = weight_kg × dose_mg/kg/dose × doses-per-day; per-dose = daily ÷ doses-per-day; daily capped at max (per-dose then recomputed from capped daily)",
      inputsEcho: {
        weight,
        dose_per_kg: dosePerKg,
        basis,
        frequency,
        max_dose_per_day: hasCap ? maxDaily : "none",
        dose_per_day: round(daily, 1),
        dose_per_dose: round(perDose, 1),
      },
      source: "Weight-based dosing arithmetic; cap per Lexicomp/AAP pediatric dosing convention",
      warnings,
    };
  },
};

// ── Pediatric BSA-based dose (mg/m²) → total dose ──
// total = BSA_m² × dose_per_m². BSA itself comes from the Mosteller/Du Bois calculator (bsa-mosteller);
// this calculator takes BSA directly so the two compose without re-deriving body surface area.
// Source: standard BSA-based (mg/m²) dosing arithmetic (e.g. chemotherapy, some pediatric regimens).
// Hand-exact reference: 1.0 m² × 100 mg/m² = 100 mg.
export const pediatricBsaDose: CalculatorDef = {
  id: "peds-bsa-based-dose",
  name: "Pediatric BSA-based dose (mg/m²)",
  category: "body",
  description:
    "Converts a label's mg/m² rate into a total dose for a given body surface area, with an optional maximum-dose cap. Pair with the BSA (Mosteller) calculator to obtain the BSA input.",
  source: "Body-surface-area (mg/m²) dosing arithmetic",
  inputs: [
    { key: "bsa", label: "Body surface area", type: "number", unit: "m²", min: 0.1, max: 3, required: true },
    { key: "dose_per_m2", label: "Dose rate", type: "number", unit: "mg/m²", min: 0, max: 10000, required: true },
    { key: "max_dose", label: "Maximum total dose (cap)", type: "number", unit: "mg", min: 0, max: 100000, required: false },
  ],
  run(args: CalcArgs): CalcResult {
    const bsa = num(args, "bsa", { min: 0.1, max: 3 });
    const dosePerM2 = num(args, "dose_per_m2", { min: 0, max: 10000 });
    const capRaw = args["max_dose"];
    const hasCap = capRaw !== undefined && capRaw !== null && capRaw !== "";
    const maxDose = hasCap ? num(args, "max_dose", { min: 0, max: 100000 }) : Infinity;

    const uncapped = bsa * dosePerM2;
    const capped = hasCap && uncapped > maxDose;
    const total = capped ? maxDose : uncapped;

    const warnings = [
      "Drug-agnostic arithmetic: the mg/m² rate and any maximum must come from the specific drug's protocol/label.",
      "BSA-capping is common in pediatric oncology (e.g. capping at the dose for ~2.0 m² in large adolescents) — apply only the cap your protocol specifies.",
    ];
    if (capped) {
      warnings.unshift(`Maximum dose cap applied: uncapped ${round(uncapped, 1)} mg exceeded the ${round(maxDose, 1)} mg cap.`);
    }

    return {
      value: round(total, 1),
      unit: "mg",
      label: "Pediatric BSA-based dose",
      category: capped ? "max dose cap applied" : "within BSA-based dose",
      interpretation: `${round(bsa, 2)} m² × ${dosePerM2} mg/m² = ${round(total, 1)} mg total dose${capped ? " (capped)" : ""}.`,
      formula: "total_dose = BSA_m² × dose_mg/m² (capped at max if supplied)",
      inputsEcho: { bsa, dose_per_m2: dosePerM2, max_dose: hasCap ? maxDose : "none" },
      source: "Body-surface-area (mg/m²) dosing arithmetic",
      warnings,
    };
  },
};

// ── Holliday-Segar maintenance fluid (4-2-1 hourly rate / 100-50-20 daily volume) ──
// Hourly (4-2-1):  4 mL/kg/hr first 10 kg + 2 mL/kg/hr next 10 kg + 1 mL/kg/hr each kg >20.
// Daily (100-50-20): 100 mL/kg/day first 10 kg + 50 mL/kg/day next 10 kg + 20 mL/kg/day each kg >20.
// The two methods are INDEPENDENT estimates (25 kg → 65 mL/hr but 1600 mL/day; 65×24=1560 ≠ 1600).
// `value` is the hourly pump rate (mL/hr); the daily volume is reported alongside.
// Source: Holliday MA, Segar WE. The maintenance need for water in parenteral fluid therapy.
// Pediatrics. 1957;19(5):823-832.
export const hollidaySegar: CalculatorDef = {
  id: "peds-holliday-segar-maintenance-fluid",
  name: "Holliday-Segar maintenance fluid (4-2-1 / 100-50-20)",
  category: "body",
  description:
    "Estimates pediatric maintenance IV fluid as an hourly rate (4-2-1 rule) and a daily volume (100-50-20 rule) from body weight.",
  source: "Holliday & Segar, Pediatrics 1957",
  inputs: [
    { key: "weight", label: "Weight", type: "number", unit: "kg", min: 0.5, max: 150, required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const weight = num(args, "weight", { min: 0.5, max: 150 });
    const hourly = hollidaySegarHourlyMl(weight); // 4-2-1
    const daily = hollidaySegarDailyMl(weight); // 100-50-20 (independent — not 24× hourly)

    const warnings = [
      "Maintenance only — does NOT account for deficit (dehydration), ongoing losses, fever, or third-spacing; add those separately.",
      "The 4-2-1 hourly rate and 100-50-20 daily volume are independent estimates and do not multiply to each other (e.g. 65 mL/hr ≠ 1560 ≈ 1600 mL/day).",
      "Classic 100-50-20 daily volumes can exceed ~2400 mL/day in large children; many protocols cap maintenance at the 70 kg adult value (~2400 mL/day, ~100 mL/hr).",
    ];
    if (weight < 3) {
      warnings.unshift("Weight <3 kg / first days of life: neonates use different maintenance regimens (lower volumes, day-of-life titration) — do not apply Holliday-Segar.");
    }

    return {
      value: round(hourly, 1),
      unit: "mL/hr",
      label: "Holliday-Segar maintenance fluid (4-2-1 rate)",
      interpretation: `Maintenance rate ${round(hourly, 1)} mL/hr (4-2-1); daily volume ${round(daily, 0)} mL/day (100-50-20).`,
      formula: "4-2-1: 4 mL/kg/hr (≤10 kg) + 2 mL/kg/hr (10–20 kg) + 1 mL/kg/hr (>20 kg). 100-50-20: 100/50/20 mL/kg/day over the same tiers.",
      inputsEcho: { weight, rate_ml_per_hr: round(hourly, 1), volume_ml_per_day: round(daily, 0) },
      source: "Holliday & Segar, Pediatrics 1957",
      warnings,
    };
  },
};

// ── Schwartz bedside pediatric eGFR (2009) (mL/min/1.73m²) ──
// eGFR = 0.413 × height_cm ÷ SCr_mgdl. k = 0.413 for IDMS-traceable creatinine, ages ~1–18 yr.
// Source: Schwartz GJ, Muñoz A, Schneider MF, et al. New equations to estimate GFR in children with
// CKD. J Am Soc Nephrol. 2009;20(3):629-637.
// Worked example: height 140 cm, SCr 0.8 mg/dL → 0.413×140/0.8 = 72.3 mL/min/1.73m².
export const schwartzEgfr: CalculatorDef = {
  id: "egfr-schwartz-bedside-2009",
  name: "Pediatric eGFR (bedside Schwartz 2009)",
  category: "renal",
  description:
    "Estimates GFR in children using the bedside Schwartz equation (k=0.413) for IDMS-traceable creatinine; basis for pediatric renal drug dosing and CKD staging.",
  source: "Schwartz et al., J Am Soc Nephrol 2009",
  inputs: [
    { key: "height", label: "Height", type: "number", unit: "cm", min: 30, max: 200, required: true },
    { key: "scr", label: "Serum creatinine", type: "number", unit: "mg/dL", min: 0.1, max: 25, required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const height = num(args, "height", { min: 30, max: 200 });
    const scr = num(args, "scr", { min: 0.1, max: 25 });
    const egfr = (0.413 * height) / scr;

    return {
      value: round(egfr, 1),
      unit: "mL/min/1.73m²",
      label: "Pediatric eGFR (bedside Schwartz 2009)",
      category: pedsGfrBand(egfr),
      interpretation: egfr < 60
        ? "below 60 for ≥3 months suggests CKD in children — verify against age-specific norms and check pediatric renal dosing"
        : "normal/mildly reduced for most ages (interpret against age-specific norms)",
      formula: "eGFR = 0.413 × height_cm ÷ SCr_mg/dL  (k = 0.413, IDMS-traceable creatinine)",
      inputsEcho: { height, scr },
      source: "Schwartz et al., J Am Soc Nephrol 2009",
      warnings: [
        "Validated for children ~1–18 years with the bedside k=0.413 (IDMS-traceable enzymatic creatinine); not for neonates/infants <1 yr.",
        "Pediatric eGFR is age-dependent: a value in the adult 'G2' band can be normal-for-age in a young child — interpret against age-specific reference GFR.",
        "Unreliable when serum creatinine is changing rapidly (e.g. AKI); use a steady-state SCr.",
      ],
    };
  },
};

function pedsGfrBand(egfr: number): string {
  if (egfr >= 90) return "≥90 mL/min/1.73m²";
  if (egfr >= 60) return "60–89 mL/min/1.73m²";
  if (egfr >= 45) return "45–59 mL/min/1.73m²";
  if (egfr >= 30) return "30–44 mL/min/1.73m²";
  if (egfr >= 15) return "15–29 mL/min/1.73m²";
  return "<15 mL/min/1.73m²";
}

export const pediatricCalculators: CalculatorDef[] = [
  pediatricWeightDose,
  pediatricBsaDose,
  hollidaySegar,
  schwartzEgfr,
];
