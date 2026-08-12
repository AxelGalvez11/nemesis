// What a model is allowed to say about causality, and what is done with it.
//
// 🔴 THE MODEL IS READING, NOT REASONING. It reports relationships a passage EXPLICITLY ASSERTS.
// It is not asked whether a relationship is true, plausible, or known to the field — only whether
// this text says it. A model that supplies its own knowledge of pharmacology would produce edges
// the document never made, and a learner would then be drilled on our beliefs while being told they
// came from their lecture.
//
// 🔴 ABSTAINING IS A CORRECT ANSWER AND THE PROMPT SAYS SO REPEATEDLY. Measured on the real corpus:
// trigger-word matching was 14% precise, and the false positives were not exotic — questions,
// headings, figure descriptions, course policy, ranges written with arrows, and "because" used to
// explain how we KNOW something rather than what caused it. Every one of those is a plausible edge
// to a model that wants to be helpful.
//
// 🔴 AND THE FAILURE MODES ARE NOT EQUAL. A missed edge costs coverage. A reversed or invented one
// teaches something false. The validator below therefore rejects rather than repairs: an edge whose
// quote is not in the source, or whose endpoints are not in its quote, is dropped and counted.

import { causalNodeKey, normalizeForIdentity } from "./knowledge-identity";
import type { CausalRelation, CausalRelationKind, KnowledgeObject } from "./knowledge-types";

/** Bumped whenever the prompt or the response shape changes what comes back for the same text.
 *  Stored on every object, so a corpus extracted under older rules can be found and regenerated. */
export const CAUSAL_EXTRACTION_VERSION = "causal/1";
export const CAUSAL_SCHEMA_VERSION = "causal-edges/1";

export const CAUSAL_RELATION_KINDS: readonly CausalRelationKind[] = [
  "causes",
  "increases",
  "decreases",
  "enables",
  "inhibits",
  "prevents",
];

/**
 * The instruction, deliberately free of subject matter.
 *
 * 🔴 NO WORKED EXAMPLE COMES FROM ONE FIELD. The development corpus is a single pharmacogenomics
 * lecture, so a prompt carrying molecular examples would teach the model that shape and quietly
 * fail on a statute or a control loop. The examples below are abstract or drawn from different
 * disciplines on purpose, and the rules are grammatical rather than topical.
 */
export const CAUSAL_EXTRACTION_PROMPT = `You extract causal relationships that a passage EXPLICITLY ASSERTS.

You are reading, not reasoning. Do not use anything you know about the subject. The only question is
whether THIS TEXT states that one identifiable thing changes, causes, enables, inhibits, prevents,
increases or decreases another identifiable thing.

For each relationship the passage asserts, return:
- cause: the thing acting, quoted from the passage
- effect: the thing changed, quoted from the passage
- relation: exactly one of causes | increases | decreases | enables | inhibits | prevents
- negated: true when the passage DENIES the relationship ("does not cause", "produces no increase")
- qualifier: the passage's own hedge or bounding condition, verbatim, or null
- verb: the word or phrase the passage used to assert it, verbatim
- quote: the exact sentence or clause from the passage that asserts it, copied character for character

Choosing the relation:
- causes     — brings about, leads to, results in, produces
- increases / decreases — states the direction the effect moves
- enables    — makes possible without producing on its own: allows, permits, lets
- inhibits   — acts against a MECHANISM or process: inhibits, blocks, suppresses
- prevents   — stops an OUTCOME from occurring: prevents, averts
If the passage does not settle which of these it means, abstain for that relationship.

ABSTAIN — return no relationship — when any of these is true:
- it is a question rather than an assertion
- it is a heading, a title, a caption, or a description of a picture
- it describes a hypothetical or counterfactual the author is exploring
- it states only that two things occur together, correlate, or trend together
- it states only that one thing happened after another
- "because" introduces how we KNOW something rather than what brought it about
- the cause or the effect is not present in the passage — including when it is only a pronoun
  such as "this", "that" or "it" whose referent is in another sentence
- the passage is fragmentary and you cannot tell which part is the cause
- it is a rule about a course, a class, or a person's conduct — attendance, deadlines for
  coursework, grading, discipline, or academic policy
- you are unsure

Note the distinction in that last rule: a consequence imposed on a STUDENT by a course is not
knowledge. A consequence that is part of the SUBJECT BEING STUDIED is. "Missing two sessions leads
to withdrawal from the module" is course policy — abstain. "Filing after the limitation deadline
results in dismissal of the claim" is substantive law — extract it.

Returning nothing is a correct and common answer. Most passages assert no causal relationship, and a
relationship you are unsure about is worth less than none: a missed relationship costs coverage, an
invented or reversed one teaches somebody something the source never said.

Do not merge several relationships into one. "A leads to B, which leads to C" is two relationships.

Respond with JSON only: {"relations": [...]}. Return {"relations": []} to abstain.`;

/** One relationship as the model returns it, before anything has been checked. */
export interface RawCausalEdge {
  cause?: unknown;
  effect?: unknown;
  relation?: unknown;
  negated?: unknown;
  qualifier?: unknown;
  verb?: unknown;
  quote?: unknown;
}

/** Why a returned edge was thrown away. Counted, never silently dropped — the rate at which a model
 *  fails each of these is the most useful signal about whether it can be trusted at all. */
export type EdgeRejection =
  | "missing-field"
  | "unknown-relation"
  /** The quote the model returned is not in the passage. The strongest signal of fabrication. */
  | "quote-not-in-source"
  /** An endpoint is not inside the quote that supposedly asserts it. */
  | "endpoint-not-in-quote"
  /** Cause and effect are the same thing. */
  | "degenerate"
  /** An endpoint is a bare pronoun, so the edge points at nothing resolvable. */
  | "pronoun-endpoint";

export interface ValidatedEdges {
  relations: CausalRelation[];
  rejected: { reason: EdgeRejection; detail: string }[];
}

/** Endpoints that resolve to nothing outside their sentence. */
const PRONOUNS = new Set([
  "this", "that", "it", "these", "those", "they", "them", "he", "she", "we", "you",
  "the effect", "the result", "the above", "the following",
]);

function contains(haystack: string, needle: string): boolean {
  return normalizeForIdentity(haystack).includes(normalizeForIdentity(needle));
}

/**
 * Keep only what the passage actually supports.
 *
 * 🔴 REJECTS, NEVER REPAIRS. A model that returns an almost-right quote is not corrected into a
 * right one — the whole value of grounding is that the stored assertion is the document's words. An
 * edge that cannot be checked against the source is exactly the edge that must not be stored.
 */
export function validateCausalEdges(input: {
  raw: readonly RawCausalEdge[];
  /** The passage the model was given, verbatim. */
  passage: string;
}): ValidatedEdges {
  const relations: CausalRelation[] = [];
  const rejected: ValidatedEdges["rejected"] = [];
  const reject = (reason: EdgeRejection, detail: string) => rejected.push({ detail, reason });

  for (const edge of input.raw) {
    const cause = typeof edge.cause === "string" ? edge.cause.trim() : "";
    const effect = typeof edge.effect === "string" ? edge.effect.trim() : "";
    const quote = typeof edge.quote === "string" ? edge.quote.trim() : "";
    const relation = typeof edge.relation === "string" ? edge.relation.trim() : "";

    if (!cause || !effect || !quote || !relation) {
      reject("missing-field", "an edge arrived without cause, effect, relation or quote");
      continue;
    }
    if (!CAUSAL_RELATION_KINDS.includes(relation as CausalRelationKind)) {
      reject("unknown-relation", `relation "${relation}" is not one of the six`);
      continue;
    }
    // 🔴 THE FABRICATION CHECK. If the sentence the model says asserts this is not in the passage,
    // the model wrote it — and everything downstream would treat our sentence as the document's.
    if (!contains(input.passage, quote)) {
      reject("quote-not-in-source", "the supporting quote is not in the passage");
      continue;
    }
    if (!contains(quote, cause) || !contains(quote, effect)) {
      reject("endpoint-not-in-quote", "an endpoint is not inside the quote that asserts it");
      continue;
    }
    if (causalNodeKey(cause) === causalNodeKey(effect)) {
      reject("degenerate", "cause and effect are the same thing");
      continue;
    }
    if (PRONOUNS.has(causalNodeKey(cause)) || PRONOUNS.has(causalNodeKey(effect))) {
      reject("pronoun-endpoint", "an endpoint is a pronoun with no referent in the passage");
      continue;
    }

    const qualifier = typeof edge.qualifier === "string" && edge.qualifier.trim() ? edge.qualifier.trim() : undefined;
    const verb = typeof edge.verb === "string" && edge.verb.trim() ? edge.verb.trim() : undefined;
    relations.push({
      assertion: quote,
      cause: { key: causalNodeKey(cause), text: cause },
      effect: { key: causalNodeKey(effect), text: effect },
      // 🔴 ANYTHING OTHER THAN `true` IS NOT A DENIAL. A missing or malformed `negated` must read as
      // "the passage asserted it", never as a hedge toward the negative — the opposite default
      // would silently invert claims a model simply forgot to annotate.
      negated: edge.negated === true,
      relation: relation as CausalRelationKind,
      ...(qualifier ? { qualifier } : {}),
      ...(verb ? { sourceVerb: verb } : {}),
    });
  }

  return { rejected, relations };
}

/** One validated edge, as a knowledge object ready to be identified and stored. */
export function causalKnowledgeFrom(input: {
  relation: CausalRelation;
  unitId: string;
  index: number;
  anchors: KnowledgeObject["sourceAnchors"];
  model: string;
}): KnowledgeObject {
  const { relation } = input;
  const arrow = relation.negated ? `does not ${relation.relation}` : relation.relation;
  return {
    derivation: "model-prose",
    extractionVersion: CAUSAL_EXTRACTION_VERSION,
    id: `${input.unitId}:c${input.index + 1}`,
    provenance: {
      extractor: CAUSAL_EXTRACTION_VERSION,
      lane: "model-prose",
      model: input.model,
      schemaVersion: CAUSAL_SCHEMA_VERSION,
    },
    relation,
    sourceAnchors: input.anchors,
    // Presentation only — never part of identity. See `identityBasis`.
    statement: `${relation.cause.text} — ${arrow} — ${relation.effect.text}`,
    type: "causal",
  };
}
