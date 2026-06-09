// Dose-conversion calculators. Pure, deterministic table lookups (real arithmetic, never LLM
// guessing). Two calculators ship here:
//   1. Opioid morphine milligram equivalents (MME) — CDC 2022 conversion-factor table.
//   2. Corticosteroid (glucocorticoid) dose equivalence — standard anti-inflammatory potency table.
// Reference test cases live in conversions.test.ts; expected values are anchored to the CDC 2022
// MMWR guideline and StatPearls, not to MDCalc (whose displayed factors are the pre-2022 values).

import { type CalcArgs, CalcError, type CalculatorDef, type CalcResult, enumArg, num, round } from "./types.ts";

// ── Opioid MME (CDC 2022) ──────────────────────────────────────────────────────────────────────
// total daily MME = daily dose × conversion factor (single opioid per call).
// Factors are the CDC 2022 Clinical Practice Guideline values (MMWR 2022;71(RR-3), Table — the
// 2022 update changed methadone 3→4.7, hydromorphone 4.0→5.0, and tramadol 0.1→0.2 vs the 2016/2017
// file). Each opioid carries its own dose unit: oral agents are mg/day; transdermal fentanyl is the
// patch rate in mcg/hr (the published per-day factor 2.4 already folds the hours-per-day in).
// Source: Dowell D et al. CDC Clinical Practice Guideline for Prescribing Opioids for Pain —
// United States, 2022. MMWR Recomm Rep 2022;71(RR-3):1-95. doi:10.15585/mmwr.rr7103a1.

interface OpioidFactor {
  factor: number;
  doseUnit: "mg/day" | "mcg/hr";
}

const MME_FACTORS: Record<string, OpioidFactor> = {
  codeine: { factor: 0.15, doseUnit: "mg/day" },
  hydrocodone: { factor: 1.0, doseUnit: "mg/day" },
  hydromorphone: { factor: 5.0, doseUnit: "mg/day" }, // 2022: changed from 4.0
  methadone: { factor: 4.7, doseUnit: "mg/day" }, // 2022: changed from 3 (and is nonlinear in practice)
  morphine: { factor: 1.0, doseUnit: "mg/day" },
  oxycodone: { factor: 1.5, doseUnit: "mg/day" },
  oxymorphone: { factor: 3.0, doseUnit: "mg/day" },
  tapentadol: { factor: 0.4, doseUnit: "mg/day" },
  tramadol: { factor: 0.2, doseUnit: "mg/day" }, // 2022: changed from 0.1
  "fentanyl-transdermal": { factor: 2.4, doseUnit: "mcg/hr" }, // per-day factor (e.g. 25 mcg/hr × 2.4 = 60 MME/day)
};

const OPIOIDS = Object.keys(MME_FACTORS) as readonly string[];

function mmeRisk(mme: number): { category: string; interpretation: string } {
  // CDC 2022 frames risk on a gradient (it removed the 2016 hard numeric ceiling). Benefit/harm
  // should be reassessed before increasing to ≥50 MME/day; ≥50 carries meaningfully higher overdose risk.
  if (mme < 50) return { category: "<50 MME/day", interpretation: "lower-risk range; reassess benefits vs harms before any increase to ≥50 MME/day" };
  if (mme < 90) return { category: "50–89 MME/day", interpretation: "higher overdose risk; CDC 2022 advises caution, careful justification, and naloxone consideration" };
  return { category: "≥90 MME/day", interpretation: "substantially higher overdose risk; reassess therapy, taper where appropriate, offer naloxone (CDC 2022 removed the prior hard 90 ceiling but flags this range)" };
}

export const opioidMme: CalculatorDef = {
  id: "opioid-mme",
  name: "Opioid morphine milligram equivalents (MME)",
  category: "conversion",
  description:
    "Converts a single opioid's daily dose to morphine milligram equivalents (MME/day) using the CDC 2022 conversion-factor table, for overdose-risk benchmarking.",
  source: "CDC Clinical Practice Guideline for Prescribing Opioids for Pain — United States, 2022 (MMWR 2022;71(RR-3))",
  inputs: [
    { key: "opioid", label: "Opioid", type: "enum", options: [...OPIOIDS], required: true },
    { key: "dose", label: "Daily dose (mg/day; transdermal fentanyl in mcg/hr)", type: "number", unit: "mg/day or mcg/hr", min: 0, max: 100000, required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const opioid = enumArg(args, "opioid", OPIOIDS);
    const dose = num(args, "dose", { min: 0, max: 100000 });
    const { factor, doseUnit } = MME_FACTORS[opioid];
    const mme = dose * factor;
    const risk = mmeRisk(mme);

    const warnings = [
      "Single-opioid result. For a regimen, compute MME for each opioid separately and sum the daily totals.",
      "MME conversion factors are for population/risk analytics, not for direct one-opioid-to-another dose conversion (use product labeling and clinical judgment for rotation, with incomplete cross-tolerance).",
      "Do not apply to buprenorphine or to opioid-use-disorder treatment dosing — CDC excludes these from MME benchmarking.",
    ];
    if (opioid === "methadone") {
      warnings.push("Methadone MME is nonlinear in practice (its relative potency rises with dose); the static 4.7 factor can under- or over-estimate risk at a given dose.");
    }
    if (opioid === "fentanyl-transdermal") {
      warnings.push("Dose is the transdermal delivery rate in mcg/hr (e.g. a 25 mcg/hr patch), not mg/day. Factor 2.4 already accounts for 24 h/day.");
    }

    return {
      value: round(mme, 1),
      unit: "MME/day",
      label: "Opioid morphine milligram equivalents (CDC 2022)",
      category: risk.category,
      interpretation: risk.interpretation,
      formula: `MME/day = daily dose (${doseUnit}) × CDC-2022 factor; ${opioid} factor = ${factor}`,
      inputsEcho: { opioid, dose, doseUnit, factor },
      source: "Dowell et al., MMWR Recomm Rep 2022;71(RR-3) (doi:10.15585/mmwr.rr7103a1)",
      warnings,
    };
  },
};

// ── Corticosteroid (glucocorticoid) dose equivalence ─────────────────────────────────────────────
// equivalent dose (to-drug) = from-dose × (equivPotencyDose[to] / equivPotencyDose[from]).
// equivPotencyDose is the mg of each agent that delivers anti-inflammatory (glucocorticoid) activity
// equivalent to 5 mg prednisone. Standard table (StatPearls, Endotext): hydrocortisone 20, cortisone
// 25, prednisone 5, prednisolone 5, methylprednisolone 4, triamcinolone 4, dexamethasone 0.75,
// betamethasone 0.6 mg. Source: Hodgens A, Sharman T. Corticosteroids. StatPearls (NBK531462).

// mg of agent equivalent in glucocorticoid (anti-inflammatory) potency to 5 mg prednisone:
const STEROID_EQUIV_MG: Record<string, number> = {
  hydrocortisone: 20,
  cortisone: 25,
  prednisone: 5,
  prednisolone: 5,
  methylprednisolone: 4,
  triamcinolone: 4,
  dexamethasone: 0.75,
  betamethasone: 0.6,
};

const STEROIDS = Object.keys(STEROID_EQUIV_MG) as readonly string[];

// Approximate biological (anti-inflammatory) duration of action, for the warning text.
const STEROID_DURATION: Record<string, string> = {
  hydrocortisone: "short-acting (~8–12 h)",
  cortisone: "short-acting (~8–12 h)",
  prednisone: "intermediate-acting (~18–36 h)",
  prednisolone: "intermediate-acting (~18–36 h)",
  methylprednisolone: "intermediate-acting (~18–36 h)",
  triamcinolone: "intermediate-acting (~18–36 h)",
  dexamethasone: "long-acting (~36–54 h)",
  betamethasone: "long-acting (~36–54 h)",
};

export const corticosteroidEquivalence: CalculatorDef = {
  id: "corticosteroid-equivalence",
  name: "Corticosteroid (glucocorticoid) dose equivalence",
  category: "conversion",
  description:
    "Converts a dose of one systemic corticosteroid to the anti-inflammatory–equivalent dose of another, using the standard glucocorticoid potency table.",
  source: "Standard glucocorticoid equivalency table (StatPearls: Hodgens & Sharman, Corticosteroids, NBK531462)",
  inputs: [
    { key: "from", label: "From corticosteroid", type: "enum", options: [...STEROIDS], required: true },
    { key: "dose", label: "Dose of from-corticosteroid", type: "number", unit: "mg", min: 0, max: 10000, required: true },
    { key: "to", label: "To corticosteroid", type: "enum", options: [...STEROIDS], required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const from = enumArg(args, "from", STEROIDS);
    const to = enumArg(args, "to", STEROIDS);
    const dose = num(args, "dose", { min: 0, max: 10000 });
    const equivDose = dose * (STEROID_EQUIV_MG[to] / STEROID_EQUIV_MG[from]);

    return {
      value: round(equivDose, 2),
      unit: "mg",
      label: `Equivalent dose of ${to}`,
      category: STEROID_DURATION[to],
      interpretation: `${dose} mg ${from} ≈ ${round(equivDose, 2)} mg ${to} by anti-inflammatory (glucocorticoid) potency`,
      formula: `to-dose = from-dose × (equiv[to] ÷ equiv[from]); equiv mg (=5 mg prednisone): ${from}=${STEROID_EQUIV_MG[from]}, ${to}=${STEROID_EQUIV_MG[to]}`,
      inputsEcho: { from, dose, to },
      source: "StatPearls (Hodgens & Sharman, Corticosteroids, NBK531462); standard glucocorticoid equivalency table",
      warnings: [
        "Equivalence is for systemic anti-inflammatory (glucocorticoid) effect only; it ignores mineralocorticoid activity (relevant for hydrocortisone/cortisone) and differing durations of action.",
        "Approximation for switching agents — not a substitute for clinical judgment, and not for topical/inhaled/intra-articular routes.",
      ],
    };
  },
};

export const conversionsCalculators: CalculatorDef[] = [opioidMme, corticosteroidEquivalence];