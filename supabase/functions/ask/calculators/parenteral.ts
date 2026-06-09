// Parenteral / IV-infusion calculators. Pure, deterministic arithmetic (real code, never LLM
// guessing) for the bedside infusion-pump math that drives vasoactive and other continuous IV
// doses, plus the compounding conversions (dilution, electrolyte mg↔mEq/mmol) those infusions
// depend on. Safety-critical: these set IV pump rates and electrolyte amounts, so every
// denominator input is bounded > 0 and the calculators throw CalcError rather than return a
// silently-wrong (Infinity/NaN) value.
//
// All five share category "conversion" (the contract's enum has no "parenteral"; that name lives
// only on the module export / file). Reference test cases live in parenteral.test.ts and are
// anchored to stated worked examples from authoritative sources (RegisteredNurseRN, NurseTogether,
// ScienceCompany, medplore), never to invented values.

import { type CalcArgs, CalcError, type CalculatorDef, type CalcResult, enumArg, num, round } from "./types.ts";

// ── IV infusion rate from a weight-based dose (mcg/kg/min → mL/hr) ────────────────────────────────
// rate_mL/hr = (dose_mcg/kg/min × weight_kg × 60) ÷ (concentration_mg/mL × 1000)
//   ×60 converts per-minute → per-hour; ÷1000 converts mcg (dose) → mg (concentration unit).
// Source: standard critical-care infusion math (RegisteredNurseRN dopamine drip review):
//   10 mcg/kg/min × 55 kg, 800 mg/500 mL (= 1.6 mg/mL) → 20.6 mL/hr.
export const infusionRateFromDose: CalculatorDef = {
  id: "iv-infusion-rate-from-dose",
  name: "IV infusion rate from weight-based dose (mcg/kg/min → mL/hr)",
  category: "conversion",
  description:
    "Converts a weight-based continuous IV dose (mcg/kg/min) to a pump rate in mL/hr, given the bag concentration (mg/mL) and patient weight.",
  source: "Standard weight-based IV infusion conversion (critical-care drip math)",
  inputs: [
    { key: "dose", label: "Dose", type: "number", unit: "mcg/kg/min", min: 0, max: 1000, required: true },
    { key: "weight", label: "Weight", type: "number", unit: "kg", min: 0.1, max: 500, required: true },
    { key: "concentration", label: "Concentration", type: "number", unit: "mg/mL", min: 0.0001, max: 1000, required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const dose = num(args, "dose", { min: 0, max: 1000 });
    const weight = num(args, "weight", { min: 0.1, max: 500 });
    const concentration = num(args, "concentration", { min: 0.0001, max: 1000 }); // mg/mL; >0 guards the divide
    const rate = (dose * weight * 60) / (concentration * 1000);
    return {
      value: round(rate, 1),
      unit: "mL/hr",
      label: "IV infusion rate",
      interpretation: `${dose} mcg/kg/min for a ${weight} kg patient at ${concentration} mg/mL = ${round(rate, 1)} mL/hr on the pump`,
      formula: "rate_mL/hr = (dose_mcg/kg/min × weight_kg × 60) ÷ (concentration_mg/mL × 1000)",
      inputsEcho: { dose, weight, concentration },
      source: "Standard weight-based IV infusion conversion (e.g. RegisteredNurseRN dopamine drip review)",
      warnings: [
        "Concentration is the actual bag concentration in mg/mL (total drug mg ÷ total volume mL); a wrong concentration scales the rate proportionally.",
        "Dose unit is mcg/kg/min. For doses ordered per kg/hr or as a flat mcg/min, convert before using this calculator.",
        "Verify against the pump and the order; this is a calculation aid, not a substitute for independent double-check of high-alert infusions.",
      ],
    };
  },
};

// ── Dose from an infusion rate (mL/hr → mcg/kg/min) ──────────────────────────────────────────────
// dose_mcg/kg/min = (rate_mL/hr × concentration_mg/mL × 1000) ÷ (weight_kg × 60)
// Exact inverse of the rate calculation above. Source: same critical-care drip math
//   (RegisteredNurseRN dopamine review round-trip): 13.125 mL/hr, 70 kg, 1.6 mg/mL → 5.0 mcg/kg/min.
export const doseFromInfusionRate: CalculatorDef = {
  id: "iv-dose-from-infusion-rate",
  name: "Dose from IV infusion rate (mL/hr → mcg/kg/min)",
  category: "conversion",
  description:
    "Converts a running IV pump rate (mL/hr) back to the delivered weight-based dose (mcg/kg/min), given the bag concentration (mg/mL) and patient weight.",
  source: "Standard weight-based IV infusion conversion (critical-care drip math)",
  inputs: [
    { key: "rate", label: "Infusion rate", type: "number", unit: "mL/hr", min: 0, max: 10000, required: true },
    { key: "concentration", label: "Concentration", type: "number", unit: "mg/mL", min: 0.0001, max: 1000, required: true },
    { key: "weight", label: "Weight", type: "number", unit: "kg", min: 0.1, max: 500, required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const rate = num(args, "rate", { min: 0, max: 10000 });
    const concentration = num(args, "concentration", { min: 0.0001, max: 1000 });
    const weight = num(args, "weight", { min: 0.1, max: 500 }); // >0 guards the divide
    const dose = (rate * concentration * 1000) / (weight * 60);
    return {
      value: round(dose, 2),
      unit: "mcg/kg/min",
      label: "Delivered dose",
      interpretation: `${rate} mL/hr at ${concentration} mg/mL for a ${weight} kg patient = ${round(dose, 2)} mcg/kg/min`,
      formula: "dose_mcg/kg/min = (rate_mL/hr × concentration_mg/mL × 1000) ÷ (weight_kg × 60)",
      inputsEcho: { rate, concentration, weight },
      source: "Standard weight-based IV infusion conversion (e.g. RegisteredNurseRN dopamine drip review)",
      warnings: [
        "Exact inverse of the rate-from-dose calculation; result is in mcg/kg/min. Convert if the order is expressed in different units.",
        "Concentration must match the bag actually hanging (mg/mL); a wrong concentration scales the dose proportionally.",
      ],
    };
  },
};

// ── IV drip rate (gtt/min from volume, time, drop factor) ─────────────────────────────────────────
// gtt/min = (volume_mL × drop_factor_gtt/mL) ÷ time_min   (rounded to a whole drop)
// Drop factor is a property of the tubing: macrodrip 10/15/20 gtt/mL, microdrip 60 gtt/mL.
// Source: NurseTogether IV drip-rate worked example — 1000 mL over 360 min with a 10 gtt/mL set
//   → 27.8 → 28 gtt/min.
export const ivDripRate: CalculatorDef = {
  id: "iv-drip-rate",
  name: "IV drip rate (gtt/min)",
  category: "conversion",
  description:
    "Calculates the manual gravity drip rate in drops per minute (gtt/min) from the volume to infuse, the time, and the tubing's drop factor.",
  source: "Standard IV gravity drip-rate formula (nursing dosage calculations)",
  inputs: [
    { key: "volume", label: "Volume to infuse", type: "number", unit: "mL", min: 0, max: 100000, required: true },
    { key: "time", label: "Infusion time", type: "number", unit: "min", min: 0.1, max: 100000, required: true },
    { key: "dropFactor", label: "Drop factor (tubing)", type: "number", unit: "gtt/mL", min: 1, max: 60, required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const volume = num(args, "volume", { min: 0, max: 100000 });
    const time = num(args, "time", { min: 0.1, max: 100000 }); // min; >0 guards the divide
    const dropFactor = num(args, "dropFactor", { min: 1, max: 60 });
    const gtt = (volume * dropFactor) / time;
    return {
      value: round(gtt, 0), // drops cannot be fractional — round to whole gtt/min
      unit: "gtt/min",
      label: "IV drip rate",
      interpretation: `Infuse ${volume} mL over ${time} min with ${dropFactor} gtt/mL tubing → set ${round(gtt, 0)} gtt/min`,
      formula: "gtt/min = (volume_mL × drop_factor_gtt/mL) ÷ time_min, rounded to a whole drop",
      inputsEcho: { volume, time, dropFactor },
      source: "Standard IV gravity drip-rate formula (e.g. NurseTogether drop-factor example)",
      warnings: [
        "Drop factor must match the tubing in use: macrodrip is typically 10, 15, or 20 gtt/mL; microdrip is 60 gtt/mL. Using the wrong drop factor mis-sets the rate.",
        "Time must be in minutes (convert hours → minutes first).",
        "Gravity drip rates drift with patient position and pole height; count and reassess at the bedside. An infusion pump set in mL/hr is preferred when available.",
      ],
    };
  },
};

// ── Dilution / final concentration (C1·V1 = C2·V2) ───────────────────────────────────────────────
// Solve any one of the four unknowns from the other three: C1·V1 = C2·V2.
// Concentration units must be consistent between C1 and C2; volume units consistent between V1 and V2.
// Source: standard dilution equation (ScienceCompany worked example): C1=5, C2=1, V2=1 → V1=0.2.
const SOLVE_FOR = ["v1", "c2", "v2", "c1"] as const;
const DILUTION_LABEL: Record<string, { label: string; unit: string }> = {
  v1: { label: "Stock volume needed (V1)", unit: "volume units" },
  v2: { label: "Final volume (V2)", unit: "volume units" },
  c1: { label: "Stock concentration (C1)", unit: "concentration units" },
  c2: { label: "Final concentration (C2)", unit: "concentration units" },
};
export const dilution: CalculatorDef = {
  id: "dilution-c1v1-c2v2",
  name: "Dilution / final concentration (C1·V1 = C2·V2)",
  category: "conversion",
  description:
    "Solves the dilution equation C1·V1 = C2·V2 for any one unknown (stock volume, final volume, or either concentration). Works in any consistent unit (mg/mL, %, M, etc.).",
  source: "Standard dilution equation C1·V1 = C2·V2",
  inputs: [
    { key: "solveFor", label: "Solve for", type: "enum", options: [...SOLVE_FOR], required: true },
    { key: "c1", label: "Stock concentration (C1)", type: "number", min: 0, max: 1e9, required: false },
    { key: "v1", label: "Stock volume (V1)", type: "number", min: 0, max: 1e9, required: false },
    { key: "c2", label: "Final concentration (C2)", type: "number", min: 0, max: 1e9, required: false },
    { key: "v2", label: "Final volume (V2)", type: "number", min: 0, max: 1e9, required: false },
  ],
  run(args: CalcArgs): CalcResult {
    const solveFor = enumArg(args, "solveFor", SOLVE_FOR);
    // Each branch requires its other three values, and each divides by one of them → bound that divisor > 0.
    let value: number;
    let used: CalcArgs;
    if (solveFor === "v1") {
      const c1 = num(args, "c1", { min: 1e-9, max: 1e9 }); // divisor
      const c2 = num(args, "c2", { min: 0, max: 1e9 });
      const v2 = num(args, "v2", { min: 0, max: 1e9 });
      value = (c2 * v2) / c1;
      used = { c2, v2, c1 };
    } else if (solveFor === "v2") {
      const c1 = num(args, "c1", { min: 0, max: 1e9 });
      const v1 = num(args, "v1", { min: 0, max: 1e9 });
      const c2 = num(args, "c2", { min: 1e-9, max: 1e9 }); // divisor
      value = (c1 * v1) / c2;
      used = { c1, v1, c2 };
    } else if (solveFor === "c1") {
      const c2 = num(args, "c2", { min: 0, max: 1e9 });
      const v2 = num(args, "v2", { min: 0, max: 1e9 });
      const v1 = num(args, "v1", { min: 1e-9, max: 1e9 }); // divisor
      value = (c2 * v2) / v1;
      used = { c2, v2, v1 };
    } else {
      // c2
      const c1 = num(args, "c1", { min: 0, max: 1e9 });
      const v1 = num(args, "v1", { min: 0, max: 1e9 });
      const v2 = num(args, "v2", { min: 1e-9, max: 1e9 }); // divisor
      value = (c1 * v1) / v2;
      used = { c1, v1, v2 };
    }
    const meta = DILUTION_LABEL[solveFor];
    return {
      value: round(value, 3),
      unit: meta.unit,
      label: meta.label,
      interpretation: `Solving C1·V1 = C2·V2 for ${solveFor.toUpperCase()} → ${round(value, 3)} ${meta.unit}`,
      formula: "C1·V1 = C2·V2 (rearranged for the requested unknown)",
      inputsEcho: { solveFor, ...used },
      source: "Standard dilution equation C1·V1 = C2·V2 (e.g. ScienceCompany dilution example)",
      warnings: [
        "Concentration units must be identical for C1 and C2; volume units must be identical for V1 and V2. The result is in those same units.",
        "When solving for V1 (stock volume), the diluent volume to add is V2 − V1 (assuming volumes are additive).",
        "Assumes a simple dilution where adding diluent does not change the amount of drug; not valid where mixing changes volume non-additively.",
      ],
    };
  },
};

// ── Electrolyte conversion: mg ↔ mEq ↔ mmol (given molecular weight and valence) ──────────────────
// mmol = mg ÷ MW ;  mEq = mmol × valence = (mg × valence) ÷ MW.
// Conversely  mg = mmol × MW = (mEq × MW) ÷ valence ;  mEq = mmol × valence.
// Source: standard electrolyte stoichiometry (medplore mEq converter, Merck Manual basis):
//   Na MW 23 / val 1 → 1 mEq = 23 mg; K 39.1/1 → 39.1 mg; Ca 40.08/2 → 20.04 mg; Mg 24.305/2 → 12.15 mg.
const ELECTROLYTE_UNITS = ["mg", "mEq", "mmol"] as const;
export const electrolyteConversion: CalculatorDef = {
  id: "electrolyte-mg-meq-mmol",
  name: "Electrolyte conversion (mg ↔ mEq ↔ mmol)",
  category: "conversion",
  description:
    "Converts an electrolyte amount between mg, mEq, and mmol given its molecular (or atomic) weight and ionic valence.",
  source: "Standard electrolyte stoichiometry: mEq = (mg × valence) ÷ MW; mmol = mg ÷ MW",
  inputs: [
    { key: "amount", label: "Amount", type: "number", min: 0, max: 1e9, required: true },
    { key: "from", label: "From unit", type: "enum", options: [...ELECTROLYTE_UNITS], required: true },
    { key: "to", label: "To unit", type: "enum", options: [...ELECTROLYTE_UNITS], required: true },
    { key: "mw", label: "Molecular / atomic weight", type: "number", unit: "g/mol", min: 0.1, max: 100000, required: true },
    { key: "valence", label: "Valence (ionic charge)", type: "number", min: 1, max: 8, required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const amount = num(args, "amount", { min: 0, max: 1e9 });
    const from = enumArg(args, "from", ELECTROLYTE_UNITS);
    const to = enumArg(args, "to", ELECTROLYTE_UNITS);
    const mw = num(args, "mw", { min: 0.1, max: 100000 }); // >0 guards mg→mmol / mg→mEq divides
    const valence = num(args, "valence", { min: 1, max: 8 }); // ≥1 guards mEq→mg / mEq→mmol divides

    // Normalize the input amount to mg (mass), then convert mg → target unit.
    let mg: number;
    if (from === "mg") mg = amount;
    else if (from === "mmol") mg = amount * mw;
    else mg = (amount * mw) / valence; // from mEq

    let value: number;
    if (to === "mg") value = mg;
    else if (to === "mmol") value = mg / mw;
    else value = (mg * valence) / mw; // to mEq

    return {
      value: round(value, 3),
      unit: to,
      label: `Electrolyte amount (${to})`,
      category: valence === 1 ? "monovalent (1 mmol = 1 mEq)" : `valence ${valence} (1 mmol = ${valence} mEq)`,
      interpretation: `${amount} ${from} = ${round(value, 3)} ${to} (MW ${mw}, valence ${valence})`,
      formula: "mmol = mg ÷ MW;  mEq = (mg × valence) ÷ MW;  mg = mmol × MW = (mEq × MW) ÷ valence",
      inputsEcho: { amount, from, to, mw, valence },
      source: "Standard electrolyte stoichiometry (e.g. medplore mEq converter; Merck Manual basis)",
      warnings: [
        "For a salt (e.g. KCl, CaCl₂), use the molecular weight of the whole salt but the valence of the ion of interest (e.g. K⁺ valence 1 within KCl).",
        "Distinguish elemental vs salt amounts: 1 g KCl ≠ 1 g elemental K. Use the MW that matches the amount you entered.",
        "Valence is the ionic charge (Na⁺/K⁺ = 1, Ca²⁺/Mg²⁺ = 2); a wrong valence mis-scales mEq.",
      ],
    };
  },
};

export const parenteralCalculators: CalculatorDef[] = [
  infusionRateFromDose,
  doseFromInfusionRate,
  ivDripRate,
  dilution,
  electrolyteConversion,
];
