// The structured arm: Nemesis's own cognition, behind the strategy interface.
//
// 🔴 A WRAPPER, AND IT MUST STAY ONE. Every teaching decision this arm makes is still
// `decideNext` — the projected learner state, the prerequisite graph, the working-memory window,
// the retrieval-eligibility interval, the value function's bands and modifiers, the misconception
// contrast. Nothing was reimplemented to fit the interface and nothing may be. If a rule ever exists
// here that does not exist in `policy-runtime.ts`, the arm being measured has stopped being the
// product, and a favourable result would say nothing about what learners actually meet.
//
// 🔴 THE PROOF THAT IT IS UNCHANGED IS THAT ITS TESTS DID NOT MOVE. `correction-loop.test.ts`,
// `product-invariants.test.ts`, `exposition-wiring.test.ts` and `policy-looks-again.test.ts` all
// exercise `decideNext` directly and were not touched to accommodate the strategy layer. A change
// here that altered behaviour would have to break one of them.
//
// 🔴 ASYNC OVER A SYNCHRONOUS FUNCTION, ON PURPOSE. This cannot block and gains nothing from a
// promise. It has one so that both arms sit at the same point in the React lifecycle: if this ran
// inside a `useMemo` while the model arm ran inside an effect, they would settle at different times
// relative to the evidence they were computed from, and "only the teaching controller changes" would
// be false in the one place it matters most.

import { decideNext } from "./policy-runtime";
import type { StrategyOutcome, TeachingContext, TeachingStrategy } from "./teaching-strategy";

export const nemesisPolicyStrategy: TeachingStrategy = {
  id: "nemesis_policy",
  async decide(context: TeachingContext): Promise<StrategyOutcome> {
    // 🔴 STATED RATHER THAN COLLAPSED INTO "NOTHING IS OWED". A canvas with no candidates and a
    // canvas where everything has just been demonstrated both produce no decision, and they are
    // opposite facts: the first means the knowledge layer gave us nothing to work with, the second
    // means the teaching worked. The comparison has to be able to tell them apart, and so does
    // anyone reading a session that went quiet.
    if (context.objectives.length === 0) {
      return { decision: null, refusal: "no-candidates", strategy: "nemesis_policy" };
    }
    const decision = decideNext({
      evidence: context.evidence,
      now: context.now,
      objectives: context.objectives,
      ...(context.actedOn ? { actedOn: context.actedOn } : {}),
      ...(context.correctionsShown ? { correctionsShown: context.correctionsShown } : {}),
      ...(context.lookups ? { lookups: context.lookups } : {}),
    });
    // 🔴 `null` WITH NO REFUSAL IS THE HONEST "NOTHING IS OWED" AND IS NOT A FAILURE. Every
    // objective advanced, which is what success looks like on a canvas the learner has worked
    // through. `uid` and `signal` are deliberately not read: this arm reaches nothing.
    return { decision, refusal: null, strategy: "nemesis_policy" };
  },
};
