// Cardiology risk scores — additive point scores used in atrial-fibrillation anticoagulation
// decisions (stroke vs. bleeding risk) and VTE pretest-probability triage. Each is a pure,
// deterministic point sum with a sourced risk band in `category`. Reference test cases live in
// cardiology.test.ts and anchor on the published points tables + band thresholds (MDCalc /
// origin papers), not on study-specific risk percentages (which vary by cohort).

import { boolArg, type CalcArgs, CalcError, type CalculatorDef, type CalcResult, enumArg, num } from "./types.ts";

const SEX = ["male", "female"] as const;

// ── CHA₂DS₂-VASc — stroke risk in non-valvular atrial fibrillation (range 0–9) ──
// C(HF)=1, H(TN)=1, A₂ge≥75=2 / 65–74=1, D(iabetes)=1, S₂troke/TIA/TE=2, V(ascular)=1,
// A(ge 65–74, scored in the age band), Sc (female sex category)=1. Age is a single 0/1/2
// band contribution (NOT two additive flags) — max total is 9, not 10.
// Source: Lip GYH et al., Chest 2010;137(2):263-272 (Euro Heart Survey on AF). MDCalc calc/801.
export const cha2ds2Vasc: CalculatorDef = {
  id: "cha2ds2-vasc",
  name: "CHA₂DS₂-VASc score (AF stroke risk)",
  category: "risk-score",
  description:
    "Estimates annual stroke/thromboembolism risk in non-valvular atrial fibrillation; guides whether to start oral anticoagulation.",
  source: "Lip et al., Chest 2010 (CHA₂DS₂-VASc)",
  inputs: [
    { key: "age", label: "Age", type: "number", unit: "years", min: 0, max: 120, required: true },
    { key: "sex", label: "Sex", type: "enum", options: [...SEX], required: true },
    { key: "chf", label: "Congestive heart failure / LV dysfunction", type: "boolean", required: false },
    { key: "hypertension", label: "Hypertension (history)", type: "boolean", required: false },
    { key: "diabetes", label: "Diabetes mellitus", type: "boolean", required: false },
    { key: "stroke", label: "Prior stroke / TIA / thromboembolism", type: "boolean", required: false },
    { key: "vascular", label: "Vascular disease (prior MI, PAD, or aortic plaque)", type: "boolean", required: false },
  ],
  run(args: CalcArgs): CalcResult {
    const age = num(args, "age", { min: 0, max: 120 });
    const sex = enumArg(args, "sex", SEX);
    const chf = boolArg(args, "chf");
    const htn = boolArg(args, "hypertension");
    const dm = boolArg(args, "diabetes");
    const stroke = boolArg(args, "stroke");
    const vascular = boolArg(args, "vascular");

    const agePts = age >= 75 ? 2 : age >= 65 ? 1 : 0;
    const sexPts = sex === "female" ? 1 : 0;
    const total = (chf ? 1 : 0) + (htn ? 1 : 0) + agePts + (dm ? 1 : 0) + (stroke ? 2 : 0) +
      (vascular ? 1 : 0) + sexPts;
    if (total < 0 || total > 9) throw new CalcError(`CHA₂DS₂-VASc total ${total} out of range 0–9`);

    const cat = total === 0 ? "low (0)" : total === 1 ? "low–moderate (1)" : `high (≥2): ${total}`;
    return {
      value: total,
      unit: "points",
      label: "CHA₂DS₂-VASc score",
      category: cat,
      interpretation: total === 0
        ? "lowest risk; men with 0 generally do not need anticoagulation"
        : total === 1
        ? "men with 1 (non-sex point): consider anticoagulation; women with 1 (sex only) are low risk"
        : "elevated stroke risk; oral anticoagulation generally recommended (≥2 men / ≥3 women)",
      formula:
        "CHF(1) + HTN(1) + Age[≥75=2, 65–74=1] + Diabetes(1) + Stroke/TIA/TE(2) + Vascular(1) + Female sex(1)",
      inputsEcho: { age, sex, chf, hypertension: htn, diabetes: dm, stroke, vascular },
      source: "Lip et al., Chest 2010; thresholds per 2020 ESC AF guideline / MDCalc calc/801",
      warnings: [
        "For non-valvular AF only (excludes moderate–severe mitral stenosis or a mechanical valve).",
        "Treatment thresholds are sex-specific (≥2 men, ≥3 women); female sex alone (score 1) is not an indication to anticoagulate.",
        "Per-score stroke percentages vary by cohort — confirm against the specific guideline/source before quoting a number.",
      ],
    };
  },
};

// ── HAS-BLED — major-bleeding risk on anticoagulation for AF (range 0–9) ──
// Hypertension(1), Abnormal renal(1) + Abnormal liver(1) [SEPARATE, max 2 together],
// Stroke(1), Bleeding history/predisposition(1), Labile INR(1), Elderly >65(1),
// Drugs(1) + Alcohol(1) [SEPARATE, max 2 together]. Max total 9. ≥3 = high risk.
// Source: Pisters R et al., Chest 2010;138(5):1093-1100 (Euro Heart Survey). MDCalc calc/807.
export const hasBled: CalculatorDef = {
  id: "has-bled",
  name: "HAS-BLED score (major bleeding risk)",
  category: "risk-score",
  description:
    "Estimates 1-year major-bleeding risk in AF patients on anticoagulation; a high score flags reversible risk factors, not a reason to withhold anticoagulation outright.",
  source: "Pisters et al., Chest 2010 (HAS-BLED)",
  inputs: [
    { key: "hypertension", label: "Hypertension (uncontrolled, SBP >160 mmHg)", type: "boolean", required: false },
    { key: "renal", label: "Abnormal renal function (dialysis, transplant, or Cr >2.26 mg/dL)", type: "boolean", required: false },
    { key: "liver", label: "Abnormal liver function (cirrhosis, or bili >2× / AST-ALT-AP >3× normal)", type: "boolean", required: false },
    { key: "stroke", label: "Prior stroke", type: "boolean", required: false },
    { key: "bleeding", label: "Prior major bleeding or predisposition to bleeding", type: "boolean", required: false },
    { key: "labileInr", label: "Labile INR (time in therapeutic range <60%)", type: "boolean", required: false },
    { key: "elderly", label: "Elderly (age >65 years)", type: "boolean", required: false },
    { key: "drugs", label: "Drugs predisposing to bleeding (antiplatelet, NSAIDs)", type: "boolean", required: false },
    { key: "alcohol", label: "Alcohol use (≥8 drinks/week)", type: "boolean", required: false },
  ],
  run(args: CalcArgs): CalcResult {
    const htn = boolArg(args, "hypertension");
    const renal = boolArg(args, "renal");
    const liver = boolArg(args, "liver");
    const stroke = boolArg(args, "stroke");
    const bleeding = boolArg(args, "bleeding");
    const labile = boolArg(args, "labileInr");
    const elderly = boolArg(args, "elderly");
    const drugs = boolArg(args, "drugs");
    const alcohol = boolArg(args, "alcohol");

    const total = (htn ? 1 : 0) + (renal ? 1 : 0) + (liver ? 1 : 0) + (stroke ? 1 : 0) +
      (bleeding ? 1 : 0) + (labile ? 1 : 0) + (elderly ? 1 : 0) + (drugs ? 1 : 0) + (alcohol ? 1 : 0);
    if (total < 0 || total > 9) throw new CalcError(`HAS-BLED total ${total} out of range 0–9`);

    const cat = total >= 3 ? `high (≥3): ${total}` : total >= 1 ? `intermediate (1–2): ${total}` : "low (0)";
    return {
      value: total,
      unit: "points",
      label: "HAS-BLED score",
      category: cat,
      interpretation: total >= 3
        ? "high bleeding risk — address reversible factors and review more often; not by itself a reason to withhold anticoagulation"
        : "low-to-moderate bleeding risk",
      formula:
        "Hypertension(1) + Abnormal renal(1) + Abnormal liver(1) + Stroke(1) + Bleeding(1) + Labile INR(1) + Elderly >65(1) + Drugs(1) + Alcohol(1)",
      inputsEcho: {
        hypertension: htn,
        renal,
        liver,
        stroke,
        bleeding,
        labileInr: labile,
        elderly,
        drugs,
        alcohol,
      },
      source: "Pisters et al., Chest 2010; band ≥3 = high risk per MDCalc calc/807",
      warnings: [
        "Renal and liver abnormality are SEPARATE 1-point items (max 2); drugs and alcohol are SEPARATE 1-point items (max 2).",
        "A high score should trigger correction of modifiable factors and closer follow-up — not automatic withholding of anticoagulation.",
        "Per-score bleeding percentages vary by cohort — confirm against the specific source before quoting a number.",
      ],
    };
  },
};

// ── Wells criteria for DVT (modified, 10-item; range −2 to +9) ──
// Nine clinical features each +1; "alternative diagnosis at least as likely as DVT" = −2,
// so the total can go negative. Source: Wells PS et al., Lancet 1997 / NEJM 2003 (modified
// includes "previously documented DVT"). MDCalc calc/362.
export const wellsDvt: CalculatorDef = {
  id: "wells-dvt",
  name: "Wells criteria for DVT",
  category: "risk-score",
  description: "Pretest probability of lower-extremity deep vein thrombosis to triage D-dimer vs. compression ultrasound.",
  source: "Wells et al., Lancet 1997 / NEJM 2003 (modified Wells DVT)",
  inputs: [
    { key: "activeCancer", label: "Active cancer (treatment or palliation within 6 months)", type: "boolean", required: false },
    { key: "immobilization", label: "Paralysis, paresis, or recent plaster immobilization of the leg", type: "boolean", required: false },
    { key: "bedridden", label: "Recently bedridden >3 days, or major surgery within 12 weeks", type: "boolean", required: false },
    { key: "tenderness", label: "Localized tenderness along the deep venous system", type: "boolean", required: false },
    { key: "legSwollen", label: "Entire leg swollen", type: "boolean", required: false },
    { key: "calfSwelling", label: "Calf swelling >3 cm vs. asymptomatic leg (10 cm below tibial tuberosity)", type: "boolean", required: false },
    { key: "pittingEdema", label: "Pitting edema confined to the symptomatic leg", type: "boolean", required: false },
    { key: "collateralVeins", label: "Collateral (nonvaricose) superficial veins present", type: "boolean", required: false },
    { key: "priorDvt", label: "Previously documented DVT", type: "boolean", required: false },
    { key: "altDiagnosis", label: "Alternative diagnosis at least as likely as DVT (−2)", type: "boolean", required: false },
  ],
  run(args: CalcArgs): CalcResult {
    const flags = [
      "activeCancer",
      "immobilization",
      "bedridden",
      "tenderness",
      "legSwollen",
      "calfSwelling",
      "pittingEdema",
      "collateralVeins",
      "priorDvt",
    ] as const;
    let total = 0;
    const echo: CalcArgs = {};
    for (const k of flags) {
      const v = boolArg(args, k);
      echo[k] = v;
      if (v) total += 1;
    }
    const alt = boolArg(args, "altDiagnosis");
    echo["altDiagnosis"] = alt;
    if (alt) total -= 2;
    if (total < -2 || total > 9) throw new CalcError(`Wells DVT total ${total} out of range −2 to 9`);

    // Modified-Wells two-level model (Wells 2003 NEJM): ≥2 = likely, <2 = unlikely.
    // Three-tier (original): ≤0 low / 1–2 moderate / ≥3 high. Both reported for context.
    const twoTier = total >= 2 ? "DVT likely (≥2)" : "DVT unlikely (<2)";
    const threeTier = total >= 3 ? "high (≥3)" : total >= 1 ? "moderate (1–2)" : "low (≤0)";
    return {
      value: total,
      unit: "points",
      label: "Wells criteria for DVT",
      category: `${twoTier}; three-tier ${threeTier}`,
      interpretation: total >= 2
        ? "DVT likely — proceed to compression ultrasound (a negative D-dimer alone does not exclude DVT here)"
        : "DVT unlikely — a negative high-sensitivity D-dimer can safely rule out DVT",
      formula:
        "Sum of nine clinical features (+1 each) minus 2 if an alternative diagnosis is at least as likely as DVT",
      inputsEcho: echo,
      source: "Wells et al., Lancet 1997 / NEJM 2003; two-level model (≥2 = likely) per Wells 2003 / NICE NG158 / MDCalc calc/362",
      warnings: [
        "The 'alternative diagnosis' item subtracts 2 points, so the total can be negative.",
        "Pretest probability only — must be combined with D-dimer and/or imaging; never use in isolation to exclude DVT.",
      ],
    };
  },
};

// ── Wells criteria for pulmonary embolism (range 0–12.5; fractional points) ──
// DVT signs=3, PE is #1 dx (or equally likely)=3; HR>100=1.5, immobilization/surgery=1.5,
// prior PE/DVT=1.5; hemoptysis=1, malignancy=1. Source: Wells PS et al., Thromb Haemost 2000 /
// Ann Intern Med 2001. MDCalc calc/115.
export const wellsPe: CalculatorDef = {
  id: "wells-pe",
  name: "Wells criteria for pulmonary embolism",
  category: "risk-score",
  description: "Pretest probability of pulmonary embolism to triage D-dimer vs. CT pulmonary angiography.",
  source: "Wells et al., Thromb Haemost 2000 / Ann Intern Med 2001 (Wells PE)",
  inputs: [
    { key: "dvtSigns", label: "Clinical signs and symptoms of DVT (+3)", type: "boolean", required: false },
    { key: "peLikely", label: "PE is the #1 diagnosis, or equally likely (+3)", type: "boolean", required: false },
    { key: "tachycardia", label: "Heart rate >100 bpm (+1.5)", type: "boolean", required: false },
    { key: "immobilization", label: "Immobilization ≥3 days or surgery in the previous 4 weeks (+1.5)", type: "boolean", required: false },
    { key: "priorVte", label: "Previous, objectively diagnosed PE or DVT (+1.5)", type: "boolean", required: false },
    { key: "hemoptysis", label: "Hemoptysis (+1)", type: "boolean", required: false },
    { key: "malignancy", label: "Malignancy (treatment within 6 months or palliative) (+1)", type: "boolean", required: false },
  ],
  run(args: CalcArgs): CalcResult {
    const dvtSigns = boolArg(args, "dvtSigns");
    const peLikely = boolArg(args, "peLikely");
    const tachy = boolArg(args, "tachycardia");
    const immob = boolArg(args, "immobilization");
    const priorVte = boolArg(args, "priorVte");
    const hemoptysis = boolArg(args, "hemoptysis");
    const malignancy = boolArg(args, "malignancy");

    const total = (dvtSigns ? 3 : 0) + (peLikely ? 3 : 0) + (tachy ? 1.5 : 0) + (immob ? 1.5 : 0) +
      (priorVte ? 1.5 : 0) + (hemoptysis ? 1 : 0) + (malignancy ? 1 : 0);
    if (total < 0 || total > 12.5) throw new CalcError(`Wells PE total ${total} out of range 0–12.5`);

    // MDCalc primary: two-tier (≤4 unlikely / >4 likely). Three-tier shown for context.
    const twoTier = total > 4 ? "PE likely (>4)" : "PE unlikely (≤4)";
    const threeTier = total > 6 ? "high (>6)" : total >= 2 ? "moderate (2–6)" : "low (<2)";
    return {
      value: total,
      unit: "points",
      label: "Wells criteria for pulmonary embolism",
      category: `${twoTier}; three-tier ${threeTier}`,
      interpretation: total > 4
        ? "PE likely — proceed to CT pulmonary angiography"
        : "PE unlikely — a negative D-dimer (or PERC-negative) can rule out PE without imaging",
      formula:
        "DVT signs(3) + PE most likely dx(3) + HR>100(1.5) + immobilization/surgery(1.5) + prior PE/DVT(1.5) + hemoptysis(1) + malignancy(1)",
      inputsEcho: {
        dvtSigns,
        peLikely,
        tachycardia: tachy,
        immobilization: immob,
        priorVte,
        hemoptysis,
        malignancy,
      },
      source: "Wells et al., Thromb Haemost 2000 / Ann Intern Med 2001; two-tier band (>4 likely) per MDCalc calc/115",
      warnings: [
        "Points are fractional — the total is not an integer (e.g. 1.5, 4.5).",
        "Pretest probability only — combine with D-dimer and/or CT pulmonary angiography; never use alone to exclude PE.",
      ],
    };
  },
};

export const cardiologyCalculators: CalculatorDef[] = [cha2ds2Vasc, hasBled, wellsDvt, wellsPe];
