import { assert, assertAlmostEquals, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cockcroftGault, ckdEpi2021, mdrd, childPugh } from "./renal.ts";
import { CalcError } from "./types.ts";

// ── Cockcroft-Gault (hand-exact: ((140−age)×wt×sexF)/(72×SCr)) ──
Deno.test("Cockcroft-Gault: male 60y, 72kg, SCr 1.0 → 80.0 mL/min", () => {
  const r = cockcroftGault.run({ age: 60, weight: 72, scr: 1.0, sex: "male" });
  assertEquals(r.value, 80.0);
  assertEquals(r.unit, "mL/min");
});
Deno.test("Cockcroft-Gault: female applies 0.85 factor → 68.0", () => {
  assertEquals(cockcroftGault.run({ age: 60, weight: 72, scr: 1.0, sex: "female" }).value, 68.0);
});
Deno.test("Cockcroft-Gault: male 40y, 80kg, SCr 1.2 → 92.6", () => {
  assertAlmostEquals(cockcroftGault.run({ age: 40, weight: 80, scr: 1.2, sex: "male" }).value, 92.6, 0.1);
});
Deno.test("Cockcroft-Gault: missing input throws CalcError", () => {
  assertThrows(() => cockcroftGault.run({ age: 60, weight: 72, sex: "male" }), CalcError);
});

// ── CKD-EPI 2021 (race-free). Reference values cross-checked against MDCalc. ──
Deno.test("CKD-EPI 2021: male 60y, SCr 1.0 → ~86", () => {
  assertAlmostEquals(ckdEpi2021.run({ age: 60, scr: 1.0, sex: "male" }).value, 86, 2);
});
Deno.test("CKD-EPI 2021: female 60y, SCr 1.0 → ~64", () => {
  assertAlmostEquals(ckdEpi2021.run({ age: 60, scr: 1.0, sex: "female" }).value, 64, 2);
});
Deno.test("CKD-EPI 2021: elevated SCr lowers eGFR + stages CKD", () => {
  const r = ckdEpi2021.run({ age: 70, scr: 2.0, sex: "male" });
  assert(r.value < 45, `expected G3b/worse, got ${r.value}`);
  assert(r.category!.startsWith("G3") || r.category!.startsWith("G4") || r.category!.startsWith("G5"));
});

// ── MDRD 4-variable (IDMS): 175 × SCr^−1.154 × age^−0.203 × (0.742 ♀) × (1.212 Black) ──
Deno.test("MDRD: male 60y, SCr 1.0 → ~76", () => {
  assertAlmostEquals(mdrd.run({ age: 60, scr: 1.0, sex: "male" }).value, 76, 2);
});
Deno.test("MDRD: female 60y, SCr 1.0 → ~57 (0.742 factor)", () => {
  assertAlmostEquals(mdrd.run({ age: 60, scr: 1.0, sex: "female" }).value, 57, 2);
});
Deno.test("MDRD: legacy Black coefficient multiplies by 1.212", () => {
  const base = mdrd.run({ age: 60, scr: 1.0, sex: "male" }).value;
  const black = mdrd.run({ age: 60, scr: 1.0, sex: "male", black: true }).value;
  assertAlmostEquals(black / base, 1.212, 0.02);
});

// ── Child-Pugh (categorical) ──
Deno.test("Child-Pugh: all-normal → 5 points, Class A", () => {
  const r = childPugh.run({ bilirubin: 1.0, albumin: 4.0, inr: 1.0, ascites: "none", encephalopathy: "none" });
  assertEquals(r.value, 5);
  assertEquals(r.category, "Class A");
});
Deno.test("Child-Pugh: mixed → 8 points, Class B", () => {
  const r = childPugh.run({ bilirubin: 2.5, albumin: 3.0, inr: 1.5, ascites: "none", encephalopathy: "grade1-2" });
  assertEquals(r.value, 8);
  assertEquals(r.category, "Class B");
});
Deno.test("Child-Pugh: worst → 15 points, Class C", () => {
  const r = childPugh.run({ bilirubin: 5, albumin: 2.0, inr: 3, ascites: "moderate-severe", encephalopathy: "grade3-4" });
  assertEquals(r.value, 15);
  assertEquals(r.category, "Class C");
});
