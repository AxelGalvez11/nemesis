import assert from "node:assert/strict";
import { test } from "node:test";

import { causalNodeKey } from "./knowledge-identity";
import type { KnowledgeObject } from "./knowledge-types";
import { semanticRelationSummary, semanticRelationsOf, type SemanticRelation } from "./semantic-relations";

const loopDiuretics: KnowledgeObject = {
  id: "loop-diuretics",
  statement: "Loop diuretics",
  type: "conceptual_system",
  unanchoredProvenance: ["model"],
  semanticRelations: [
    {
      id: "r-class",
      family: "classification",
      relationshipType: "member_of",
      roles: [
        { role: "member", value: { text: "loop diuretics", valueType: "concept" } },
        { role: "category", value: { text: "diuretics", valueType: "concept" } },
      ],
    },
    {
      id: "r-location",
      family: "spatial",
      relationshipType: "acts_at",
      roles: [
        { role: "agent", value: { text: "loop diuretics" } },
        { role: "location", value: { text: "thick ascending limb" } },
      ],
    },
    {
      id: "r-mechanism",
      family: "causal_mechanistic",
      relationshipType: "inhibits",
      roles: [
        { role: "agent", value: { text: "loop diuretics" } },
        { role: "target", value: { text: "NKCC2" } },
      ],
    },
    {
      id: "r-open-world",
      relationshipType: "countercurrent_multiplier_disruption",
      roles: [
        { role: "disruptor", value: { text: "NKCC2 inhibition" } },
        { role: "system", value: { text: "medullary concentration gradient" } },
      ],
    },
  ],
};

test("one idea carries several overlapping relation families", () => {
  const relations = semanticRelationsOf(loopDiuretics);
  assert.equal(relations.length, 4);
  assert.deepEqual(relations.map((relation) => relation.family), [
    "classification",
    "spatial",
    "causal_mechanistic",
    undefined,
  ]);
});

test("a relationship type this version has never heard of is preserved and legible", () => {
  const unknown = semanticRelationsOf(loopDiuretics)[3]!;
  assert.equal(unknown.relationshipType, "countercurrent_multiplier_disruption");
  assert.equal(
    semanticRelationSummary(unknown),
    "countercurrent_multiplier_disruption(disruptor=NKCC2 inhibition, system=medullary concentration gradient)",
  );
});

test("legacy causal knowledge gains a semantic view without flattening direction, scope, or evidence", () => {
  const legacy: KnowledgeObject = {
    id: "edge-1",
    relation: {
      assertion: "More substrate increases reaction rate until the enzyme saturates.",
      cause: { key: causalNodeKey("more substrate"), text: "more substrate" },
      effect: { key: causalNodeKey("reaction rate"), text: "reaction rate" },
      negated: false,
      qualifier: "until the enzyme saturates",
      qualifierKind: "conditional",
      relation: "increases",
    },
    sourceAnchors: [{ sourceId: "lecture-1", unitId: "p4" }],
    statement: "More substrate increases reaction rate until saturation",
    type: "causal",
    unanchoredProvenance: [],
  };

  const [relation] = semanticRelationsOf(legacy);
  assert.equal(relation?.family, "causal_mechanistic");
  assert.deepEqual(relation?.roles.map((role) => role.role), ["cause", "effect"]);
  assert.deepEqual(relation?.qualifiers, [{ kind: "conditional", value: "until the enzyme saturates" }]);
  assert.equal(relation?.evidence?.[0]?.assertion, legacy.relation?.assertion);
  assert.deepEqual(relation?.evidence?.[0]?.sourceAnchors, legacy.sourceAnchors);
});

test("unknown families are not required for unknown relationship types", () => {
  const newShape: SemanticRelation = {
    id: "r-new",
    relationshipType: "whatever_this_new_structure_is",
    roles: [{ role: "subject", value: { text: "a thing" } }],
  };
  assert.equal(semanticRelationsOf({ ...loopDiuretics, semanticRelations: [newShape] })[0], newShape);
});
