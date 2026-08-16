// The structure inside a piece of knowledge, independently of how Nemesis currently teaches it.
//
// `KnowledgeObject.type` predates this layer. It is still useful as a compatibility hint for the
// interaction the current runtime can stage, but it is not an ontology: loop diuretics can be a
// classification, a location, a mechanism, a causal chain and a comparison at the same time. A
// single enum value cannot say that, and splitting the idea into unrelated copies would throw away
// the fact that those readings constrain and explain one another.
//
// This substrate is intentionally open world. `family` names common shapes for retrieval and
// trusted renderers; `relationshipType`, role names, value types and qualifier kinds remain strings.
// An extractor encountering a structure Nemesis has never named must be able to preserve it for the
// general model instead of coercing it to the nearest familiar bucket or dropping it at validation.

import type { CanonicalSourceAnchor } from "@/lib/sources/source-context";

import { normalizeForIdentity } from "./knowledge-identity";
import type { KnowledgeObject } from "./knowledge-types";

/** Common relation families, not the complete set of relationships knowledge may contain. */
export const SEMANTIC_RELATION_FAMILIES = [
  "fact_association",
  "identity",
  "classification",
  "hierarchy",
  "part_whole",
  "comparison",
  "causal_mechanistic",
  "functional",
  "conditional",
  "exception",
  "procedural_algorithmic",
  "quantitative",
  "probabilistic",
  "temporal",
  "spatial",
  "constraint",
  "example_counterexample",
  "analogy",
  "evidence_support",
  "misconception_failure_mode",
  "transfer_generalization",
] as const;

export type SemanticRelationFamily = (typeof SEMANTIC_RELATION_FAMILIES)[number];

/** One participant in a relation. `valueType` is open for formulas, intervals, entities, etc. */
export interface SemanticValue {
  /** The source-facing representation. Never replace this with only a normalised key. */
  text: string;
  /** Conservative identity/join key when the extractor can state one. */
  key?: string;
  /** Open-world description such as `entity`, `formula`, `probability`, `region`, or a new kind. */
  valueType?: string;
  /** Machine-readable magnitude when the text expresses one. */
  number?: number;
  /** Unit attached to `number`, verbatim or normalised by an evidence-preserving parser. */
  unit?: string;
}

/** A named participant. Repeated role names make n-ary sets and comparisons representable. */
export interface SemanticRole {
  /** Open-world role such as cause, effect, member, category, whole, part, input, or output. */
  role: string;
  value: SemanticValue;
  /** Meaningful source order, when the relation has one. */
  order?: number;
}

/** A condition, uncertainty, exception, comparison basis, scope, or other bound on a relation. */
export interface SemanticQualifier {
  /** Open-world kind; common examples are condition, epistemic, probability and temporal_scope. */
  kind: string;
  value: string | number | boolean;
  unit?: string;
}

/** Evidence for one relation. Several records allow course and external claims to coexist. */
export interface SemanticRelationEvidence {
  /** Exact source language supporting the relation, when a source said it in prose. */
  assertion?: string;
  /** Durable positions in uploaded or retrieved sources. */
  sourceAnchors?: readonly CanonicalSourceAnchor[];
  /** Open source context: uploaded_material, course, external, model, or a future context. */
  sourceContext?: string;
  /** Extractor/model lineage for this reading, without confusing it with learner evidence. */
  extractor?: string;
  model?: string;
  schemaVersion?: string;
}

/**
 * One semantic assertion, possibly n-ary and always allowed to use a previously unseen name.
 *
 * `relationshipType` is the claim (`inhibits`, `member_of`, `conserves_charge`). `family` is an
 * optional broad structural hint. Unknown types are valid data; known families only buy adapters.
 */
export interface SemanticRelation {
  id: string;
  relationshipType: string;
  family?: SemanticRelationFamily;
  roles: readonly SemanticRole[];
  negated?: boolean;
  qualifiers?: readonly SemanticQualifier[];
  evidence?: readonly SemanticRelationEvidence[];
}

function value(text: string, valueType = "entity"): SemanticValue {
  return { key: normalizeForIdentity(text), text, valueType };
}

function evidenceFor(
  knowledge: KnowledgeObject,
  assertion?: string,
): readonly SemanticRelationEvidence[] | undefined {
  const records: SemanticRelationEvidence[] = [];
  if ((knowledge.sourceAnchors?.length ?? 0) > 0 || assertion) {
    records.push({
      ...(assertion ? { assertion } : {}),
      ...(knowledge.sourceAnchors?.length ? { sourceAnchors: knowledge.sourceAnchors } : {}),
      sourceContext: "uploaded_material",
      ...(knowledge.provenance?.extractor ? { extractor: knowledge.provenance.extractor } : {}),
      ...(knowledge.provenance?.model ? { model: knowledge.provenance.model } : {}),
      ...(knowledge.provenance?.schemaVersion ? { schemaVersion: knowledge.provenance.schemaVersion } : {}),
    });
  }
  if (knowledge.unanchoredProvenance.includes("model")) records.push({ sourceContext: "model" });
  return records.length ? records : undefined;
}

/**
 * Read the new substrate, or expose a lossless semantic view of a legacy payload.
 *
 * Explicit relations are authoritative as a set. The bridge only runs when none were stored, which
 * prevents one newly extracted relation from being silently combined with a guessed legacy copy.
 */
export function semanticRelationsOf(knowledge: KnowledgeObject): readonly SemanticRelation[] {
  if (knowledge.semanticRelations?.length) return knowledge.semanticRelations;

  if (knowledge.type === "causal" && knowledge.relation) {
    const relation = knowledge.relation;
    return [{
      id: `${knowledge.id}:semantic:causal`,
      relationshipType: relation.relation,
      family: "causal_mechanistic",
      roles: [
        { role: "cause", value: { key: relation.cause.key, text: relation.cause.text, valueType: "entity" } },
        { role: "effect", value: { key: relation.effect.key, text: relation.effect.text, valueType: "entity" } },
      ],
      ...(relation.negated ? { negated: true } : {}),
      ...(relation.qualifier
        ? { qualifiers: [{ kind: relation.qualifierKind ?? "qualification", value: relation.qualifier }] }
        : {}),
      ...(evidenceFor(knowledge, relation.assertion) ? { evidence: evidenceFor(knowledge, relation.assertion) } : {}),
    }];
  }

  if (knowledge.type === "association" && knowledge.pair) {
    const pair = knowledge.pair;
    return [{
      id: `${knowledge.id}:semantic:association`,
      relationshipType: knowledge.relationKind ?? "associated_with",
      family: "fact_association",
      roles: [
        { role: pair.leftRole ?? "left", value: value(pair.left) },
        { role: pair.rightRole ?? "right", value: value(pair.right) },
      ],
      ...(evidenceFor(knowledge) ? { evidence: evidenceFor(knowledge) } : {}),
    }];
  }

  if (knowledge.type === "classification" && knowledge.contrast) {
    const contrast = knowledge.contrast;
    return [{
      id: `${knowledge.id}:semantic:classification`,
      relationshipType: "member_of_category",
      family: "classification",
      roles: [
        ...(contrast.axis ? [{ role: "axis", value: value(contrast.axis) } as SemanticRole] : []),
        { role: "category", value: value(contrast.label) },
        ...contrast.members.map((member) => ({ role: "member", value: value(member) })),
        ...contrast.siblings.map((sibling) => ({ role: "contrasting_category", value: value(sibling.label) })),
      ],
      ...(evidenceFor(knowledge) ? { evidence: evidenceFor(knowledge) } : {}),
    }];
  }

  if (knowledge.type === "procedure" && knowledge.steps?.length) {
    return [{
      id: `${knowledge.id}:semantic:procedure`,
      relationshipType: "ordered_steps",
      family: "procedural_algorithmic",
      roles: [
        { role: "goal", value: value(knowledge.statement) },
        ...knowledge.steps.map((step, index) => ({
          order: index + 1,
          role: "step",
          value: value(step.text, "action"),
        })),
      ],
      ...(evidenceFor(knowledge) ? { evidence: evidenceFor(knowledge) } : {}),
    }];
  }

  if (knowledge.type === "spatial" && knowledge.figure) {
    const figure = knowledge.figure;
    return figure.labels.map((label, index) => ({
      id: `${knowledge.id}:semantic:spatial:${index + 1}`,
      relationshipType: "located_in_figure",
      family: "spatial",
      roles: [
        { role: "figure", value: value(figure.caption ?? figure.imageRef, "figure") },
        { role: "part", value: value(label.text) },
      ],
      qualifiers: [
        { kind: "x_fraction", value: label.x },
        { kind: "y_fraction", value: label.y },
      ],
      ...(evidenceFor(knowledge) ? { evidence: evidenceFor(knowledge) } : {}),
    }));
  }

  return [];
}

/** Compact, faithful text for a general model. No family-specific policy is encoded here. */
export function semanticRelationSummary(relation: SemanticRelation): string {
  const name = relation.family
    ? `${relation.family}/${relation.relationshipType}`
    : relation.relationshipType;
  const roles = relation.roles
    .map((entry) => `${entry.role}${entry.order === undefined ? "" : `#${entry.order}`}=${entry.value.text}`)
    .join(", ");
  const qualifiers = relation.qualifiers?.length
    ? `; ${relation.qualifiers.map((entry) => `${entry.kind}=${String(entry.value)}${entry.unit ? ` ${entry.unit}` : ""}`).join(", ")}`
    : "";
  return `${relation.negated ? "NOT " : ""}${name}(${roles})${qualifiers}`;
}

/** Exact conservative join terms for structural retrieval. Unknown relations participate too. */
export function semanticRelationKeys(relation: SemanticRelation): readonly string[] {
  return [...new Set(
    relation.roles
      .map((entry) => entry.value.key ?? normalizeForIdentity(entry.value.text))
      .filter(Boolean),
  )];
}

export function semanticKeysOf(knowledge: KnowledgeObject): readonly string[] {
  return [...new Set(semanticRelationsOf(knowledge).flatMap(semanticRelationKeys))];
}
