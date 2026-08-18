// When picking from options is the most valuable thing to ask for — and how much a correct pick
// actually establishes.
//
// 🔴🔴 THE ASYMMETRY THIS FILE EXISTS TO HOLD, IN ONE LINE: A CORRECT RECOGNITION IS WEAKER EVIDENCE
// THAN A CORRECT PRODUCTION, AND NO NUMBER OF RECOGNITIONS ADDS UP TO ONE PRODUCTION. `scaffold-rung.ts`
// already put that in the type — `entails("recognition", "independent")` is false, and it is a
// DIRECTION rather than a matter of degree. What was missing is the other half of the sentence: the
// runtime never actually staged a recognition task, so the weaker rung was a value nothing produced
// and the asymmetry was unexercised. This file is where "is this the right form to ask in?" is
// decided, and it refuses in exactly the case where a recognition would flatter a learner.
//
// 🔴 IT IS NOT A DIFFICULTY SETTING, AND THE LEARNER NEVER SEES ONE. §33: *"The learner never sees a
// difficulty setting change. The Canvas simply changes the task."* Nothing here is selectable, nothing
// is remembered between calls, and the same evidence always produces the same answer.
//
// 🔴 RESPONSE BURDEN AND COGNITIVE DEMAND ARE SEPARATE VARIABLES — the owner's ruling, and the thing
// a naive multiple-choice implementation collapses. Tapping is cheap whatever the question, which is
// why a recognition item is worth offering deep into a sitting; that says nothing about how hard the
// discrimination is. Difficulty lives in HOW CLOSE the options are and is reported by
// `ChoiceSet.demand`, which is read off the distractors' grounds and never off how many there are.
// This module refuses any set that is merely cheap.
//
// 🔴 PURE, AND STRUCTURAL. Same inputs, same decision, no clock, no model call, no subject matter.

import type { ChoiceSet } from "./choice-set";
import type { LearnerEvidence } from "./learner-evidence";
import type { ObjectiveCapability } from "./learning-objective";
import { scaffoldRungFor } from "./scaffold-decision";
import { entails } from "./scaffold-rung";

/**
 * What the log establishes about this objective, read as FORMS rather than as a score.
 *
 * 🔴🔴 A DISCRIMINATED UNION RATHER THAN A NUMBER, AND THAT IS THE WHOLE OF THE OWNER'S REQUIREMENT
 * *"express this in the evidence model, not only in a comment"*. A confidence float would let three
 * recognitions sum past one production, because addition does not know the difference between them.
 * A union cannot: `recognised` and `produced` are different values, and no amount of the first
 * becomes the second.
 *
 * 🔴 IT IS A PROJECTION OF THE LOG, NOT A STORED FIELD. Nothing is written, nothing is migrated, and
 * a change of mind about what a form is worth reinterprets every row ever recorded for free — the
 * same discipline `projectLearnerState` and `establishesBelief` already hold.
 */
export type MasteryEvidence =
  /** No demonstration on record. 🔴 NOT "weak" and not zero — nobody has shown anything either way. */
  | { kind: "none" }
  /**
   * Demonstrated, but only ever by picking it out.
   *
   * 🔴 THE STATE §31.2 CALLS PROVISIONAL, AND THE ONE THIS WHOLE FEATURE MAKES REACHABLE. Before a
   * recognition task existed, every demonstration this runtime staged was unaided, so this variant
   * described nothing that could happen.
   */
  | { kind: "recognised"; distinctOperations: number }
  /** Produced unaided at least once. 🔴 THE ONLY VARIANT `establishesMastery` accepts. */
  | { kind: "produced"; distinctOperations: number };

/**
 * How many DIFFERENT cognitive operations demonstrated this objective.
 *
 * 🔴 ROWS THAT RECORDED NO OPERATION CONTRIBUTE NOTHING RATHER THAN A DEFAULT. Every row written
 * before the column existed carries none, and counting it as some operation would invent a form of
 * evidence nobody observed. The error therefore runs in the under-claiming direction, which costs a
 * re-ask and never a false credit.
 */
function distinctOperationsIn(demonstrations: readonly LearnerEvidence[]): number {
  const operations = new Set<ObjectiveCapability>();
  for (const row of demonstrations) {
    if (row.operation) operations.add(row.operation);
  }
  return operations.size;
}

/**
 * Fold a log into the forms it demonstrated.
 *
 * 🔴 ONLY `strong` AND `understood` COUNT, WHICH IS THE SAME PAIR `projectLearnerState` FOLDS
 * `demonstratedAt` FROM. A `partial` is part of an objective shown at a demand, not that objective
 * shown at that demand, and an `incorrect` at `independent` is an unaided WRONG answer — the exact
 * row that once made `satisfies(state, "independent")` return true for a learner who had never got
 * it right. Reusing the same pair is what stops this reading and that one from drifting apart.
 */
export function masteryEvidenceIn(evidence: readonly LearnerEvidence[]): MasteryEvidence {
  const demonstrations = evidence.filter(
    (row) => row.demonstrationObtained && (row.verdict === "strong" || row.verdict === "understood"),
  );
  if (demonstrations.length === 0) return { kind: "none" };
  const distinctOperations = distinctOperationsIn(demonstrations);
  // 🔴 `entails`, NOT A STRING COMPARISON. Production implies recognition and `narrowed` and `cued`
  // sit between them; asking `=== "independent"` would file a cued production as recognition-only.
  const produced = demonstrations.some((row) => row.scaffoldRung && entails(row.scaffoldRung, "independent"));
  return produced ? { distinctOperations, kind: "produced" } : { distinctOperations, kind: "recognised" };
}

/**
 * Has this objective been shown at a demand that would count as knowing it?
 *
 * 🔴 FALSE FOR EVERY `recognised`, HOWEVER MANY TIMES AND IN HOWEVER MANY FORMS. This is the owner's
 * rule executed rather than commented: *"one correct recognition answer must not establish mastery on
 * its own"* — and, because the union cannot add, neither may fifty.
 *
 * 🔴 IT IS NOT A SECOND `satisfies`. `satisfies(state, rung)` is the sanctioned gate and stays the
 * gate; this is the same fact folded per FORM so a caller can also ask "in how many ways?". A test
 * pins the two against the same log, because two readings of one truth that nothing compares are how
 * they come to disagree.
 */
export function establishesMastery(mastery: MasteryEvidence): boolean {
  return mastery.kind === "produced";
}

/**
 * How many distinct forms have to agree before repetition counts as strengthening.
 *
 * 🔴 TWO, AND IT MEASURES FORMS RATHER THAN ATTEMPTS. Answering the identical question twice is the
 * drill trap with a counter on it; recognising something as a `name` and again as a `compare` is the
 * same knowledge reached by two different routes, which is the only kind of repetition that means
 * anything. §31.2's asymmetry is untouched: this can make confidence higher, never mastery true.
 */
export const CONVERGING_FORMS = 2;

/**
 * Does the record contain the same objective demonstrated by more than one route?
 *
 * 🔴 "MAY STRENGTHEN CONFIDENCE", AND THE WORD IS `CONFIDENCE`, NOT `MASTERY`. The owner's sentence
 * draws that line and this function respects it: `establishesMastery` does not consult this, and no
 * amount of convergence moves a `recognised` to a `produced`.
 */
export function convergingAcrossForms(mastery: MasteryEvidence): boolean {
  return mastery.kind !== "none" && mastery.distinctOperations >= CONVERGING_FORMS;
}

/** Why offering options is the right ask right now. 🔴 Reason codes, tallied and asserted on, never
 *  prose — the same construction `SelectionReason` uses one layer up. */
export type RecognitionReason =
  /** A belief this learner has already been observed to hold is on the screen beside the answer. */
  | "competing-model-on-offer"
  /** The source itself declared these classes confusable, and both are on the screen. */
  | "source-declared-neighbours"
  /** Unaided attempts have gone unresolved, more than once, without anything resolving them since. */
  | "unaided-production-unresolved";

/** Why it is not. 🔴 Every refusal is a real and expected outcome on real material, not a fault. */
export type RecognitionRefusal =
  /** No honest set of options could be built. See `ChoiceRefusal` for why that is usually correct. */
  | "no-choice-set"
  /**
   * The options are all merely same-shape answers.
   *
   * 🔴 THE REFUSAL THAT KEEPS THIS FROM BECOMING A QUIZ. A set a learner can solve by elimination
   * measures elimination. Recognition earns its place only where the options are genuinely confusable,
   * which is what `demand: "near"` means and is decided from the distractors' grounds.
   */
  | "nothing-to-discriminate"
  /**
   * Recognition is the only thing on record, so another one would add nothing.
   *
   * 🔴🔴 THE OWNER'S RULE ABOUT NOT ASKING "WHY?" AFTER EVERY CORRECT PICK, POINTED THE OTHER WAY AND
   * THEREFORE UNABLE TO DRIFT FROM IT. What is owed after a recognition-only pass is PRODUCTION —
   * `teaching-policy.ts`'s provisional branch already asks for exactly that, from durable state rather
   * than from "the last answer was a tap". This refusal is the same fact stopping this module from
   * offering the cheap form again in the same breath.
   */
  | "production-owed"
  /**
   * Unaided production has not been tried and found wanting yet.
   *
   * 🔴 THE FIRST ASK IS ALWAYS PRODUCTION, AND THIS IS WHY. *"Prefer a task that reveals the learner
   * over a question about them"* — a recognition item put first would hand the answer to someone who
   * could have produced it, and the log would record a weaker demonstration than the learner was
   * capable of. Options are what happens when asking outright has already failed to resolve anything.
   */
  | "production-not-yet-tried";

export type RecognitionDecision =
  | { preferred: true; reasons: readonly RecognitionReason[] }
  | { preferred: false; refusal: RecognitionRefusal };

/**
 * How many consecutive unresolved unaided attempts justify changing the FORM of the question.
 *
 * 🔴 THE SAME BAR `scaffold-decision.ts` ALREADY SET, READ FROM THE SAME FOLD RATHER THAN RESTATED.
 * One miss is ordinary and is not a pattern; two straight is the number this codebase already decided
 * is real signal, and `scaffoldRungFor` computes the trailing run — stopping at the last attempt that
 * resolved, so a bad week in March cannot narrow a question in August. Writing a second constant here
 * would be a second, independently-editable copy of a judgement that has already been made.
 */
export const RECOGNITION_AFTER_UNRESOLVED = 2;

/**
 * Is putting options on screen the highest-value way to ask this, right now?
 *
 * 🔴 IT ANSWERS ABOUT THE FORM, NEVER ABOUT WHETHER TO ASK. `chooseNextTeachingAction` has already
 * decided a retrieval is owed; this only decides what shape it takes. Keeping the two apart is what
 * stops this from becoming a second "should we ask" rule that can disagree with the first one — the
 * exact separation `scaffold-decision.ts` states in its own header for the same reason.
 *
 * 🔴 EVERY REFUSAL IS CHECKED BEFORE ANY REASON IS COLLECTED, so a set that is disqualified cannot
 * also be recommended. The order is cheapest-and-most-decisive first.
 */
export function recognitionPreferred(input: {
  /** The options this runtime can honestly stage, or null when none could be built. */
  choices: ChoiceSet | null;
  /** This objective's own evidence, newest last. */
  evidence: readonly LearnerEvidence[];
}): RecognitionDecision {
  const { choices, evidence } = input;
  if (!choices) return { preferred: false, refusal: "no-choice-set" };
  if (choices.demand !== "near") return { preferred: false, refusal: "nothing-to-discriminate" };

  const mastery = masteryEvidenceIn(evidence);
  // 🔴 `establishesMastery` RATHER THAN AN INLINE `kind` CHECK, SO THE ASYMMETRY HAS ONE READER. A
  // learner with production on record may meet options again; one whose only demonstration was a pick
  // is owed the harder form, unless the picks have converged across genuinely different routes — which
  // strengthens confidence and still does not establish mastery.
  if (mastery.kind === "recognised" && !establishesMastery(mastery) && !convergingAcrossForms(mastery)) {
    return { preferred: false, refusal: "production-owed" };
  }

  const { streak } = scaffoldRungFor(evidence);
  if (streak < RECOGNITION_AFTER_UNRESOLVED) {
    return { preferred: false, refusal: "production-not-yet-tried" };
  }

  const reasons: RecognitionReason[] = ["unaided-production-unresolved"];
  if (choices.options.some((option) => option.ground?.kind === "held_misconception")) {
    reasons.unshift("competing-model-on-offer");
  }
  if (choices.options.some((option) => option.ground?.kind === "neighbouring_class")) {
    reasons.push("source-declared-neighbours");
  }
  return { preferred: true, reasons };
}
