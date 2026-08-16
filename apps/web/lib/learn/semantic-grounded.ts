// A general model reading of the learner's material, admitted only when its evidence resolves.
//
// The model owns semantic recognition: relation names and roles are open-world, and this boundary
// never tries to rediscover them with keywords. Nemesis owns the harder guarantees around that
// judgment: every assertion is copied from a named excerpt, every participant occurs in that
// evidence, output is bounded, and malformed or invented claims become refusals rather than
// learner objectives.

import { quoteAnchor, type CanonicalSourceAnchor } from "@/lib/sources/source-context";

import type { CanvasSource, SourceExcerpt } from "./canvas-model";
import { knowledgeIdentityKey, normalizeForIdentity } from "./knowledge-identity";
import type { KnowledgeObject } from "./knowledge-types";
import {
  SEMANTIC_RELATION_FAMILIES,
  type SemanticQualifier,
  type SemanticRelation,
  type SemanticRelationEvidence,
  type SemanticRelationFamily,
  type SemanticRole,
} from "./semantic-relations";

export const SEMANTIC_EXTRACTION_VERSION = "semantic-prose/1";
export const SEMANTIC_SCHEMA_VERSION = "open-relations/1";

const MAX_STRUCTURES = 80;
const MAX_ROLES = 12;
const MAX_EVIDENCE = 8;
const MAX_QUALIFIERS = 12;

export const SEMANTIC_EXTRACTION_PROMPT = `In the same read, extract important NON-CAUSAL knowledge
structures explicitly stated by the material. Knowledge features overlap. Use any relationshipType
that faithfully names the structure; do not force a new structure into a familiar category.

The common optional families are:
fact_association, identity, classification, hierarchy, part_whole, comparison, functional,
conditional, exception, procedural_algorithmic, quantitative, probabilistic, temporal, spatial,
constraint, example_counterexample, analogy, evidence_support, misconception_failure_mode,
transfer_generalization.

Do not return causal or mechanistic claims here; the relations list already carries those. Do not
repeat simple glossary pairs already represented as left/right associations. Prefer structures that
help a learner understand, derive, distinguish, transfer, or correctly use other material.

For each structure return:
- relationshipType: a short open-world name such as member_of, composed_of, differs_by, used_for,
  applies_when, conserved, analogous_to, or a new accurate name
- family: one common family above when it fits exactly, otherwise omit it
- roles: two or more named participants. Copy every participant text from the evidence. order is
  required when order matters. valueType, number, and unit are optional source-preserving details
- negated: true only when the material explicitly denies the relation
- qualifiers: conditions, exceptions, probabilities, uncertainty, comparison axes, scopes, or
  other limits. Copy string values verbatim
- evidence: one or more records, each with an excerptId exactly as bracketed below and an assertion
  copied from that excerpt character for character. Every role and string qualifier must occur in
  at least one copied assertion

Numbering alone does not make a procedure. A numbered set of questions, headings, diagnoses,
references, or examples is not an ordered procedure. Extract procedural_algorithmic only when the
material states that the items are actions or stages to execute in that order.

Return fewer structures rather than weak ones. Never use outside knowledge.`;

type RefusalReason =
  | "unreadable-response"
  | "malformed-structure"
  | "missing-evidence"
  | "unresolvable-excerpt"
  | "unanchorable-excerpt"
  | "assertion-not-verbatim"
  | "ungrounded-role"
  | "ungrounded-qualifier"
  | "duplicate";

export interface SemanticRefusal {
  reason: RefusalReason;
  detail: string;
}

export interface SemanticTerritoryResult {
  objects: KnowledgeObject[];
  refusals: SemanticRefusal[];
}

interface Located {
  excerpt: SourceExcerpt;
  sourceId: string;
}

function locate(sources: readonly CanvasSource[], excerptId: string): Located | null | "unanchorable" {
  for (const source of sources) {
    const excerpt = source.excerpts.find((candidate) => candidate.id === excerptId);
    if (!excerpt) continue;
    if (!source.librarySourceId || !excerpt.unitId) return "unanchorable";
    return { excerpt, sourceId: source.librarySourceId };
  }
  return null;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function familyOf(value: unknown): SemanticRelationFamily | undefined {
  return typeof value === "string" && (SEMANTIC_RELATION_FAMILIES as readonly string[]).includes(value)
    ? value as SemanticRelationFamily
    : undefined;
}

function evidenceOf(
  value: unknown,
  sources: readonly CanvasSource[],
  model: string,
): { anchors: CanonicalSourceAnchor[]; assertions: string[]; evidence: SemanticRelationEvidence[] } | SemanticRefusal {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_EVIDENCE) {
    return { detail: "A semantic structure carried no bounded evidence list.", reason: "missing-evidence" };
  }
  const anchors: CanonicalSourceAnchor[] = [];
  const assertions: string[] = [];
  const evidence: SemanticRelationEvidence[] = [];
  for (const entry of value) {
    if (!record(entry)) return { detail: "A semantic evidence record was malformed.", reason: "missing-evidence" };
    const excerptId = text(entry.excerptId, 120);
    const assertion = text(entry.assertion, 1_500);
    if (!excerptId || !assertion) {
      return { detail: "A semantic evidence record omitted its excerpt or exact assertion.", reason: "missing-evidence" };
    }
    const found = locate(sources, excerptId);
    if (found === null) {
      return { detail: `A semantic structure cited unknown excerpt "${excerptId}".`, reason: "unresolvable-excerpt" };
    }
    if (found === "unanchorable") {
      return { detail: `Excerpt "${excerptId}" has no durable locator.`, reason: "unanchorable-excerpt" };
    }
    if (!found.excerpt.text.includes(assertion)) {
      return { detail: `The assertion for excerpt "${excerptId}" was not copied verbatim.`, reason: "assertion-not-verbatim" };
    }
    const anchor: CanonicalSourceAnchor = {
      quote: quoteAnchor(found.excerpt.text, assertion),
      sourceId: found.sourceId,
      unitId: found.excerpt.unitId!,
    };
    anchors.push(anchor);
    assertions.push(assertion);
    evidence.push({
      assertion,
      extractor: SEMANTIC_EXTRACTION_VERSION,
      model,
      schemaVersion: SEMANTIC_SCHEMA_VERSION,
      sourceAnchors: [anchor],
      sourceContext: "uploaded_material",
    });
  }
  return { anchors, assertions, evidence };
}

function rolesOf(value: unknown, assertions: readonly string[]): SemanticRole[] | SemanticRefusal {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_ROLES) {
    return { detail: "A semantic structure must carry two to twelve roles.", reason: "malformed-structure" };
  }
  const roles: SemanticRole[] = [];
  for (const entry of value) {
    if (!record(entry)) return { detail: "A semantic role was malformed.", reason: "malformed-structure" };
    const role = text(entry.role, 60);
    const roleText = text(entry.text, 240);
    if (!role || !roleText) return { detail: "A semantic role omitted its name or text.", reason: "malformed-structure" };
    if (!assertions.some((assertion) => assertion.includes(roleText))) {
      return { detail: `Role "${roleText}" does not occur in its cited evidence.`, reason: "ungrounded-role" };
    }
    const valueType = entry.valueType === undefined ? null : text(entry.valueType, 60);
    const unit = entry.unit === undefined ? null : text(entry.unit, 40);
    const number = entry.number;
    const order = entry.order;
    if ((entry.valueType !== undefined && !valueType) || (entry.unit !== undefined && !unit)) {
      return { detail: "A semantic role carried an invalid value type or unit.", reason: "malformed-structure" };
    }
    if (number !== undefined && (typeof number !== "number" || !Number.isFinite(number))) {
      return { detail: "A semantic role carried an invalid number.", reason: "malformed-structure" };
    }
    if (order !== undefined && (!Number.isInteger(order) || Number(order) < 1 || Number(order) > MAX_ROLES)) {
      return { detail: "A semantic role carried an invalid order.", reason: "malformed-structure" };
    }
    roles.push({
      role,
      value: {
        key: normalizeForIdentity(roleText),
        text: roleText,
        ...(valueType ? { valueType } : {}),
        ...(number !== undefined ? { number: number as number } : {}),
        ...(unit ? { unit } : {}),
      },
      ...(order !== undefined ? { order: order as number } : {}),
    });
  }
  return roles;
}

function qualifiersOf(value: unknown, assertions: readonly string[]): SemanticQualifier[] | SemanticRefusal | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_QUALIFIERS) {
    return { detail: "A semantic qualifier list was malformed.", reason: "malformed-structure" };
  }
  const qualifiers: SemanticQualifier[] = [];
  for (const entry of value) {
    if (!record(entry)) return { detail: "A semantic qualifier was malformed.", reason: "malformed-structure" };
    const kind = text(entry.kind, 60);
    const unit = entry.unit === undefined ? null : text(entry.unit, 40);
    const candidate = entry.value;
    if (!kind || (entry.unit !== undefined && !unit) || !["string", "number", "boolean"].includes(typeof candidate)) {
      return { detail: "A semantic qualifier omitted a valid kind or value.", reason: "malformed-structure" };
    }
    if (typeof candidate === "number" && !Number.isFinite(candidate)) {
      return { detail: "A semantic qualifier carried an invalid number.", reason: "malformed-structure" };
    }
    if (typeof candidate === "string" && !assertions.some((assertion) => assertion.includes(candidate))) {
      return { detail: `Qualifier "${candidate}" does not occur in its cited evidence.`, reason: "ungrounded-qualifier" };
    }
    qualifiers.push({ kind, value: candidate as string | number | boolean, ...(unit ? { unit } : {}) });
  }
  return qualifiers;
}

function refusal(value: unknown): value is SemanticRefusal {
  return record(value) && typeof value.reason === "string" && typeof value.detail === "string";
}

function relationKey(relation: SemanticRelation): string {
  return JSON.stringify({
    family: relation.family ?? null,
    negated: relation.negated ?? false,
    qualifiers: relation.qualifiers ?? [],
    relationshipType: normalizeForIdentity(relation.relationshipType),
    roles: relation.roles.map((entry) => ({
      order: entry.order ?? null,
      role: normalizeForIdentity(entry.role),
      value: entry.value.key ?? normalizeForIdentity(entry.value.text),
    })),
  });
}

function proceduralObject(input: {
  relation: SemanticRelation;
  grounded: { anchors: CanonicalSourceAnchor[]; assertions: string[] };
  index: number;
  model: string;
}): KnowledgeObject | null {
  if (input.relation.family !== "procedural_algorithmic") return null;
  const stepRoles = input.relation.roles
    .filter((role) => role.role === "step" && role.order !== undefined)
    .sort((a, b) => a.order! - b.order!);
  if (stepRoles.length < 2) return null;
  if (stepRoles.some((role, index) => role.order !== index + 1)) return null;
  const goal = input.relation.roles.find((role) => role.role === "goal" || role.role === "procedure" || role.role === "process");
  const object: KnowledgeObject = {
    derivation: "model-prose",
    extractionVersion: SEMANTIC_EXTRACTION_VERSION,
    id: `semantic:${input.index + 1}`,
    provenance: {
      extractor: SEMANTIC_EXTRACTION_VERSION,
      lane: "model-prose",
      model: input.model,
      schemaVersion: SEMANTIC_SCHEMA_VERSION,
    },
    semanticRelations: [input.relation],
    sourceAnchors: input.grounded.anchors,
    statement: goal?.value.text ?? input.grounded.assertions[0]!,
    steps: stepRoles.map((role, index) => {
      const evidenceIndex = input.grounded.assertions.findIndex((assertion) => assertion.includes(role.value.text));
      return {
        marker: `${index + 1}.`,
        text: role.value.text,
        unitId: input.grounded.anchors[Math.max(0, evidenceIndex)]!.unitId!,
      };
    }),
    type: "procedure",
    unanchoredProvenance: [],
  };
  object.identityKey = knowledgeIdentityKey(object);
  return object;
}

/** Parse only the `structures` member of the combined grounded-prose response. */
export function parseSemanticTerritory(input: {
  text: string;
  sources: readonly CanvasSource[];
  model: string;
}): SemanticTerritoryResult {
  let candidates: unknown[];
  try {
    const parsed: unknown = JSON.parse(input.text);
    const structures = record(parsed) ? parsed.structures : undefined;
    if (structures === undefined) return { objects: [], refusals: [] };
    if (!Array.isArray(structures)) throw new Error("not a list");
    candidates = structures.slice(0, MAX_STRUCTURES);
  } catch {
    return {
      objects: [],
      refusals: [{ detail: "The semantic response was not a readable structures list.", reason: "unreadable-response" }],
    };
  }

  const objects: KnowledgeObject[] = [];
  const refusals: SemanticRefusal[] = [];
  const seen = new Set<string>();
  for (const [index, candidate] of candidates.entries()) {
    if (!record(candidate)) {
      refusals.push({ detail: `Structure ${index + 1} was not an object.`, reason: "malformed-structure" });
      continue;
    }
    const relationshipType = text(candidate.relationshipType, 80);
    if (!relationshipType) {
      refusals.push({ detail: `Structure ${index + 1} omitted its relationship type.`, reason: "malformed-structure" });
      continue;
    }
    const grounded = evidenceOf(candidate.evidence, input.sources, input.model);
    if (refusal(grounded)) {
      refusals.push(grounded);
      continue;
    }
    const roles = rolesOf(candidate.roles, grounded.assertions);
    if (refusal(roles)) {
      refusals.push(roles);
      continue;
    }
    const qualifiers = qualifiersOf(candidate.qualifiers, grounded.assertions);
    if (refusal(qualifiers)) {
      refusals.push(qualifiers);
      continue;
    }
    const family = familyOf(candidate.family);
    const relation: SemanticRelation = {
      evidence: grounded.evidence,
      ...(family ? { family } : {}),
      id: `semantic:${index + 1}`,
      ...(candidate.negated === true ? { negated: true } : {}),
      ...(qualifiers?.length ? { qualifiers } : {}),
      relationshipType,
      roles,
    };
    const key = relationKey(relation);
    if (seen.has(key)) {
      refusals.push({ detail: `Structure ${index + 1} duplicated an earlier relation.`, reason: "duplicate" });
      continue;
    }
    seen.add(key);

    const semanticProcedure = proceduralObject({
      grounded,
      index,
      model: input.model,
      relation,
    });
    if (family === "procedural_algorithmic" && !semanticProcedure) {
      refusals.push({
        detail: `Structure ${index + 1} claimed a procedure without two or more consecutively ordered step roles.`,
        reason: "malformed-structure",
      });
      continue;
    }
    const object: KnowledgeObject = semanticProcedure ?? {
      derivation: "model-prose",
      extractionVersion: SEMANTIC_EXTRACTION_VERSION,
      id: `semantic:${index + 1}`,
      provenance: {
        extractor: SEMANTIC_EXTRACTION_VERSION,
        lane: "model-prose",
        model: input.model,
        schemaVersion: SEMANTIC_SCHEMA_VERSION,
      },
      semanticRelations: [relation],
      sourceAnchors: grounded.anchors,
      statement: grounded.assertions[0]!,
      type: "conceptual_system",
      unanchoredProvenance: [],
    };
    if (!object.identityKey) object.identityKey = knowledgeIdentityKey(object);
    objects.push(object);
  }
  return { objects, refusals };
}
