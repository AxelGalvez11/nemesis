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
}): PolicyDecision | null {
  const decisions = input.objectives.map(({ knowledge, objective }) => {
    // 🔴 FILTERED BY OBJECTIVE, NEVER BY CANVAS. The evidence handed in is everything this learner
    // holds for these objectives across every session — a canvas filter here would silently turn
    // the durable learner model back into a session transcript, and every test would still pass.
    const mine = input.evidence.filter((entry) => entry.objectiveIdentityKey === objective.identityKey);
    const state = projectLearnerState(objective.identityKey, mine);
    return {
      action: chooseNextTeachingAction({
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

  return (
    decisions.find((decision) => decision.action.type !== "advance" && decision.action.type !== "defer") ??
    decisions.find((decision) => decision.action.type === "defer") ??
    null
  );
}

/** Does this canvas have anything the policy runtime can actually teach?
 *
 *  🔴 THE GATE IS THE SUPPORTED SLICE, NOT A GUESS ABOUT THE CANVAS. Association recall is the one
 *  path built end to end; a canvas with a causal knowledge object and no association has nothing
 *  here and must keep the runtime it already had. Widening this is what shipping the next
 *  knowledge type MEANS — not a flag flip. */
export function canUsePolicyRuntime(objectives: readonly ResolvedObjective[]): boolean {
  return objectives.some(
    ({ knowledge, objective }) => knowledge.type === "association" && objective.capability === "recall",
  );
}

export function supportedObjectives(objectives: readonly ResolvedObjective[]): ResolvedObjective[] {
  return objectives.filter(
    ({ knowledge, objective }) => knowledge.type === "association" && objective.capability === "recall",
  );
}
