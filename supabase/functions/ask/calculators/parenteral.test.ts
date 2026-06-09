import { assertAlmostEquals, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dilution, doseFromInfusionRate, electrolyteConversion, infusionRateFromDose, ivDripRate } from "./parenteral.ts";
import { CalcError } from "./types.ts";

// ── IV infusion rate from dose (mcg/kg/min → mL/hr) ──
// Reference: RegisteredNurseRN dopamine drip review — 10 mcg/kg/min, 55 kg, 800 mg/500 mL
// (= 1.6 mg/mL) → 20.6 mL/hr.
// https://www.registerednursern.com/dopamine-iv-drip-calculation-practice-review/
Deno.test("infusionRateFromDose: 10 mcg/kg/min, 55 kg, 1.6 mg/mL → 20.6 mL/hr (RegisteredNurseRN)", () => {
  const r = infusionRateFromDose.run({ dose: 10, weight: 55, concentration: 1.6 });
  assertEquals(r.value, 20.6);
  assertEquals(r.unit, "mL/hr");
});
// Boundary: a zero dose yields a zero rate (lower edge, must not error).
Deno.test("infusionRateFromDose: dose 0 → 0 mL/hr (boundary)", () => {
  assertEquals(infusionRateFromDose.run({ dose: 0, weight: 70, concentration: 1.6 }).value, 0);
});
// Validation: zero concentration would divide-by-zero → must throw, not return Infinity.
Deno.test("infusionRateFromDose: concentration 0 throws CalcError (no divide-by-zero)", () => {
  assertThrows(() => infusionRateFromDose.run({ dose: 5, weight: 70, concentration: 0 }), CalcError);
});

// ── Dose from infusion rate (mL/hr → mcg/kg/min) ── exact inverse / round-trip ──
// Reference: RegisteredNurseRN dopamine review — 5 mcg/kg/min, 70 kg, 1.6 mg/mL ⇄ 13.125 mL/hr.
// Feeding the unrounded 13.125 mL/hr back must recover 5.0 mcg/kg/min.
Deno.test("doseFromInfusionRate: 13.125 mL/hr, 1.6 mg/mL, 70 kg → 5.0 mcg/kg/min (round-trip)", () => {
  const r = doseFromInfusionRate.run({ rate: 13.125, concentration: 1.6, weight: 70 });
  assertEquals(r.value, 5.0);
  assertEquals(r.unit, "mcg/kg/min");
});
// Validation: zero weight would divide-by-zero (and is clinically invalid) → must throw.
Deno.test("doseFromInfusionRate: weight 0 throws CalcError", () => {
  assertThrows(() => doseFromInfusionRate.run({ rate: 13.125, concentration: 1.6, weight: 0 }), CalcError);
});

// ── IV drip rate (gtt/min) ──
// Reference: NurseTogether drop-factor example — 1000 mL over 360 min with a 10 gtt/mL set
// → 27.8 → 28 gtt/min (rounded to a whole drop).
// https://www.nursetogether.com/calculate-iv-drip-rate-drop-factor-formula/
Deno.test("ivDripRate: 1000 mL / 360 min / 10 gtt/mL → 28 gtt/min (NurseTogether)", () => {
  const r = ivDripRate.run({ volume: 1000, time: 360, dropFactor: 10 });
  assertEquals(r.value, 28);
  assertEquals(r.unit, "gtt/min");
});
// Boundary: microdrip 60 gtt/mL where mL/hr == gtt/min (1000 mL / 60 min × 60 gtt/mL = 1000 gtt/min).
Deno.test("ivDripRate: microdrip 60 gtt/mL, 60 mL / 60 min → 60 gtt/min (boundary)", () => {
  assertEquals(ivDripRate.run({ volume: 60, time: 60, dropFactor: 60 }).value, 60);
});
// Validation: zero time would divide-by-zero → must throw.
Deno.test("ivDripRate: time 0 throws CalcError", () => {
  assertThrows(() => ivDripRate.run({ volume: 1000, time: 0, dropFactor: 10 }), CalcError);
});

// ── Dilution C1·V1 = C2·V2 ──
// Reference: ScienceCompany worked example — C1=5, C2=1, V2=1 → V1=0.2 (any consistent unit).
// https://www.sciencecompany.com/How-To-Calculate-A-Dilution.aspx
Deno.test("dilution: solve V1 for C1=5, C2=1, V2=1 → 0.2 (ScienceCompany)", () => {
  const r = dilution.run({ solveFor: "v1", c1: 5, c2: 1, v2: 1 });
  assertEquals(r.value, 0.2);
});
// Same relation solved for V2 (mg/mL units): 10 mg/mL stock, 50 mL, diluted to 2 mg/mL → 250 mL final.
Deno.test("dilution: solve V2 for C1=10, V1=50, C2=2 → 250", () => {
  assertEquals(dilution.run({ solveFor: "v2", c1: 10, v1: 50, c2: 2 }).value, 250);
});
// Validation: solving for V1 with C1=0 divides-by-zero → must throw.
Deno.test("dilution: solveFor v1 with C1=0 throws CalcError", () => {
  assertThrows(() => dilution.run({ solveFor: "v1", c1: 0, c2: 1, v2: 1 }), CalcError);
});

// ── Electrolyte mg ↔ mEq ↔ mmol ──
// Reference: medplore mEq converter / Merck stoichiometry — 1 mEq = MW/valence mg.
//   Na MW 23, val 1 → 1 mEq = 23 mg; Ca MW 40.08, val 2 → 1 mEq = 20.04 mg.
// https://medplore.com/dose-calculators/meq-converter/
Deno.test("electrolyteConversion: 23 mg Na (MW 23, val 1) → 1 mEq (medplore)", () => {
  const r = electrolyteConversion.run({ amount: 23, from: "mg", to: "mEq", mw: 23, valence: 1 });
  assertEquals(r.value, 1);
  assertEquals(r.unit, "mEq");
});
Deno.test("electrolyteConversion: 1 mEq Ca (MW 40.08, val 2) → 20.04 mg", () => {
  const r = electrolyteConversion.run({ amount: 1, from: "mEq", to: "mg", mw: 40.08, valence: 2 });
  assertAlmostEquals(r.value, 20.04, 0.005);
});
// Boundary/identity: divalent ion, 1 mmol = 2 mEq (Ca/Mg rule).
Deno.test("electrolyteConversion: 1 mmol divalent → 2 mEq", () => {
  assertEquals(electrolyteConversion.run({ amount: 1, from: "mmol", to: "mEq", mw: 40.08, valence: 2 }).value, 2);
});
// Validation: zero molecular weight would divide-by-zero (mg→mmol) → must throw.
Deno.test("electrolyteConversion: MW 0 throws CalcError", () => {
  assertThrows(() => electrolyteConversion.run({ amount: 100, from: "mg", to: "mmol", mw: 0, valence: 1 }), CalcError);
});
