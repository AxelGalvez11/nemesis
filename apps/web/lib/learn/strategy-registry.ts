// The one place an arm name becomes a controller — and the one place a failed controller becomes a
// working screen.
//
// 🔴 SEPARATE FROM `teaching-strategy.ts` BECAUSE THAT FILE HAS NO RUNTIME IMPORTS AT ALL, AND KEEPING
// IT THAT WAY IS WHAT LETS `learner-evidence.ts` AND `learner-store.ts` DEPEND ON IT WITHOUT A CYCLE.
// The interface and the id are needed by the persistence layer; the implementations pull in the
// model client, the judge and the whole cognition stack.
//
// 🔴 EXHAUSTIVE OVER THE UNION, SO AN ARM CANNOT BE HALF-ADDED. `Record<TeachingStrategyId, …>` makes
// a missing entry a compile error rather than a runtime `undefined` that resolves to "no controller"
// and shows the learner a blank Canvas.

import { llmTeacherStrategy } from "./strategy-llm-teacher";
import { nemesisPolicyStrategy } from "./strategy-nemesis";
import {
  FALLBACK_RECORDED_AS,
  FALLBACK_STRATEGY,
  type MovedOn,
  type StrategyOutcome,
  type TeachingContext,
  type TeachingStrategy,
  type TeachingStrategyId,
} from "./teaching-strategy";

const REGISTRY: Record<TeachingStrategyId, TeachingStrategy> = {
  llm_teacher: llmTeacherStrategy,
  nemesis_policy: nemesisPolicyStrategy,
  // 🔴 THE SAME OBJECT AS `nemesis_policy`, DELIBERATELY. The fallback is not a third controller —
  // it is the structured policy, running under a name that says WHY it ran. A separate
  // implementation here would be a second copy of the product's own cognition, which is the thing
  // `strategy-nemesis.ts`'s header forbids in the strongest terms it has.
  nemesis_policy_fallback: nemesisPolicyStrategy,
};

/** The raw arm. 🔴 No fallback. Tests and experiments use this when they need to observe an arm's
 *  own behaviour, including its failures. */
export function strategyFor(id: TeachingStrategyId): TeachingStrategy {
  return REGISTRY[id];
}

/**
 * How many times a controller may say "move on" before the Canvas insists on something to show.
 *
 * 🔴 A BOUND ON A LOOP, NOT A PEDAGOGICAL CONSTANT. It decides nothing about teaching: the
 * controller can pass over anything it likes, and this only caps how many passes happen inside ONE
 * turn before the learner is shown whatever is left. Without it a controller that decided to skip
 * everything would spend one model call per objective on a single turn — real money, and a canvas
 * that appears to hang. Three is enough for "these first few are not worth it" and small enough that
 * the worst turn costs four calls rather than forty.
 */
const MAX_PASSES = 3;

/**
 * What the PRODUCT runs: the assigned arm, and the structured policy behind it if that arm cannot
 * decide.
 *
 * 🔴🔴 THIS DID NOT EXIST, AND ITS ABSENCE WAS CORRECT UNTIL TODAY. While the model arm was a
 * default-off baseline, `teaching-strategy.ts` argued at length that a fallback would be
 * catastrophic: the LLM arm would quietly BE the Nemesis arm, every metric would report the two as
 * equivalent, and the conclusion drawn would be "structured cognition adds nothing" when what
 * actually happened is that the baseline never ran. That argument is still right, and it is about
 * SILENCE rather than about falling back.
 *
 * Now that the model controller is the default, a refusal is not a wasted experimental turn — it is
 * a learner staring at a blank canvas because an upstream provider blinked. So the fallback exists,
 * and the whole danger is removed by making it loud: the decision is recorded as
 * `nemesis_policy_fallback`, never as `nemesis_policy`, so a turn the model failed to decide can
 * never be counted as a turn the structured arm was chosen for. `compareStrategies` filters on the
 * exact id, so fallback rows are excluded from BOTH arms rather than folded into one.
 *
 * 🔴 AND THE ORIGINAL REFUSAL IS CARRIED, NOT DISCARDED. "How often did the model controller fail,
 * and how" stays a count rather than becoming a guess — which is the instrument that would otherwise
 * have gone quiet in exactly the conditions that break it.
 */
export async function controllerFor(
  id: TeachingStrategyId,
  context: TeachingContext,
): Promise<StrategyOutcome> {
  // 🔴🔴 "MOVE ON" IS A DECISION THE CANVAS STILL HAS TO SURVIVE. When the controller answers
  // `advance` or `revisit`, it has genuinely decided — but the learner is looking at a surface that
  // needs something on it, so the objective is set aside and the controller is asked again over
  // what is left. This is what makes `advance` first-class rather than "what happens when every
  // other action disappeared": it ends an objective's turn without ending the sitting.
  //
  // 🔴 AND THE SET-ASIDE IS LOCAL TO THIS CALL. Nothing is written, nothing persists past the turn,
  // and the objectives come back on the next one unless the runtime records them — which it does,
  // from `movedOn`, into the same session-local list `actedOn` already uses.
  const movedOn: MovedOn[] = [];
  let remaining = context.objectives;
  let outcome: StrategyOutcome = await REGISTRY[id].decide(context);

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const action = outcome.decision?.action;
    if (!action || (action.type !== "advance" && action.type !== "revisit")) break;
    movedOn.push({
      action: action.type,
      because: action.because,
      objectiveIdentityKey: outcome.decision!.objective.identityKey,
    });
    remaining = remaining.filter(
      (entry) => entry.objective.identityKey !== outcome.decision!.objective.identityKey,
    );
    // Nothing left to offer. The surface already knows how to say so honestly, and saying it is
    // better than putting back the very thing the controller just declined.
    if (remaining.length === 0) {
      return { decision: null, movedOn, refusal: null, strategy: outcome.strategy };
    }
    outcome = await REGISTRY[id].decide({ ...context, objectives: remaining });
  }
  if (movedOn.length > 0) outcome = { ...outcome, movedOn };
  // 🔴 A REFUSAL, NOT A `null` DECISION. `decision: null, refusal: null` is the honest "nothing is
  // owed" — every objective demonstrated, the canvas worked through — and falling back on it would
  // ask the structured policy to find work where the controller correctly found none.
  if (!outcome.refusal) return outcome;
  // 🔴 AND NEVER FOR `no-candidates`. That refusal means the knowledge layer handed the controller
  // nothing, which the structured policy would meet identically. Retrying it would spend a second
  // pass to reach the same empty answer and would file a fallback where no controller failed.
  if (outcome.refusal === "no-candidates") return outcome;
  if (id === FALLBACK_STRATEGY || id === FALLBACK_RECORDED_AS) return outcome;

  const rescued = await REGISTRY[FALLBACK_STRATEGY].decide(context);
  if (!rescued.decision) {
    // The fallback found nothing either. Report the ORIGINAL refusal: what needs explaining is why
    // the assigned controller failed, not that a second one then agreed there was nothing to do.
    return outcome;
  }
  return {
    // The passes that happened before the refusal still happened, and the runtime still has to know
    // about them — dropping them here would put the skipped objectives straight back on the next turn.
    ...(movedOn.length > 0 ? { movedOn } : {}),
    decision: {
      ...rescued.decision,
      rationale: {
        after: outcome.refusal,
        // The literal rather than the constant: `DecisionRationale`'s discriminant has to be a
        // single value for the union to narrow, and `FALLBACK_RECORDED_AS` is typed as the whole id
        // union. The constant is still what `strategy` below is set from, so the two cannot name
        // different arms — and a test pins that they agree.
        by: "nemesis_policy_fallback",
        // The structured policy's own trace, unchanged. What it weighed is exactly what it always
        // weighs; only the reason it was asked is new.
        selection:
          rescued.decision.rationale.by === "nemesis_policy"
            ? rescued.decision.rationale.selection
            : { reasons: [], score: 0 },
      },
    },
    refusal: null,
    strategy: FALLBACK_RECORDED_AS,
  };
}
