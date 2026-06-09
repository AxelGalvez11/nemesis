import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { curb65, meld, meldNa, qsofa } from "./severity.ts";
import { CalcError } from "./types.ts";

// ── MELD (original): 10 × [0.957·ln(SCr) + 0.378·ln(bili) + 1.120·ln(INR) + 0.643], clamped 6–40 ──
// Reference values verified against multiple calculators (mdapp.co, Cleveland Clinic) and the UNOS
// lower-bound rule (labs <1 → 1, so all-1.0 → 10×0.643 = 6.43 → 6).
Deno.test("MELD: all labs 1.0 → 6 (UNOS floor; 10×0.643 ≈ 6.43)", () => {
  const r = meld.run({ scr: 1.0, bilirubin: 1.0, inr: 1.0 });
  assertEquals(r.value, 6);
  assertEquals(r.unit, "points");
});
Deno.test("MELD: SCr 2.5, bili 5.0, INR 2.0 → 29 (mdapp/Cleveland Clinic reference)", () => {
  assertEquals(meld.run({ scr: 2.5, bilirubin: 5.0, inr: 2.0 }).value, 29);
});
Deno.test("MELD: SCr 1.9, bili 4.2, INR 1.2 → 20 (reference)", () => {
  assertEquals(meld.run({ scr: 1.9, bilirubin: 4.2, inr: 1.2 }).value, 20);
});
Deno.test("MELD: SCr above 4.0 is capped at 4.0 (extreme SCr does not raise score further)", () => {
  const at4 = meld.run({ scr: 4.0, bilirubin: 2.0, inr: 1.5 }).value;
  const above = meld.run({ scr: 12.0, bilirubin: 2.0, inr: 1.5 }).value;
  assertEquals(at4, above);
});
Deno.test("MELD: dialysis forces SCr to 4.0", () => {
  const dial = meld.run({ scr: 1.0, bilirubin: 2.0, inr: 1.5, dialysis: true }).value;
  const cr4 = meld.run({ scr: 4.0, bilirubin: 2.0, inr: 1.5 }).value;
  assertEquals(dial, cr4);
});
Deno.test("MELD: missing INR throws CalcError", () => {
  assertThrows(() => meld.run({ scr: 1.0, bilirubin: 1.0 }), CalcError);
});

// ── MELD-Na (OPTN/UNOS 2016): MELD + 1.32·(137−Na) − [0.033·MELD·(137−Na)]; Na 125–137; only if MELD>11 ──
// Worked reference: MELD 20 (from SCr 1.9 / bili 4.2 / INR 1.2), Na 130 → 20 + 1.32·7 − 0.033·20·7
//   = 20 + 9.24 − 4.62 = 24.62 → 25.  Source: MDCalc MELD Na (UNOS/OPTN), calc/78.
Deno.test("MELD-Na: MELD 20 (SCr 1.9/bili 4.2/INR 1.2), Na 130 → 25 (OPTN reference)", () => {
  assertEquals(meldNa.run({ scr: 1.9, bilirubin: 4.2, inr: 1.2, sodium: 130 }).value, 25);
});
Deno.test("MELD-Na: conditional gate — MELD ≤ 11 → no sodium correction (MELD-Na = MELD)", () => {
  // all-1.0 labs → MELD 6 (≤11); Na 130 must NOT change the score.
  assertEquals(meldNa.run({ scr: 1.0, bilirubin: 1.0, inr: 1.0, sodium: 130 }).value, 6);
});
Deno.test("MELD-Na: Na = 137 leaves MELD unchanged (137−137 = 0)", () => {
  const base = meld.run({ scr: 2.5, bilirubin: 5.0, inr: 2.0 }).value; // 29
  assertEquals(meldNa.run({ scr: 2.5, bilirubin: 5.0, inr: 2.0, sodium: 137 }).value, base);
});
Deno.test("MELD-Na: sodium below 125 is clamped to 125", () => {
  const at125 = meldNa.run({ scr: 1.9, bilirubin: 4.2, inr: 1.2, sodium: 125 }).value;
  const below = meldNa.run({ scr: 1.9, bilirubin: 4.2, inr: 1.2, sodium: 110 }).value;
  assertEquals(at125, below);
});
Deno.test("MELD-Na: missing sodium throws CalcError", () => {
  assertThrows(() => meldNa.run({ scr: 1.9, bilirubin: 4.2, inr: 1.2 }), CalcError);
});

// ── CURB-65: 1 pt each Confusion / BUN>19 / RR≥30 / SBP<90 or DBP≤60 / Age≥65 ──
Deno.test("CURB-65: all criteria absent → 0, low risk", () => {
  const r = curb65.run({ confusion: false, bun: 10, resp_rate: 16, sbp: 120, dbp: 80, age: 40 });
  assertEquals(r.value, 0);
  assertEquals(r.category, "low risk");
});
Deno.test("CURB-65: all criteria present → 5, high risk", () => {
  const r = curb65.run({ confusion: true, bun: 40, resp_rate: 32, sbp: 85, dbp: 55, age: 80 });
  assertEquals(r.value, 5);
  assertEquals(r.category, "high risk");
});
Deno.test("CURB-65 boundary: age exactly 65 scores (≥65)", () => {
  const r = curb65.run({ confusion: false, bun: 10, resp_rate: 16, sbp: 120, dbp: 80, age: 65 });
  assertEquals(r.value, 1);
});
Deno.test("CURB-65 boundary: BUN exactly 19 does NOT score (> 19), 20 does", () => {
  const base = { confusion: false, resp_rate: 16, sbp: 120, dbp: 80, age: 40 };
  assertEquals(curb65.run({ ...base, bun: 19 }).value, 0);
  assertEquals(curb65.run({ ...base, bun: 20 }).value, 1);
});
Deno.test("CURB-65 boundary: SBP exactly 90 does NOT score (< 90); DBP exactly 60 scores (≤ 60)", () => {
  const base = { confusion: false, bun: 10, resp_rate: 16, age: 40 };
  assertEquals(curb65.run({ ...base, sbp: 90, dbp: 80 }).value, 0);
  assertEquals(curb65.run({ ...base, sbp: 120, dbp: 60 }).value, 1);
});
Deno.test("CURB-65: score 2 → intermediate risk", () => {
  const r = curb65.run({ confusion: true, bun: 10, resp_rate: 16, sbp: 120, dbp: 80, age: 70 });
  assertEquals(r.value, 2);
  assertEquals(r.category, "intermediate risk");
});
Deno.test("CURB-65: missing diastolic BP throws CalcError", () => {
  assertThrows(() => curb65.run({ confusion: false, bun: 10, resp_rate: 16, sbp: 120, age: 40 }), CalcError);
});

// ── qSOFA: 1 pt each RR≥22 / GCS<15 / SBP≤100; ≥2 = high risk ──
Deno.test("qSOFA: normal vitals → 0, not high risk", () => {
  const r = qsofa.run({ resp_rate: 16, gcs: 15, sbp: 120 });
  assertEquals(r.value, 0);
  assertEquals(r.category, "not high risk");
});
Deno.test("qSOFA: all three criteria → 3, high risk", () => {
  const r = qsofa.run({ resp_rate: 28, gcs: 13, sbp: 90 });
  assertEquals(r.value, 3);
  assertEquals(r.category, "high risk");
});
Deno.test("qSOFA boundary: RR exactly 22 scores (≥22); SBP exactly 100 scores (≤100); GCS 15 does not", () => {
  const r = qsofa.run({ resp_rate: 22, gcs: 15, sbp: 100 });
  assertEquals(r.value, 2); // RR (1) + SBP (1); GCS 15 → 0
  assertEquals(r.category, "high risk");
});
Deno.test("qSOFA boundary: SBP 101 does NOT score; GCS 14 (altered) does", () => {
  const r = qsofa.run({ resp_rate: 18, gcs: 14, sbp: 101 });
  assertEquals(r.value, 1); // only GCS<15
  assertEquals(r.category, "not high risk");
});
Deno.test("qSOFA: missing SBP throws CalcError", () => {
  assertThrows(() => qsofa.run({ resp_rate: 22, gcs: 15 }), CalcError);
});

// ── sanity: every calculator echoes inputs and cites a source ──
Deno.test("severity: results carry formula + source + inputsEcho", () => {
  for (const r of [
    meld.run({ scr: 2.5, bilirubin: 5.0, inr: 2.0 }),
    meldNa.run({ scr: 1.9, bilirubin: 4.2, inr: 1.2, sodium: 130 }),
    curb65.run({ confusion: true, bun: 40, resp_rate: 32, sbp: 85, dbp: 55, age: 80 }),
    qsofa.run({ resp_rate: 28, gcs: 13, sbp: 90 }),
  ]) {
    assert(r.formula.length > 0, "formula present");
    assert(r.source.length > 0, "source present");
    assert(Object.keys(r.inputsEcho).length > 0, "inputsEcho present");
  }
});