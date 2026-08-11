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
  /** What this pair belongs with, used ONLY to group items during first encoding. Removed once
   *  initial learning happens, because grouping is a scaffold — leaving it in place lets the
   *  learner answer from the heading rather than from memory. */
  groupLabel?: string;
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
  /** Set only when `type` is "association". Other types will add their own payloads as they are
   *  built; deliberately not a ten-way union up front, because nine of those shapes would be
   *  guesses written before the interaction that uses them exists. */
  pair?: AssociationPair;
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
  /** One row of a real grid, read as cells. */
  | "table-row";

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
