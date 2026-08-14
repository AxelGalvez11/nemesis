// The one place an arm name becomes a controller.
//
// 🔴 SEPARATE FROM `teaching-strategy.ts` BECAUSE THAT FILE HAS NO RUNTIME IMPORTS AT ALL, AND KEEPING
// IT THAT WAY IS WHAT LETS `learner-evidence.ts` AND `learner-store.ts` DEPEND ON IT WITHOUT A CYCLE.
// The interface and the id are needed by the persistence layer; the implementations pull in the
// model client, the judge and the whole cognition stack. Putting the registry there would drag all
// of that into every module that merely wants to name an arm.
//
// 🔴 EXHAUSTIVE OVER THE UNION, SO A THIRD ARM CANNOT BE HALF-ADDED. `Record<TeachingStrategyId, …>`
// makes a missing entry a compile error rather than a runtime `undefined` that resolves to "no
// controller" and shows the learner a blank Canvas.

import { llmTeacherStrategy } from "./strategy-llm-teacher";
import { nemesisPolicyStrategy } from "./strategy-nemesis";
import type { TeachingStrategy, TeachingStrategyId } from "./teaching-strategy";

const REGISTRY: Record<TeachingStrategyId, TeachingStrategy> = {
  llm_teacher: llmTeacherStrategy,
  nemesis_policy: nemesisPolicyStrategy,
};

export function strategyFor(id: TeachingStrategyId): TeachingStrategy {
  return REGISTRY[id];
}
