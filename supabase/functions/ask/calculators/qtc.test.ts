import { assert, assertAlmostEquals, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { qtcBazett, qtcFramingham, qtcFridericia, qtcHodges } from "./qtc.ts";
import { CalcError } from "./types.ts";

// PROVENANCE of expected values (units: QT/QTc ms, RR s, HR bpm). The four published formulas are
// confirmed against MDCalc "Corrected QT Interval (QTc)" calc/48
// (https://www.mdcalc.com/calc/48/corrected-qt-interval-qtc), which implements exactly these four:
//   Bazett      QTc = QT / √RR            (Bazett, Heart 1920;7:353-370)
//   Fridericia  QTc = QT / RR^(1/3)       (Fridericia, Acta Med Scand 1920;53:469-486)
//   Framingham  QTc = QT + 0.154×(1−RR), in seconds, ×1000 → ms  (Sagie et al., Am J Cardiol 1992;70:797-801)
//   Hodges      QTc = QT + 1.75×(HR−60)   (Hodges et al., J Am Coll Cardiol 1983;1:694)
// Each numeric expectation below is the EXACT arithmetic of the published formula confirmed at the
// URLs above — NOT an invented value. Two are additionally anchored to independent third-party
// worked examples so Bazett is checked against a calculator we did not write:
//   • Omnicalculator (https://www.omnicalculator.com/health/qtc): QT 360 ms, HR 80 bpm → Bazett 415.7 ms.
//   • ActiveCalculator (https://activecalculator.com/calculators/health/qtc-calculator):
//       QT 380 ms, HR 72 bpm → Bazett 416 ms;  QT 320 ms, HR 115 bpm → Bazett 443 ms.
// Prolongation thresholds (>450 ms men, >470 ms women, >500 ms markedly prolonged / torsades risk)
// follow standard AHA/ACC practice and the bands shown by MDCalc calc/48.

// ── Defining boundary: at HR 60 bpm (RR 1.0 s) every correction reduces to QTc = QT exactly ──
Deno.test("Bazett: HR 60 (RR 1.0) → no correction, QTc = QT (400)", () => {
  const r = qtcBazett.run({ qt: 400, hr: 60 });
  assertEquals(r.value, 400);
  assertEquals(r.unit, "ms");
});
Deno.test("Fridericia: HR 60 → QTc = QT (400)", () => {
  assertEquals(qtcFridericia.run({ qt: 400, hr: 60 }).value, 400);
});
Deno.test("Framingham: HR 60 → QTc = QT (400)", () => {
  assertEquals(qtcFramingham.run({ qt: 400, hr: 60 }).value, 400);
});
Deno.test("Hodges: HR 60 → QTc = QT (400)", () => {
  assertEquals(qtcHodges.run({ qt: 400, hr: 60 }).value, 400);
});

// ── Tachycardia worked case (QT 360 ms, HR 120 bpm, RR 0.5 s) — hand-exact per published formulae ──
Deno.test("Bazett: QT 360, HR 120 → 509 ms (360/√0.5)", () => {
  assertEquals(qtcBazett.run({ qt: 360, hr: 120 }).value, 509);
});
Deno.test("Fridericia: QT 360, HR 120 → 454 ms (360/0.5^(1/3))", () => {
  assertEquals(qtcFridericia.run({ qt: 360, hr: 120 }).value, 454);
});
Deno.test("Framingham: QT 360, HR 120 → 437 ms (360 + 154×(1−0.5))", () => {
  assertEquals(qtcFramingham.run({ qt: 360, hr: 120 }).value, 437);
});
Deno.test("Hodges: QT 360, HR 120 → 465 ms (360 + 1.75×60)", () => {
  assertEquals(qtcHodges.run({ qt: 360, hr: 120 }).value, 465);
});

// ── Bazett normal-rate cross-check vs Omnicalculator: QT 360, HR 80 → ≈415.7 ms ──
Deno.test("Bazett: QT 360, HR 80 → ~416 ms (Omnicalculator 415.7)", () => {
  assertAlmostEquals(qtcBazett.run({ qt: 360, hr: 80 }).value, 416, 1);
});

// ── Bazett independent cross-checks vs ActiveCalculator worked examples ──
Deno.test("Bazett: QT 380, HR 72 → 416 ms (ActiveCalculator)", () => {
  assertEquals(qtcBazett.run({ qt: 380, hr: 72 }).value, 416);
});
Deno.test("Bazett: QT 320, HR 115 → 443 ms (ActiveCalculator)", () => {
  assertEquals(qtcBazett.run({ qt: 320, hr: 115 }).value, 443);
});

// ── RR-interval input path equals the HR path (HR 120 ⇔ RR 0.5 s) ──
Deno.test("RR input equals HR input (RR 0.5 ⇔ HR 120) for Bazett", () => {
  assertEquals(qtcBazett.run({ qt: 360, rr: 0.5 }).value, qtcBazett.run({ qt: 360, hr: 120 }).value);
});

// ── Prolongation bands (thresholds: >450 men, >470 women, >500 markedly prolonged / torsades) ──
Deno.test("Bazett: markedly prolonged QTc (>500) flags torsades risk", () => {
  const r = qtcBazett.run({ qt: 500, hr: 100, sex: "male" }); // 500/√0.6 ≈ 645 ms
  assert(r.value > 500, `expected >500, got ${r.value}`);
  assert(r.category!.includes("markedly prolonged"), `category was: ${r.category}`);
  assert(r.warnings!.some((w) => w.includes("torsades")), "expected a torsades-risk warning");
});
Deno.test("Sex-specific band: 460 ms is prolonged for men but normal for women", () => {
  // Construct QTc ≈ 460 ms: at HR 60, QTc = QT, so qt 460 gives QTc 460 for any formula.
  const male = qtcHodges.run({ qt: 460, hr: 60, sex: "male" });
  const female = qtcHodges.run({ qt: 460, hr: 60, sex: "female" });
  assertEquals(male.value, 460);
  assertEquals(female.value, 460);
  assert(male.category!.includes("prolonged"), `male category: ${male.category}`);
  assert(female.category!.includes("normal"), `female category: ${female.category}`);
});
Deno.test("Sex omitted: still bands QTc and warns sex is missing", () => {
  const r = qtcBazett.run({ qt: 460, hr: 60 });
  assert(r.warnings!.some((w) => w.toLowerCase().includes("sex not provided")), "expected a sex-missing warning");
});

// ── Input validation: missing QT, and missing BOTH heart rate and RR, throw CalcError ──
Deno.test("missing QT throws CalcError", () => {
  assertThrows(() => qtcBazett.run({ hr: 80 }), CalcError);
});
Deno.test("neither HR nor RR provided throws CalcError", () => {
  assertThrows(() => qtcBazett.run({ qt: 400 }), CalcError);
});
Deno.test("out-of-range heart rate throws CalcError", () => {
  assertThrows(() => qtcFridericia.run({ qt: 400, hr: 500 }), CalcError);
});
Deno.test("invalid sex enum throws CalcError", () => {
  assertThrows(() => qtcBazett.run({ qt: 400, hr: 80, sex: "other" }), CalcError);
});
