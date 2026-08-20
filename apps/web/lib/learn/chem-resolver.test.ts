// Resolving a name, and the four ways it can fail without lying.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `a failing resolver never falls back to the model`. That is
// the whole reason the module exists: a remembered SMILES is indistinguishable from a correct one
// in the output, so the moment "we could not look it up" quietly becomes "here is one anyway", the
// resolver has bought nothing.

import assert from "node:assert/strict";
import test from "node:test";

import { pubchemUrl, resolveStructure, type ChemResolveDeps } from "./chem-resolver";

const ASPIRIN = "CC(=O)OC1=CC=CC=C1C(=O)O";

function answering(body: unknown, status = 200): ChemResolveDeps {
  return { fetch: async () => ({ json: async () => body, ok: status < 400, status }) };
}

function propertyTable(row: Record<string, unknown>) {
  return { PropertyTable: { Properties: [row] } };
}

test("a name becomes a canonical structure, stamped with where it came from", async () => {
  const result = await resolveStructure("aspirin", answering(propertyTable({ CID: 2244, IsomericSMILES: ASPIRIN })));
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.structure.value, ASPIRIN);
  assert.equal(result.ok && result.structure.id, "2244");
  assert.equal(result.ok && result.structure.provider, "pubchem");
  assert.equal(result.ok && result.structure.name, "aspirin");
});

test("🔴 the isomeric form wins, because stereochemistry is what a chirality question needs", () => {
  // Preferring the flat form would make "identify the chiral centre" unanswerable on a structure
  // that had one.
  const url = pubchemUrl("alanine");
  assert.ok(url.indexOf("IsomericSMILES") < url.indexOf("CanonicalSMILES"), "isomeric must be asked for first");
});

test("both spellings of the field are read, because the provider renamed it", async () => {
  const older = await resolveStructure("aspirin", answering(propertyTable({ CID: 2244, CanonicalSMILES: ASPIRIN })));
  const newer = await resolveStructure("aspirin", answering(propertyTable({ CID: 2244, SMILES: ASPIRIN })));
  assert.equal(older.ok, true);
  assert.equal(newer.ok, true);
});

test("🔴 a 404 is 'no such compound' and a 503 is 'the provider is down'", async () => {
  // Collapsing these would teach a learner that a molecule does not exist because a server was busy.
  const missing = await resolveStructure("notacompound", answering({}, 404));
  assert.equal(missing.ok === false && missing.reason, "not-found");

  const down = await resolveStructure("aspirin", answering({}, 503));
  assert.equal(down.ok === false && down.reason, "provider-unreachable");
});

test("a network failure is a named refusal rather than a thrown error", async () => {
  const result = await resolveStructure("aspirin", {
    fetch: async () => { throw new Error("getaddrinfo ENOTFOUND"); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "provider-unreachable");
});

test("🔴 a failing resolver returns nothing, never a structure from somewhere else", async () => {
  for (const deps of [answering({}, 404), answering({}, 500), answering(propertyTable({ CID: 1 }))]) {
    const result = await resolveStructure("aspirin", deps);
    assert.equal(result.ok, false, "a refusal must never carry a structure");
  }
});

test("🔴 the resolver's own answer is validated like any other input", async () => {
  // "It came from PubChem" is the same class of claim as "it came from a big open repository".
  const result = await resolveStructure("weird", answering(propertyTable({ CID: 9, SMILES: "<svg/>" })));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "no-usable-structure");
});

test("an empty name is refused before a request is made", async () => {
  let called = false;
  const result = await resolveStructure("   ", { fetch: async () => { called = true; return { json: async () => ({}), ok: true, status: 200 }; } });
  assert.equal(result.ok === false && result.reason, "empty-name");
  assert.equal(called, false);
});

test("the name is encoded into the URL rather than concatenated", () => {
  assert.match(pubchemUrl("acetylsalicylic acid"), /compound\/name\/acetylsalicylic%20acid\/property\//);
});
