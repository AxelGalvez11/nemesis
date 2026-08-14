import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  CAUSAL_EXTRACTION_PROMPT,
  CAUSAL_EXTRACTION_TEMPERATURE,
  causalKnowledgeFrom,
  validateCausalEdges,
  type RawCausalEdge,
} from "./causal-extraction-contract";
import { causalNodeKey, knowledgeIdentityKey } from "./knowledge-identity";
import { objectivesForKnowledge } from "./learning-objective";
import { runtimeCanStage } from "./runtime-support";

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

// ── negation is a valid OUTPUT, and only ever caught one way ────────────────

test("🔴 a positive edge from a quote that denies it is REJECTED", () => {
  // The worst output this lane can produce: the stored claim would be the opposite of the document.
  // Not repaired into a negation — a model that misread the polarity may have misread more.
  const passage = "Price controls do not increase supply.";
  const { rejected, relations } = validate(
    [{ cause: "Price controls", effect: "supply", negated: false, quote: passage, relation: "increases" }],
    passage,
  );
  assert.equal(relations.length, 0);
  assert.equal(rejected[0]?.reason, "negation-dropped");
});

test("the same edge, correctly marked negated, is kept", () => {
  const passage = "Price controls do not increase supply.";
  const { relations } = validate(
    [{ cause: "Price controls", effect: "supply", negated: true, quote: passage, relation: "increases" }],
    passage,
  );
  assert.equal(relations.length, 1);
  assert.equal(relations[0]?.negated, true);
});

test("🔴 nothing infers a negation from a quote that merely lacks one", () => {
  // The check fires one way only. Absence of a denial must never be read as a denial — that would
  // invent the opposite claim from silence, which is the same defect in reverse.
  const { relations } = validate([GOOD]);
  assert.equal(relations[0]?.negated, false);
});

// ── bounding conditions are modality ────────────────────────────────────────

test("🔴 a conditional scope is preserved and labelled, not treated as decoration", () => {
  // Dropping "until the enzyme saturates" does not lose a detail — it turns a bounded observation
  // into a general law the source never stated, and a learner taught that gets the real case wrong.
  const passage = "Increased substrate concentration raises reaction velocity until the enzyme saturates.";
  const { relations } = validate(
    [{
      cause: "Increased substrate concentration",
      effect: "reaction velocity",
      qualifier: "until the enzyme saturates",
      qualifierKind: "conditional",
      quote: passage,
      relation: "increases",
    }],
    passage,
  );
  assert.equal(relations[0]?.qualifier, "until the enzyme saturates");
  assert.equal(relations[0]?.qualifierKind, "conditional");
});

test("an epistemic hedge is labelled as one", () => {
  const { relations } = validate([{ ...GOOD, qualifier: "may", qualifierKind: "epistemic" }]);
  assert.equal(relations[0]?.qualifierKind, "epistemic");
});

test("an unrecognised qualifierKind is dropped rather than guessed", () => {
  const { relations } = validate([{ ...GOOD, qualifier: "will", qualifierKind: "vibes" }]);
  assert.equal(relations[0]?.qualifier, "will");
  assert.equal(relations[0]?.qualifierKind, undefined);
});

test("🔴 a conditional scope changes identity — the bounded claim is different knowledge", () => {
  const plain = validate([{ ...GOOD, qualifier: undefined }]).relations[0]!;
  const bounded = validate([{ ...GOOD, qualifier: "until saturation", qualifierKind: "conditional" }]).relations[0]!;
  const object = (relation: typeof plain) =>
    causalKnowledgeFrom({ anchors: [], index: 0, model: "m", relation, unitId: "b1" });
  assert.notEqual(knowledgeIdentityKey(object(plain)), knowledgeIdentityKey(object(bounded)));
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

test("🔴 a causal object from the model lane mints a prediction the runtime can stage", () => {
  // 🔴 THE END OF THE LANE THAT USED TO STOP HERE. This asserted `[]` — the model could construct a
  // grounded causal edge and the learner would never meet it, because the objective layer refused
  // every type but `association`. Extraction reaching further than the runtime is the silent kind of
  // shortfall: nothing errors, the object is stored, and the Canvas simply has less to do.
  const relation = validate([GOOD]).relations[0]!;
  const object = causalKnowledgeFrom({ anchors: [], index: 0, model: "m", relation, unitId: "b1" });
  const [objective] = objectivesForKnowledge(object);
  assert.equal(objective?.capability, "predict");
  assert.equal(objective?.cue, relation.cause.text, "the question opens from the cause the model read");
  assert.ok(runtimeCanStage(object.type, objective!.capability), "minted but unstageable is the same dead end");
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
  // 🔴 WHOLE WORDS, LISTED EXPLICITLY. A stem match flagged "generally" for containing "gene" and
  // failed a prompt that was fine — and a guard that cries wolf gets deleted rather than heeded.
  const domainWords = [
    "allele", "alleles", "codon", "codons", "enzyme", "enzymes", "gene", "genes", "genetic",
    "nucleotide", "nucleotides", "protein", "proteins", "metabolizer", "metabolizers", "metabolism",
    "CYP", "drug", "drugs", "patient", "patients", "dose", "doses", "receptor", "receptors",
  ];
  // 🔴 WORD BOUNDARIES, NOT SUBSTRINGS. The first version matched "gene" inside "generally" and
  // failed on a prompt that was fine — a guard that cries wolf gets deleted rather than heeded.
  for (const word of domainWords) {
    assert.equal(
      new RegExp(`\\b${word}\\b`, "i").test(CAUSAL_EXTRACTION_PROMPT),
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

test("🔴 the prompt says a denied relationship is still a relationship", () => {
  // Measured: every negated claim in the benchmark was abstained on. Safe, but "X does not cause Y"
  // is real knowledge and was invisible to Nemesis.
  assert.ok(CAUSAL_EXTRACTION_PROMPT.includes("A DENIED relationship is a relationship"));
  assert.ok(CAUSAL_EXTRACTION_PROMPT.includes("never infer a"), "and it must not be inferred");
});

test("🔴 the prompt names bounding conditions as modality, with examples from several fields", () => {
  // The model preserved "may" and dropped every condition that says WHEN a claim holds.
  assert.ok(CAUSAL_EXTRACTION_PROMPT.includes("conditional"));
  for (const example of ["under cyclic load", "when voltage is held constant", "at constant volume"]) {
    assert.ok(CAUSAL_EXTRACTION_PROMPT.includes(example), `missing conditional example: ${example}`);
  }
});

test("🔴 the prompt separates a speculative example from a general conditional rule", () => {
  assert.ok(CAUSAL_EXTRACTION_PROMPT.includes("HYPOTHETICALS"));
  assert.ok(CAUSAL_EXTRACTION_PROMPT.includes("how things work"));
});

test("🔴 the ownership rule judges the relationship, not the tone", () => {
  assert.ok(CAUSAL_EXTRACTION_PROMPT.includes("WHOSE KNOWLEDGE IS IT"));
  assert.ok(CAUSAL_EXTRACTION_PROMPT.includes("not whether the wording sounds"));
});

test("the prompt refuses a passage that states both directions", () => {
  assert.ok(CAUSAL_EXTRACTION_PROMPT.includes("BOTH directions"));
});

test("🔴 the prompt distinguishes course policy from subject matter", () => {
  // Refusing "filing after the deadline results in dismissal" would make Nemesis unable to teach
  // whole disciplines; accepting "miss two sessions and you are withdrawn" teaches the syllabus.
  assert.ok(CAUSAL_EXTRACTION_PROMPT.includes("limitation deadline"), "the law case must be shown");
  assert.ok(CAUSAL_EXTRACTION_PROMPT.includes("withdrawal from the module"), "and the course case");
});

test("🔴 the lane declares a deterministic temperature, and it is zero", () => {
  // Measured: at the valve's default sampling the identical prompt flipped 12.8% of the development
  // fold between two runs — one reporting 0 fabricated edges and the next 3. A zero-tolerance
  // criterion cannot be checked against a sampled result.
  assert.equal(CAUSAL_EXTRACTION_TEMPERATURE, 0);
});

test("🔴 every caller of this lane sends temperature 0, not just the benchmark", () => {
  // Knowledge extraction is STATE CREATION. The same source imported twice must not produce
  // different durable knowledge because sampling differed — a learner would find facts appearing
  // and disappearing between imports of one file, with nothing to explain it.
  //
  // Asserted across every caller rather than inside one, because the eval harness getting this
  // right while a production path forgot is exactly how the 12.8% flip rate would come back
  // invisibly: the benchmark would stay reproducible while production quietly was not.
  const callers = ["../../scripts/eval/causal-eval.mts"];
  for (const caller of callers) {
    const source = readFileSync(new URL(caller, import.meta.url), "utf8");
    assert.ok(
      /temperature:\s*CAUSAL_EXTRACTION_TEMPERATURE/.test(source),
      `${caller} must send CAUSAL_EXTRACTION_TEMPERATURE, never a literal or nothing`,
    );
  }
});

// ── negation and modality are independent axes ──────────────────────────────

test("🔴 a hedged DENIAL keeps both — neither field may erase the other", () => {
  // c032: "may not lead to a different insertion of amino acid". Recording only the negation says
  // the author was certain when they hedged; recording only the hedge says the opposite of what
  // they wrote. Two independent facts about one claim.
  const passage = "A change in the last nucleotide may not lead to a different insertion of amino acid.";
  const { relations } = validate(
    [{
      cause: "A change in the last nucleotide",
      effect: "a different insertion of amino acid",
      negated: true,
      qualifier: "may",
      qualifierKind: "epistemic",
      quote: passage,
      relation: "causes",
    }],
    passage,
  );
  assert.equal(relations[0]?.negated, true);
  assert.equal(relations[0]?.qualifier, "may");
  assert.equal(relations[0]?.qualifierKind, "epistemic");
});

test("🔴 a hedged denial is different knowledge from a flat one", () => {
  const base: RawCausalEdge = { ...GOOD, negated: true, qualifier: undefined };
  const flat = validate([base]).relations[0]!;
  const hedged = validate([{ ...base, qualifier: "may", qualifierKind: "epistemic" }]).relations[0]!;
  const object = (relation: typeof flat) =>
    causalKnowledgeFrom({ anchors: [], index: 0, model: "m", relation, unitId: "b1" });
  assert.notEqual(knowledgeIdentityKey(object(flat)), knowledgeIdentityKey(object(hedged)));
});

// ── partial causation is a relation, not a hedge ────────────────────────────

test("🔴 contributes_to is its own relation, not causes with a qualifier", () => {
  // "The harvest collapse contributed to the unrest" is a CONFIDENT claim about a PARTIAL role.
  // Storing it as `causes` asserts that one factor explains the whole outcome; storing it as
  // `causes` + a hedge asserts uncertainty the author never expressed.
  const passage = "The collapse of the harvest in 1788 contributed to the unrest of the following year.";
  const { relations } = validate(
    [{
      cause: "The collapse of the harvest in 1788",
      effect: "the unrest",
      quote: passage,
      relation: "contributes_to",
      verb: "contributed to",
    }],
    passage,
  );
  assert.equal(relations[0]?.relation, "contributes_to");
  assert.equal(relations[0]?.sourceVerb, "contributed to");
  assert.equal(relations[0]?.qualifier, undefined, "partial causation is not a hedge");
});

test("🔴 three contributing factors share an effect node without any claiming sufficiency", () => {
  // What makes a multifactorial subject teachable: "what factors contributed?" is answerable from
  // three contributes_to edges into one node. Three `causes` edges would each be a lie.
  const passage = "Taxation contributed to the unrest.";
  const { relations } = validate(
    [{ cause: "Taxation", effect: "the unrest", quote: passage, relation: "contributes_to" }],
    passage,
  );
  assert.equal(relations[0]?.effect.key, causalNodeKey("the unrest"));
  assert.notEqual(
    knowledgeIdentityKey(causalKnowledgeFrom({ anchors: [], index: 0, model: "m", relation: relations[0]!, unitId: "b1" })),
    knowledgeIdentityKey(causalKnowledgeFrom({
      anchors: [], index: 0, model: "m", unitId: "b1",
      relation: { ...relations[0]!, relation: "causes" },
    })),
    "contributes_to and causes must be different knowledge",
  );
});
