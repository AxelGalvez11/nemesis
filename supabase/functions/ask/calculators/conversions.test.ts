import { assert, assertAlmostEquals, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { opioidMme, corticosteroidEquivalence } from "./conversions.ts";
import { CalcError } from "./types.ts";

// ── Opioid MME (CDC 2022). Reference factors from the CDC 2022 Clinical Practice Guideline table:
//    https://www.cdc.gov/mmwr/volumes/71/rr/rr7103a1.htm (MMWR 2022;71(RR-3)).
//    These cases deliberately exercise the factors the 2022 update CHANGED (methadone 3→4.7,
//    tramadol 0.1→0.2, hydromorphone 4.0→5.0) so they fail against any pre-2022 table. ──

Deno.test("MME: methadone 20 mg/day × 4.7 (CDC 2022) → 94.0 MME/day", () => {
  const r = opioidMme.run({ opioid: "methadone", dose: 20 });
  assertEquals(r.value, 94.0); // CDC 2022 factor 4.7 (was 3 pre-2022)
  assertEquals(r.unit, "MME/day");
});

Deno.test("MME: tramadol 100 mg/day × 0.2 (CDC 2022) → 20.0 MME/day", () => {
  // CDC 2022 changed tramadol from 0.1 → 0.2; the old table would give 10.0.
  assertEquals(opioidMme.run({ opioid: "tramadol", dose: 100 }).value, 20.0);
});

Deno.test("MME: hydromorphone 8 mg/day × 5.0 (CDC 2022) → 40.0 MME/day", () => {
  // CDC 2022 changed hydromorphone from 4.0 → 5.0; the old table would give 32.0.
  assertEquals(opioidMme.run({ opioid: "hydromorphone", dose: 8 }).value, 40.0);
});

Deno.test("MME: transdermal fentanyl 25 mcg/hr × 2.4 → 60.0 MME/day (CDC worked example)", () => {
  // CDC's own worked example: 25 mcg/hr patch ≈ 60 mg/day oral morphine equivalent.
  assertEquals(opioidMme.run({ opioid: "fentanyl-transdermal", dose: 25 }).value, 60.0);
});

// ── Boundary / category case: 60 mg/day oxycodone × 1.5 = 90.0 → the ≥90 MME/day risk band. ──
Deno.test("MME: oxycodone 60 mg/day → 90.0 MME/day, ≥90 risk band", () => {
  const r = opioidMme.run({ opioid: "oxycodone", dose: 60 });
  assertEquals(r.value, 90.0);
  assertEquals(r.category, "≥90 MME/day");
});

Deno.test("MME: 40 mg/day oxycodone → 60.0, <50? no — lands in 50–89 band", () => {
  const r = opioidMme.run({ opioid: "oxycodone", dose: 40 }); // 40 × 1.5 = 60
  assertEquals(r.value, 60.0);
  assertEquals(r.category, "50–89 MME/day");
});

Deno.test("MME: low-dose codeine sits in <50 band", () => {
  const r = opioidMme.run({ opioid: "codeine", dose: 120 }); // 120 × 0.15 = 18
  assertEquals(r.value, 18.0);
  assertEquals(r.category, "<50 MME/day");
});

// ── Input validation throws ──
Deno.test("MME: missing dose throws CalcError", () => {
  assertThrows(() => opioidMme.run({ opioid: "morphine" }), CalcError);
});

Deno.test("MME: unknown opioid throws CalcError", () => {
  assertThrows(() => opioidMme.run({ opioid: "heroin", dose: 30 }), CalcError);
});

// ── Corticosteroid equivalence. Reference table from StatPearls (NBK531462):
//    prednisone 5, methylprednisolone 4, dexamethasone 0.75, hydrocortisone 20 mg = equipotent.
//    https://www.ncbi.nlm.nih.gov/books/NBK531462/ ──

Deno.test("Steroid: 40 mg prednisone → methylprednisolone = 32 mg", () => {
  // 40 × (4 / 5) = 32
  const r = corticosteroidEquivalence.run({ from: "prednisone", dose: 40, to: "methylprednisolone" });
  assertEquals(r.value, 32);
  assertEquals(r.unit, "mg");
});

Deno.test("Steroid: 40 mg prednisone → dexamethasone = 6 mg", () => {
  // 40 × (0.75 / 5) = 6
  assertEquals(corticosteroidEquivalence.run({ from: "prednisone", dose: 40, to: "dexamethasone" }).value, 6);
});

Deno.test("Steroid: 5 mg prednisone → hydrocortisone = 20 mg (table equipotency)", () => {
  assertEquals(corticosteroidEquivalence.run({ from: "prednisone", dose: 5, to: "hydrocortisone" }).value, 20);
});

Deno.test("Steroid: same drug is identity (20 mg hydrocortisone → 20 mg)", () => {
  assertAlmostEquals(corticosteroidEquivalence.run({ from: "hydrocortisone", dose: 20, to: "hydrocortisone" }).value, 20, 0.001);
});

Deno.test("Steroid: dexamethasone is long-acting category", () => {
  const r = corticosteroidEquivalence.run({ from: "prednisone", dose: 10, to: "dexamethasone" });
  assert(r.category!.startsWith("long-acting"), `expected long-acting, got ${r.category}`);
});

// ── Input validation throws ──
Deno.test("Steroid: unknown from-drug throws CalcError", () => {
  assertThrows(() => corticosteroidEquivalence.run({ from: "fludrocortisone", dose: 10, to: "prednisone" }), CalcError);
});

Deno.test("Steroid: missing dose throws CalcError", () => {
  assertThrows(() => corticosteroidEquivalence.run({ from: "prednisone", to: "dexamethasone" }), CalcError);
});