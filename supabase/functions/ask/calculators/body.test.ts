import { assert, assertAlmostEquals, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { adjustedBodyWeight, bmi, bsaDuBois, bsaMosteller, idealBodyWeight, leanBodyWeight } from "./body.ts";
import { CalcError } from "./types.ts";

// ── BMI = weight_kg ÷ (height_m)²; WHO classification (<18.5 / <25 / <30 …) ──
// Normal-case reference: 70 kg, 170 cm → 24.2 kg/m² (hand-exact: 70 / 1.70² = 24.22).
Deno.test("BMI: 70 kg, 170 cm → 24.2 kg/m², Normal", () => {
  const r = bmi.run({ weight: 70, height: 170 });
  assertEquals(r.value, 24.2);
  assertEquals(r.unit, "kg/m²");
  assert(r.category!.startsWith("Normal"));
});
// Boundary/category case: BMI exactly 25.0 must classify as Overweight (WHO cutoff is inclusive at 25).
// 72.25 kg / 1.70² = 25.000 kg/m². Source: WHO TRS 894 / CDC adult BMI categories.
Deno.test("BMI: 25.0 boundary → Overweight (inclusive cutoff)", () => {
  const r = bmi.run({ weight: 72.25, height: 170 });
  assertEquals(r.value, 25.0);
  assert(r.category!.startsWith("Overweight"), `got ${r.category}`);
});
Deno.test("BMI: obese-range weight → Obese class category", () => {
  const r = bmi.run({ weight: 100, height: 170 }); // 34.6 → obese class I
  assert(r.category!.startsWith("Obese"), `got ${r.category}`);
});
Deno.test("BMI: missing height throws CalcError", () => {
  assertThrows(() => bmi.run({ weight: 70 }), CalcError);
});

// ── BSA Mosteller = √(height_cm × weight_kg ÷ 3600) ──
// Reference: 170 cm, 70 kg → 1.82 m² (worked example: √(11900/3600)=1.818).
// Source: medicalequations.com Mosteller worked example; formula Mosteller NEJM 1987.
Deno.test("BSA Mosteller: 170 cm, 70 kg → 1.82 m²", () => {
  const r = bsaMosteller.run({ height: 170, weight: 70 });
  assertAlmostEquals(r.value, 1.82, 0.01);
  assertEquals(r.unit, "m²");
});
// Clean exact case: 180 cm, 80 kg → √(14400/3600)=√4=2.00 m².
Deno.test("BSA Mosteller: 180 cm, 80 kg → 2.00 m² (exact)", () => {
  assertEquals(bsaMosteller.run({ height: 180, weight: 80 }).value, 2.0);
});
Deno.test("BSA Mosteller: missing weight throws CalcError", () => {
  assertThrows(() => bsaMosteller.run({ height: 170 }), CalcError);
});

// ── BSA Du Bois = 0.007184 × weight_kg^0.425 × height_cm^0.725 ──
// Reference: 170 cm, 60 kg → 1.69 m².
// Source: omnicalculator.com/health/bsa Du Bois worked example; formula Du Bois Arch Intern Med 1916.
Deno.test("BSA Du Bois: 170 cm, 60 kg → 1.69 m²", () => {
  assertAlmostEquals(bsaDuBois.run({ height: 170, weight: 60 }).value, 1.69, 0.01);
});
Deno.test("BSA Du Bois: 170 cm, 70 kg → 1.81 m²", () => {
  // 0.007184 × 70^0.425 × 170^0.725 = 1.8097 → 1.81 (computed from the published Du Bois formula).
  assertAlmostEquals(bsaDuBois.run({ height: 170, weight: 70 }).value, 1.81, 0.01);
});

// ── Ideal body weight — Devine. Male 50 + 2.3×(in over 60); female 45.5 + 2.3×(in over 60). ──
// Reference: male, 70 in = 177.8 cm → 50 + 2.3×10 = 73.0 kg.
// Source: ClinCalc / MDCalc IBW worked example; formula Devine 1974.
Deno.test("IBW Devine: male 177.8 cm (70 in) → 73.0 kg", () => {
  const r = idealBodyWeight.run({ height: 177.8, sex: "male" });
  assertAlmostEquals(r.value, 73.0, 0.05);
  assertEquals(r.unit, "kg");
});
// Sex-difference case: female base is 4.5 kg lower → 68.5 kg at the same height.
Deno.test("IBW Devine: female 177.8 cm → 68.5 kg (45.5 base)", () => {
  assertAlmostEquals(idealBodyWeight.run({ height: 177.8, sex: "female" }).value, 68.5, 0.05);
});
Deno.test("IBW Devine: missing sex throws CalcError", () => {
  assertThrows(() => idealBodyWeight.run({ height: 177.8 }), CalcError);
});

// ── Adjusted body weight = IBW + 0.4 × (actual − IBW), chained on UNROUNDED IBW ──
// Reference: male, 70 in (177.8 cm), 100 kg → IBW 73, AdjBW 73 + 0.4×27 = 83.8 kg.
// Source: ClinCalc / Omnicalculator adjusted-body-weight worked example.
Deno.test("AdjBW: male 177.8 cm, 100 kg → 83.8 kg", () => {
  const r = adjustedBodyWeight.run({ height: 177.8, weight: 100, sex: "male" });
  assertAlmostEquals(r.value, 83.8, 0.05);
});
Deno.test("AdjBW: actual below IBW still returns formula value + warns (no clamp/throw)", () => {
  const r = adjustedBodyWeight.run({ height: 177.8, weight: 60, sex: "male" }); // IBW 73 → 73 + 0.4×(−13) = 67.8
  assertAlmostEquals(r.value, 67.8, 0.05);
  assert(r.warnings!.some((w) => w.toLowerCase().includes("below ibw")), "expected below-IBW warning");
});
Deno.test("AdjBW: missing weight throws CalcError", () => {
  assertThrows(() => adjustedBodyWeight.run({ height: 177.8, sex: "male" }), CalcError);
});

// ── Lean body weight — Boer ──
// Reference: male, 50 kg, 165 cm → 0.407×50 + 0.267×165 − 19.2 = 45.2 kg.
//            female, 50 kg, 165 cm → 0.252×50 + 0.473×165 − 48.3 = 42.3 kg.
// Source: omnicalculator.com/health/lean-body-mass Boer worked example; formula Boer Am J Physiol 1984.
Deno.test("LBW Boer: male 50 kg, 165 cm → 45.2 kg", () => {
  assertAlmostEquals(leanBodyWeight.run({ weight: 50, height: 165, sex: "male" }).value, 45.2, 0.05);
});
Deno.test("LBW Boer: female 50 kg, 165 cm → 42.3 kg (sex coefficients differ)", () => {
  assertAlmostEquals(leanBodyWeight.run({ weight: 50, height: 165, sex: "female" }).value, 42.3, 0.05);
});
Deno.test("LBW Boer: bad sex enum throws CalcError", () => {
  assertThrows(() => leanBodyWeight.run({ weight: 50, height: 165, sex: "other" }), CalcError);
});
