// Renal & hepatic function calculators — the highest-stakes group (they drive dose adjustment).
// Each formula is the published reference; reference test cases live in renal.test.ts.

import { type CalcArgs, CalcError, type CalculatorDef, type CalcResult, enumArg, num, round } from "./types.ts";

const SEX = ["male", "female"] as const;

// ── Cockcroft-Gault creatinine clearance (mL/min) ──
// CrCl = ((140 − age) × weight_kg × sexFactor) / (72 × SCr_mgdl); female sexFactor 0.85.
// Source: Cockcroft DW, Gault MH. Nephron. 1976;16(1):31-41.
export const cockcroftGault: CalculatorDef = {
  id: "crcl-cockcroft-gault",
  name: "Creatinine clearance (Cockcroft-Gault)",
  category: "renal",
  description: "Estimates creatinine clearance for renal drug dosing (the basis of most label renal-dosing thresholds).",
  source: "Cockcroft & Gault, Nephron 1976",
  inputs: [
    { key: "age", label: "Age", type: "number", unit: "years", min: 0, max: 120, required: true },
    { key: "weight", label: "Weight", type: "number", unit: "kg", min: 1, max: 500, required: true },
    { key: "scr", label: "Serum creatinine", type: "number", unit: "mg/dL", min: 0.1, max: 25, required: true },
    { key: "sex", label: "Sex", type: "enum", options: [...SEX], required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const age = num(args, "age", { min: 0, max: 120 });
    const weight = num(args, "weight", { min: 1, max: 500 });
    const scr = num(args, "scr", { min: 0.1, max: 25 });
    const sex = enumArg(args, "sex", SEX);
    const sexFactor = sex === "female" ? 0.85 : 1;
    const crcl = ((140 - age) * weight * sexFactor) / (72 * scr);
    return {
      value: round(crcl, 1),
      unit: "mL/min",
      label: "Creatinine clearance (Cockcroft-Gault)",
      category: crclStage(crcl),
      interpretation: crcl < 30 ? "severe impairment — many drugs need dose reduction or avoidance" : crcl < 60 ? "moderate impairment — check label renal dosing" : "normal/mild",
      formula: "((140 − age) × weight_kg × (0.85 if female)) ÷ (72 × SCr_mg/dL)",
      inputsEcho: { age, weight, scr, sex },
      source: "Cockcroft & Gault, Nephron 1976",
      warnings: [
        "Uses actual body weight; for obese patients an adjusted body weight is often substituted (clinical judgment).",
        "Assumes steady-state serum creatinine; unreliable in AKI.",
      ],
    };
  },
};

function crclStage(crcl: number): string {
  if (crcl >= 90) return "≥90 mL/min";
  if (crcl >= 60) return "60–89 mL/min";
  if (crcl >= 30) return "30–59 mL/min";
  if (crcl >= 15) return "15–29 mL/min";
  return "<15 mL/min";
}

// ── CKD-EPI 2021 creatinine eGFR (race-free) (mL/min/1.73m²) ──
// eGFR = 142 × min(SCr/κ,1)^α × max(SCr/κ,1)^(−1.200) × 0.9938^age × (1.012 if female)
//   κ = 0.7 (female) / 0.9 (male); α = −0.241 (female) / −0.302 (male).
// Source: Inker LA et al. New CK-EPI creatinine equation without race. NEJM 2021;385:1737-1749.
export const ckdEpi2021: CalculatorDef = {
  id: "egfr-ckd-epi-2021",
  name: "eGFR (CKD-EPI 2021, race-free)",
  category: "renal",
  description: "Race-free eGFR for CKD staging (the current KDIGO-preferred equation).",
  source: "Inker et al., NEJM 2021 (CKD-EPI creatinine 2021)",
  inputs: [
    { key: "age", label: "Age", type: "number", unit: "years", min: 18, max: 120, required: true },
    { key: "scr", label: "Serum creatinine", type: "number", unit: "mg/dL", min: 0.1, max: 25, required: true },
    { key: "sex", label: "Sex", type: "enum", options: [...SEX], required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const age = num(args, "age", { min: 18, max: 120 });
    const scr = num(args, "scr", { min: 0.1, max: 25 });
    const sex = enumArg(args, "sex", SEX);
    const female = sex === "female";
    const kappa = female ? 0.7 : 0.9;
    const alpha = female ? -0.241 : -0.302;
    const ratio = scr / kappa;
    const egfr = 142 *
      Math.pow(Math.min(ratio, 1), alpha) *
      Math.pow(Math.max(ratio, 1), -1.200) *
      Math.pow(0.9938, age) *
      (female ? 1.012 : 1);
    return {
      value: round(egfr, 0),
      unit: "mL/min/1.73m²",
      label: "eGFR (CKD-EPI 2021)",
      category: ckdStage(egfr),
      interpretation: egfr < 60 ? "below 60 for ≥3 months suggests CKD; check drug renal dosing" : "normal/mildly reduced",
      formula: "142 × min(SCr/κ,1)^α × max(SCr/κ,1)^−1.200 × 0.9938^age × (1.012 if female); κ=0.7♀/0.9♂, α=−0.241♀/−0.302♂",
      inputsEcho: { age, scr, sex },
      source: "Inker et al., NEJM 2021",
      warnings: ["Race-free 2021 equation (KDIGO-preferred). Reports per 1.73m² BSA — not interchangeable with Cockcroft-Gault mL/min for label thresholds."],
    };
  },
};

function ckdStage(egfr: number): string {
  if (egfr >= 90) return "G1 (≥90)";
  if (egfr >= 60) return "G2 (60–89)";
  if (egfr >= 45) return "G3a (45–59)";
  if (egfr >= 30) return "G3b (30–44)";
  if (egfr >= 15) return "G4 (15–29)";
  return "G5 (<15)";
}

// ── MDRD 4-variable eGFR (IDMS-traceable) (mL/min/1.73m²) ──
// eGFR = 175 × SCr^−1.154 × age^−0.203 × (0.742 if female) × (1.212 if Black)
// Source: Levey AS et al. (IDMS-traceable MDRD Study equation). Note: CKD-EPI 2021 is preferred;
// the Black coefficient is deprecated — included only for legacy comparison, default off.
export const mdrd: CalculatorDef = {
  id: "egfr-mdrd-4v",
  name: "eGFR (MDRD 4-variable, IDMS)",
  category: "renal",
  description: "Legacy eGFR equation; provided for comparison. Prefer CKD-EPI 2021.",
  source: "Levey et al., IDMS-traceable MDRD",
  inputs: [
    { key: "age", label: "Age", type: "number", unit: "years", min: 18, max: 120, required: true },
    { key: "scr", label: "Serum creatinine", type: "number", unit: "mg/dL", min: 0.1, max: 25, required: true },
    { key: "sex", label: "Sex", type: "enum", options: [...SEX], required: true },
    { key: "black", label: "Black race (legacy coefficient)", type: "boolean", required: false },
  ],
  run(args: CalcArgs): CalcResult {
    const age = num(args, "age", { min: 18, max: 120 });
    const scr = num(args, "scr", { min: 0.1, max: 25 });
    const sex = enumArg(args, "sex", SEX);
    const black = args["black"] === true || args["black"] === "true";
    const egfr = 175 * Math.pow(scr, -1.154) * Math.pow(age, -0.203) * (sex === "female" ? 0.742 : 1) * (black ? 1.212 : 1);
    return {
      value: round(egfr, 0),
      unit: "mL/min/1.73m²",
      label: "eGFR (MDRD 4-variable)",
      category: ckdStage(egfr),
      formula: "175 × SCr^−1.154 × age^−0.203 × (0.742 if female) × (1.212 if Black)",
      inputsEcho: { age, scr, sex, black },
      source: "IDMS-traceable MDRD (Levey et al.)",
      warnings: ["Superseded by CKD-EPI 2021 (race-free). The Black-race coefficient is deprecated; default off."],
    };
  },
};

// ── Child-Pugh score (hepatic) → class A/B/C ──
// Points 1–3 each for bilirubin, albumin, INR, ascites, encephalopathy. Total 5–15.
// A=5–6 (well-compensated), B=7–9, C=10–15 (decompensated). Source: Pugh et al. 1973.
const ASCITES = ["none", "mild", "moderate-severe"] as const;
const ENCEPH = ["none", "grade1-2", "grade3-4"] as const;
export const childPugh: CalculatorDef = {
  id: "child-pugh",
  name: "Child-Pugh score (hepatic function)",
  category: "hepatic",
  description: "Grades chronic liver disease severity; many labels give hepatic dosing by Child-Pugh class.",
  source: "Pugh RNH et al., Br J Surg 1973",
  inputs: [
    { key: "bilirubin", label: "Total bilirubin", type: "number", unit: "mg/dL", min: 0, max: 60, required: true },
    { key: "albumin", label: "Serum albumin", type: "number", unit: "g/dL", min: 0.5, max: 7, required: true },
    { key: "inr", label: "INR", type: "number", min: 0.5, max: 12, required: true },
    { key: "ascites", label: "Ascites", type: "enum", options: [...ASCITES], required: true },
    { key: "encephalopathy", label: "Encephalopathy", type: "enum", options: [...ENCEPH], required: true },
  ],
  run(args: CalcArgs): CalcResult {
    const bili = num(args, "bilirubin", { min: 0, max: 60 });
    const alb = num(args, "albumin", { min: 0.5, max: 7 });
    const inr = num(args, "inr", { min: 0.5, max: 12 });
    const ascites = enumArg(args, "ascites", ASCITES);
    const enceph = enumArg(args, "encephalopathy", ENCEPH);

    const biliPts = bili < 2 ? 1 : bili <= 3 ? 2 : 3;
    const albPts = alb > 3.5 ? 1 : alb >= 2.8 ? 2 : 3;
    const inrPts = inr < 1.7 ? 1 : inr <= 2.3 ? 2 : 3;
    const ascPts = ascites === "none" ? 1 : ascites === "mild" ? 2 : 3;
    const encPts = enceph === "none" ? 1 : enceph === "grade1-2" ? 2 : 3;
    const total = biliPts + albPts + inrPts + ascPts + encPts;
    if (total < 5 || total > 15) throw new CalcError(`Child-Pugh total ${total} out of range 5–15`);
    const cls = total <= 6 ? "A" : total <= 9 ? "B" : "C";

    return {
      value: total,
      unit: "points",
      label: "Child-Pugh score",
      category: `Class ${cls}`,
      interpretation: cls === "A" ? "well-compensated (5–6)" : cls === "B" ? "significant compromise (7–9)" : "decompensated (10–15)",
      formula: "Sum of 1–3 points for bilirubin, albumin, INR, ascites, encephalopathy",
      inputsEcho: { bilirubin: bili, albumin: alb, inr, ascites, encephalopathy: enceph },
      source: "Pugh et al., Br J Surg 1973",
    };
  },
};

export const renalCalculators: CalculatorDef[] = [cockcroftGault, ckdEpi2021, mdrd, childPugh];
