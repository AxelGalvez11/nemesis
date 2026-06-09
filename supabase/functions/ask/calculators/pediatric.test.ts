import { assert, assertAlmostEquals, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hollidaySegar, pediatricBsaDose, pediatricWeightDose, schwartzEgfr } from "./pediatric.ts";
import { CalcError } from "./types.ts";

// ── Pediatric weight-based dose (mg/kg/day or mg/kg/dose → daily total + per-dose, with max cap) ──
// Normal vs authoritative: amoxicillin 25 mg/kg/day, 14.2 kg, q12h → 355 mg/day, 177.5 mg/dose.
// This exact worked example (Daily = 25×14.2 = 355 mg → per dose = 177.5 mg) is published at
//   https://pharmacyfreak.com/pediatric-dose-calculator-weight-based/ and
//   https://medplore.com/dose-calculators/pediatric-dose-calculator/ (which also documents the
//   max-daily-dose cap behavior: cap the final dose, show the uncapped value, recompute per-dose).
Deno.test("Peds weight dose: 25 mg/kg/day × 14.2 kg, q12h → 355 mg/day, 177.5 mg/dose", () => {
  const r = pediatricWeightDose.run({ weight: 14.2, dose_per_kg: 25, basis: "per-day", frequency: 2 });
  assertEquals(r.value, 355.0);
  assertEquals(r.unit, "mg/day");
  assertEquals(r.inputsEcho.dose_per_dose, 177.5);
});
// per-dose basis: 15 mg/kg/dose × 18 kg = 270 mg/dose; q6h (4/day) → 1080 mg/day (hand-exact).
Deno.test("Peds weight dose: 15 mg/kg/dose × 18 kg, q6h → 270 mg/dose, 1080 mg/day", () => {
  const r = pediatricWeightDose.run({ weight: 18, dose_per_kg: 15, basis: "per-dose", frequency: 4 });
  assertEquals(r.inputsEcho.dose_per_dose, 270.0);
  assertEquals(r.value, 1080.0);
});
// Boundary: max-dose cap binds AND per-dose is recomputed from the capped daily total (no over-dose).
// 90 mg/kg/day × 50 kg = 4500 mg/day uncapped; cap 3000 → daily 3000, q12h → 1500 mg/dose (exact).
Deno.test("Peds weight dose: cap binds → daily capped, per-dose recomputed from capped total", () => {
  const r = pediatricWeightDose.run({ weight: 50, dose_per_kg: 90, basis: "per-day", frequency: 2, max_dose_per_day: 3000 });
  assertEquals(r.value, 3000.0);
  assertEquals(r.inputsEcho.dose_per_dose, 1500.0); // 3000 / 2, NOT 4500/2 → cap-recompute invariant
  assertEquals(r.category, "max daily dose cap applied");
  assert(r.warnings!.some((w: string) => w.toLowerCase().includes("cap applied")), "expected cap-applied warning");
});
// Cap present but does NOT bind → uncapped value passes through unchanged.
Deno.test("Peds weight dose: cap above requirement does not bind", () => {
  const r = pediatricWeightDose.run({ weight: 20, dose_per_kg: 50, basis: "per-day", frequency: 2, max_dose_per_day: 3000 });
  assertEquals(r.value, 1000.0); // 50×20=1000 < 3000 cap
  assertEquals(r.category, "within weight-based dose");
});
// Validation: missing weight throws; bad basis enum throws.
Deno.test("Peds weight dose: missing weight throws CalcError", () => {
  assertThrows(() => pediatricWeightDose.run({ dose_per_kg: 25, basis: "per-day", frequency: 2 }), CalcError);
});
Deno.test("Peds weight dose: invalid basis throws CalcError", () => {
  assertThrows(() => pediatricWeightDose.run({ weight: 14, dose_per_kg: 25, basis: "weekly", frequency: 2 }), CalcError);
});

// ── Pediatric BSA-based dose (mg/m²) → total ──
// Hand-exact normal case: 1.0 m² × 100 mg/m² = 100 mg (self-verifying pure multiplication).
// Source (convention): mg/m² body-surface-area dosing; formula total = BSA × dose/m².
Deno.test("Peds BSA dose: 1.0 m² × 100 mg/m² → 100 mg (hand-exact)", () => {
  const r = pediatricBsaDose.run({ bsa: 1.0, dose_per_m2: 100 });
  assertEquals(r.value, 100.0);
  assertEquals(r.unit, "mg");
});
Deno.test("Peds BSA dose: 1.5 m² × 200 mg/m² → 300 mg", () => {
  assertEquals(pediatricBsaDose.run({ bsa: 1.5, dose_per_m2: 200 }).value, 300.0);
});
// Boundary: cap binds. 1.8 m² × 1000 = 1800 mg uncapped; cap 1500 → 1500 mg (exact).
Deno.test("Peds BSA dose: max-dose cap binds → capped total", () => {
  const r = pediatricBsaDose.run({ bsa: 1.8, dose_per_m2: 1000, max_dose: 1500 });
  assertEquals(r.value, 1500.0);
  assertEquals(r.category, "max dose cap applied");
});
Deno.test("Peds BSA dose: missing dose_per_m2 throws CalcError", () => {
  assertThrows(() => pediatricBsaDose.run({ bsa: 1.0 }), CalcError);
});

// ── Holliday-Segar maintenance fluid (4-2-1 mL/hr / 100-50-20 mL/day) ──
// 25 kg → 65 mL/hr (4-2-1) AND 1600 mL/day (100-50-20) — two INDEPENDENT methods.
// The 65 mL/hr value is a published worked example (40+20+5) at
//   https://www.maskinduction.com/the-4-2-1-rule-for-maintenance-fluid-therapy-in-infants-and-children.html.
// The 1600 mL/day value is HAND-EXACT (1000+500+100) from the 100-50-20 tiers confirmed at
//   https://www.omnicalculator.com/health/maintenance-fluids-children (100/50/20 mL/kg/day over the
//   ≤10 / 10–20 / >20 kg tiers); the 10/20/30 kg boundary values below are likewise hand-exact from
//   those tiers. Original method: Holliday MA, Segar WE. Pediatrics 1957;19(5):823-832.
Deno.test("Holliday-Segar: 25 kg → 65 mL/hr (4-2-1) and 1600 mL/day (100-50-20)", () => {
  const r = hollidaySegar.run({ weight: 25 });
  assertEquals(r.value, 65.0); // 40 + 20 + 5
  assertEquals(r.unit, "mL/hr");
  assertEquals(r.inputsEcho.volume_ml_per_day, 1600.0); // 1000 + 500 + 100 (NOT 65×24=1560)
});
// Independent-methods invariant: hourly×24 must NOT equal the daily volume at 25 kg.
Deno.test("Holliday-Segar: 4-2-1 and 100-50-20 are independent (65×24 ≠ 1600)", () => {
  const r = hollidaySegar.run({ weight: 25 });
  assert((r.value as number) * 24 !== r.inputsEcho.volume_ml_per_day, "methods must not be 24× of each other");
});
// Boundary at exactly 10 kg (first-tier edge): 40 mL/hr, 1000 mL/day.
// Source: omnicalculator/maskinduction tier definitions (≤10 kg → 4 mL/kg/hr, 100 mL/kg/day).
Deno.test("Holliday-Segar: 10 kg boundary → 40 mL/hr, 1000 mL/day", () => {
  const r = hollidaySegar.run({ weight: 10 });
  assertEquals(r.value, 40.0);
  assertEquals(r.inputsEcho.volume_ml_per_day, 1000.0);
});
// Boundary at exactly 20 kg (second-tier edge): 60 mL/hr, 1500 mL/day.
Deno.test("Holliday-Segar: 20 kg boundary → 60 mL/hr, 1500 mL/day", () => {
  const r = hollidaySegar.run({ weight: 20 });
  assertEquals(r.value, 60.0);
  assertEquals(r.inputsEcho.volume_ml_per_day, 1500.0);
});
// 30 kg cross-check (third tier): 70 mL/hr, 1700 mL/day. Source: omnicalculator worked example.
Deno.test("Holliday-Segar: 30 kg → 70 mL/hr, 1700 mL/day", () => {
  const r = hollidaySegar.run({ weight: 30 });
  assertEquals(r.value, 70.0);
  assertEquals(r.inputsEcho.volume_ml_per_day, 1700.0);
});
Deno.test("Holliday-Segar: missing weight throws CalcError", () => {
  assertThrows(() => hollidaySegar.run({}), CalcError);
});

// ── Schwartz bedside pediatric eGFR (2009): eGFR = 0.413 × height_cm ÷ SCr_mgdl ──
// Reference value is HAND-EXACT from the published bedside formula (k=0.413), not a third-party
// worked example: 0.413×140=57.82, /0.8 = 72.275 → 72.3 mL/min/1.73m².
// Formula source: Schwartz GJ et al., New equations to estimate GFR in children with CKD.
//   J Am Soc Nephrol 2009;20(3):629-637 (PMID 19158356, https://pubmed.ncbi.nlm.nih.gov/19158356/).
// Constant k=0.413 and IDMS-traceable/age-1-16 scope cross-confirmed via the Schwartz Pediatric
//   Bedside eGFR (2009) calculator description (Medscape/QxMD calc 281) and
//   https://myadlm.org/cln/articles/2015/may/pediatric-estimation-of-glomerular-filtration-rate.
Deno.test("Schwartz 2009: 140 cm, SCr 0.8 → 72.3 mL/min/1.73m²", () => {
  const r = schwartzEgfr.run({ height: 140, scr: 0.8 });
  assertAlmostEquals(r.value, 72.3, 0.05);
  assertEquals(r.unit, "mL/min/1.73m²");
});
// Clean exact case: 100 cm, SCr 0.413 → 0.413×100/0.413 = 100.0 mL/min/1.73m² (exact).
Deno.test("Schwartz 2009: 100 cm, SCr 0.413 → 100.0 (exact)", () => {
  assertAlmostEquals(schwartzEgfr.run({ height: 100, scr: 0.413 }).value, 100.0, 0.05);
});
// Boundary/category: elevated SCr lowers eGFR into a reduced-GFR band.
// 120 cm, SCr 1.5 → 0.413×120/1.5 = 33.04 → 30–44 band.
Deno.test("Schwartz 2009: elevated SCr → reduced eGFR band", () => {
  const r = schwartzEgfr.run({ height: 120, scr: 1.5 });
  assertAlmostEquals(r.value, 33.0, 0.1);
  assert(r.value < 60, `expected reduced GFR, got ${r.value}`);
  assert(r.category!.startsWith("30") || r.category!.startsWith("15") || r.category!.startsWith("45"));
});
Deno.test("Schwartz 2009: missing creatinine throws CalcError", () => {
  assertThrows(() => schwartzEgfr.run({ height: 140 }), CalcError);
});
Deno.test("Schwartz 2009: creatinine below floor throws CalcError", () => {
  assertThrows(() => schwartzEgfr.run({ height: 140, scr: 0 }), CalcError);
});
