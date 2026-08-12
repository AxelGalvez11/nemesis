// Which model answers this turn, and in which thinking mode.
//
// Lifted out of nemesis-llm/index.ts so the one decision that decides what a
// student's money buys can be tested without a network, a device key, or a
// deploy. The valve calls this and does nothing else with plan strings.
//
// 🔴 THE RULE THIS REPLACES was `ctx.plan === 'pro' || ctx.plan === 'max'`,
// written three times. Every production account is `enterprise`, so the premium
// lane was unreachable by everyone — silently, because a model that answers is
// indistinguishable from the right model answering unless you check which one
// replied. Plans are now asked for CAPABILITIES (plan-capabilities.ts).
//
// 🔴🔴 AND THE LANE HAD A SECOND LOCK ON IT. The gate also required High effort,
// which it read out of the request body — and no client has sent High since the
// composer's effort pill was removed (phone #369, web 2026-07-31). Both surfaces
// pin Medium, and Medium *strips* the one branch that ever set it. So the
// premium lane was unreachable for two independent reasons, and fixing the plan
// gate alone would have changed nothing at all.
//
// Effort is now the SERVER'S judgement, made from the student's own words by
// work-class.ts. Nothing a client puts in the body can raise the tier.

import { resolvePlanCapabilities, type PlanCapabilities } from "./plan-capabilities.ts";
import { carriesAttachment, promptOnly, type WorkClass, type WorkReason, type WorkSignals } from "./work-class.ts";

export const FLASH_MODEL = "deepseek-v4-flash";
export const PRO_MODEL = "deepseek-v4-pro";

export type ThinkingMode = { type: "enabled" | "disabled" } | undefined;

export interface ModelChoice {
  /** The model id to send upstream. */
  model: string;
  /** The DeepSeek `thinking` selector, or undefined to leave the default. */
  thinking: ThinkingMode;
  /** Drop the effort selectors — the lane does not accept them. */
  dropEffortSelectors: boolean;
  /** Which lane was chosen, for the trace. */
  lane: "glm" | "pro" | "flash-thinking" | "flash";
  /** The capabilities that produced this choice. */
  capabilities: PlanCapabilities;
  /** How hard the server judged the turn to be. */
  workClass: WorkClass;
  /** Which signal decided that, as a loggable slug. */
  reason: WorkReason;
  /** True when the class asked for the premium lane and the account, or a
   *  server flag, did not grant it. The answer still arrives on the fast model
   *  — this is how a plan limit becomes visible instead of silent. */
  downgraded: boolean;
}

export interface ModelRequest {
  /** What the client asked for. HONOURED ONLY FOR `glm*` — see chooseModel. */
  requestedModel: string;
  /** The server's own judgement of the turn (work-class.ts). */
  workClass: WorkClass;
  /** The signal behind it, carried through to the trace. */
  reason: WorkReason;
  plan: string | null | undefined;
  status: string | null | undefined;
  /** Server flags. */
  proHighMode: boolean;
  glmHighMode: boolean;
  glmConfigured: boolean;
  glmModel: string;
}

/**
 * The retired aliases, mapped.
 *
 * 🔴 `deepseek-reasoner` HAS NEVER MEANT v4-pro. It means the fast model with
 * thinking switched ON, and it always did — the alias that died on 2026-07-24
 * was thinking-on Flash. Reading it as "the premium model" is the single
 * easiest mistake to make in this file.
 *
 * Any unrecognised id maps to Flash rather than passing through: the valve owns
 * the model name because the valve pays for it, and a client naming a model we
 * do not sell would otherwise surface the provider's raw 400 to a student.
 */
function isGlmRequest(model: string): boolean {
  return model.toLowerCase().startsWith("glm");
}

/**
 * Choose the lane.
 *
 * 🔴 ONLY A `complex` TURN EVER REACHES THE PREMIUM LANE. An entitled account
 * does not get v4-pro for "hi" — the owner was explicit: "Do not make every
 * Enterprise request use Pro." Small talk and ordinary work stay on the fast
 * model for every plan, which is also what keeps the margin model true.
 *
 * 🔴 AND THE CLIENT'S `model` IS NOT CONSULTED, except for `glm*`. It used to
 * be: `deepseek-chat` meant thinking off and `deepseek-reasoner` meant thinking
 * on, so a browser could pick the more expensive mode by changing one string in
 * a JSON body. The two aliases still ARRIVE — every shipped build sends one —
 * and they are now simply ignored, which is why there is a test that says so
 * rather than a comment. `glm*` survives because that is a different product
 * surface a caller opts into by name, not a tier.
 *
 * A `complex` turn that the plan does not reach is NOT refused. It runs on the
 * fast model with thinking on and answers honestly inside the plan's limits —
 * the owner's rule — and sets `downgraded` so the trace can say which happened.
 */
export function chooseModel(request: ModelRequest): ModelChoice {
  const capabilities = resolvePlanCapabilities(request.plan, request.status);
  const base = { capabilities, reason: request.reason, workClass: request.workClass };

  if (isGlmRequest(request.requestedModel)) {
    return { ...base, downgraded: false, dropEffortSelectors: true, lane: "glm", model: request.requestedModel, thinking: undefined };
  }

  const wantsPremium = request.workClass === "complex";

  // The top lane, when it is switched on and the account reaches it.
  if (wantsPremium && capabilities.highestReasoningTier && request.glmHighMode && request.glmConfigured) {
    return { ...base, downgraded: false, dropEffortSelectors: true, lane: "glm", model: request.glmModel, thinking: undefined };
  }

  // The premium reasoning lane.
  if (wantsPremium && capabilities.premiumReasoning && request.proHighMode) {
    // v4-pro reasons natively; it takes no thinking selector and no effort field.
    return { ...base, downgraded: false, dropEffortSelectors: true, lane: "pro", model: PRO_MODEL, thinking: undefined };
  }

  // Everything else is the fast model. Thinking is on for anything above small
  // talk — including a complex turn that did not reach the premium lane, which
  // is the most reasoning we can honestly give that account.
  const thinking: ThinkingMode = request.workClass === "simple" ? { type: "disabled" } : { type: "enabled" };
  return {
    ...base,
    downgraded: wantsPremium,
    dropEffortSelectors: false,
    lane: thinking.type === "enabled" ? "flash-thinking" : "flash",
    model: FLASH_MODEL,
    thinking,
  };
}

/** A capability token a client may declare in `x-nemesis-caps`. */
export const REASONING_ECHO_CAP = "reasoning-echo";

/**
 * Read the classifier's inputs out of an OpenAI-shaped request body.
 *
 * 🔴 THE LAST USER MESSAGE, NOT THE LAST MESSAGE. A turn makes one request per
 * tool round, and rounds two and three end in `role:"tool"`. Reading the tail
 * would classify a JSON tool result — a few dozen characters of machine output —
 * as the student's question, and every multi-round turn would collapse to
 * `brief_request` on its second breath.
 */
export function signalsFromBody(
  body: Record<string, unknown>,
  capsHeader: string | null,
): WorkSignals & { toolNames: string[] } {
  const messages = Array.isArray(body.messages) ? (body.messages as Record<string, unknown>[]) : [];
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user" && typeof messages[i]?.content === "string") {
      lastUser = i;
      break;
    }
  }
  const wireText = lastUser >= 0 ? (messages[lastUser].content as string) : "";

  // 🔴 THIS TURN'S TOOLS, NOT THE THREAD'S. Everything before the last user
  // message belongs to questions already answered. Counting those would make
  // `escalationCandidate` fire on the word "hi" typed into a long conversation
  // where the student happened to read their calendar and their Library an hour
  // ago — and the whole point of that signal is to measure whether ONE turn
  // reached for two sources.
  const toolNames: string[] = [];
  for (const message of messages.slice(lastUser + 1)) {
    if (!Array.isArray(message?.tool_calls)) continue;
    for (const call of message.tool_calls as Record<string, unknown>[]) {
      const name = (call?.function as { name?: unknown } | undefined)?.name;
      if (typeof name === "string") toolNames.push(name);
    }
  }

  const declared = (capsHeader ?? "").split(",").map((token) => token.trim().toLowerCase());
  const toolsRide = Array.isArray(body.tools) && body.tools.length > 0;

  return {
    forcesTool: body.tool_choice !== undefined && body.tool_choice !== "auto" && body.tool_choice !== "none",
    hasAttachment: carriesAttachment(wireText),
    prompt: promptOnly(wireText),
    toolNames,
    toolsWithoutReasoningEcho: toolsRide && !declared.includes(REASONING_ECHO_CAP),
  };
}

/**
 * Fields that mean something to DeepSeek and nothing to anyone else.
 *
 * 🔴 `reasoning_content` ON A MESSAGE IS DEEPSEEK-ONLY. When an outage moves a
 * conversation to GLM, Qwen, Kimi or Anthropic mid-flight, the history still
 * carries the assistant turns we echoed it back on — a field those providers
 * never defined. Most OpenAI-compatible servers ignore unknown message fields;
 * "most" is not a guarantee to bet an outage on, and an outage is exactly when
 * nobody is watching. Stripped on the way out instead.
 */
export function stripDeepSeekOnlyFields(body: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...body };
  delete cleaned.thinking;
  delete cleaned.reasoning;
  delete cleaned.reasoning_effort;
  if (Array.isArray(cleaned.messages)) {
    cleaned.messages = (cleaned.messages as Record<string, unknown>[]).map((message) => {
      if (!message || typeof message !== "object" || !("reasoning_content" in message)) return message;
      const { reasoning_content: _dropped, ...rest } = message;
      return rest;
    });
  }
  return cleaned;
}
