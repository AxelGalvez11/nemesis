// The gate in front of the depiction library.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `an unclosed ring is refused, because the parser accepts it`.
// That case was measured against the real library: `C1CC` parses without error and then draws a
// molecule missing the ring the request was about. A structure that renders WRONG is worse than one
// that refuses, because nothing downstream can tell it happened.

import assert from "node:assert/strict";
import test from "node:test";

import { MAX_SMILES_LENGTH, statesStereochemistry, validateReaction, validateSmiles, validateStructure } from "./chem-notation";

const ASPIRIN = "CC(=O)OC1=CC=CC=C1C(=O)O";
const CAFFEINE = "CN1C=NC2=C1C(=O)N(C)C(=O)N2C";
const L_ALANINE = "C[C@@H](N)C(=O)O";

test("real structures pass, and what passes is the trimmed value", () => {
  for (const smiles of [ASPIRIN, CAFFEINE, L_ALANINE, "O", "[NH4+]", "C/C=C/C", "c1ccccc1", "[Na+].[Cl-]"]) {
    const result = validateSmiles(`  ${smiles}  `);
    assert.equal(result.ok, true, `${smiles} was refused`);
    assert.equal(result.ok && result.value, smiles);
  }
});

test("🔴 prose where notation belongs is refused on the alphabet, before any parser sees it", () => {
  // The most common failure by far: a model narrating instead of answering.
  const result = validateSmiles("the structure of aspirin, which is an ester");
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "structure-not-notation");
});

test("markup is refused the same way", () => {
  const result = validateSmiles("<svg onload=alert(1)>");
  assert.equal(result.ok === false && result.reason, "structure-not-notation");
});

test("🔴 an unclosed ring is refused, because the parser accepts it and draws the ring missing", () => {
  const result = validateSmiles("C1CC");
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "structure-unclosed-ring");
});

test("a closed ring is not mistaken for an unclosed one", () => {
  assert.equal(validateSmiles("C1CC1").ok, true);
  assert.equal(validateSmiles("C%12CCCCC%12").ok, true);
});

test("🔴 digits inside atom brackets are counts, not ring bonds", () => {
  // Getting this wrong would refuse every charged or isotopic atom in chemistry.
  assert.equal(validateSmiles("[NH4+]").ok, true);
  assert.equal(validateSmiles("[13CH4]").ok, true);
  assert.equal(validateSmiles("[Fe+2]").ok, true);
});

test("unbalanced brackets are refused by which kind went wrong", () => {
  assert.equal(validateSmiles("C(((C").ok === false && (validateSmiles("C(((C") as { detail: string }).detail.includes("branch"), true);
  assert.equal(validateSmiles("CC)").ok === false && (validateSmiles("CC)") as { reason: string }).reason, "structure-unbalanced");
  assert.equal(validateSmiles("[NH4").ok === false && (validateSmiles("[NH4") as { reason: string }).reason, "structure-unbalanced");
});

test("empty and non-string inputs are refused by name", () => {
  for (const bad of ["", "   ", null, undefined, 42, {}]) {
    const result = validateSmiles(bad);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "structure-empty");
  }
});

test("a runaway structure is bounded rather than laid out", () => {
  const result = validateSmiles("C".repeat(MAX_SMILES_LENGTH + 1));
  assert.equal(result.ok === false && result.reason, "structure-too-long");
  assert.equal(validateSmiles("C".repeat(MAX_SMILES_LENGTH)).ok, true);
});

test("🔴 a notation no depiction owns is refused rather than passed through hopefully", () => {
  const result = validateStructure("inchi", "InChI=1S/C9H8O4/c1-6(10)13-8-5-3-2-4-7(8)9(11)12/h2-5H,1H3,(H,11,12)");
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "structure-unsupported-notation");
  assert.match(result.ok === false ? result.detail : "", /resolve it to SMILES first/);
});

test("smiles is the notation that is owned", () => {
  assert.equal(validateStructure("smiles", ASPIRIN).ok, true);
});

test("🔴 stereochemistry is reported off the input, because that is where it is lost", () => {
  // A learner asked to find the chiral centre on a structure that never carried one has been asked
  // an unanswerable question, and no renderer could have known.
  assert.equal(statesStereochemistry(L_ALANINE), true);
  assert.equal(statesStereochemistry("C/C=C/C"), true);
  assert.equal(statesStereochemistry(ASPIRIN), false);
});

// ─────────────────────────────────────────────────────────────────── reactions

test("a real reaction passes, agents and all", () => {
  // Esterification, with the acid catalyst written as an agent between the arrows.
  assert.equal(validateReaction("CC(=O)O.CCO>[H+]>CC(=O)OCC.O").ok, true);
});

test("🔴 the empty middle is normal, not a mistake", () => {
  // `A>>B` is how most teaching schemes are written: the conditions are words above the arrow
  // rather than molecules in the string.
  assert.equal(validateReaction("CC(=O)O.CCO>>CC(=O)OCC.O").ok, true);
});

test("🔴 one molecule where a reaction was asked for gets its own reason", () => {
  // A misunderstanding of the question rather than a typo in the chemistry, and the two want
  // different corrections.
  const result = validateReaction("CC(=O)OCC");
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "structure-not-a-reaction");
});

test("an arrow with nothing on one end is refused by which end is missing", () => {
  const noProducts = validateReaction("CCO>>");
  assert.equal(noProducts.ok === false && noProducts.reason, "structure-half-a-reaction");
  assert.match(noProducts.ok === false ? noProducts.detail : "", /no products/);
  const noReactants = validateReaction(">>CCO");
  assert.match(noReactants.ok === false ? noReactants.detail : "", /no reactants/);
});

test("🔴 a malformed side names WHICH side, because they send a model to different places", () => {
  const result = validateReaction("CCO>>C1CC");
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "structure-unclosed-ring");
  assert.match(result.ok === false ? result.detail : "", /^products:/);
});

test("a reaction is refused under the molecule notation, and vice versa", () => {
  // The notations are named rather than sniffed, so a capability gap stays countable.
  assert.equal(validateStructure("smiles", "CCO>>CC=O").ok, false);
  assert.equal(validateStructure("reaction-smiles", "CCO").ok, false);
  assert.equal(validateStructure("reaction-smiles", "CCO>>CC=O").ok, true);
});

test("a runaway scheme is bounded", () => {
  const result = validateReaction(`${"C".repeat(300)}>>${"C".repeat(301)}`);
  assert.equal(result.ok === false && result.reason, "structure-too-long");
});
