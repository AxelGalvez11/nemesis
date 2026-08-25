// The dots an arrow comes from.

import assert from "node:assert/strict";
import { test } from "node:test";

import { lonePairCount, lonePairDirections, lonePairDots } from "./lone-pairs";

const atom = (element: string, bondOrder: number, hydrogens = 0, charge = 0) =>
  lonePairCount({ bondOrder, charge, element, hydrogens });

test("🔴🔴🔴 every atom in the owner's own mechanism picture", () => {
  // The reference he sent, 2026-08-25: an amine attacking a nitropyridine, through an alkoxide.
  assert.equal(atom("N", 3), 1, "a neutral amine carries one pair");
  assert.equal(atom("N", 2, 1, -1), 1, "the amide anion");
  assert.equal(atom("O", 2), 2, "the ether oxygen the arrow leaves");
  assert.equal(atom("O", 1, 0, -1), 3, "the alkoxide");
  assert.equal(atom("O", 1, 1), 2, "the alcohol");
});

test("🔴🔴 a charge moves the count by exactly one electron, in the right direction", () => {
  assert.equal(atom("N", 4, 0, 1), 0, "ammonium should have none left");
  assert.equal(atom("O", 3, 0, 1), 1, "an oxonium keeps one");
  assert.equal(atom("C", 3, 0, -1), 1, "a carbanion carries one");
  assert.equal(atom("Cl", 0, 0, -1), 4, "chloride really does carry four");
});

test("🔴🔴 an ordinary skeletal carbon draws nothing, which is most of every picture", () => {
  // 🔴 THE FAILURE THIS GUARDS. Forget the hydrogens and a methyl carbon computes (4 − 1) / 2 = 1,
  // and the drawing sprouts a lone pair on every corner of every chain.
  assert.equal(atom("C", 1, 3), 0, "a methyl carbon");
  assert.equal(atom("C", 2, 2), 0, "a chain carbon");
  assert.equal(atom("C", 4), 0, "a fully substituted carbon");
  assert.equal(atom("C", 2, 1), 0, "half of an alkene");
});

test("🔴🔴 a double bond is worth two, or a carbonyl grows a third pair", () => {
  assert.equal(atom("O", 2), 2, "the carbonyl oxygen, counted by bond ORDER");
  assert.equal(atom("N", 3), 1, "an imine nitrogen: one double and one single");
});

test("🔴🔴🔴 aromatic nitrogen, both kinds, which is where rounding earns its keep", () => {
  // Two aromatic bonds are 1.5 each. Pyridine: 5 − 3 = 2, one pair, and it is the pair that does
  // the chemistry. Pyrrole also carries an H, leaving half a pair; rounding down draws none, and a
  // textbook does not draw that one either because it is in the ring's π system.
  assert.equal(atom("N", 3), 1, "pyridine-type nitrogen");
  assert.equal(atom("N", 3, 1), 0, "pyrrole-type nitrogen");
});

test("🔴 an element the arithmetic does not cover draws nothing rather than something wrong", () => {
  // A transition metal's electron count is not this sum, and a confident wrong number would sit on
  // a picture the learner is marked against.
  for (const metal of ["Fe", "Cu", "Pd", "Zn"]) assert.equal(atom(metal, 2), 0, metal);
});

test("🔴🔴🔴 the dots go in the GAPS between the bonds, never on top of one", () => {
  // 🔴 THE FAILURE THIS RULE IS SHAPED TO AVOID. Fixed positions put a pair over a bond end on most
  // atoms, and on a mechanism the reader then cannot tell a lone pair from the end of a bond.
  const bonds = [0, Math.PI]; // a straight-through atom, bonds east and west
  const directions = lonePairDirections(bonds, 2);
  assert.equal(directions.length, 2);
  for (const angle of directions) {
    for (const bond of bonds) {
      const apart = Math.abs(Math.atan2(Math.sin(angle - bond), Math.cos(angle - bond)));
      assert.ok(apart > 0.6, `a pair landed ${apart.toFixed(2)} rad from a bond`);
    }
  }
});

test("🔴🔴 one bond and three pairs spread around the far side, rather than stacking", () => {
  const directions = lonePairDirections([0], 3);
  assert.equal(directions.length, 3);
  const sorted = [...directions].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i += 1) {
    assert.ok(sorted[i]! - sorted[i - 1]! > 0.6, "two pairs landed on top of each other");
  }
});

test("🔴 a bare ion with no bonds still spaces its pairs evenly", () => {
  const directions = lonePairDirections([], 4);
  assert.equal(directions.length, 4);
  const sorted = [...directions].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i += 1) {
    assert.ok(Math.abs(sorted[i]! - sorted[i - 1]! - Math.PI / 2) < 0.01, "the pairs are not evenly spread");
  }
});

test("🔴🔴🔴 the pair's own point comes back with its dots, because the arrow starts THERE", () => {
  // A mechanism arrow does not begin at an atom's centre. It begins at the pair that is moving, so
  // the geometry that places the dots has to be the geometry the arrow starts from.
  const [pair] = lonePairDots({ x: 10, y: 10 }, [Math.PI], 1, 6, 3);
  assert.ok(pair);
  if (!pair) return;
  assert.equal(pair.dots.length, 2, "a pair is two dots");
  const span = Math.hypot(pair.dots[0]!.x - pair.dots[1]!.x, pair.dots[0]!.y - pair.dots[1]!.y);
  assert.ok(Math.abs(span - 3) < 0.01, `the dots are ${span.toFixed(2)} apart, not the gap asked for`);
  const reach = Math.hypot(pair.at.x - 10, pair.at.y - 10);
  assert.ok(Math.abs(reach - 6) < 0.01, "the pair does not sit at the radius asked for");
  // Opposite the only bond, which points west.
  assert.ok(pair.at.x > 10, "the pair landed on the bond's side of the atom");
  // And the two dots straddle the direction rather than lying along it.
  const mid = { x: (pair.dots[0]!.x + pair.dots[1]!.x) / 2, y: (pair.dots[0]!.y + pair.dots[1]!.y) / 2 };
  assert.ok(Math.abs(mid.x - pair.at.x) < 1e-9 && Math.abs(mid.y - pair.at.y) < 1e-9);
});

test("🔴 nothing to draw returns nothing, never a NaN point", () => {
  assert.deepEqual(lonePairDirections([0, 1, 2], 0), []);
  assert.deepEqual(lonePairDots({ x: 0, y: 0 }, [0], 0, 5, 2), []);
});

console.log("lone-pairs.test.ts OK");
