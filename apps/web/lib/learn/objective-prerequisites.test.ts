// What counts as a dependency, and — more importantly — what does not.
//
// 🔴 MOST OF THIS FILE IS REFUSALS, AND THAT IS THE POINT. A missing prerequisite edge costs
// nothing: the selector behaves exactly as it did before this module existed. A FALSE edge silently
// reorders what a learner is taught and sends them "down" to material that was never underneath —
// invisibly, because the trace still reads as a confident reason. So the tests that matter are the
// ones proving an edge is NOT drawn.

import assert from "node:assert/strict";
import { test } from "node:test";

import { causalNodeKey } from "./knowledge-identity";
import type { KnowledgeObject } from "./knowledge-types";
import { dependentsOf, prerequisiteMap, termsOf } from "./objective-prerequisites";

function edge(id: string, cause: string, effect: string): KnowledgeObject {
  return {
    id,
    identityKey: id,
    relation: {
      // The source's own sentence — a causal edge with nothing behind it is an assertion by us.
      assertion: `${cause} causes ${effect}.`,
      cause: { key: causalNodeKey(cause), text: cause },
      effect: { key: causalNodeKey(effect), text: effect },
      negated: false,
      relation: "causes",
    },
    statement: `${cause} — causes — ${effect}`,
    type: "causal",
    unanchoredProvenance: [],
  };
}

function pair(id: string, left: string, right: string): KnowledgeObject {
  return {
    id,
    identityKey: id,
    pair: { id: `${id}:r`, left, leftRole: "term", right, rightRole: "definition" },
    relationKind: "term|definition",
    statement: `${left} — ${right}`,
    type: "association",
    unanchoredProvenance: [],
  };
}

const candidate = (knowledge: KnowledgeObject) => ({ identityKey: knowledge.id, knowledge });
const mapOf = (...objects: KnowledgeObject[]) => prerequisiteMap(objects.map(candidate));

/** A procedure knowledge object with `count` steps, real text rather than placeholders. */
function procedureOf(id: string, ...stepTexts: string[]): KnowledgeObject {
  return {
    id,
    identityKey: id,
    statement: stepTexts[0] ?? "",
    steps: stepTexts.map((text, index) => ({ marker: `${index + 1}.`, text, unitId: "u1" })),
    type: "procedure",
    unanchoredProvenance: [],
  };
}

/** One step's objective, as `objectivesForKnowledge` mints it — `identityKey` distinct per step,
 *  `stepKey` carrying its 1-based position, which is the only thing `termsOf` reads for a step. */
function stepCandidate(knowledge: KnowledgeObject, stepKey: number) {
  return {
    identityKey: `${knowledge.id}:step${stepKey}`,
    knowledge,
    parameters: { stepKey },
  };
}

// ── the edges that SHOULD exist ─────────────────────────────────────────────

test("🔴🔴 a causal chain joins: the step before is a prerequisite of the step after", () => {
  // The behaviour I11 has been waiting for. A learner who cannot say what follows from decreased
  // current should be offered the step that PRODUCES decreased current, not the same question again.
  const map = mapOf(
    edge("e1", "Increasing resistance", "decreased current"),
    edge("e2", "decreased current", "reduced heating"),
  );
  assert.deepEqual(map.get("e2"), ["e1"], "e2 starts where e1 ends");
  assert.equal(map.has("e1"), false, "and the first link depends on nothing here");
});

test("a definition carries into the mechanism that starts from it", () => {
  // 🔴 THE ONE EDGE THAT CROSSES KNOWLEDGE TYPES, and it only fires because both sides normalise
  // through `causalNodeKey`. Two normalisers would leave this silently never firing.
  const map = mapOf(
    pair("a1", "resistance", "opposition to current flow"),
    edge("e1", "opposition to current flow", "less charge moving per second"),
  );
  assert.deepEqual(map.get("e1"), ["a1"]);
});

test("🔴 the join survives the source's own capitalisation and punctuation", () => {
  const map = mapOf(
    edge("e1", "A frameshift mutation", "A premature stop codon."),
    edge("e2", "a premature stop codon", "a truncated protein"),
  );
  assert.deepEqual(map.get("e2"), ["e1"]);
});

test("field-agnostic: the same rule builds a chain in a contracts course", () => {
  // 🔴 NO SUBJECT KNOWLEDGE ANYWHERE IN THIS MODULE, which is the standing product test — would this
  // work for a law student and a mechanical engineering student? The edges below are built by the
  // identical code path as the physiology ones above.
  const map = mapOf(
    edge("c1", "valid consideration", "a binding contract"),
    edge("c2", "a binding contract", "an enforceable obligation"),
  );
  assert.deepEqual(map.get("c2"), ["c1"]);
});

test("dependents are the same edges, read the other way", () => {
  const map = mapOf(
    edge("e1", "increased load", "material fatigue"),
    edge("e2", "material fatigue", "crack propagation"),
    edge("e3", "material fatigue", "reduced service life"),
  );
  const dependents = dependentsOf(map);
  assert.deepEqual([...(dependents.get("e1") ?? [])].sort(), ["e2", "e3"]);
});

// ── I11 for a procedure: the step before is a prerequisite of the step after ────

test("🔴🔴 a procedure chain joins: step 2 depends on step 1, the source's own stated order", () => {
  // The same edge the causal chain test above proves, one knowledge kind over. A learner who
  // cannot say what comes after step 1 should be offered step 1, not step 2 asked louder.
  const procedure = procedureOf("p1", "Draft the motion.", "File it with the clerk.", "Serve the opposing party.");
  const map = prerequisiteMap([
    stepCandidate(procedure, 1),
    stepCandidate(procedure, 2),
    stepCandidate(procedure, 3),
  ]);
  assert.deepEqual(map.get("p1:step2"), ["p1:step1"]);
  assert.deepEqual(map.get("p1:step3"), ["p1:step2"]);
  assert.equal(map.has("p1:step1"), false, "the first step is cued by the procedure's own name, not a prior step");
});

test("🔴 two different procedures' steps do not cross-wire", () => {
  // An unscoped "step#2" would make "administer the second dose" a prerequisite of "file the second
  // exhibit" the moment both procedures existed in the same canvas. The scope is the knowledge
  // object's own identity, so two step-2s from different procedures never collide.
  const filing = procedureOf("p1", "Draft the motion.", "File it with the clerk.");
  const dosing = procedureOf("p2", "Check the chart.", "Administer the second dose.");
  const map = prerequisiteMap([
    stepCandidate(filing, 1),
    stepCandidate(filing, 2),
    stepCandidate(dosing, 1),
    stepCandidate(dosing, 2),
  ]);
  assert.deepEqual(map.get("p1:step2"), ["p1:step1"]);
  assert.deepEqual(map.get("p2:step2"), ["p2:step1"]);
});

test("a procedure candidate with no stepKey contributes nothing — refusing, not guessing a position", () => {
  const procedure = procedureOf("p1", "Draft the motion.", "File it with the clerk.");
  const map = prerequisiteMap([
    { identityKey: "p1:mystery", knowledge: procedure },
    stepCandidate(procedure, 1),
  ]);
  assert.equal(map.has("p1:mystery"), false);
});

test("🔴 classification produces no edges, ever — members are SIBLINGS on one axis, not a chain", () => {
  // Stated rather than left as silence: unlike procedure, this is not a missing feature waiting for
  // someone to read the roles. "*3/*3 requires *3/*6" would invent an order the source never had —
  // both classes sit on the same axis, told apart from each other, not derived from each other.
  const classification: KnowledgeObject = {
    contrast: {
      column: 3,
      featureColumns: [1, 2],
      label: "Poor (PM)",
      members: ["*3/*3", "*3/*6"],
      siblings: [{ label: "Normal (NM)", members: ["*1/*1"] }],
    },
    id: "c1",
    identityKey: "c1",
    statement: "Predicted Metabolizer status: Poor (PM)",
    type: "classification",
    unanchoredProvenance: [],
  };
  assert.deepEqual(termsOf(classification, { memberKey: "*3/*3" }), { establishes: [], requires: [] });
  assert.equal(mapOf(classification).size, 0);
});

// ── the edges that must NOT exist ───────────────────────────────────────────

test("🔴🔴 a term that merely CONTAINS another is not a dependency", () => {
  // The 14%-precision trap, in this file's own terms. "Increasing resistance" and "resistance" are
  // different strings and a substring match would join them — along with "Week 3" and "Week 3
  // revision", and "Boeing 747" and "Boeing". Exact normalised equality, or no edge.
  const map = mapOf(
    pair("a1", "ohm", "resistance"),
    edge("e1", "Increasing resistance", "decreased current"),
  );
  assert.equal(map.size, 0, "no edge — and no edge is the correct answer, not a gap");
});

test("🔴 an objective is never its own prerequisite", () => {
  // A source that writes "inflammation leads to inflammation" would otherwise make this objective
  // depend on itself, and the selector would rank it above itself for ever.
  const map = mapOf(edge("e1", "inflammation", "inflammation"));
  assert.equal(map.size, 0);
});

test("🔴 a symmetric pair does not become a cycle with itself", () => {
  // An association is symmetric as knowledge but the minted objective runs left → right. Reading
  // both directions would make two pairs sharing a term prerequisites OF EACH OTHER.
  const map = mapOf(pair("a1", "losartan", "Cozaar"), pair("a2", "Cozaar", "losartan"));
  const a1 = map.get("a1") ?? [];
  const a2 = map.get("a2") ?? [];
  assert.equal(a1.includes("a1"), false);
  assert.equal(a2.includes("a2"), false);
});

test("🔴 empty role text links nothing to anything", () => {
  // Two unparsed roles both normalise to "", and matching on that would make every broken object a
  // prerequisite of every other broken object.
  const map = mapOf(edge("e1", "", ""), edge("e2", "", ""));
  assert.equal(map.size, 0);
});

test("🔴 a procedure object with no steps payload contributes nothing", () => {
  // Type says procedure, payload is missing — the shape a partially-read row has. Mirrors "a causal
  // object with no relation payload contributes nothing" below: it must not fall through to a
  // guessed position, and it must not fall through even when SOME OTHER candidate in the same call
  // supplies a `parameters.stepKey` for a different knowledge object entirely.
  const procedure: KnowledgeObject = {
    id: "p1",
    identityKey: "p1",
    statement: "Titrate slowly, then hold",
    type: "procedure",
    unanchoredProvenance: [],
  };
  assert.deepEqual(termsOf(procedure), { establishes: [], requires: [] });
  assert.deepEqual(termsOf(procedure, { stepKey: 1 }), { establishes: [], requires: [] });
  assert.equal(mapOf(procedure, edge("e1", "titration", "a stable level")).size, 0);
});

test("🔴 a conditional_rule — genuinely unread — still produces no edges", () => {
  // Unlike procedure and classification, nobody has read this type's roles at all yet. The refusing
  // default this file opens with, still true of whatever the NEXT unread type turns out to be.
  const rule: KnowledgeObject = {
    id: "r1",
    identityKey: "r1",
    statement: "Applies only when the buyer is a merchant",
    type: "conditional_rule",
    unanchoredProvenance: [],
  };
  assert.deepEqual(termsOf(rule), { establishes: [], requires: [] });
});

test("🔴 a causal object with no relation payload contributes nothing", () => {
  // Type says causal, payload is missing — the shape a partially-read row has. It must not fall
  // through to the association branch or to a guessed pair of roles.
  const broken: KnowledgeObject = {
    id: "b1",
    identityKey: "b1",
    statement: "something causes something",
    type: "causal",
    unanchoredProvenance: [],
  };
  assert.deepEqual(termsOf(broken), { establishes: [], requires: [] });
});

test("terms are read from the KNOWLEDGE, not from display strings", () => {
  // 🔴 A COPY CHANGE MUST NOT REWIRE WHAT IS TAUGHT BEFORE WHAT. The objective's `answer` carries a
  // bracketed qualifier and its `label` reads "Say what follows from …"; matching on those would
  // make the dependency graph a function of presentation.
  const withQualifier = edge("e1", "increasing resistance", "decreased current");
  withQualifier.relation!.qualifier = "when voltage is held constant";
  const terms = termsOf(withQualifier);
  assert.deepEqual(terms.establishes, [causalNodeKey("decreased current")]);
  assert.equal(
    terms.establishes[0]?.includes("voltage"),
    false,
    "the bound is part of the claim, never part of the join key",
  );
});
