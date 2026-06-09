import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cha2ds2Vasc, hasBled, wellsDvt, wellsPe } from "./cardiology.ts";
import { CalcError } from "./types.ts";

// Reference values come from MDCalc's published points tables + band thresholds (the structural,
// cohort-independent facts), cross-checked against the origin papers — never from invented
// study-specific risk percentages.

// ── CHA₂DS₂-VASc (range 0–9; age band 0/1/2; female sex +1) ──
// Ref points table: https://www.mdcalc.com/calc/801/cha2ds2-vasc-score-atrial-fibrillation-stroke-risk
Deno.test("CHA₂DS₂-VASc: 50y male, HTN only → 1 point, low–moderate", () => {
  const r = cha2ds2Vasc.run({ age: 50, sex: "male", hypertension: true });
  assertEquals(r.value, 1);
  assertEquals(r.unit, "points");
  assert(r.category!.includes("low–moderate"));
});
Deno.test("CHA₂DS₂-VASc: 76y female with HTN+DM+prior stroke → 7 points, high (age≥75=2, stroke=2)", () => {
  // age≥75=2, female=1, HTN=1, DM=1, stroke/TIA=2 → 7
  const r = cha2ds2Vasc.run({ age: 76, sex: "female", hypertension: true, diabetes: true, stroke: true });
  assertEquals(r.value, 7);
  assert(r.category!.startsWith("high"));
});
Deno.test("CHA₂DS₂-VASc: all criteria present caps at 9 (age band is a single 0/1/2, not two flags)", () => {
  const r = cha2ds2Vasc.run({
    age: 80,
    sex: "female",
    chf: true,
    hypertension: true,
    diabetes: true,
    stroke: true,
    vascular: true,
  });
  assertEquals(r.value, 9); // chf1+htn1+age2+dm1+stroke2+vasc1+female1
});
Deno.test("CHA₂DS₂-VASc: 64y male, no risk factors → 0 points, low", () => {
  const r = cha2ds2Vasc.run({ age: 64, sex: "male" });
  assertEquals(r.value, 0);
  assert(r.category!.includes("low"));
});
Deno.test("CHA₂DS₂-VASc: missing required sex throws CalcError", () => {
  assertThrows(() => cha2ds2Vasc.run({ age: 70, chf: true }), CalcError);
});

// ── HAS-BLED (range 0–9; renal/liver separate, drugs/alcohol separate; ≥3 = high) ──
// Ref points table: https://www.mdcalc.com/calc/807/has-bled-score-major-bleeding-risk
Deno.test("HAS-BLED: HTN + elderly → 2 points, intermediate (1–2 band)", () => {
  const r = hasBled.run({ hypertension: true, elderly: true });
  assertEquals(r.value, 2);
  assert(r.category!.startsWith("intermediate"));
});
Deno.test("HAS-BLED: exactly 3 points crosses into high-risk band", () => {
  const r = hasBled.run({ hypertension: true, elderly: true, labileInr: true });
  assertEquals(r.value, 3);
  assert(r.category!.startsWith("high"));
});
Deno.test("HAS-BLED: renal AND liver are separate items (both +1 → 2, not capped at 1)", () => {
  const r = hasBled.run({ renal: true, liver: true });
  assertEquals(r.value, 2);
});
Deno.test("HAS-BLED: drugs AND alcohol are separate items (both +1 → 2)", () => {
  const r = hasBled.run({ drugs: true, alcohol: true });
  assertEquals(r.value, 2);
});
Deno.test("HAS-BLED: all nine criteria present → max 9", () => {
  const r = hasBled.run({
    hypertension: true,
    renal: true,
    liver: true,
    stroke: true,
    bleeding: true,
    labileInr: true,
    elderly: true,
    drugs: true,
    alcohol: true,
  });
  assertEquals(r.value, 9);
});
Deno.test("HAS-BLED: non-boolean-like input throws CalcError", () => {
  assertThrows(() => hasBled.run({ hypertension: "maybe" }), CalcError);
});

// ── Wells DVT (range −2 to +9; alternative diagnosis = −2; ≥2 likely two-level) ──
// Ref points table: https://www.mdcalc.com/calc/362/wells-criteria-dvt
Deno.test("Wells DVT: active cancer + tenderness + entire leg swollen → 3 points, likely + high", () => {
  const r = wellsDvt.run({ activeCancer: true, tenderness: true, legSwollen: true });
  assertEquals(r.value, 3);
  assert(r.category!.includes("likely"));
  assert(r.category!.includes("high"));
});
Deno.test("Wells DVT: alternative diagnosis subtracts 2 → can go negative", () => {
  // tenderness +1, alt diagnosis −2 → −1
  const r = wellsDvt.run({ tenderness: true, altDiagnosis: true });
  assertEquals(r.value, -1);
  assert(r.category!.includes("unlikely"));
});
Deno.test("Wells DVT: 0 points → DVT unlikely (two-level <2), three-tier low", () => {
  const r = wellsDvt.run({});
  assertEquals(r.value, 0);
  assert(r.category!.includes("unlikely"));
  assert(r.category!.includes("low"));
});
Deno.test("Wells DVT: score 1 is still 'unlikely'; score 2 crosses into 'likely' (Wells 2003 two-level ≥2)", () => {
  // The modified-Wells two-level cutoff is ≥2 = likely, <2 = unlikely (Wells 2003 NEJM / NICE NG158).
  const one = wellsDvt.run({ tenderness: true });
  assertEquals(one.value, 1);
  assert(one.category!.includes("unlikely"), `score 1 must be unlikely, got ${one.category}`);
  const two = wellsDvt.run({ tenderness: true, legSwollen: true });
  assertEquals(two.value, 2);
  assert(two.category!.includes("likely"), `score 2 must be likely, got ${two.category}`);
});
Deno.test("Wells DVT: non-boolean input throws CalcError", () => {
  assertThrows(() => wellsDvt.run({ tenderness: "sometimes" }), CalcError);
});

// ── Wells PE (range 0–12.5; fractional points; >4 likely two-tier) ──
// Ref points table: https://www.mdcalc.com/calc/115/wells-criteria-pulmonary-embolism
Deno.test("Wells PE: DVT signs(3) + tachycardia(1.5) → 4.5 points, likely (>4)", () => {
  const r = wellsPe.run({ dvtSigns: true, tachycardia: true });
  assertEquals(r.value, 4.5);
  assert(r.category!.includes("likely"));
});
Deno.test("Wells PE: exactly 4 points (DVT signs 3 + hemoptysis 1) is the 'unlikely' boundary (≤4)", () => {
  // total 4 is NOT >4, so two-tier = unlikely (the 4↔5 edge)
  const r = wellsPe.run({ dvtSigns: true, hemoptysis: true });
  assertEquals(r.value, 4);
  assert(r.category!.includes("unlikely"));
});
Deno.test("Wells PE: all seven criteria present → 12.5 (max)", () => {
  const r = wellsPe.run({
    dvtSigns: true,
    peLikely: true,
    tachycardia: true,
    immobilization: true,
    priorVte: true,
    hemoptysis: true,
    malignancy: true,
  });
  assertEquals(r.value, 12.5);
  assert(r.category!.includes("high"));
});
Deno.test("Wells PE: 1.5 points (tachycardia only) → low three-tier, unlikely two-tier", () => {
  const r = wellsPe.run({ tachycardia: true });
  assertEquals(r.value, 1.5);
  assert(r.category!.includes("unlikely"));
  assert(r.category!.includes("low"));
});
Deno.test("Wells PE: non-boolean input throws CalcError", () => {
  assertThrows(() => wellsPe.run({ dvtSigns: "yes please" }), CalcError);
});
