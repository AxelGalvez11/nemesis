// Which of the things Nemesis could do next is worth the most — and why.
//
// 🔴 THIS REPLACES "THE FIRST OBJECTIVE THAT IS OWED SOMETHING". That selector was honest about
// being provisional and it had a real ceiling: within a tier it fell back to whichever identity key
// sorted first, so a learner who had failed one objective twice and another once was offered them in
// hash order. The learner model had become substantially more sophisticated than the thing choosing
// from it.
//
// 🔴🔴 IT SCORES ACTIONS, NEVER THE LEARNER, AND THAT DISTINCTION IS THE WHOLE DESIGN. There is no
// mastery number anywhere in this file. Nothing here is stored, nothing accumulates, and nothing is
// ever shown to a learner as a measure of them. `value()` answers "how much is asking THIS worth at
// THIS moment", recomputed from durable evidence every single time — so it can be rewritten
// completely without migrating a single row, and it can never quietly become a score on a person.
//
// 🔴 EVERY TERM IS NAMED AND CARRIED OUT WITH THE ANSWER. A selector whose output is one float is a
// selector nobody can debug and nobody can correct: "why did Nemesis ask me this?" deserves better
// than "it scored highest". Each contribution is a `SelectionReason`, and the winning decision
// carries the list — which is the inspectable policy trace, not a model's chain of thought.
//
// 🔴 AND IT IS A STRICT GENERALISATION OF WHAT CAME BEFORE. The bands below reproduce the ordering
// the previous selector encoded — an exposition the learner is owed outranks anything Nemesis wants
// to ask; never-established outranks due-for-review — because those were reasoned about, tested, and
// accepted. What is new is discrimination WITHIN a band, which is where the old rule fell back to
// arbitrary. Every test written against the old ordering still passes, and that is the evidence this
// is an extension rather than a replacement.

import type { LearnerEvidence, LearnerObjectiveState } from "./learner-evidence";
import type { KnowledgeObject } from "./knowledge-types";
import { entails } from "./scaffold-rung";
import type { TeachingAction } from "./teaching-policy";

/**
 * Why an action scored what it did. The policy trace, in the product's own vocabulary.
 *
 * 🔴 REASON CODES, NOT PROSE. `TeachingAction.because` is a sentence for a human to read; these are
 * values a test can assert on and a dashboard can count. Both exist because they answer different
 * questions — "what would you tell the learner" and "what did the system weigh".
 */
export type SelectionReason =
  /** Nemesis has already decided to tell them something, and the telling is half-finished. */
  | "owed-an-answer"
  /** A named competing model is in the way; retrieval alone keeps returning the same wrong answer. */
  | "misconception-in-the-way"
  /** No evidence at all. The cheapest possible information about this learner. */
  | "never-established"
  /** Attempted, and what came back fell short. */
  | "fell-short"
  /** Attempted repeatedly and still unresolved — the strongest signal of a real gap. */
  | "repeatedly-unresolved"
  /** Evidence exists but no reading we would stand behind. */
  | "nothing-conclusive-yet"
  /** Demonstrated by picking it out, never by producing it — §31.2's provisional ✓. */
  | "recognised-not-produced"
  /** Demonstrated, and long enough ago that asking again measures memory. */
  | "due-again"
  /** Worked very recently. Asking now would measure the last few minutes, not learning. */
  | "just-worked"
  /** Other material has intervened since this was last touched, which is what makes it askable. */
  | "displaced-since";

export interface ActionValue {
  /** Higher is more worth doing NOW. 🔴 A property of the ACTION at this moment — never of the
   *  learner, never stored, never shown. */
  score: number;
  /** Every term that contributed, most significant first. The trace. */
  reasons: SelectionReason[];
}

/**
 * The bands, and why they are ordered this way.
 *
 * 🔴 BANDS RATHER THAN A CONTINUUM, BECAUSE THE ORDERING BETWEEN THEM IS A RULE AND THE ORDERING
 * WITHIN THEM IS A JUDGEMENT. A modifier must never lift an action out of its band: no amount of
 * "this failed three times" should outrank an answer the learner is standing there waiting for. The
 * gaps are wide enough that the modifiers below cannot cross them, and that is checked by a test.
 */
const BAND = {
  /** §39: the exposure is the second half of an interaction the learner is already inside. */
  exposition: 10_000,
  /**
   * Not yet demonstrated — never asked, asked inconclusively, or asked and missed.
   *
   * 🔴🔴 ONE BAND, AND MY FIRST VERSION SPLIT IT. I gave never-established 8,000 and unresolved
   * 6,000, reasoning that an unknown buys the most information. That inverted a behaviour this
   * codebase had already accepted and pinned: the previous selector's tier was
   * `status !== "correct"`, which puts "never asked" and "asked and missed" TOGETHER above
   * review, deliberately. Splitting them meant a learner who had just missed something twice was
   * handed a brand-new question instead — the system visibly dropping the thread it had started,
   * and the opposite of the owner's *"it returns to failed material after intervening work"*.
   *
   * So the band is shared and the MODIFIERS discriminate, which is the whole reason for having
   * modifiers. A repeatedly-missed objective outranks an untouched one because it has been missed
   * repeatedly, not because of where it sits in an enum.
   */
  owed: 8_000,
  /** Looked strong, but only at recognition. A false ✓ is invisible and compounds. */
  provisional: 4_000,
  /** Demonstrated and due. Real, and the least urgent thing here. */
  due: 2_000,
} as const;

/**
 * Evidence exists, but nothing conclusive came back.
 *
 * 🔴 A NUDGE INSIDE THE BAND, NOT A BAND OF ITS OWN. An objective nobody has ever asked buys
 * slightly more than one whose last reading was too uncertain to stand behind — but both are
 * "not demonstrated", and putting a band boundary between them would be the same over-claiming
 * that splitting `owed` was.
 */
const INCONCLUSIVE_NUDGE = 100;

/** Each further unresolved attempt adds this much. Bounded so it cannot cross a band. */
const PER_FAILED_ATTEMPT = 200;
/** …and bounded here, so five failures and fifty are not a hundredfold difference. */
const MAX_FAILED_ATTEMPTS = 5;

/**
 * Working memory, as a penalty rather than a filter.
 *
 * 🔴 A PENALTY, NOT AN EXCLUSION, AND THAT IS DELIBERATE. The old selector filtered `defer` out of
 * the candidates entirely, so a session in which everything had just been worked had nothing to
 * offer at all. Ranking down instead means the least-recently-touched thing still wins, and a
 * learner never meets a blank surface.
 */
const JUST_WORKED_PENALTY = 1_500;

/** How many other objectives must intervene before something counts as displaced. */
const DISPLACEMENT = 1;

export interface ValueInput {
  action: TeachingAction;
  state: LearnerObjectiveState;
  knowledge: KnowledgeObject;
  /** This objective's own evidence, newest last. */
  evidence: readonly LearnerEvidence[];
  /** How many OTHER objectives have been worked since this one was last acted on. */
  interveningActs: number;
}

/** Attempts that came back wrong, partial, or with nothing shown — the learner's own signal. */
function unresolvedAttempts(evidence: readonly LearnerEvidence[]): number {
  return evidence.filter(
    (row) =>
      row.objectiveEvidence !== "not_addressed" &&
      (row.verdict === "incorrect" || row.verdict === "misconception" || row.verdict === "partial" ||
        (!row.demonstrationObtained && row.objectiveEvidence === "nothing_produced")),
  ).length;
}

/**
 * What this action is worth right now.
 *
 * 🔴 PURE. No clock, no network, no model, no randomness — the same inputs always produce the same
 * score, so "why did Nemesis ask me this?" is answerable by replaying it rather than by guessing.
 */
export function value(input: ValueInput): ActionValue {
  const { action, evidence, interveningActs, state } = input;
  const reasons: SelectionReason[] = [];
  let score: number;

  if (action.type === "show_correction") {
    score = BAND.exposition;
    reasons.push("owed-an-answer");
  } else if (action.type === "contrast") {
    // 🔴 ALSO THE EXPOSITION BAND, AND ABOVE `show_correction` INSIDE IT. A competing model does not
    // merely leave a gap, it actively returns the wrong answer — so it blocks its own retrieval in a
    // way an ordinary miss does not, and separating the pair is what unblocks everything after it.
    score = BAND.exposition + 500;
    reasons.push("owed-an-answer", "misconception-in-the-way");
  } else if (state.status === "unknown" && state.evidenceCount === 0) {
    score = BAND.owed;
    reasons.push("never-established");
  } else if (state.status === "unknown") {
    // Evidence exists; no reading we would stand behind came back. Worth settling, and slightly
    // below the untouched case — asking something never asked buys marginally more information.
    score = BAND.owed - INCONCLUSIVE_NUDGE;
    reasons.push("nothing-conclusive-yet");
  } else if (state.status === "correct") {
    // 🔴 THE ASYMMETRY §31.2 IS BUILT ON. A ✓ that was only recognised is provisional and owes a
    // production probe; a false ✓ costs skipping something unknown, which is invisible and
    // compounds, while a false ✕ costs re-teaching something known and self-corrects.
    const provisional = state.demonstratedAt !== null && !entails(state.demonstratedAt, "independent");
    score = provisional ? BAND.provisional : BAND.due;
    reasons.push(provisional ? "recognised-not-produced" : "due-again");
  } else {
    // Incorrect, partial, or an opportunity that produced nothing. The learner has shown us where
    // the gap is, which is worth exactly as much as an unknown until the modifiers speak.
    score = BAND.owed;
    reasons.push("fell-short");
  }

  // ── modifiers: they discriminate WITHIN a band and can never cross one ────
  const failures = Math.min(unresolvedAttempts(evidence), MAX_FAILED_ATTEMPTS);
  if (failures > 1) {
    // 🔴 REPEATEDLY UNRESOLVED IS THE STRONGEST GAP SIGNAL THE LEARNER GIVES US, and the old
    // selector could not see it at all: within a tier it fell back to identity-key order, so
    // something failed three times waited behind something failed once for no reason anybody chose.
    score += failures * PER_FAILED_ATTEMPT;
    reasons.push("repeatedly-unresolved");
  }

  if (interveningActs >= DISPLACEMENT) {
    reasons.push("displaced-since");
  } else if (state.lastEvidenceAt) {
    // Touched, and nothing has come between. Asking again now measures whether they can still hear
    // their own voice. Ranked down rather than removed — see `JUST_WORKED_PENALTY`.
    score -= JUST_WORKED_PENALTY;
    reasons.push("just-worked");
  }

  return { reasons, score };
}

/**
 * The most valuable of several candidate actions.
 *
 * 🔴 TIES BREAK ON THE CALLER'S ORDER, WHICH IS ALREADY STABLE. Two genuinely equal candidates must
 * resolve the same way on every render, or the same canvas asks a different question after a reload
 * and nothing looks wrong. `Array.prototype.reduce` keeps the first of equals, which is what makes
 * this stable without a second sort.
 */
export function mostValuable<T>(candidates: readonly T[], valueOf: (candidate: T) => ActionValue): T | undefined {
  if (candidates.length === 0) return undefined;
  let best: T = candidates[0]!;
  let bestValue = valueOf(best);
  for (const candidate of candidates.slice(1)) {
    const candidateValue = valueOf(candidate);
    if (candidateValue.score > bestValue.score) {
      best = candidate;
      bestValue = candidateValue;
    }
  }
  return best;
}
