// The arithmetic that stops a picture marking a correct learner wrong.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `a stated angle that disagrees with its own coordinates is
// refused`. It is the whole reason Nemesis needs no geometry solver to be honest: placing points is
// hard, checking them is arithmetic, and a figure labelled 30° whose coordinates say 47° teaches a
// wrong number with a picture backing it up.

import assert from "node:assert/strict";
import test from "node:test";

import {
  agrees,
  angleAt,
  distance,
  equivalentResistance,
  moneyAgrees,
  resultant,
  verifyAngle,
  verifyBalance,
  verifyEquilibrium,
  verifyEquivalentResistance,
  verifyTotal,
} from "./visual-verification";

// ─────────────────────────────────────────────────────────────────── tolerances

test("🔴 money and geometry do not share a tolerance, because the subjects disagree about scale", () => {
  // Half a cent is out in accounting; a fixed epsilon that accepted it would accept a real error in
  // a large balance sheet, and the same epsilon on an angle would reject a correct figure.
  assert.equal(moneyAgrees(1000000, 1000000.004), true);
  assert.equal(moneyAgrees(1000000, 1000000.01), false);
  assert.equal(agrees(1000000, 1000000.000001), true);
});

test("a non-finite value never agrees with anything", () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.equal(agrees(bad, 1), false);
    assert.equal(moneyAgrees(bad, 1), false);
  }
});

// ─────────────────────────────────────────────────────────────────── totals and balances

test("a correct total verifies and a wrong one is refused by name", () => {
  assert.equal(verifyTotal([100, 250, 75], 425, true).ok, true);
  const wrong = verifyTotal([100, 250, 75], 420, true);
  assert.equal(wrong.ok, false);
  assert.equal(wrong.ok === false && wrong.reason, "total-mismatch");
  assert.match(wrong.ok === false ? wrong.detail : "", /sums to 425.*stated total is 420/);
});

test("🔴 an empty column reports nothing-to-check rather than passing", () => {
  // A total of zero over no values is arithmetically true and is almost certainly an empty table.
  // Reporting it as verified makes "we checked" indistinguishable from "there was nothing there".
  const result = verifyTotal([], 0, true);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "nothing-to-check");
});

test("🔴 balancing is a rule about shape, and knows nothing about accounting", () => {
  // Two columns whose sums must be equal. Nothing here knows what a debit is, and nothing may learn.
  assert.equal(verifyBalance([20000], [20000]).ok, true);
  const out = verifyBalance([20000], [19999]);
  assert.equal(out.ok === false && out.reason, "balance-mismatch");
  assert.match(out.ok === false ? out.detail : "", /20000.*19999/);
});

test("a balance over two empty sides is nothing-to-check", () => {
  assert.equal(verifyBalance([], []).ok === false && (verifyBalance([], []) as { reason: string }).reason, "nothing-to-check");
});

test("a non-finite cell is its own reason, not a mismatch", () => {
  assert.equal(verifyTotal([1, NaN], 1, true).ok === false && (verifyTotal([1, NaN], 1, true) as { reason: string }).reason, "not-a-number");
  assert.equal(verifyBalance([1, Infinity], [1]).ok === false && (verifyBalance([1, Infinity], [1]) as { reason: string }).reason, "not-a-number");
});

// ─────────────────────────────────────────────────────────────────── geometry

test("angles are measured from the coordinates", () => {
  // A right angle at the origin, and an equilateral corner.
  assert.ok(Math.abs((angleAt({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }) ?? 0) - 90) < 1e-9);
  const equilateral = angleAt({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: Math.sqrt(3) / 2 }) ?? 0;
  assert.ok(Math.abs(equilateral - 60) < 1e-9);
});

test("coincident points have no angle rather than an angle of zero", () => {
  // Returning 0 would be a number that looks like an answer.
  assert.equal(angleAt({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 2 }), null);
});

test("🔴 a stated angle that disagrees with its own coordinates is refused", () => {
  const vertex = { x: 0, y: 0 };
  const a = { x: 1, y: 0 };
  const b = { x: 0, y: 1 };
  assert.equal(verifyAngle(vertex, a, b, 90).ok, true);
  const wrong = verifyAngle(vertex, a, b, 30);
  assert.equal(wrong.ok, false);
  assert.equal(wrong.ok === false && wrong.reason, "geometry-mismatch");
  assert.match(wrong.ok === false ? wrong.detail : "", /90\.0°.*labelled 30°/);
});

test("a model placing points to two decimals is not punished for rounding", () => {
  // Refusing a degree of slop would refuse every correct figure a model can actually produce.
  const measured = verifyAngle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 0.87 }, 60);
  assert.equal(measured.ok, true);
});

test("distance is available for the same kind of claim", () => {
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

// ─────────────────────────────────────────────────────────────────── vectors

test("a resultant is the sum of the components", () => {
  const net = resultant([{ degrees: 0, magnitude: 3 }, { degrees: 90, magnitude: 4 }]);
  assert.ok(Math.abs(net.magnitude - 5) < 1e-9);
  assert.ok(Math.abs(net.degrees - 53.13) < 0.01);
});

test("🔴 forces claimed to balance are checked, so a wrong diagram cannot mark a right answer wrong", () => {
  // A block on an incline: gravity down, and the normal plus friction that must cancel it.
  const balanced = verifyEquilibrium([
    { degrees: 270, magnitude: 98 },
    { degrees: 60, magnitude: 84.87 },
    { degrees: 150, magnitude: 49 },
  ]);
  assert.equal(balanced.ok, true);

  const wrong = verifyEquilibrium([
    { degrees: 270, magnitude: 98 },
    { degrees: 90, magnitude: 50 },
  ]);
  assert.equal(wrong.ok, false);
  assert.equal(wrong.ok === false && wrong.reason, "equilibrium-mismatch");
  assert.match(wrong.ok === false ? wrong.detail : "", /48\.00 at -90°/);
});

test("🔴 the equilibrium tolerance scales with the largest force present", () => {
  // 0.5 N left over in a 100 N system is rounding. The same 0.5 N in a 1 N system is not.
  assert.equal(verifyEquilibrium([{ degrees: 0, magnitude: 100 }, { degrees: 180, magnitude: 99.5 }]).ok, true);
  assert.equal(verifyEquilibrium([{ degrees: 0, magnitude: 1 }, { degrees: 180, magnitude: 0.5 }]).ok, false);
});

test("equilibrium over one vector, or over nothing, is nothing-to-check", () => {
  assert.equal(verifyEquilibrium([{ degrees: 0, magnitude: 5 }]).ok === false, true);
  const zero = verifyEquilibrium([{ degrees: 0, magnitude: 0 }, { degrees: 90, magnitude: 0 }]);
  assert.equal(zero.ok === false && zero.reason, "nothing-to-check");
});

// ─────────────────────────────────────────────────────────────────────── equivalent resistance

test("series adds and parallel adds reciprocally, nesting", () => {
  assert.equal(equivalentResistance({ ohms: 47 }), 47);
  assert.equal(equivalentResistance({ arrangement: "series", parts: [{ ohms: 100 }, { ohms: 200 }] }), 300);
  assert.equal(equivalentResistance({ arrangement: "parallel", parts: [{ ohms: 200 }, { ohms: 200 }] }), 100);
  assert.equal(
    equivalentResistance({
      arrangement: "series",
      parts: [{ ohms: 100 }, { arrangement: "parallel", parts: [{ ohms: 200 }, { ohms: 200 }] }],
    }),
    200,
  );
});

test("🔴 a zero-ohm branch shorts a parallel group to zero instead of dividing by it", () => {
  assert.equal(equivalentResistance({ arrangement: "parallel", parts: [{ ohms: 0 }, { ohms: 100 }] }), 0);
});

test("an empty group and a non-finite value cannot be reduced", () => {
  assert.equal(equivalentResistance({ arrangement: "series", parts: [] }), null);
  assert.equal(equivalentResistance({ ohms: Number.NaN }), null);
  assert.equal(equivalentResistance({ ohms: -5 }), null);
});

test("🔴 a claimed equivalent is verified with hand-rounding tolerance, and a mismatch names both numbers", () => {
  const network = { arrangement: "parallel" as const, parts: [{ ohms: 80 }, { ohms: 200 }] };
  // 80·200/280 = 57.142857… — three significant figures must verify.
  assert.equal(verifyEquivalentResistance(network, 57.1).ok, true);
  const wrong = verifyEquivalentResistance(network, 70);
  assert.equal(wrong.ok, false);
  assert.equal(wrong.ok === false && wrong.reason, "value-mismatch");
  assert.match(wrong.ok === false ? wrong.detail : "", /57\.143/);
  assert.match(wrong.ok === false ? wrong.detail : "", /70/);
});

test("a network that cannot be reduced makes the claim nothing-to-check, never a silent pass", () => {
  const result = verifyEquivalentResistance({ arrangement: "series", parts: [] }, 10);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "nothing-to-check");
});
