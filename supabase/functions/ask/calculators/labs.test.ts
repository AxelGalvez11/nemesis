import { assert, assertAlmostEquals, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { anionGap, correctedAnionGap, correctedCalcium, correctedSodium, fena, serumOsmolality } from "./labs.ts";
import { CalcError } from "./types.ts";

// ── Albumin-corrected calcium: Ca + 0.8 × (4.0 − albumin) ──
// Reference: MDCalc / Omnicalculator worked example — Ca 7.2 mg/dL, albumin 1.1 g/dL → 9.52 mg/dL
// (0.8 × (4.0 − 1.1) + 7.2 = 2.32 + 7.2 = 9.52). Hand-exact evaluation of the published formula.
Deno.test("Corrected calcium: Ca 7.2, albumin 1.1 → 9.52 mg/dL", () => {
  const r = correctedCalcium.run({ calcium: 7.2, albumin: 1.1 });
  assertEquals(r.value, 9.52);
  assertEquals(r.unit, "mg/dL");
});
Deno.test("Corrected calcium: normal albumin (4.0) leaves calcium unchanged + categorizes normal", () => {
  const r = correctedCalcium.run({ calcium: 9.4, albumin: 4.0 });
  assertEquals(r.value, 9.4);
  assertEquals(r.category, "normal (8.5–10.5 mg/dL)");
});
Deno.test("Corrected calcium: low corrected value flags hypocalcemia band", () => {
  const r = correctedCalcium.run({ calcium: 7.5, albumin: 4.0 });
  assertEquals(r.category, "low (<8.5 mg/dL)");
});
Deno.test("Corrected calcium: missing albumin throws CalcError", () => {
  assertThrows(() => correctedCalcium.run({ calcium: 7.2 }), CalcError);
});

// ── Sodium correction for hyperglycemia: Na + factor × (glucose − 100) / 100 ──
// Reference: MDCalc "Sodium Correction for Hyperglycemia" — Katz factor 1.6 (NEJM 1973),
// Hillier factor 2.4 (Am J Med 1999). Hand-exact: Na 130, glucose 600.
// Katz:    130 + 1.6 × (600−100)/100 = 130 + 8.0 = 138.0
// Hillier: 130 + 2.4 × (600−100)/100 = 130 + 12.0 = 142.0
Deno.test("Corrected sodium (Katz 1.6 default): Na 130, glucose 600 → 138.0", () => {
  const r = correctedSodium.run({ sodium: 130, glucose: 600 });
  assertEquals(r.value, 138.0);
  assertEquals(r.unit, "mEq/L");
});
Deno.test("Corrected sodium (Hillier 2.4): Na 130, glucose 600 → 142.0", () => {
  const r = correctedSodium.run({ sodium: 130, glucose: 600, method: "hillier" });
  assertEquals(r.value, 142.0);
});
Deno.test("Corrected sodium: glucose ≤ 100 computes (no throw) and warns", () => {
  const r = correctedSodium.run({ sodium: 140, glucose: 90 });
  assertAlmostEquals(r.value, 139.8, 0.05); // 140 + 1.6 × (90−100)/100 = 139.84 → 139.8
  assert(r.warnings!.some((w) => w.toLowerCase().includes("≤ 100") || w.includes("hyperglycemia")));
});
Deno.test("Corrected sodium: bad method enum throws CalcError", () => {
  assertThrows(() => correctedSodium.run({ sodium: 130, glucose: 600, method: "bogus" }), CalcError);
});

// ── Anion gap: Na − (Cl + HCO3) ──
// Reference: MDCalc "Anion Gap". Hand-exact: Na 140, Cl 105, HCO3 25 → 10 mEq/L (normal band).
Deno.test("Anion gap: Na 140, Cl 105, HCO3 25 → 10 mEq/L (normal)", () => {
  const r = anionGap.run({ sodium: 140, chloride: 105, bicarbonate: 25 });
  assertEquals(r.value, 10);
  assertEquals(r.category, "normal (3–12)");
});
Deno.test("Anion gap: high-gap acidosis crosses the >12 boundary", () => {
  const r = anionGap.run({ sodium: 140, chloride: 100, bicarbonate: 10 }); // 140 − 110 = 30
  assertEquals(r.value, 30);
  assertEquals(r.category, "high anion gap (>12)");
});
Deno.test("Anion gap: missing bicarbonate throws CalcError", () => {
  assertThrows(() => anionGap.run({ sodium: 140, chloride: 105 }), CalcError);
});

// ── Albumin-corrected anion gap: [Na − (Cl + HCO3)] + 2.5 × (4.0 − albumin) ──
// Reference: MDCalc "Anion Gap" (albumin-corrected, Figge Crit Care Med 1998). MDCalc worked
// case: an apparently-normal AG of 10 with albumin 2.0 g/dL → corrected 15 (a masked high gap).
// Hand-exact: Na 140, Cl 105, HCO3 25 (AG 10), albumin 2.0 → 10 + 2.5 × (4.0−2.0) = 15.0
Deno.test("Corrected anion gap: AG 10 + albumin 2.0 → 15.0 (unmasks high gap)", () => {
  const r = correctedAnionGap.run({ sodium: 140, chloride: 105, bicarbonate: 25, albumin: 2.0 });
  assertEquals(r.value, 15.0);
  assertEquals(r.category, "high corrected gap (>12)");
});
Deno.test("Corrected anion gap: normal albumin reduces to the plain gap", () => {
  const r = correctedAnionGap.run({ sodium: 140, chloride: 105, bicarbonate: 25, albumin: 4.0 });
  assertEquals(r.value, 10); // no albumin adjustment
  assertEquals(r.category, "normal (≤12)");
});
Deno.test("Corrected anion gap: missing albumin throws CalcError", () => {
  assertThrows(() => correctedAnionGap.run({ sodium: 140, chloride: 105, bicarbonate: 25 }), CalcError);
});

// ── Calculated serum osmolality: 2 × Na + glucose/18 + BUN/2.8 ──
// Reference: MDCalc "Serum Osmolality/Osmolarity". Hand-exact: Na 140, glucose 90, BUN 20
// → 2×140 + 90/18 + 20/2.8 = 280 + 5 + 7.142857… = 292.142857… → 292.1 mOsm/kg.
Deno.test("Serum osmolality: Na 140, glucose 90, BUN 20 → 292.1 mOsm/kg", () => {
  const r = serumOsmolality.run({ sodium: 140, glucose: 90, bun: 20 });
  assertEquals(r.value, 292.1);
  assertEquals(r.unit, "mOsm/kg");
  assertEquals(r.category, "normal (275–295)");
});
Deno.test("Serum osmolality: measured value yields osmolar-gap category", () => {
  // calc ≈ 292.1; measured 310 → gap ≈ 17.9 (≥10 → elevated)
  const r = serumOsmolality.run({ sodium: 140, glucose: 90, bun: 20, measuredOsm: 310 });
  assertEquals(r.category, "elevated osmolar gap (≥10)");
  assert(r.interpretation!.includes("osmolar gap"));
});
Deno.test("Serum osmolality: missing BUN throws CalcError", () => {
  assertThrows(() => serumOsmolality.run({ sodium: 140, glucose: 90 }), CalcError);
});

// ── FENa: (urine Na × serum Cr) / (serum Na × urine Cr) × 100 ──
// Reference: MDCalc "Fractional Excretion of Sodium (FENa)" (Espinel JAMA 1976). Hand-exact
// worked case: UNa 60, serum Cr 2.0, serum Na 140, urine Cr 80
// → (60 × 2.0) / (140 × 80) × 100 = 120 / 11200 × 100 = 1.0714… → 1.07%.
Deno.test("FENa: UNa 60, sCr 2.0, sNa 140, uCr 80 → 1.07%", () => {
  const r = fena.run({ urineNa: 60, serumCr: 2.0, serumNa: 140, urineCr: 80 });
  assertEquals(r.value, 1.07);
  assertEquals(r.unit, "%");
});
Deno.test("FENa: low value (<1%) categorizes as prerenal pattern", () => {
  // UNa 20, sCr 2.0, sNa 140, uCr 100 → (20×2)/(140×100)×100 = 0.2857… → 0.29% (<1%)
  const r = fena.run({ urineNa: 20, serumCr: 2.0, serumNa: 140, urineCr: 100 });
  assertAlmostEquals(r.value, 0.29, 0.01);
  assert(r.category!.includes("prerenal"));
});
Deno.test("FENa: missing urine creatinine throws CalcError", () => {
  assertThrows(() => fena.run({ urineNa: 60, serumCr: 2.0, serumNa: 140 }), CalcError);
});
