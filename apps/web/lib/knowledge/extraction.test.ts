// The rules that decide what becomes a node, and the one that decides what may be evidence at all.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  accept,
  conceptKeyOf,
  earnsANode,
  extractionPrompt,
  MINT_BUDGET,
  MIN_CONFIDENCE,
  type ConceptUpdate,
  type MintProposal,
} from "./extraction";

const passes: MintProposal = {
  name: "Beta-2 Agonists",
  parentKey: "asthma-pharmacology",
  assessableAlone: true,
  separableFromParent: true,
  recurring: true,
  corpusGrain: true,
};

const update = (over: Partial<ConceptUpdate> = {}): ConceptUpdate => ({
  conceptKey: null,
  evidence: "correct_explanation",
  confidence: 0.9,
  quote: "LABAs bronchodilate but do not treat the inflammation.",
  mint: passes,
  ...over,
});

const SOURCE = readFileSync(join(import.meta.dirname, "extraction.ts"), "utf8");
const TURN_SHAPE = SOURCE.slice(
  SOURCE.indexOf("export interface LearnerTurn"),
  SOURCE.indexOf("/** A concept already known"),
).toLowerCase();

// 🔴 THE STRUCTURAL GUARANTEE, ASSERTED RATHER THAN TRUSTED. The owner's rule (2026-09-04) is that
// a dropped document must never move the learner model. The defence is that `LearnerTurn` has
// nowhere to put document text — so this reads the source and fails if such a field is ever added.
// A comment can be ignored by the next person in a hurry; a red test cannot.
test("LearnerTurn has no field a document could arrive in", () => {
  for (const forbidden of ["document", "attachment", "file", "excerpt", "passage", "sources"]) {
    assert.equal(TURN_SHAPE.includes(`${forbidden}:`), false, `LearnerTurn gained a "${forbidden}" field`);
  }
});

test("LearnerTurn has no field a tutor reply could arrive in", () => {
  // `inReplyTo` is the question the learner was answering — context for judging what they said,
  // never the tutor's own explanation.
  for (const forbidden of ["reply:", "assistant:", "answer:", "response:", "completion:"]) {
    assert.equal(TURN_SHAPE.includes(forbidden), false, `LearnerTurn gained a "${forbidden}" field`);
  }
});

test("the prompt says the same thing in words, so the two cannot drift apart", () => {
  const prompt = extractionPrompt([]).toLowerCase();
  assert.ok(prompt.includes("only what the learner"));
  assert.ok(prompt.includes("documents they uploaded"));
});

test("earning a node needs all four tests, not three", () => {
  assert.equal(earnsANode(passes), true);
  for (const key of ["assessableAlone", "separableFromParent", "recurring", "corpusGrain"] as const) {
    assert.equal(earnsANode({ ...passes, [key]: false }), false, `${key} was not required`);
  }
});

test("a detail is rejected rather than minted", () => {
  const detail = update({ mint: { ...passes, name: "Albuterol onset", separableFromParent: false } });
  const out = accept([detail], new Set());
  assert.equal(out.mint.length, 0);
  assert.ok(out.rejected[0]?.why.includes("detail"));
});

test("an existing concept is attached to, and mints nothing", () => {
  const out = accept([update({ conceptKey: "beta-2-agonists" })], new Set(["beta-2-agonists"]));
  assert.equal(out.attach.length, 1);
  assert.equal(out.mint.length, 0);
});

test("evidence landing on existing concepts is not capped", () => {
  const many = Array.from({ length: 40 }, () => update({ conceptKey: "beta-2-agonists" }));
  assert.equal(accept(many, new Set(["beta-2-agonists"])).attach.length, 40);
});

// 🔴 NOT "trimmed to three". The first three of a runaway batch are no better than the last nine:
// the size of the batch is itself the signal that the model stopped noticing what a person
// demonstrated and started summarising a lecture.
test("a batch over the mint budget is rejected whole, not trimmed", () => {
  const proposals = Array.from({ length: MINT_BUDGET + 1 }, (_, i) =>
    update({ mint: { ...passes, name: `Concept ${i}` } }),
  );
  const out = accept(proposals, new Set());
  assert.equal(out.mint.length, 0);
  assert.equal(out.rejected.length, MINT_BUDGET + 1);
});

test("a batch at exactly the budget is allowed", () => {
  const proposals = Array.from({ length: MINT_BUDGET }, (_, i) =>
    update({ mint: { ...passes, name: `Concept ${i}` } }),
  );
  assert.equal(accept(proposals, new Set()).mint.length, MINT_BUDGET);
});

test("a guess is dropped before it can reach the graph", () => {
  const out = accept([update({ confidence: MIN_CONFIDENCE - 0.01 })], new Set());
  assert.equal(out.mint.length, 0);
  assert.equal(out.attach.length, 0);
});

test("concept keys collapse the same idea and keep different ones apart", () => {
  const keys = new Set(["Beta-2 Agonists", "beta 2 agonists", "Beta2  Agonists!"].map(conceptKeyOf));
  assert.equal(keys.size, 1);
  assert.notEqual(conceptKeyOf("Beta-2 Agonists"), conceptKeyOf("Beta blockers"));
});
