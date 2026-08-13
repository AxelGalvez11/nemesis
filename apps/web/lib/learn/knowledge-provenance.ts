// How Nemesis knows a thing — the two questions the provenance set exists to answer.
//
// 🔴 THE SET IS STORED IN TWO FIELDS AND READ THROUGH ONE PAIR OF FUNCTIONS, WHICH IS THE WHOLE
// DESIGN. Anchored ways of knowing live in `sourceAnchors`; unanchored ones in
// `unanchoredProvenance`. They are disjoint by construction — an anchored way of knowing cannot be
// expressed in the unanchored list and vice versa — so the two collections cannot contradict each
// other. The alternative was one explicit list of provenance records, which reads more directly and
// would have duplicated every anchor into a second collection free to drift out of step with the
// first. This codebase has paid for two hand-maintained lists disagreeing more than once.
//
// 🔴 CONSUMERS MUST ASK THESE FUNCTIONS RATHER THAN READING EITHER FIELD. A consumer that checks
// `unanchoredProvenance.includes("model")` to decide whether to show a citation gets it wrong the
// moment a claim is known BOTH ways: Nemesis knew it from model knowledge and later found it in the
// learner's Lecture 4, and that claim has a real excerpt to show.

import type { KnowledgeObject, UnanchoredProvenance } from "./knowledge-types";

/** One way Nemesis knows a claim. */
export type WayOfKnowing =
  | { kind: "model" }
  | { kind: "source"; sourceId: string };

/**
 * May a citation marker render for this claim?
 *
 * 🔴 THIS IS THE QUESTION THE `¹` IS ALLOWED TO ASK, AND IT IS ABOUT ANCHORS, NEVER ABOUT WHETHER
 * MODEL KNOWLEDGE WAS INVOLVED. The marker promises "here is the excerpt this came from". A claim
 * Nemesis first knew from model knowledge and later grounded in a real source HAS such an excerpt,
 * and suppressing its marker would hide a citation the learner is entitled to follow.
 *
 * The converse is the one that matters more: a claim with no anchor must never show a marker,
 * because a fabricated source is worse than no marker at all.
 */
export function hasGroundableAnchor(knowledge: Pick<KnowledgeObject, "sourceAnchors">): boolean {
  return (knowledge.sourceAnchors?.length ?? 0) > 0;
}

/**
 * Every way Nemesis knows this claim — what a Sources surface should list.
 *
 * 🔴 ACCUMULATING, NEVER EXCLUSIVE. Grounding a model claim ADDS a source; it does not delete the
 * fact that Nemesis also knew it independently. A learner asking "how do you know this?" about a
 * claim that is both model-known and in their Lecture 4 should be told both, and telling them only
 * the tidier half is a false answer to a question about trust.
 */
export function waysOfKnowing(
  knowledge: Pick<KnowledgeObject, "sourceAnchors" | "unanchoredProvenance">,
): WayOfKnowing[] {
  const ways: WayOfKnowing[] = (knowledge.unanchoredProvenance ?? []).map(
    (kind: UnanchoredProvenance) => ({ kind }) as WayOfKnowing,
  );
  for (const anchor of knowledge.sourceAnchors ?? []) {
    ways.push({ kind: "source", sourceId: anchor.sourceId });
  }
  return ways;
}

/**
 * Is this claim honestly accounted for at all?
 *
 * 🔴 THE REFUSAL MOVED FROM "NO SOURCE" TO "NO HONEST PROVENANCE", AND THIS IS THAT PREDICATE.
 * `canvas-knowledge.ts` used to refuse any canvas without a durable library source, which read a
 * missing SOURCE as a missing IDENTITY and closed the product's primary entrance: a learner who
 * types a topic got material with nothing to do. A topic-first claim has a provenance — model
 * knowledge — so it is no longer refused.
 *
 * What is still refused is a claim with NO way of knowing at all. That is not a topic-first canvas;
 * it is an object nobody can say anything true about, and minting it would put a claim in a real
 * learner's tables with no account of where it came from.
 */
export function hasHonestProvenance(
  knowledge: Pick<KnowledgeObject, "sourceAnchors" | "unanchoredProvenance">,
): boolean {
  return waysOfKnowing(knowledge).length > 0;
}
