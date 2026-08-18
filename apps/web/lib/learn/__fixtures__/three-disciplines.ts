// Material from three unrelated fields, built once and shared by the worked-example, completion and
// transfer tests.
//
// 🔴🔴 THE FIXTURES ARE THE FIELD-AGNOSTICISM ARGUMENT, NOT DECORATION. Every builder these tests
// exercise reads knowledge STRUCTURE — an ordered run, a directed relation, a class contrast — and
// never the words inside it. The way that claim fails silently is a test suite whose only causal
// relation happens to be pharmacological, at which point a keyword list would pass everything. So
// the same shapes are supplied three times over: a pharmacokinetic relation, a legal one, and an
// electrical one; a laboratory procedure, a civil-procedure one, and a maintenance one.
//
// 🔴 AND THE TEXTS SHARE NO VOCABULARY. Nothing here says "drug", "court" or "circuit" in more than
// one discipline's fixture, so a builder that had learned any of those words would produce different
// output for the three and the assertions would diverge.

import type { KnowledgeObject } from "../knowledge-types";
import type { CausalRelationKind } from "../knowledge-types";
import { objectivesForKnowledge, type LearningObjective } from "../learning-objective";
import type { StoredObjective } from "../learner-store";

export function causal(input: {
  id: string;
  cause: string;
  effect: string;
  relation: CausalRelationKind;
  assertion: string;
  negated?: boolean;
  qualifier?: string;
  qualifierKind?: "epistemic" | "conditional";
}): KnowledgeObject {
  return {
    id: input.id,
    identityKey: `causal:v2:${input.id}`,
    relation: {
      assertion: input.assertion,
      cause: { key: input.cause.toLowerCase(), text: input.cause },
      effect: { key: input.effect.toLowerCase(), text: input.effect },
      negated: input.negated ?? false,
      relation: input.relation,
      ...(input.qualifier ? { qualifier: input.qualifier } : {}),
      ...(input.qualifierKind ? { qualifierKind: input.qualifierKind } : {}),
    },
    statement: input.assertion,
    type: "causal",
    unanchoredProvenance: [],
  } as KnowledgeObject;
}

export function procedure(id: string, name: string, steps: readonly string[]): KnowledgeObject {
  return {
    id,
    identityKey: `procedure:v2:${id}`,
    statement: name,
    steps: steps.map((text, index) => ({ marker: `${index + 1}.`, text, unitId: `${id}-u${index}` })),
    type: "procedure",
    unanchoredProvenance: [],
  } as KnowledgeObject;
}

export function association(id: string, left: string, right: string): KnowledgeObject {
  return {
    id,
    identityKey: `association:v2:${id}`,
    pair: { id: `${id}:r`, left, leftRole: "term", right, rightRole: "meaning" },
    statement: `${left} means ${right}`,
    type: "association",
    unanchoredProvenance: [],
  } as KnowledgeObject;
}

export function classification(input: {
  id: string;
  axis: string;
  label: string;
  members: readonly string[];
  siblings: readonly { label: string; members: readonly string[] }[];
}): KnowledgeObject {
  return {
    contrast: {
      axis: input.axis,
      column: 1,
      featureColumns: [2],
      label: input.label,
      members: input.members,
      siblings: input.siblings,
    },
    id: input.id,
    identityKey: `classification:v2:${input.id}`,
    statement: `${input.members.join(", ")} sorted by ${input.axis}`,
    type: "classification",
    unanchoredProvenance: [],
  } as KnowledgeObject;
}

/** Knowledge plus its first objective, in the shape the runtime passes around. */
export function resolved(knowledge: KnowledgeObject, index = 0): {
  knowledge: KnowledgeObject;
  objective: StoredObjective;
} {
  const objective = objectivesForKnowledge(knowledge)[index];
  if (!objective) throw new Error(`no objective ${index} for ${knowledge.id}`);
  return { knowledge, objective: { ...objective, rowId: `row-${knowledge.id}-${index}` } };
}

export function objectivesOf(knowledge: KnowledgeObject): LearningObjective[] {
  return objectivesForKnowledge(knowledge);
}

// ── medicine ────────────────────────────────────────────────────────────────

export const PHARMACOKINETICS = causal({
  assertion: "Reduced renal clearance increases steady-state plasma concentration.",
  cause: "reduced renal clearance",
  effect: "steady-state plasma concentration",
  id: "pk1",
  relation: "increases",
});

export const ASSAY = procedure("pr-assay", "the dilution assay", [
  "Warm the sample to room temperature.",
  "Add the buffer and mix until clear.",
  "Read the absorbance at the stated wavelength.",
  "Divide by the dilution factor.",
]);

// ── law ─────────────────────────────────────────────────────────────────────

export const LIMITATION = causal({
  assertion: "Fraudulent concealment by the defendant postpones the running of the limitation period.",
  cause: "fraudulent concealment by the defendant",
  effect: "the running of the limitation period",
  id: "law1",
  relation: "prevents",
});

export const PLEADING = procedure("pr-pleading", "filing a defence", [
  "Acknowledge service within fourteen days.",
  "Admit or deny each allegation in turn.",
  "State any positive case relied on.",
  "Serve the defence on every other party.",
]);

// ── engineering ─────────────────────────────────────────────────────────────

export const OHM = causal({
  assertion: "Raising the series resistance decreases the current through the branch.",
  cause: "raising the series resistance",
  effect: "the current through the branch",
  id: "eng1",
  relation: "decreases",
});

export const BEARING = procedure("pr-bearing", "replacing a shaft bearing", [
  "Isolate and lock out the drive.",
  "Support the shaft before releasing the housing.",
  "Draw the old race off with the puller.",
  "Seat the new race square to the shoulder.",
]);
