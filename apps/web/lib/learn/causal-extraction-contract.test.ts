import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CAUSAL_EXTRACTION_PROMPT,
  causalKnowledgeFrom,
  validateCausalEdges,
  type RawCausalEdge,
} from "./causal-extraction-contract";
import { knowledgeIdentityKey } from "./knowledge-identity";
import { objectivesForKnowledge } from "./learning-objective";

// The validator is the last line before a model's opinion becomes stored knowledge, so every check
// in it is tested by handing it exactly the failure it exists to stop.

const PASSAGE = "The incorporation of a stop codon will lead to pre-mature termination of the amino acid change.";

const GOOD: RawCausalEdge = {
  cause: "incorporation of a stop codon",
  effect: "pre-mature termination",
  negated: false,
  qualifier: "will",
  quote: "The incorporation of a stop codon will lead to pre-mature termination",
  relation: "causes",
  verb: "will lead to",
};

const validate = (raw: RawCausalEdge[], passage = PASSAGE) => validateCausalEdges({ passage, raw });

test("a grounded edge is kept, with source truth intact", () => {
  const { rejected, relations } = validate([GOOD]);
  assert.deepEqual(rejected, []);
  assert.equal(relations.length, 1);
  assert.equal(relations[0]!.cause.text, "incorporation of a stop codon");
  assert.equal(relations[0]!.relation, "causes");
  assert.equal(relations[0]!.qualifier, "will");
  assert.equal(relations[0]!.sourceVerb, "will lead to");
  assert.equal(relations[0]!.assertion, GOOD.quote);
});

// ── fabrication ─────────────────────────────────────────────────────────────

test("🔴 an edge whose quote is not in the passage is REJECTED, not repaired", () => {
  // The strongest fabrication signal there is. If the sentence the model says asserts this is not in
  // the document, the model wrote it — and everything downstream would treat our words as theirs.
  const { rejected, relations } = validate([
    { ...GOOD, quote: "A stop codon terminates translation prematurely." },
  ]);
  assert.equal(relations.length, 0);
  assert.equal(rejected[0]?.reason, "quote-not-in-source");
});

test("🔴 an endpoint that is not inside its own quote is rejected", () => {
  const { rejected, relations } = validate([{ ...GOOD, cause: "ribosomal subunit assembly" }]);
  assert.equal(relations.length, 0);
  assert.equal(rejected[0]?.reason, "endpoint-not-in-quote");
});

test("🔴 a pronoun endpoint is rejected — it points at nothing resolvable", () => {
  const passage = "This significantly reduces the error rate.";
  const { rejected, relations } = validate(
    [{ cause: "This", effect: "the error rate", quote: passage, relation: "decreases" }],
    passage,
  );
  assert.equal(relations.length, 0);
  assert.equal(rejected[0]?.reason, "pronoun-endpoint");
});

test("an edge pointing at itself is rejected", () => {
  const { rejected } = validate([{ ...GOOD, effect: "incorporation of a stop codon" }]);
  assert.equal(rejected[0]?.reason, "degenerate");
});

test("a relation outside the six is rejected rather than coerced", () => {
  const { rejected } = validate([{ ...GOOD, relation: "correlates_with" }]);
  assert.equal(rejected[0]?.reason, "unknown-relation");
});

test("a missing field is rejected", () => {
  const { rejected } = validate([{ cause: "x", relation: "causes" }]);
  assert.equal(rejected[0]?.reason, "missing-field");
});

// ── negation defaults ───────────────────────────────────────────────────────

test("🔴 anything other than true reads as NOT denied", () => {
  // The opposite default would silently invert a claim a model merely forgot to annotate — turning
  // an assertion into its denial is the worst single failure available here.
  for (const value of [undefined, null, "false", "no", 0]) {
    const { relations } = validate([{ ...GOOD, negated: value }]);
    assert.equal(relations[0]?.negated, false, `negated: ${String(value)} must not deny the claim`);
  }
  assert.equal(validate([{ ...GOOD, negated: true }]).relations[0]?.negated, true);
});

test("a denied edge and an asserted one are different knowledge", () => {
  const asserted = validate([GOOD]).relations[0]!;
  const denied = validate([{ ...GOOD, negated: true }]).relations[0]!;
  const object = (relation: typeof asserted) =>
    causalKnowledgeFrom({ anchors: [], index: 0, model: "m", relation, unitId: "b1" });
  assert.notEqual(knowledgeIdentityKey(object(asserted)), knowledgeIdentityKey(object(denied)));
});

// ── the object it becomes ───────────────────────────────────────────────────

test("a validated edge becomes a knowledge object carrying its whole provenance", () => {
  const relation = validate([GOOD]).relations[0]!;
  const object = causalKnowledgeFrom({
    anchors: [{ sourceId: "lib-1", unitId: "b550" }],
    index: 0,
    model: "claude-sonnet-5",
    relation,
    unitId: "b550",
  });

  assert.equal(object.type, "causal");
  assert.equal(object.derivation, "model-prose");
  assert.deepEqual(object.provenance, {
    extractor: "causal/1",
    lane: "model-prose",
    model: "claude-sonnet-5",
    schemaVersion: "causal-edges/1",
  });
  assert.equal(object.sourceAnchors?.length, 1);
});

test("🔴 a causal object from the model lane still mints no objectives", () => {
  const relation = validate([GOOD]).relations[0]!;
  const object = causalKnowledgeFrom({ anchors: [], index: 0, model: "m", relation, unitId: "b1" });
  assert.deepEqual(objectivesForKnowledge(object), []);
});

test("a denied edge says so in its statement, so a human reading a log is not misled", () => {
  const relation = validate([{ ...GOOD, negated: true }]).relations[0]!;
  const object = causalKnowledgeFrom({ anchors: [], index: 0, model: "m", relation, unitId: "b1" });
  assert.match(object.statement, /does not causes?/);
});

// ── the prompt stays domain-agnostic ────────────────────────────────────────

test("🔴 the prompt teaches no single academic field", () => {
  // The development corpus is one pharmacogenomics lecture. A prompt carrying molecular examples
  // would learn that shape and fail on a statute or a control loop, and the benchmark could not tell
  // us — 30 of its 33 positives come from that same lecture.
  const domainWords = [
    "allele", "codon", "enzyme", "gene", "nucleotide", "protein", "metaboliz",
    "CYP", "drug", "patient", "dose", "receptor",
  ];
  for (const word of domainWords) {
    assert.equal(
      CAUSAL_EXTRACTION_PROMPT.toLowerCase().includes(word.toLowerCase()),
      false,
      `the prompt mentions "${word}" — it is teaching one field`,
    );
  }
});

test("🔴 the prompt tells the model that abstaining is correct", () => {
  const prompt = CAUSAL_EXTRACTION_PROMPT.toLowerCase();
  assert.ok(prompt.includes("abstain"));
  assert.ok(prompt.includes("returning nothing is a correct"), "abstention must be rewarded, not tolerated");
  // Every rejection class the real corpus actually produced has to be named.
  for (const rule of ["question", "heading", "hypothetical", "correlate", "after another", "pronoun", "course"]) {
    assert.ok(prompt.includes(rule), `the prompt does not cover: ${rule}`);
  }
});

test("🔴 the prompt distinguishes course policy from subject matter", () => {
  // Refusing "filing after the deadline results in dismissal" would make Nemesis unable to teach
  // whole disciplines; accepting "miss two sessions and you are withdrawn" teaches the syllabus.
  assert.ok(CAUSAL_EXTRACTION_PROMPT.includes("SUBJECT BEING STUDIED"));
});
