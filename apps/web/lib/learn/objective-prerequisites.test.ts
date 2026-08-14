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

test("🔴 a knowledge type with no stated roles produces no edges, rather than guessed ones", () => {
  // 🔴 THE REFUSING DEFAULT FOR EVERYTHING NOT YET READ. When `procedure` or `conditional_rule`
  // start minting objectives they get no prerequisites until someone states what their roles ARE.
  // That is a missing feature; inventing edges for a shape nobody has read is a wrong answer.
  const procedure: KnowledgeObject = {
    id: "p1",
    identityKey: "p1",
    statement: "Titrate slowly, then hold",
    type: "procedure",
    unanchoredProvenance: [],
  };
  assert.deepEqual(termsOf(procedure), { establishes: [], requires: [] });
  assert.equal(mapOf(procedure, edge("e1", "titration", "a stable level")).size, 0);
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
