// Deciding what a learner just demonstrated, and whether any of it deserves a new node.
//
// 🔴🔴 THE INPUT TYPE IS THE SAFEGUARD, NOT A COMMENT ASKING NICELY.
//
// Owner, 2026-09-04: *"make sure documents dropped in dont count as user input, nemesis should
// update from user prompts not documents."*
//
// `LearnerTurn` can hold ONE thing: something the learner themselves wrote or said. There is no
// field for document text, no field for Nemesis's reply, and no field for what was on screen. A
// caller who wants to pass a lecture in has nowhere to put it. That is deliberate: a comment saying
// "do not pass documents" is advice, and a type that cannot carry one is a guarantee.
//
// Why it matters more than it sounds: when somebody drops a pharmacology lecture and asks a
// question, the model's context contains an expert explanation of the whole subject. An extractor
// reading that context would conclude the learner knows all of it, and would be confidently wrong
// about every person who reads widely and demonstrates nothing. The document knows pharmacology.
// The person who uploaded it does not know it yet.
//
// Nemesis's own replies are excluded for the same reason: if the tutor explains a mechanism
// beautifully, the tutor knows the mechanism.
//
// PURE. No React, no I/O, no clock — the model call lives in the route that uses this.

/** Something the learner themselves produced. The only admissible evidence about them. */
export interface LearnerTurn {
  /** Verbatim, as they wrote or said it. */
  readonly said: string;
  /** What Nemesis had asked, when it asked something. Context for judging, never itself evidence. */
  readonly inReplyTo: string | null;
  readonly canvasId: string | null;
  readonly at: string;
}

/** A concept already known to the graph, offered to the model so it attaches rather than mints. */
export interface KnownConcept {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly parentName: string | null;
}

export type EvidenceType =
  | "correct_explanation"
  | "partial_explanation"
  | "misconception"
  | "correct_answer"
  | "incorrect_answer"
  | "self_report";

/** One thing the model claims the learner showed. */
export interface ConceptUpdate {
  /** An existing `concept_key` when it matched, else null and `mint` carries the proposal. */
  readonly conceptKey: string | null;
  readonly evidence: EvidenceType;
  readonly confidence: number;
  /** The learner's own words that support this, for the evidence panel. */
  readonly quote: string | null;
  readonly mint: MintProposal | null;
}

export interface MintProposal {
  readonly name: string;
  readonly parentKey: string | null;
  /** The model's answers to the four tests below. All four must hold. */
  readonly assessableAlone: boolean;
  readonly separableFromParent: boolean;
  readonly recurring: boolean;
  readonly corpusGrain: boolean;
}

/**
 * 🔴 AT MOST THREE NEW CONCEPTS FROM ONE EXCHANGE, AND A BATCH THAT WANTS MORE IS REJECTED WHOLE.
 *
 * Not trimmed to three — rejected. A model proposing twelve new concepts from one message has
 * stopped noticing what a person demonstrated and started summarising a lecture, and the first
 * three of a bad batch are no better than the last nine. Attaching evidence to concepts that
 * already exist is unlimited; only MINTING is capped.
 */
export const MINT_BUDGET = 3;

/** Below this the model is guessing, and a guess is not evidence. */
export const MIN_CONFIDENCE = 0.55;

/**
 * The four tests a candidate must pass to earn its own node.
 *
 * Written here rather than only in the prompt so it is checkable after the fact: a model that says
 * yes to everything still cannot mint, because this runs on its answers.
 */
export function earnsANode(mint: MintProposal): boolean {
  return mint.assessableAlone && mint.separableFromParent && mint.recurring && mint.corpusGrain;
}

/**
 * Normalise a name so "Beta-2 Agonists", "beta 2 agonists" and "Beta2 agonists" are one key.
 *
 * 🔴 THE LETTER/DIGIT SPLIT IS NOT COSMETIC, AND A TEST CAUGHT ITS ABSENCE. Without it "beta2"
 * and "beta-2" normalise to different keys, so the same drug class arrives twice under two
 * spellings that are both common in the literature — precisely the duplicate this function exists
 * to prevent. The same applies to "covid19"/"covid-19", "part d"/"partd", "type2"/"type 2".
 */
export function conceptKeyOf(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    // put a boundary between letters and digits, in both directions
    .replace(/([a-z])(\d)/g, "$1-$2")
    .replace(/(\d)([a-z])/g, "$1-$2")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

export interface Accepted {
  readonly attach: readonly ConceptUpdate[];
  readonly mint: readonly ConceptUpdate[];
  readonly rejected: readonly { readonly update: ConceptUpdate; readonly why: string }[];
}

/**
 * Sort what the model returned into what we will act on and what we will not.
 *
 * 🔴 ATTACHING IS THE COMMON CASE AND MINTING IS THE RARE ONE. If a session of hard study produces
 * forty pieces of evidence and no new concepts, that is the system working: the learner was
 * studying a course whose concepts already exist. The graph should grow slowly even while somebody
 * learns fast.
 */
export function accept(updates: readonly ConceptUpdate[], known: ReadonlySet<string>): Accepted {
  const attach: ConceptUpdate[] = [];
  const mint: ConceptUpdate[] = [];
  const rejected: { update: ConceptUpdate; why: string }[] = [];

  for (const update of updates) {
    if (update.confidence < MIN_CONFIDENCE) {
      rejected.push({ update, why: "below the confidence floor" });
      continue;
    }
    if (update.conceptKey && known.has(update.conceptKey)) {
      attach.push(update);
      continue;
    }
    if (!update.mint) {
      rejected.push({ update, why: "named no existing concept and proposed none" });
      continue;
    }
    if (!earnsANode(update.mint)) {
      // 🔴 THE DETAIL IS NOT DISCARDED. A candidate that fails the tests is a fact ABOUT a concept
      // rather than a concept: the caller files it as evidence text on the parent, so "onset is
      // about five minutes" still reaches the side panel and can still be quizzed. It simply does
      // not get a dot of its own.
      rejected.push({ update, why: "a detail of its parent, not a concept" });
      continue;
    }
    mint.push(update);
  }

  if (mint.length > MINT_BUDGET) {
    return {
      attach,
      mint: [],
      rejected: [
        ...rejected,
        ...mint.map((update) => ({ update, why: `batch proposed ${mint.length} new concepts` })),
      ],
    };
  }
  return { attach, mint, rejected };
}

/**
 * 🔴 A NEW CONCEPT IS BORN AT `introduced`, NEVER HIGHER.
 *
 * The owner's rule: *"a concept should not become mastered just because Nemesis explained it
 * once."* Minting and mastering in one breath is the sharpest version of that mistake — mastery
 * requires repeated retrieval over time, which by definition cannot have happened the first time we
 * heard of something.
 */
export const BIRTH_STATUS = "introduced" as const;

/** What the model is told. Kept beside the code that enforces it so the two cannot drift. */
export function extractionPrompt(known: readonly KnownConcept[]): string {
  const catalogue = known
    .slice(0, 400)
    .map((c) => (c.parentName ? `${c.key} (${c.name}, under ${c.parentName})` : `${c.key} (${c.name})`))
    .join("\n");

  return [
    "You are updating a model of what one learner knows. You will be shown only what the LEARNER",
    "said. You will not be shown documents they uploaded or replies the tutor gave, because neither",
    "is evidence about them.",
    "",
    "Return concept updates. For each thing the learner demonstrated, prefer an existing concept",
    "from this list and give its key:",
    "",
    catalogue || "(none yet)",
    "",
    "Attaching to an existing concept is the normal outcome. Only propose a NEW concept when none",
    "fits, and only when all four of these are true:",
    "  assessableAlone     a question about it can be answered without answering about its parent",
    "  separableFromParent someone could know the parent and not this, or this and not the parent",
    "  recurring           it appears across lectures, chapters or questions, not once",
    "  corpusGrain         it is the size of a textbook learning objective, not a single fact",
    "",
    "A property of something is not a concept. Onset times, colours, doses and trade names are",
    "details of a concept, not concepts. Say so by leaving mint null.",
    "",
    "Never propose more than three new concepts. If you want more, you are summarising rather than",
    "noticing what this person showed.",
    "",
    "Quote the learner's own words for each update. If they said nothing that demonstrates",
    "knowledge — they asked a question, greeted you, or gave an instruction — return no updates.",
  ].join("\n");
}
