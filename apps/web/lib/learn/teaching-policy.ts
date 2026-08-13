// What the learner should do NEXT, chosen from what they have already demonstrated.
//
// 🔴 THIS IS NOT `canvas-policy.ts`, AND THE DIFFERENCE IS THE WHOLE POINT. That module answers
// "what should the canvas do about the answer just given" — reactive, running after a performance,
// reading one evaluation. This one answers "what is worth doing at all", from durable learner state
// that may have been established in a completely different session. Different questions on
// different axes; neither replaces the other.
//
// 🔴 ONE DECISION, FROM THE CURRENT STATE, AND THEN IT IS DONE. There is deliberately no sequence
// in here — no "if unknown: teach, then recall, then test". That would be the six-stage machine
// moved into a new file, which is exactly what this architecture exists to remove. The loop lives
// OUTSIDE: state → action → evidence → new state → ask again. Each call sees only where the learner
// is now, so the same state always yields the same action and nothing accumulates in here.
//
// 🔴 AND IT IS DETERMINISTIC. No model call, no randomness. A policy that cannot be replayed cannot
// be debugged, and "why did Nemesis ask me this?" has to have an answer better than "it felt like
// it". Every action carries `because` for exactly that reason.
//
// 🔴 ASSOCIATION RECALL ONLY. This is the first executable piece of the eventual policy, not the
// learning algorithm. It is deliberately small enough to be obviously correct.

import type { LearnerEvidence, LearnerObjectiveState } from "./learner-evidence";
import type { LearningObjective } from "./learning-objective";
import type { KnowledgeObject } from "./knowledge-types";
import { eligibleForRetrieval } from "./retrieval-eligibility";

/**
 * A single thing to do. An ACTION, never a STAGE.
 *
 * 🔴 THE DISTINCTION MATTERS MORE THAN IT LOOKS. An action is local — one move, after which the
 * policy runs again on whatever the learner produced. A stage dictates the rest of the session:
 * enter `LearnStage` and the next three things are decided before the learner has done anything.
 * The names stay small on purpose.
 */
export type TeachingAction =
  /** Ask them to produce it. The only action that generates new evidence. */
  | { type: "retrieve"; objectiveId: string; because: string }
  /** State the answer plainly. For a wrong attempt, or an opportunity that produced nothing. */
  | { type: "show_correction"; objectiveId: string; because: string }
  /** Put the confusable items side by side, then ask for both. Only for a named competing model. */
  | { type: "contrast"; objectiveIds: string[]; competingWith: readonly string[]; because: string }
  /** Hold this one for now — acting again this soon would teach nothing. Come back after other work. */
  | { type: "defer"; objectiveId: string; because: string }
  /** Nothing is owed here. Move to whatever is next. */
  | { type: "advance"; because: string };

export interface TeachingPolicyInput {
  objective: LearningObjective;
  knowledgeObject: KnowledgeObject;
  learnerState: LearnerObjectiveState;
  /**
   * This objective's recent evidence, most recent last.
   *
   * 🔴 THE ONLY EXTRA INPUT, AND IT EARNS ITS PLACE. It answers a question the projected state
   * cannot: how long ago. Without it the policy would show a correction, be asked again a second
   * later, and show the same correction — a loop that looks like teaching and is not.
   *
   * 🔴 NO RETENTION, NO CALENDAR, NO PREREQUISITES, NO AVAILABLE TIME. Those are real inputs to a
   * real policy and none of them are needed to make the decisions below, so adding them now would
   * be guessing at an interface before anything exercises it.
   */
  recentEvidence: readonly LearnerEvidence[];
  /** Injected so every decision is reproducible in a test rather than depending on the clock. */
  now: Date;
}

/**
 * 🔴 ACTING AGAIN INSIDE THIS WINDOW TEACHES NOTHING. Asking someone the same thing four minutes
 * after they answered measures whether they can still hear their own voice; showing a correction
 * twice in a row is just the same sentence twice. The policy holds instead, and the loop brings the
 * objective back after intervening work.
 *
 * Deliberately crude, and deliberately NOT a retention estimate — that is exactly the "add the
 * field when a real decision needs it" line. When real retrievability exists it supersedes this.
 */
export const ACT_AGAIN_AFTER_MS = 60 * 60 * 1000;

function msSince(state: LearnerObjectiveState, now: Date): number {
  if (!state.lastEvidenceAt) return Number.POSITIVE_INFINITY;
  return now.getTime() - Date.parse(state.lastEvidenceAt);
}

export function chooseNextTeachingAction(input: TeachingPolicyInput): TeachingAction {
  const { learnerState: state, objective } = input;
  const id = objective.identityKey;
  const sinceMs = msSince(state, input.now);
  const actedJustNow = sinceMs < ACT_AGAIN_AFTER_MS;

  switch (state.status) {
    // 🔴 UNKNOWN ASKS RATHER THAN TELLS, AND THAT IS THE WHOLE POINT OF THE STATE. Unknown means
    // NEMESIS LACKS EVIDENCE — it does not mean the learner lacks knowledge. Opening with "you
    // haven't learned this yet, first read this" asserts something nobody has observed, and spends
    // the learner's attention on material they may already hold. Asking costs seconds and settles
    // it. This is "prefer a task that reveals the learner over a question about them", executed.
    case "unknown":
      return {
        because: `no evidence exists for "${objective.label}" — asking settles it, and telling would assert something unobserved`,
        objectiveId: id,
        type: "retrieve",
      };

    // 🔴 A NAMED COMPETING MODEL IS IN THE WAY, so retrieval alone keeps returning the same wrong
    // answer: the learner is not failing to remember, they are remembering something else. Put the
    // confusable pairs side by side, then ask for both. This is the first place the KIND of
    // evidence changes the pedagogy rather than just the wording.
    case "misconception": {
      const competing = [...new Set(
        input.recentEvidence
          .filter((e) => e.verdict === "misconception")
          .flatMap((e) => e.misconceptions ?? []),
      )];
      return {
        because: `a specific competing answer keeps surfacing, so the pair needs separating before another retrieval is worth asking for`,
        competingWith: competing,
        // Only this objective is named. Resolving the COMPETING objective is a lookup over the
        // learner's other knowledge, which belongs to the caller that holds it — not to a decision
        // function that is supposed to stay pure.
        objectiveIds: [id],
        type: "contrast",
      };
    }

    // Wrong, or right about only part of it. Both want the answer stated plainly and another
    // attempt later — 🔴 NOT the identical question a millisecond afterwards, which tests nothing.
    case "incorrect":
    case "partial":
      if (actedJustNow && state.evidenceCount > 1) {
        return {
          because: `this was just corrected, so another attempt should come after some intervening work`,
          objectiveId: id,
          type: "defer",
        };
      }
      return {
        because: state.status === "partial"
          ? `part of this was demonstrated and part was missing — the answer is worth stating plainly before asking again`
          : `the last attempt contradicted this objective, so the correct answer is worth stating before another attempt`,
        objectiveId: id,
        type: "show_correction",
      };

    // 🔴 AN OPPORTUNITY PASSED AND NOTHING CAME BACK — revealed, gave up, or unreadable. They did
    // not give a wrong answer, so they must not be told they were wrong. Show the association, and
    // let the loop bring it back for a real attempt later.
    case "not_demonstrated":
      if (actedJustNow && state.evidenceCount > 1) {
        return {
          because: `the answer was just shown, so the next retrieval should follow some intervening work`,
          objectiveId: id,
          type: "defer",
        };
      }
      return {
        because: state.latestVerdict
          ? `no retrieval was obtained this time, though this was demonstrated before — showing it beats asking again immediately`
          : `an opportunity passed with no usable demonstration, so the answer is worth showing before asking again`,
        objectiveId: id,
        type: "show_correction",
      };

    // 🔴 DEMONSTRATED. Move on — for now, and ONLY for now. Nothing here requires a separate Test
    // stage to re-verify what was just shown to work; that is the fixed sequence this architecture
    // removes. It does not come back because a session template says there are more steps left.
    //
    // 🔴 BUT "MOVE ON" USED TO MEAN "FOR EVER", AND THAT WAS THE DEFECT. Both branches returned
    // `advance`, `decideNext` never selects an `advance`, and `projectLearnerState` has no clock —
    // so a demonstrated objective was not deprioritised, it was EXCLUDED. Measured: answered
    // correctly a year ago, still `null`. The comment above used to promise it would "come back
    // later on its own merits, once forgetting is modelled"; nothing had checked whether that day
    // had arrived, and it had not.
    case "correct": {
      // 🔴 EXACTLY ONE INTERVAL GOVERNS TEMPO HERE, AND THE CONJUNCTION THAT USED TO SIT ON THIS
      // LINE IS WHY THAT SENTENCE HAS TO BE WRITTEN DOWN. This read `!actedJustNow &&
      // eligibleForRetrieval(...)`. `actedJustNow` is measured against `ACT_AGAIN_AFTER_MS`, so a
      // learner waited the LONGER of the two and the owner's ruling on tempo was inert anywhere
      // below one hour. Measured, not reasoned: the constant moved 60 min → 10 min and the decision
      // table did not change by a single row.
      //
      // The two constants answer different questions, which is why only this branch changed.
      // `ACT_AGAIN_AFTER_MS` asks "have we just TOUCHED this objective?" — a churn guard, blind to
      // the outcome, and the ONLY guard on the three branches above, where it still does real work.
      // Eligibility asks "is this demonstrated objective DUE?" — a scheduling decision. On THIS
      // branch it is the more specific of the two and never looser, so it subsumes the churn guard.
      //
      // 🔴 LAYER 1 DID NOT LEAVE, IT MOVED FROM THE DECISION ONTO THE CONFIGURATION. Never
      // re-asking the thing just answered is now guaranteed by the floor asserted at module scope
      // in `retrieval-eligibility.ts`: a tempo short enough to reopen the immediate repeat cannot
      // be configured at all. A bound on the input can never out-vote the number the owner set —
      // a second interval in this condition could, and did.
      //
      // 🔴 AND THIS IS THE SEAM. Eligibility is consulted from exactly one place. When "when does
      // this return?" stops being a constant READ and becomes a question ASKED — of evidence, of
      // the operation, of prior demonstrations, of forgetting — it is this one expression that
      // changes, not the shape of the policy around it.
      if (eligibleForRetrieval({ lastEvidenceAt: state.lastEvidenceAt, now: input.now })) {
        return {
          because: `demonstrated before, and long enough ago that asking again measures memory rather than the last few minutes`,
          objectiveId: id,
          type: "retrieve",
        };
      }
      return {
        because: `already demonstrated, and not yet due for another retrieval`,
        type: "advance",
      };
    }
  }
}
