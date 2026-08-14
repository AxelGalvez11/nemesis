// What the cognition runtime can actually put in front of a learner — asked in ONE place.
//
// 🔴 THIS EXISTS BECAUSE THE SAME RULE WAS WRITTEN TWICE, IN TWO FILES, ON TWO LAYERS. Ownership
// (`knowledge-coverage.ts`, "may this canvas keep the policy runtime?") and selection
// (`policy-runtime.ts`, "which of these objectives may I act on?") are genuinely different
// questions, and both were answered by the identical literal `association + recall`. Two copies of
// one rule is one edit away from a canvas that is OWNED by the runtime and then finds every
// objective filtered out of it — a learner handed a Canvas with nothing on it, and no error
// anywhere, because each file is individually correct.
//
// 🔴 IT IS A CAPABILITY LEDGER, NOT A FEATURE FLAG. A line here is a claim that the whole chain
// exists for that pair: something MINTS the objective, something can WORD the question, the judge is
// told what to CHECK, and what comes back is evidence the projection can READ. Adding a line without
// those four is how a learner is asked a question the rest of the system cannot process.

import type { KnowledgeType } from "./knowledge-types";
import type { ObjectiveCapability } from "./learning-objective";

/**
 * The knowledge-type / capability pairs the runtime can stage end to end.
 *
 * 🔴 PAIRS, NEVER TWO INDEPENDENT LISTS. "Types we support" beside "capabilities we support" admits
 * their CROSS PRODUCT — a `recall` over a causal edge, an `explain` over an association — neither of
 * which anything mints and neither of which has a question that could be worded for it.
 */
const SUPPORTED: ReadonlySet<string> = new Set<string>([
  // The original slice: one term produced from another, judged against the term.
  "association|recall",
  // 🔴 THE FIRST CAPABILITY THAT IS NOT PRODUCTION-OF-A-TERM. One causal edge, asked as an account
  // ("what follows from X, and why?") rather than a lookup — the operation `openingOperation`
  // already names for causal knowledge. It is the first pair whose correction §39 gives a
  // `deliberate` exposition to, which is the first time the Canvas holds still and lets a learner
  // read something instead of flashing an answer past them.
  "causal|predict",
]);

/**
 * Can the runtime stage a task for this capability over this knowledge?
 *
 * 🔴 BOTH ARGUMENTS, ALWAYS. Asking with the type alone would answer "does anything work for causal
 * knowledge?", which is not a question any caller has — they hold an objective, and an objective is
 * a capability over a type. The knowledge type on its own cannot say what will be asked.
 */
export function runtimeCanStage(knowledgeType: KnowledgeType, capability: ObjectiveCapability): boolean {
  return SUPPORTED.has(`${knowledgeType}|${capability}`);
}

/**
 * Every pair, for tests and for anything that needs to report what the runtime covers.
 *
 * 🔴 EXPORTED SO A TEST CAN SWEEP IT RATHER THAN RESTATE IT. A test listing the pairs by hand is a
 * second copy of this ledger, and the copy silently stops matching the day a pair is added.
 */
export function supportedPairs(): { knowledgeType: KnowledgeType; capability: ObjectiveCapability }[] {
  return [...SUPPORTED].map((entry) => {
    const [knowledgeType, capability] = entry.split("|");
    return {
      capability: capability as ObjectiveCapability,
      knowledgeType: knowledgeType as KnowledgeType,
    };
  });
}
