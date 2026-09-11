// The web app's conversational turn, imported. See web.ts for the rule (pure modules only).
export {
  courseGate,
  decisionOrReply,
  HISTORY_TURNS,
  turnRouterMessages,
  type TurnContext,
  type TurnDecision,
  type TurnExchange,
} from "../../../web/lib/learn/turn-router.ts";
export { groundingBlock } from "../../../web/lib/learn/canvas-grounding.ts";
export { sourceDisagreementInstruction } from "../../../web/lib/workspace/source-authority.ts";
export { loadMemory, memoryBlock, type MemoryLine } from "../../../web/lib/learn/learner-memory.ts";
export { replySegments } from "../../../web/lib/learn/reply-visuals.ts";
export { type TurnStage } from "../../../web/lib/learn/turn-preview.ts";
