import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { causalNodeKey, identityBasis, knowledgeIdentityKey } from "./knowledge-identity";
import type { CausalRelation, KnowledgeObject } from "./knowledge-types";
import { CAUSAL_BENCHMARK, eligibleForExtraction, stageOf } from "./__fixtures__/causal-benchmark";
import { knowledgeFromRow, knowledgePayload } from "./learner-store";
import { objectivesForKnowledge } from "./learning-objective";

// The persistence boundary, in both directions.
//
// 🔴 THIS FILE EXISTS BECAUSE THE PAYLOAD WAS WRITE-ONLY. `saveKnowledge` enumerated
// `{ anchors, pair }` by hand and nothing anywhere read a knowledge object back — so a causal
// relation would have been stored as an empty object, no test would have failed, and the loss would
// have been diagnosed weeks later in the extractor. Six structural fields have already died in this
// codebase exactly that way.
//
// Round trip means `object → payload → row → object`, compared field by field.

const RELATION: CausalRelation = {
  assertion: "The incorporation of a stop codon will lead to pre-mature termination of the amino acid change.",
  cause: { key: causalNodeKey("Incorporation of a stop codon"), text: "Incorporation of a stop codon" },
  effect: { key: causalNodeKey("premature termination"), text: "premature termination" },
  negated: false,
  qualifier: "will",
  relation: "causes",
  sourceVerb: "will lead to",
};

const CAUSAL: KnowledgeObject = {
  derivation: "model-prose",
  extractionVersion: "causal/1",
  id: "b550:c1",
  provenance: {
    extractor: "causal/1",
    lane: "model-prose",
    model: "claude-sonnet-5",
    schemaVersion: "causal-edges/1",
  },
  relation: RELATION,
  sourceAnchors: [
    {
      headingPath: ["Variant types"],
      page: 12,
      quote: { exact: "will lead to pre-mature termination", prefix: "stop codon " },
      sourceId: "lib-1",
      unitId: "b550",
    },
  ],
  statement: "Incorporation of a stop codon — causes — premature termination",
  type: "causal",
};

function roundTrip(object: KnowledgeObject): KnowledgeObject {
  // Exactly what `saveKnowledge` writes, through JSON as a jsonb column would.
  const payload = JSON.parse(JSON.stringify(knowledgePayload(object)));
  return knowledgeFromRow({
    extraction_version: object.extractionVersion ?? null,
    identity_key: knowledgeIdentityKey(object),
    payload,
    relation_kind: object.relationKind ?? null,
    statement: object.statement,
    type: object.type,
  });
}

// ── the causal payload survives ─────────────────────────────────────────────

test("🔴 a causal relation survives extract → save → load in every semantic field", () => {
  const back = roundTrip(CAUSAL);
  assert.equal(back.type, "causal");
  assert.deepEqual(back.relation, RELATION, "the whole relation must come back unchanged");
  assert.equal(back.relation?.cause.text, "Incorporation of a stop codon");
  assert.equal(back.relation?.effect.text, "premature termination");
  assert.equal(back.relation?.relation, "causes");
  assert.equal(back.relation?.negated, false);
  assert.equal(back.relation?.qualifier, "will");
});

test("🔴 direction survives persistence — cause and effect do not swap or merge", () => {
  const back = roundTrip(CAUSAL);
  assert.equal(back.relation?.cause.key, causalNodeKey("Incorporation of a stop codon"));
  assert.equal(back.relation?.effect.key, causalNodeKey("premature termination"));
  assert.notEqual(back.relation?.cause.key, back.relation?.effect.key);
});

test("🔴 negation survives — the stored claim is not the opposite of the source's", () => {
  const denied: KnowledgeObject = { ...CAUSAL, relation: { ...RELATION, negated: true } };
  assert.equal(roundTrip(denied).relation?.negated, true);
});

test("provenance survives: anchors come back with page, headings and quote intact", () => {
  const back = roundTrip(CAUSAL);
  assert.equal(back.sourceAnchors?.length, 1);
  assert.deepEqual(back.sourceAnchors?.[0], CAUSAL.sourceAnchors![0]);
});

test("🔴 extraction provenance survives — which system made this, under which rules", () => {
  // A model-extracted object must stay distinguishable from a grid-extracted one for ever. When the
  // prompt or the model changes, "which objects came from the old extractor?" has to be answerable
  // by query — otherwise the only safe migration is deleting the corpus.
  const back = roundTrip(CAUSAL);
  assert.equal(back.derivation, "model-prose");
  assert.equal(back.extractionVersion, "causal/1");
  assert.deepEqual(back.provenance, {
    extractor: "causal/1",
    lane: "model-prose",
    model: "claude-sonnet-5",
    schemaVersion: "causal-edges/1",
  });
});

test("🔴 source truth survives beside the normalised edge", () => {
  // The normalised edge is for identity and composition; the assertion is for grounding and audit.
  // Both, or "Nemesis believes A may cause B because this passage said X" is unanswerable.
  const back = roundTrip(CAUSAL);
  assert.equal(back.relation?.assertion, RELATION.assertion);
  assert.equal(back.relation?.sourceVerb, "will lead to");
});

test("🔴 extraction confidence never appears in the knowledge payload", () => {
  // Knowledge-generation uncertainty and learner cognition are different kinds of not-knowing.
  // A model's confidence that a passage asserts something must never sit where it could be read as
  // a fact about the person.
  const payload = JSON.stringify(knowledgePayload(CAUSAL));
  for (const banned of ["confidence", "score", "probability", "certainty"]) {
    assert.equal(payload.includes(banned), false, `knowledge payload carries ${banned}`);
  }
});

// ── association persistence is unchanged ────────────────────────────────────

const ASSOCIATION: KnowledgeObject = {
  derivation: "table-row",
  extractionVersion: "association/2",
  id: "t1:r1",
  identityKey: "association:v2:8589ff53b101b420",
  pair: { id: "t1:r1", left: "losartan", leftRole: "generic", right: "Cozaar", rightRole: "brand" },
  relationKind: "brand|generic",
  sourceAnchors: [{ sourceId: "lib-1", unitId: "t1" }],
  statement: "losartan — Cozaar",
  type: "association",
};

test("🔴 the association payload keeps the shape production rows already have", () => {
  // Rows written before this change store their provenance under `anchors`. Renaming it would make
  // every existing object read back with no provenance at all — a silent loss of exactly the thing
  // anchors exist to prevent.
  const payload = knowledgePayload(ASSOCIATION);
  assert.ok("anchors" in payload, "existing rows are read by this key");
  assert.ok("pair" in payload);
  assert.deepEqual(payload.anchors, ASSOCIATION.sourceAnchors);
  assert.deepEqual(payload.pair, ASSOCIATION.pair);
});

test("an association still round-trips unchanged", () => {
  const back = roundTrip(ASSOCIATION);
  assert.deepEqual(back.pair, ASSOCIATION.pair);
  assert.equal(back.relationKind, "brand|generic");
  assert.deepEqual(back.sourceAnchors, ASSOCIATION.sourceAnchors);
});

test("a legacy row written under the old hand-enumerated payload still loads", () => {
  // The two objects in production were written as `{ anchors, pair }` and nothing else.
  const back = knowledgeFromRow({
    extraction_version: "association/2",
    identity_key: "association:v2:8589ff53b101b420",
    payload: { anchors: [{ sourceId: "lib-1", unitId: "t1" }], pair: ASSOCIATION.pair },
    relation_kind: "brand|generic",
    statement: "losartan — Cozaar",
    type: "association",
  });
  assert.deepEqual(back.pair, ASSOCIATION.pair);
  assert.equal(back.sourceAnchors?.length, 1);
});

// ── the boundary is generic ─────────────────────────────────────────────────

test("🔴 a knowledge type this file has never heard of still round-trips", () => {
  // The property that makes this the LAST time adding a type touches persistence. If someone adds
  // `procedure` with a `steps` payload and this fails, the boundary went back to enumerating.
  const invented = {
    id: "x1",
    statement: "a shape nothing here knows about",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    steps: [{ order: 1, text: "first" }, { order: 2, text: "second" }],
    type: "procedure",
  } as unknown as KnowledgeObject;

  const back = roundTrip(invented) as unknown as { steps?: unknown };
  assert.deepEqual(back.steps, [{ order: 1, text: "first" }, { order: 2, text: "second" }]);
});

test("🔴 persistence does not enumerate payload fields by hand", () => {
  // The defect itself, asserted directly: `payload:` must be handed a derived value, never an
  // object literal listing the fields somebody remembered on the day.
  const source = readFileSync(new URL("./learner-store.ts", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(code.includes("payload: knowledgePayload(knowledge)"), "the payload must be derived");
  assert.equal(/payload:\s*\{/.test(code), false, "an inline payload literal deletes unknown fields");
});

// ── causal identity ─────────────────────────────────────────────────────────

test("🔴 direction is part of identity — reversing an edge is different knowledge", () => {
  const forward = knowledgeIdentityKey(CAUSAL);
  const reversed = knowledgeIdentityKey({
    ...CAUSAL,
    relation: { ...RELATION, cause: RELATION.effect, effect: RELATION.cause },
  });
  assert.notEqual(forward, reversed, "a sorted key would teach a mechanism backwards");
});

test("🔴 negation is part of identity", () => {
  assert.notEqual(
    knowledgeIdentityKey(CAUSAL),
    knowledgeIdentityKey({ ...CAUSAL, relation: { ...RELATION, negated: true } }),
  );
});

test("🔴 modality is part of identity — 'may cause' is not 'causes'", () => {
  const plain = knowledgeIdentityKey({ ...CAUSAL, relation: { ...RELATION, qualifier: undefined } });
  const hedged = knowledgeIdentityKey({ ...CAUSAL, relation: { ...RELATION, qualifier: "may" } });
  assert.notEqual(plain, hedged, "flattening a hedge asserts what the author declined to");
});

test("the relation kind is part of identity — increases is not decreases", () => {
  assert.notEqual(
    knowledgeIdentityKey({ ...CAUSAL, relation: { ...RELATION, relation: "increases" } }),
    knowledgeIdentityKey({ ...CAUSAL, relation: { ...RELATION, relation: "decreases" } }),
  );
});

test("identity ignores the statement, so two wordings of one edge converge", () => {
  // The statement is presentation. Two documents that phrase the same edge differently but name the
  // same nodes are the same knowledge.
  const other: KnowledgeObject = { ...CAUSAL, id: "other:1", statement: "a stop codon terminates translation early" };
  assert.equal(knowledgeIdentityKey(other), knowledgeIdentityKey(CAUSAL));
});

test("🔴 node keys are normalised text, and the limitation is real", () => {
  // Documented, not hidden: an entity-identity layer would be needed to merge these, and having a
  // model declare two phrasings equivalent would silently weld unrelated mechanisms together.
  assert.notEqual(causalNodeKey("protein function"), causalNodeKey("the function of the protein"));
  // What DOES converge: case and surrounding punctuation.
  assert.equal(causalNodeKey("Protein function."), causalNodeKey("protein function"));
});

test("edges compose by shared node key, without a mechanism object", () => {
  // A → B → C is two edges. Nothing stores the chain; the join is the shared key.
  const ab = { cause: { key: causalNodeKey("A"), text: "A" }, effect: { key: causalNodeKey("B"), text: "B" } };
  const bc = { cause: { key: causalNodeKey("B"), text: "B" }, effect: { key: causalNodeKey("C"), text: "C" } };
  assert.equal(ab.effect.key, bc.cause.key);
});

test("the identity basis is readable, so a disputed merge can be answered by looking", () => {
  assert.equal(
    identityBasis(CAUSAL),
    "causal|causes|is|mod=will|incorporation of a stop codon|premature termination",
  );
});

// ── causal knowledge is persisted and NOT teachable ─────────────────────────

test("🔴 causal knowledge mints NO objectives, so no policy can reach it", () => {
  // Persisting knowledge is not knowing how to teach it. `openingOperation("causal")` says
  // `predict`, and nothing in the objective layer can execute a prediction — so minting a runnable
  // objective would hand a mechanism to the recall runtime and drill it as a flashcard.
  assert.deepEqual(objectivesForKnowledge(CAUSAL), []);
  assert.deepEqual(objectivesForKnowledge({ ...CAUSAL, relation: { ...RELATION, negated: true } }), []);
});

test("association still mints its two directions", () => {
  assert.equal(objectivesForKnowledge(ASSOCIATION).length, 2);
});

// ── the benchmark's three stages ────────────────────────────────────────────

test("🔴 capability, dedup and semantic negatives stay three different things", () => {
  // A degraded source, a repeated assertion and a passage that makes no claim all produce no
  // causal object — for three unrelated reasons. Collapsing them made the acceptance fold read
  // 33% precise when the slice production actually sends was 100%.
  const capability = CAUSAL_BENCHMARK.filter((i) => stageOf(i) === "capability");
  const dedup = CAUSAL_BENCHMARK.filter((i) => stageOf(i) === "dedup");
  const semantic = eligibleForExtraction();

  assert.ok(capability.length > 0, "the corpus must still carry degraded material as evidence");
  assert.ok(dedup.length > 0, "and repeated assertions");
  assert.equal(capability.length + dedup.length + semantic.length, CAUSAL_BENCHMARK.length);

  // Every degraded item is capability-stage regardless of what its text looks like: the question
  // is whether we could reliably LOOK, never what we would have found.
  assert.ok(capability.every((i) => i.degraded));
  assert.ok(semantic.every((i) => !i.degraded && i.label !== "duplicate"));
});

test("🔴 no positive is hidden behind a gate", () => {
  // If a `causal` item were degraded or a duplicate, the benchmark would be quietly excusing a
  // recall miss by calling it an ineligible input.
  for (const item of CAUSAL_BENCHMARK.filter((i) => i.label === "causal")) {
    assert.equal(stageOf(item), "semantic", `${item.id} is a positive behind a ${stageOf(item)} gate`);
  }
});
