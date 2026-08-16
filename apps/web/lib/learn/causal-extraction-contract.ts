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

/**
 * The sampling temperature this lane MUST be called with.
 *
 * 🔴 NOT A TUNING PREFERENCE — IT IS WHAT MAKES A ZERO-TOLERANCE CRITERION CHECKABLE. Measured
 * 2026-08-12: the identical prompt over the identical 78 passages flipped 12.8% of them between two
 * runs at the valve's default sampling. One run reported 0 fabricated edges and the next reported 3.
 * A criterion like "never invent a causal claim" cannot be verified against a sampled result, and a
 * benchmark that moves on its own cannot tell a real improvement from noise — for a while it told
 * me a prompt change had fixed something that sampling had merely hidden.
 *
 * At 0 the same 78 passages agreed 78/78 across two runs.
 *
 * 🔴 THE PRODUCTION LANE MUST SEND THIS TOO. Reading a document is not a creative task, and an
 * extractor that answers differently on a re-run would mint knowledge objects that appear and
 * disappear between imports of the same file.
 *
 * 🔴🔴 AND IT DOES NOT — THIS CONSTANT HAS ZERO CALLERS, AND THE TRANSPORT CANNOT CARRY IT.
 * Measured 2026-08-16. `canvas-api.ts`'s `ask()` sends only `decision`, and `postChatCompletion`
 * builds its payload from `messages`, `model`, `reasoning_effort`, `stream` and `tools` — there is
 * no temperature field anywhere on the door, so the production causal lane has always run at the
 * valve's default sampling.
 *
 * The cost is not theoretical. The identical prompt over the identical production lecture returned
 * 6, 7, 10, 16, 26 and 37 edges across runs, and once returned `{"relations":[]}` three times in a
 * row.
 *
 * 🔴 SENDING IT IS NOT THE FIX, WHICH IS WHY NOTHING HERE WAS WIRED UP. Passing `temperature`
 * straight to the valve was measured too: at temperature 0 the same prompt still returned 33, 0 and
 * 42 edges on three consecutive runs. The valve either strips the field or the provider ignores it,
 * and the valve is deployed outside this repository and has diverged from this source before. So
 * threading `temperature` through `ChatCompletionOptions` would LOOK like a fix and change nothing —
 * the same dead constant one layer down. This needs the valve's owner, and it is escalated rather
 * than papered over. `scripts/causal-temperature.ts` is the reproduction.
 */
export const CAUSAL_EXTRACTION_TEMPERATURE = 0;

export const CAUSAL_RELATION_KINDS: readonly CausalRelationKind[] = [
  "causes",
  "contributes_to",
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
- relation: exactly one of causes | contributes_to | increases | decreases | enables | inhibits | prevents
- negated: true when the passage DENIES the relationship ("does not cause", "produces no increase")
- qualifier: the passage's own hedge OR bounding condition, verbatim, or null
- qualifierKind: "epistemic" for a hedge, "conditional" for a scope, or null when qualifier is null
- verb: the word or phrase the passage used to assert it, verbatim
- quote: the exact sentence or clause from the passage that asserts it, copied character for character

A DENIED relationship is a relationship. "Aspirin does not prevent myocardial infarction" and "price
controls do not increase supply" are knowledge worth keeping — return them with negated: true, the
same relation the passage names, and the passage's own words. Do NOT abstain merely because the
assertion is negative. Only abstain if the denial itself is not stated in the passage: never infer a
negation from surrounding context.

NEGATION AND MODALITY ARE INDEPENDENT, and a passage can carry both. "may not lead to a different
outcome" is negated: true AND qualifier: "may" — a hedged denial, not a flat one. Recording only the
negation states the author was certain when they were not; recording only the hedge states the
opposite of what they said. Both fields, every time they are both present.

The qualifier is anything the passage uses to limit the claim, and there are two kinds:
- epistemic — how sure the author is: "may", "can", "likely", "generally", "typically"
- conditional — WHEN the relationship holds: "under cyclic load", "when voltage is held constant",
  "at constant volume", "during exertion", "in the presence of a moderator", "until the mixture
  reaches equilibrium"
Both must be preserved verbatim. Dropping a condition does not lose a detail, it changes the claim
into a general law the passage never stated — "compression raises temperature" is a different and
wrong thing from "compression raises temperature at constant volume".

Choosing the relation:
- causes          — brings about on its own: leads to, results in, produces
- contributes_to  — ONE FACTOR AMONG OTHERS: "contributed to", "was a factor in", "helped drive",
                    "played a part in". This is not a weaker version of causes and not a hedge —
                    it is a confident claim about a partial role, and calling it "causes" asserts
                    that this factor alone explains the outcome.
- increases / decreases — states the direction the effect moves
- enables         — makes possible without producing on its own: allows, permits, lets
- inhibits        — reduces or works against something without necessarily stopping it
- prevents        — stops something from happening: prevents, blocks, averts
The line between inhibits and prevents is a soft one, and the verb you record matters more than
which of the two you pick. If the passage does not settle which relation it means at all, abstain.

ABSTAIN — return no relationship — when any of these is true:
- it is a question rather than an assertion
- it is a heading, a title, a caption, or a description of a picture
- it states only that two things occur together, correlate, vary together or trend together —
  "Y rises with X", "Y varies with X", "Y is associated with X", "countries with more X tend to
  have more Y". Co-variation is not a causal assertion, and nothing you know about the subject may
  be used to upgrade it into one. Only extract if the passage separately says one drives the other
- it states only that one thing happened after another
- "because" introduces how we KNOW something rather than what brought it about
- the cause or the effect is not present in the passage — including when it is a pronoun such as
  "this", "that" or "it", or a phrase pointing back at something outside the passage such as
  "these factors", "the above" or "such changes"
- the passage is fragmentary and you cannot tell which part is the cause
- the passage gives BOTH directions and does not settle which — "it can raise or lower the value
  depending on the setting" states no direction, and choosing one invents a claim
- the relationship does not belong to the subject being studied
- you are unsure

HYPOTHETICALS. A speculative example is not knowledge; a general conditional rule is. The test is
whether the passage asserts that the relationship HOLDS, or merely imagines one instance of it:
- "Suppose the temperature were doubled; the rate would roughly quadruple." — imagining a case,
  abstain
- "If the central bank were to cut rates, investment would likely rise." — a speculation about one
  possible future, abstain
- "When the load exceeds the yield point, deformation becomes permanent." — a general rule stated
  with a condition, extract it with that condition as the qualifier
"If/when X, then Y" is extractable when the passage presents it as how things work, not as a
scenario being entertained.

WHOSE KNOWLEDGE IS IT. The last abstention rule is about ownership, not tone. Ask: is this
relationship part of what someone is studying, or is it a rule about how a course, a platform, a
process or an institution treats a person? Judge the relationship, not whether the wording sounds
bureaucratic.
- "Missing two sessions leads to withdrawal from the module" — about the course, abstain
- "Continued poor performance may result in additional required academic support" — about how the
  course responds to a student, abstain
- "Failure to torque the fasteners may result in rejection of the warranty claim" — a commercial
  consequence for a person, not a fact about fasteners, abstain
- "Filing after the limitation deadline results in dismissal of the claim" — substantive law, and
  someone is studying it, extract it
- "Under-torquing the bolt allows the joint to loosen under vibration" — a fact about the
  mechanism, extract it

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
  qualifierKind?: unknown;
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
  | "pronoun-endpoint"
  /** The quote denies the relationship but the edge came back positive — the stored claim would be
   *  the opposite of the document. 🔴 One-way only; nothing here infers a negation from absence. */
  | "negation-dropped";

export interface ValidatedEdges {
  relations: CausalRelation[];
  rejected: { reason: EdgeRejection; detail: string }[];
}

/** Endpoints that resolve to nothing outside their sentence. */
const PRONOUNS = new Set([
  "this", "that", "it", "these", "those", "they", "them", "he", "she", "we", "you",
  "the effect", "the result", "the above", "the following",
]);

/** Explicit denial, as a passage writes one.
 *
 *  🔴 USED ONLY TO CATCH A DROPPED NEGATION, NEVER TO ADD ONE. Matching this does not make an edge
 *  negative; failing to match it does not make an edge positive. It answers exactly one question:
 *  did the model return a positive edge from a quote that plainly denies it?
 *
 *  🔴🔴 TWO HOLES IN THIS PATTERN PUT REVERSED CLAIMS IN THE KEPT SET, FOUND BY HAND-CHECKING REAL
 *  OUTPUT (2026-08-16, the owner's pharmacogenomics lecture, 2 of 15 kept edges):
 *
 *    1. `\bn't\b` COULD NEVER MATCH A CONTRACTION. `\b` requires a word boundary before `n`, and in
 *       "doesn't" the `n` is preceded by `s` — both word characters, so no boundary exists. It never
 *       fired on doesn't / don't / isn't / won't / can't in the entire life of this lane. The
 *       lecture's "it doesn’t affect protein structure" was stored as protein structure being
 *       AFFECTED. The apostrophe is also typographic (’) in real documents, not the ASCII one.
 *    2. MODAL NEGATION WAS ABSENT. Only do/did/will/would/is/are were listed, so "may not",
 *       "might not", "could not" and "should not" all read as assertions. The lecture's "a change in
 *       the last (third) nucleotide ... may not lead to a different insertion of amino acid" — the
 *       wobble rule — was stored as the exact opposite of what it teaches. The contract's own prompt
 *       discusses "may not lead to" as the worked example of a hedged denial, so the instruction
 *       anticipated this and only the safety net was missing.
 *
 *  Both were stored as positive causal claims a learner would then be drilled on and graded against.
 *  Widened here, never in the other direction: this can only ever cause MORE edges to be refused,
 *  which is the safe side of a guard whose whole job is refusing.
 */
const DENIAL =
  /\b(?:do(?:es)?|did|is|are|was|were|has|have|had|will|would|can|could|may|might|must|shall|should|need)\s+not\b|\bcan\s?not\b|\bnever\b|\bfails?\s+to\b|\bno\s+(?:further|additional|significant)?\s*\w*(?:increase|decrease|change|effect)\b|n['’]t\b/i;

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

    // 🔴 THE DENIAL CHECK, AND IT ONLY EVER FIRES ONE WAY. When the quote plainly denies the
    // relationship but the edge came back positive, the stored claim would be the OPPOSITE of the
    // document — the single worst output this lane can produce. It is not repaired into a negation,
    // because a model that misread the polarity may have misread more than the polarity.
    //
    // 🔴 AND THERE IS NO CHECK IN THE OTHER DIRECTION. Nothing here concludes a claim is negative
    // because the quote lacks a denial: negation is asserted by the source or not at all, never
    // inferred from what is missing.
    if (edge.negated !== true && DENIAL.test(quote)) {
      reject("negation-dropped", "the quote denies the relationship but the edge came back positive");
      continue;
    }

    const qualifier = typeof edge.qualifier === "string" && edge.qualifier.trim() ? edge.qualifier.trim() : undefined;
    const verb = typeof edge.verb === "string" && edge.verb.trim() ? edge.verb.trim() : undefined;
    const kind = edge.qualifierKind === "epistemic" || edge.qualifierKind === "conditional"
      ? edge.qualifierKind
      : undefined;
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
      ...(qualifier && kind ? { qualifierKind: kind } : {}),
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
    // 🔴 TWO DIFFERENT PROVENANCES, BOTH CORRECT, AND THIS IS THE CLEAREST PLACE TO SEE WHY THEY
    // ARE NOT ONE FIELD. `provenance.lane` is `model-prose`: a MODEL read this relation out of the
    // document. `sourceProvenance` is `sourced`: the claim nonetheless traces to a real library
    // source, and its anchors resolve into that source's text.
    //
    // Collapsing them would mislabel every model-read claim as model KNOWLEDGE and suppress a
    // citation that genuinely has an excerpt behind it.
    provenance: {
      extractor: CAUSAL_EXTRACTION_VERSION,
      lane: "model-prose",
      model: input.model,
      schemaVersion: CAUSAL_SCHEMA_VERSION,
    },
    unanchoredProvenance: [],
    relation,
    sourceAnchors: input.anchors,
    // Presentation only — never part of identity. See `identityBasis`.
    statement: `${relation.cause.text} — ${arrow} — ${relation.effect.text}`,
    type: "causal",
  };
}
