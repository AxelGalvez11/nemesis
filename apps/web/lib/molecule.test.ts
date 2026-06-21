// npx tsx lib/molecule.test.ts
import assert from "node:assert/strict";
import { pubchemMoleculeUrl } from "./molecule.ts";

// Small molecules → a PubChem image URL containing the encoded name.
for (const d of ["lisinopril", "metformin", "atorvastatin", "ibuprofen", "warfarin", "amoxicillin"]) {
  assert.ok(pubchemMoleculeUrl(d)?.includes(encodeURIComponent(d)), `${d} should get a structure image`);
}

// Biologics / peptides → null (PubChem's 2D depiction is a useless tangle; common heavily-queried drugs).
for (const d of ["semaglutide", "tirzepatide", "liraglutide", "dulaglutide", "adalimumab", "pembrolizumab", "etanercept", "insulin glargine", "insulin"]) {
  assert.equal(pubchemMoleculeUrl(d), null, `${d} should be suppressed as a biologic`);
}

// Edge cases.
assert.equal(pubchemMoleculeUrl("   "), null, "blank → null");
assert.ok(pubchemMoleculeUrl("Ozempic")?.includes("Ozempic"), "a brand name we can't classify still gets a URL (404-hides if no structure)");

console.log("molecule.test.ts OK");
