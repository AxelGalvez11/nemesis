// The Minimap's territory chips are learner-facing copy, and this file is where that gets checked.
//
// 🔴 `availableTerritories` HAD NO TEST AT ALL BEFORE THIS FILE. It is live — `use-policy-runtime.ts`
// calls it to build what the Minimap offers — and its label comes straight off
// `entry.knowledge.statement`, which `knowledge-extraction.ts` and `knowledge-territory.ts` both
// build as `${left} — ${right}` whenever a table named no columns. So the chip a learner reads was
// carrying a raw em dash: a genuine violation of the owner's "no em dashes in learner-facing copy"
// rule (2026-08-15), sitting in a file nothing exercised.

import assert from "node:assert/strict";
import { test } from "node:test";

import { availableTerritories } from "./canvas-focus";
import type { ResolvedObjective } from "./canvas-knowledge";
import type { KnowledgeObject } from "./knowledge-types";
import type { StoredObjective } from "./learner-store";

/** A minimal, valid association — the shape whose unlabelled form joins with an em dash. */
function pairKnowledge(id: string, left: string, right: string): KnowledgeObject {
  return {
    id,
    identityKey: id,
    pair: { id: `${id}:r`, left, right },
    statement: `${left} — ${right}`,
    type: "association",
    unanchoredProvenance: [],
  };
}

function objectiveOver(knowledge: KnowledgeObject, identityKey: string): ResolvedObjective {
  const objective: StoredObjective = {
    answer: "answer",
    capability: "recall",
    cue: "cue",
    identityKey,
    identityVersion: 1,
    knowledgeIdentityKey: knowledge.identityKey ?? knowledge.id,
    label: "label",
    parameters: {},
    rowId: `${identityKey}:row`,
  };
  return { knowledge, objective };
}

test("a territory label built from an unlabelled pair carries no em dash", () => {
  const knowledge = pairKnowledge("k1", "losartan", "Cozaar");
  const territories = availableTerritories([objectiveOver(knowledge, "o1")]);

  assert.equal(territories.length, 1);
  assert.doesNotMatch(territories[0]!.label, /—|–/, "the Minimap chip must not carry a raw em or en dash");
  assert.equal(territories[0]!.label, "losartan, Cozaar");
});

test("sanitising the label does not change which objectives group under it", () => {
  // Two objectives minted from the SAME knowledge object — e.g. the pair's forward and backward
  // recall directions — must still collapse into one chip, dash or no dash.
  const knowledge = pairKnowledge("k1", "losartan", "Cozaar");
  const territories = availableTerritories([
    objectiveOver(knowledge, "o1"),
    objectiveOver(knowledge, "o2"),
  ]);

  assert.equal(territories.length, 1, "one statement is one territory, however many objectives it minted");
  assert.deepEqual([...territories[0]!.identityKeys].sort(), ["o1", "o2"]);
});

test("a statement with no dash at all is left exactly as written", () => {
  const knowledge: KnowledgeObject = {
    id: "k2",
    identityKey: "k2",
    statement: "Filing after the limitation deadline results in dismissal",
    type: "causal",
    unanchoredProvenance: [],
  };
  const territories = availableTerritories([objectiveOver(knowledge, "o3")]);

  assert.equal(territories[0]!.label, "Filing after the limitation deadline results in dismissal");
});

test("🔴 explicit semantic parents create collapsible objective and subobjective territory", () => {
  const member = (id: string, statement: string): KnowledgeObject => ({
    id,
    identityKey: id,
    semanticRelations: [{
      family: "classification",
      id: `${id}:classification`,
      relationshipType: "member_of",
      roles: [
        { role: "member", value: { text: statement } },
        { role: "category", value: { text: "Adaptive immunity" } },
      ],
    }],
    statement,
    type: "conceptual_system",
    unanchoredProvenance: [],
  });
  const territories = availableTerritories([
    objectiveOver(member("k3", "Humoral immunity"), "o4"),
    objectiveOver(member("k4", "Cellular immunity"), "o5"),
  ]);

  assert.equal(territories.length, 1);
  assert.equal(territories[0]!.label, "Adaptive immunity");
  assert.deepEqual(territories[0]!.identityKeys, ["o4", "o5"]);
  assert.deepEqual(territories[0]!.children?.map((child) => child.label), ["Humoral immunity", "Cellular immunity"]);
});

test("a lone structural relation stays flat instead of inventing a one-child hierarchy", () => {
  const knowledge: KnowledgeObject = {
    id: "k5",
    identityKey: "k5",
    semanticRelations: [{
      family: "hierarchy",
      id: "k5:hierarchy",
      relationshipType: "subtype_of",
      roles: [
        { role: "child", value: { text: "ACE inhibitor" } },
        { role: "parent", value: { text: "Antihypertensive" } },
      ],
    }],
    statement: "ACE inhibitor",
    type: "conceptual_system",
    unanchoredProvenance: [],
  };
  const territories = availableTerritories([objectiveOver(knowledge, "o6")]);
  assert.equal(territories[0]!.label, "ACE inhibitor");
  assert.equal(territories[0]!.children, undefined);
});
