// What KIND of thing is being learned — and therefore what would count as knowing it.
//
// The mistake this exists to prevent is the one every study app makes: treat all material as
// generic "content", convert it into summaries, flashcards and quizzes, and let the artifact
// decide the pedagogy. That is backwards. "lisinopril ↔ Zestril" and "why ACE inhibition lowers
// blood pressure" are not the same kind of knowledge, cannot be learned the same way, and a
// flashcard is a correct interaction for exactly one of them.
//
// 🔴 THE UNIT IS THE KNOWLEDGE OBJECT, NOT THE DOCUMENT. One paragraph about one drug yields an
// association (its brand name), a classification (its class), a rule (avoid in pregnancy), a
// causal chain (how it lowers blood pressure) and a procedure (how to counsel someone starting
// it). Classifying the DOCUMENT as "pharmacology" and picking one interaction for all of it
// throws away the entire point. So the type lives on the object, and one source passage may
// produce several objects of several types.
//
// 🔴 STRUCTURAL, NEVER SUBJECT-MATTER — the same rule the rest of this codebase runs on. Every
// type below has to read sensibly for a law student, a mechanical engineer and someone learning
// a language. "association" covers a drug and its brand name, a kanji and its reading, a case
// and its holding, and a component and its part number. If a type only makes sense in one
// field, it is the wrong abstraction.

import type { CanonicalSourceAnchor } from "@/lib/sources/source-context";

import type { SourceRef } from "./canvas-model";

/** The ten kinds of knowledge, each of which demands a different cognitive operation.
 *
 *  🔴 METACOGNITION IS DELIBERATELY ABSENT. The brief lists it eleventh, and it is explicitly
 *  "not subject matter itself" — it is what we track ABOUT the learner (latency, assistance,
 *  repeated confusion, confidence). Putting it in this union would make it something a passage
 *  could BE, and the first extraction pass would start labelling paragraphs "metacognitive".
 *  It belongs to learner state; see canvas-events.ts and canvas-retention.ts. */
export type KnowledgeType =
  /** Arbitrary or semi-arbitrary mappings. There is usually nothing to explain — the work is
   *  making the link retrievable, in both directions, without confusing neighbours. */
  | "association"
  /** Telling neighbouring categories apart. The difficulty is never one label; it is knowing
   *  which feature discriminates. */
  | "classification"
  /** Chains of dependency, where the goal is to simulate the system rather than recite arrows. */
  | "causal"
  /** Executing a sequence of operations under defined rules — the work is shown, not selected. */
  | "algorithm"
  /** Many interacting parts, learned by building a model at low resolution and refining it. */
  | "conceptual_system"
  /** What to do, in what order, under what conditions — including exceptions and stop points. */
  | "procedure"
  /** Relationships in space that prose represents badly. */
  | "spatial"
  /** Change across time, where each stage transforms the last. */
  | "temporal"
  /** When a rule applies, and — the part that is actually hard — when it does not. */
  | "conditional_rule"
  /** No single memorised answer: prior knowledge combined into something new. */
  | "synthesis";

export const KNOWLEDGE_TYPES: readonly KnowledgeType[] = [
  "association",
  "classification",
  "causal",
  "algorithm",
  "conceptual_system",
  "procedure",
  "spatial",
  "temporal",
  "conditional_rule",
  "synthesis",
];

/** The cognitive operation an interaction asks the learner to perform.
 *
 *  🔴 OPERATIONS, NOT MODES. Not "Flashcard Mode", "Quiz Mode", "Notes Mode" — those are
 *  artifact categories inherited from study software, and building them as product primitives
 *  freezes the pedagogy into furniture. The canvas can be a diagram for twenty seconds, then a
 *  spoken retrieval, then a handwritten calculation. There is no requirement that it look the
 *  same between two operations, because the cognitive task changed. */
export type CognitiveOperation =
  | "inspect"
  | "retrieve"
  | "classify"
  | "distinguish"
  | "predict"
  | "explain"
  | "calculate"
  | "reconstruct"
  | "locate"
  | "sequence"
  | "apply"
  | "diagnose"
  | "synthesize"
  | "revise";

/** The two halves of an association, and which way round it is being asked.
 *
 *  "forward" is cue → response as the material presents it; "backward" is the reverse. Both are
 *  stored because knowing one direction is genuinely not knowing the other — someone who can
 *  produce the brand name from the generic often cannot do the reverse, and a system that only
 *  ever tests one way will report mastery it has never observed. */
export type AssociationDirection = "forward" | "backward";

export interface AssociationPair {
  id: string;
  /** The side the material leads with. */
  left: string;
  right: string;
  /**
   * What the SOURCE called the column each side sat in — `generic`, `brand`, `case`, `holding`.
   *
   * 🔴 THIS IS WHAT MAKES AN OBJECTIVE MEAN SOMETHING. Without it, all a later capability can say
   * is "the left one" and "the right one", which are properties of how a document was typeset. A
   * glossary printing `Generic | Brand` and a revision sheet printing `Brand | Generic` teach the
   * identical pair, and a capability defined positionally would mean OPPOSITE things in the two
   * files while carrying the same name. The learner is not asked to produce "the right-hand
   * column"; they are asked to produce the brand.
   *
   * Absent when the grid named no columns — a real and common case, and one that must stay
   * distinguishable rather than being filled in with a position. */
  leftRole?: string;
  rightRole?: string;
  /** What this pair belongs with, used ONLY to group items during first encoding. Removed once
   *  initial learning happens, because grouping is a scaffold — leaving it in place lets the
   *  learner answer from the heading rather than from memory. */
  groupLabel?: string;
}

/**
 * One end of a causal edge.
 *
 * 🔴 A NODE, SO EDGES CAN SHARE ONE. `A → B` and `B → C` both mint a node for B, and because the
 * key is derived from B's own text they are the SAME key — which is what lets a mechanism be
 * assembled later by joining edges, rather than being stored now as one opaque paragraph nobody can
 * query, re-order, or discover a learner holds half of.
 *
 * 🔴 AND THE KEY IS NORMALISED TEXT, NOT A CONCEPT. "protein function" and "the function of the
 * protein" are two nodes today. That is a stated limitation rather than an oversight: merging them
 * needs a real entity-identity layer, and having a model declare two phrasings equivalent would be
 * a guess that silently welds unrelated mechanisms together. A missed merge is recoverable; a false
 * one asserts a chain the source never made.
 */
export interface CausalNode {
  /** The author's own words. */
  text: string;
  /** Normalised form — used for identity, and for joining one edge to the next. */
  key: string;
}

/**
 * What the source claims the cause DOES to the effect.
 *
 * 🔴 EACH ONE GROUNDED IN LANGUAGE ACTUALLY PRESENT IN THE CORPUS — not an ontology written in
 * advance. Measured 2026-08-12 over 1,231 readable units: `leads to`/`results in`/`produces`;
 * `increases`/`raises`; `reduces`/`lowers`/`ablates`; `inhibits`/`blocks`/`suppresses`;
 * `prevents`/`averts`; `allows`/`enables`/`permits`. Add another when a real document needs one.
 *
 * 🔴 CAUSALITY AND POLARITY ARE DIFFERENT AXES, which is why this is not `increase | decrease`.
 * "Receptor activation enables a downstream process" and "drug X inhibits enzyme Y" are causal
 * claims carrying no polarity, and forcing them onto a polarity scale would invent one.
 *
 * 🔴 `inhibits` AND `prevents` ARE SEPARATE BECAUSE THE CORPUS USES THEM SEPARATELY. Measured: the
 * object of `inhibit` is a mechanism — a protein, a conversion, reuptake, an ion channel — while
 * the object of `prevent` is an outcome someone did not want. "Drug inhibits enzyme" and "drug
 * prevents stroke" are different claims, and collapsing them to fit a smaller enum would be exactly
 * the semantic corruption this file refuses everywhere else. When the distinction is genuinely
 * unclear in a passage, the extractor abstains rather than picking one.
 */
export type CausalRelationKind =
  /** Brings about — leads to, results in, produces. */
  | "causes"
  | "increases"
  | "decreases"
  /** Makes possible without producing on its own — allows, permits. */
  | "enables"
  /** Acts against a MECHANISM — inhibits, blocks, suppresses. */
  | "inhibits"
  /** Stops an OUTCOME from occurring — prevents, averts. */
  | "prevents";

/**
 * One DIRECTED causal edge, exactly as the source asserted it.
 *
 * 🔴 ONE EDGE, NEVER A MECHANISM. `A → B → C` is two objects sharing node B. Storing the chain as a
 * single object would make it one indivisible piece of knowledge, so nothing could ever discover
 * that a learner holds the first link and not the second — which is the whole reason for modelling
 * causality apart from prose.
 */
export interface CausalRelation {
  cause: CausalNode;
  effect: CausalNode;
  relation: CausalRelationKind;
  /**
   * The source DENIED the relationship.
   *
   * 🔴 ITS OWN FIELD, AND PART OF IDENTITY. "may not lead to a different amino acid" and "leads to
   * a different amino acid" are opposite claims about the same two nodes. Without this they collapse
   * into one object and a learner is drilled on the negation of what the document says.
   */
  negated: boolean;
  /**
   * The source's own hedge OR bounding condition, verbatim.
   *
   * 🔴 MODALITY IS PART OF THE CLAIM. "X causes Y" and "X may cause Y" are different assertions,
   * and flattening the second into the first states something the author declined to state. It is
   * therefore part of identity too. Absent means the source asserted it plainly — never that
   * nobody looked.
   *
   * 🔴 AND A BOUNDING CONDITION IS MODALITY, NOT DECORATION. Measured 2026-08-12: the model
   * preserved epistemic hedges like "may" and dropped every condition that says WHEN a relationship
   * holds — "until the enzyme saturates", "under cyclic load", "when voltage is held constant".
   * Dropping one does not lose detail, it STRENGTHENS the claim into a general law:
   *
   *     "more substrate increases reaction rate"                     an overgeneralised rule
   *     "more substrate increases reaction rate until saturation"    what the source said
   *
   * A learner taught the first will get the second wrong, and Nemesis will have taught them that.
   */
  qualifier?: string;
  /**
   * Which KIND of qualification it is.
   *
   * 🔴 ONE FIELD WOULD LOSE A DISTINCTION CANVAS NEEDS. "may increase heart rate" and "increases
   * heart rate during exertion" are both qualified, but the first is uncertainty about whether the
   * relationship holds and the second is a scope in which it definitely does. A later interaction
   * that wants to test "when does this apply?" can only find the second.
   *
   * Deliberately a label rather than a parsed condition — this is not a logic system, and the
   * source's own words remain the record.
   */
  qualifierKind?: "epistemic" | "conditional";
  /**
   * The verb the document actually used — "leads to", "inhibits", "ablates".
   *
   * 🔴 KEPT BECAUSE THE NORMALISED KIND IS A LOSSY READING OF IT. `relation` is what identity and
   * composition run on; this is what the author wrote. When a later pass decides the six kinds were
   * too coarse, the evidence for re-deriving them is here rather than gone — and an audit asking
   * "why does Nemesis call this `inhibits`?" has an answer that is not a hash.
   */
  sourceVerb?: string;
  /**
   * The exact passage that asserts this edge, verbatim.
   *
   * 🔴 SOURCE TRUTH AND NORMALISED REPRESENTATION ARE DIFFERENT THINGS AND BOTH ARE REQUIRED. The
   * normalised edge exists so two documents can converge and so mechanisms can compose; this exists
   * so the claim can be checked against the document by eye. Together they answer the only question
   * that matters when a learner disputes something: "Nemesis believes A may cause B because THIS
   * passage said THAT." A model-extracted edge with no assertion behind it is an assertion by us.
   */
  assertion: string;
}

/**
 * Which system produced a knowledge object, and under what rules.
 *
 * 🔴 KNOWLEDGE-GENERATION PROVENANCE, NEVER LEARNER COGNITION. Nothing here may reach
 * `learner_evidence`: a model's confidence that a passage asserts something is a fact about our
 * extractor, and storing it beside a learner's demonstration would let one be read as the other.
 * The learner's uncertainty, the extractor's uncertainty and the parser's limitations are three
 * different kinds of not-knowing, and collapsing any two of them into a generic "unknown" is how a
 * system starts filling gaps with confidence.
 *
 * 🔴 AND IT EXISTS SO A CORPUS CAN BE REGENERATED SAFELY. When the prompt or the model changes,
 * "which objects came from the old extractor?" must be answerable by query rather than by guessing
 * from dates — otherwise the only safe migration is deleting everything.
 */
export interface ExtractionProvenance {
  /** The extractor and its rules version, e.g. "causal/1". */
  extractor: string;
  /** Which lane produced it — a deterministic grid reader, a model over prose. */
  lane: KnowledgeDerivation;
  /** The model, when one was involved. Absent for deterministic lanes. */
  model?: string;
  /** The version of the response schema the model was held to. */
  schemaVersion?: string;
}

/** One learnable thing, of one type.
 *
 *  Sits BETWEEN the canvas's coarse objectives (`CanvasConcept`) and the prompts that test them:
 *  a concept is "ACE inhibitors", and the knowledge objects under it are the association, the
 *  rule and the causal chain, each of which is learned and mastered separately. */
export interface KnowledgeObject {
  id: string;
  type: KnowledgeType;
  /** One line naming what is to be known. Always present, whatever the type — it is what the
   *  objectives map and any diagnosis can show without understanding the payload. */
  statement: string;
  /** The coarse objectives this belongs to, so existing diagnosis keeps working unchanged. */
  conceptIds?: string[];
  /** Set only when `type` is "association". Other types add their own payloads as they are built;
   *  deliberately not a ten-way union up front, because eight of those shapes would be guesses
   *  written before the interaction that uses them exists. */
  pair?: AssociationPair;
  /** Set only when `type` is "causal". One directed edge — see `CausalRelation`. */
  relation?: CausalRelation;
  /** Where this sits in the CANVAS — `{sourceId, excerptId}`, resolving against one canvas's own
   *  excerpt list. Canvas-local, and meaningless in any other canvas. */
  sourceRefs?: SourceRef[];
  /** Where this sits in the SOURCE — durable, quote-based, still valid after the document is
   *  reparsed by a better parser.
   *
   *  🔴 BOTH LOCATOR FIELDS ARE HERE AND THEY ARE NOT INTERCHANGEABLE. A knowledge object outlives
   *  the canvas that first met it, so what it stores has to mean something to a canvas that has
   *  never seen that one — which `sourceRefs` does not. Converting between them is an explicit
   *  step (`groundCanonicalAnchor`), never an assumption that a block id is an excerpt id. */
  sourceAnchors?: CanonicalSourceAnchor[];
  /** Content-derived identity, stable across documents and sessions. See knowledge-identity.ts:
   *  this is what lets a second canvas recognise knowledge a first one already taught. */
  identityKey?: string;
  /**
   * WHAT RELATIONSHIP the two halves stand in — part of identity, not decoration.
   *
   * 🔴 IDENTICAL STRINGS CAN PARTICIPATE IN DIFFERENT RELATIONSHIPS, so two objects with the same
   * pair are not necessarily the same knowledge. Without this, a glossary saying `X — its legal
   * definition` and a parts list saying `X — its supplier` would collapse into one object and a
   * learner would be credited with knowing something they were never asked.
   *
   * 🔴 AND IT IS DERIVED, NOT UNDERSTOOD. This is whatever the source called its own columns,
   * normalised — `generic|brand`, `term|definition`. It is NOT a semantic taxonomy: nothing here
   * knows that a "brand" is a trade name, and inferring that would need exactly the subject-matter
   * knowledge this codebase refuses to encode. The honest cost is that a table with no header row
   * cannot converge with one that has headers, because only one of them stated the relationship.
   */
  relationKind?: string;
  /** HOW this object was derived.
   *
   *  🔴 CARRIED FOR HONESTY, NOT BOOKKEEPING. "3 associations extracted" reads as "3 table rows
   *  recovered" unless the object itself says otherwise — including to whoever later reads a
   *  report and concludes the table lane is working. */
  derivation?: KnowledgeDerivation;
  /** Which version of the extractor produced this, so a corpus extracted under old rules can be
   *  found and redone rather than silently mixed in with a newer one. */
  extractionVersion?: string;
  /** The full generation record — which system, which lane, which model, which schema.
   *  🔴 Never learner cognition. See `ExtractionProvenance`. */
  provenance?: ExtractionProvenance;
}

/**
 * The evidence an extracted object actually rests on.
 *
 * 🔴 THERE IS ONLY ONE, AND THE ABSENCE OF A PROSE DERIVATION IS A MEASURED DECISION RATHER THAN
 * AN UNFINISHED FEATURE. Across every structured document in production on 2026-08-11, 38 of 219
 * lines matched an obvious "X: Y" or "X — Y" shape, and hardly any of them were a pair worth
 * learning: "Memphis: 102" is a room number, "Friday Link: https://…" is a URL, and a grading
 * table that had been flattened into prose produced "93 – 100 A 77 – 79.99 C+ 90 – 92.99 A-". A
 * flattened schedule was worse than unstructured — it was REORDERED, its columns interleaved word
 * by word ("3.1.1, Active 3.2.8, learning: 3.2.9, …"). An extractor reading that would mint dozens
 * of confident, useless objects and then drill a student on room numbers.
 *
 * So a delimiter is not evidence of an association. A grid is.
 */
export type KnowledgeDerivation =
  /** One row of a real grid, read as cells. Deterministic. */
  | "table-row"
  /** A model reading structured prose under a strict abstain-first contract.
   *
   *  🔴 THE FIRST LANE WHERE A MODEL DECIDES WHAT KNOWLEDGE EXISTS, which is why it is named
   *  rather than folded into the one above. Measured 2026-08-12: trigger-word matching over this
   *  corpus was 14% precise, so a deterministic prose lane was not an option — but a model-derived
   *  object must be distinguishable from a grid-derived one for ever, because they carry different
   *  risk and only one of them can be re-derived by reading the document. */
  | "model-prose";

/** What a learner produced on one association attempt.
 *
 *  🔴 THIS IS EVIDENCE, and it is stored with their actual words. `correct` is a derived
 *  convenience; `said` is the record. A drill that kept only a boolean could never afterwards
 *  discover that every wrong answer for losartan was the answer for valsartan — which is the
 *  single most useful thing in this file. */
export interface AssociationAttempt {
  pairId: string;
  direction: AssociationDirection;
  /** Exactly what they typed, said or wrote. */
  said: string;
  correct: boolean;
  /** They explicitly gave up rather than producing something. Distinct from a wrong answer:
   *  surrendering is honest and tells us nothing about what they confused it WITH. */
  admitted?: boolean;
  at: string;
  tookMs?: number;
  via?: "typed" | "spoken" | "written";
}

/** Which interaction this kind of knowledge needs first.
 *
 *  🔴 The renderer does not decide pedagogy. This does, and the canvas renders whatever it
 *  returns. Only "association" is implemented end to end so far; the rest name the operation
 *  the brief specifies so that the mapping is written down and reviewable before each is built
 *  — and so nothing quietly falls back to a quiz. */
export function openingOperation(type: KnowledgeType): CognitiveOperation {
  switch (type) {
    case "association":
      return "retrieve";
    case "classification":
      return "classify";
    case "causal":
      return "predict";
    case "algorithm":
      return "calculate";
    case "conceptual_system":
      return "explain";
    case "procedure":
      return "apply";
    case "spatial":
      return "locate";
    case "temporal":
      return "sequence";
    case "conditional_rule":
      return "distinguish";
    case "synthesis":
      return "synthesize";
  }
}

/** Does this operation require the learner to PRODUCE something?
 *
 *  The universal principle: prefer speaking, typing, writing, drawing and arranging over
 *  passive reveal. Recognition is only the right target when discrimination is itself the
 *  objective — which is why `classify` and `distinguish` are the two that may legitimately use
 *  a choice format, and everything else must not. */
export function requiresProduction(operation: CognitiveOperation): boolean {
  return operation !== "inspect" && operation !== "classify" && operation !== "distinguish";
}
