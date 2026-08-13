// Which objective the policy is asked about, and what it said.
//
// 🔴 THE POLICY DECIDES WHAT TO DO ABOUT ONE OBJECTIVE. SOMETHING STILL HAS TO CHOOSE THE
// OBJECTIVE. That choosing is here, kept as small and as boring as it can be, because it is
// exactly where a curriculum would grow back: an ordering that encoded "teach the easy ones
// first", or a rule that walked every objective through the same three steps, would be the
// six-stage machine rebuilt one level up. This picks the first objective that is owed something,
// in a fixed order, and stops.
//
// 🔴 STATELESS, LIKE THE POLICY IT CALLS. Nothing accumulates between calls. Run it twice on the
// same evidence and it returns the same decision; run it after evidence lands and it returns
// whatever that new state deserves. The loop lives outside: decide → ask → evidence → decide.

import { projectLearnerState, type LearnerEvidence, type LearnerObjectiveState } from "./learner-evidence";
import type { KnowledgeObject } from "./knowledge-types";
import type { StoredObjective } from "./learner-store";
import { chooseNextTeachingAction, type TeachingAction } from "./teaching-policy";
import type { ResolvedObjective } from "./canvas-knowledge";

export interface PolicyDecision {
  objective: StoredObjective;
  knowledge: KnowledgeObject;
  state: LearnerObjectiveState;
  action: TeachingAction;
  /** This objective's own evidence, newest last — what the decision was made from. */
  evidence: LearnerEvidence[];
}

/**
 * The one thing to do next across this canvas's objectives, or null when nothing is owed.
 *
 * Arbitration in two passes, and only two:
 *
 *   1. the first objective the policy wants to ACT on — retrieve, correct, contrast;
 *   2. failing that, the first it wants to HOLD, so a learner who has just been corrected on
 *      everything here is told so rather than shown a blank page.
 *
 * `advance` means nothing is owed, so it is never the answer to "what next" — it is the absence of
 * one. When every objective advances, this returns null and the caller says the honest thing.
 */
export function decideNext(input: {
  objectives: readonly ResolvedObjective[];
  evidence: readonly LearnerEvidence[];
  now: Date;
  /**
   * Objectives this session has already acted on, moved to the back of the queue.
   *
   * 🔴 SESSION STATE, AND DELIBERATELY NOT LEARNER STATE. Reading a correction is not a claim that
   * anyone can now do anything, so it must never become evidence — which leaves a gap the policy
   * cannot close on its own: showing a correction produces no new evidence, so the state that asked
   * for it is unchanged, so it asks again. "Got it" re-rendered the identical card for ever.
   *
   * 🔴 AND IT IS A REORDERING, NOT A FILTER. If every objective has been acted on, the last one
   * still comes back rather than the session ending in a blank page — being shown something twice
   * is a much smaller failure than a surface with nothing on it.
   */
  actedOn?: ReadonlySet<string>;
  /**
   * Objectives whose CORRECTION has already been displayed in this session.
   *
   * 🔴 A DIFFERENT SET FROM `actedOn`, AND CONFUSING THE TWO INVERTS THE FIX THEY SERVE.
   * `acknowledge()` adds an objective to `actedOn` when the learner clears the FEEDBACK screen
   * after answering — which happens BEFORE any correction is displayed. A policy reading `actedOn`
   * to mean "they have seen the answer" would therefore defer at the exact moment the correction is
   * owed, and someone who got a question wrong would never be shown the answer at all.
   *
   * 🔴 SESSION STATE AND NEVER LEARNER STATE, for the same reason `actedOn` is: receiving a
   * correction is not a demonstration, so it must not become evidence. That is precisely why the
   * policy cannot recover this from the log and has to be told.
   */
  correctionsShown?: ReadonlySet<string>;
}): PolicyDecision | null {
  const acted = input.actedOn ?? new Set<string>();
  const corrected = input.correctionsShown ?? new Set<string>();
  // Stable: identity order is preserved inside each group, so this only moves already-seen
  // objectives behind unseen ones and never shuffles the rest.
  const ordered = [
    ...input.objectives.filter(({ objective }) => !acted.has(objective.identityKey)),
    ...input.objectives.filter(({ objective }) => acted.has(objective.identityKey)),
  ];

  const decisions = ordered.map(({ knowledge, objective }) => {
    // 🔴 FILTERED BY OBJECTIVE, NEVER BY CANVAS. The evidence handed in is everything this learner
    // holds for these objectives across every session — a canvas filter here would silently turn
    // the durable learner model back into a session transcript, and every test would still pass.
    const mine = input.evidence.filter((entry) => entry.objectiveIdentityKey === objective.identityKey);
    const state = projectLearnerState(objective.identityKey, mine);
    return {
      action: chooseNextTeachingAction({
        correctionAlreadyShown: corrected.has(objective.identityKey),
        knowledgeObject: knowledge,
        learnerState: state,
        now: input.now,
        objective,
        recentEvidence: mine,
      }),
      evidence: mine,
      knowledge,
      objective,
      state,
    };
  });

  const owed = decisions.filter(
    (decision) => decision.action.type !== "advance" && decision.action.type !== "defer",
  );

  // NEVER-ESTABLISHED OUTRANKS DUE-FOR-REVIEW.
  //
  // 🔴 THIS IS A STATED DEFAULT, NOT AN INVARIANT, AND IT IS WRITTEN DOWN AS ONE ON PURPOSE.
  // **Interleaving new and review material is a legitimate alternative**, and choosing between them
  // is a product decision about how a session should feel — not a correctness property anything
  // downstream may assume. Whoever finds this rule later should read a choice that can be revisited,
  // with its reasoning attached, rather than a law they are afraid to touch.
  //
  // What is NOT optional is that *some* rule is stated here. Before objectives could become eligible
  // again, ordering between them was free: `correct` produced `advance`, `advance` was unselectable,
  // and nothing demonstrated could compete with anything unasked. Making demonstrated objectives
  // askable again removed that accident — and the alternative to this tier was never "prefer
  // review", it was ARBITRARY: whichever identity key happened to sort first.
  //
  // The reverse-direction acceptance case is what caught its absence. Demonstrate "losartan →
  // Cozaar" and the next question must be "Cozaar → ?", not the same direction again because its
  // interval elapsed — a learner re-asked what they just showed, while a fact they have never seen
  // waits behind it. Three existing tests failed without this, so it is required to hold behaviour
  // that was already accepted, which is what makes it mechanism rather than a new preference.
  //
  // 🔴 AND IT IS A PRECEDENCE RULE, NOT A SECOND INTERVAL. There is no number here and nothing to
  // tune — exactly one value governs tempo (`RETRIEVAL_ELIGIBLE_AFTER_MS`) and this does not touch
  // it. Within each tier the existing positional order still decides, so nothing else changes.
  return (
    owed.find((decision) => decision.state.status !== "correct") ??
    owed[0] ??
    decisions.find((decision) => decision.action.type === "defer") ??
    null
  );
}

/** The objectives this runtime can act on, of the ones a canvas resolved.
 *
 *  🔴 THIS IS A FILTER, NOT AN OWNERSHIP TEST, AND THERE IS DELIBERATELY NO `canUsePolicyRuntime`
 *  BESIDE IT ANY MORE. There used to be: `objectives.some(supported)` — one association was enough
 *  to hand the runtime a whole canvas, so a forty-page lecture containing a single glossary table
 *  satisfied it exactly as well as a glossary did, and every paragraph in it would have become
 *  unreachable. Ownership is decided in `knowledge-coverage.ts`, from what the SOURCE contains
 *  rather than from what happened to be extractable out of it. Do not reintroduce a permissive
 *  predicate here; make the loose question unrepresentable instead. */
export function supportedObjectives(objectives: readonly ResolvedObjective[]): ResolvedObjective[] {
  return objectives.filter(
    ({ knowledge, objective }) => knowledge.type === "association" && objective.capability === "recall",
  );
}
