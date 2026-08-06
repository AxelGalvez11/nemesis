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

import { resolvePlanCapabilities, type PlanCapabilities } from "./plan-capabilities.ts";

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
}

export interface ModelRequest {
  /** What the client asked for (`deepseek-chat`, `deepseek-reasoner`, `glm*`…). */
  requestedModel: string;
  /** Whether this turn carries High effort, in any of its three encodings. */
  effortHigh: boolean;
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
function resolveAlias(model: string): { model: string; thinking: ThinkingMode } {
  const m = model.toLowerCase();
  if (m === "deepseek-chat") return { model: FLASH_MODEL, thinking: { type: "disabled" } };
  if (m === "deepseek-reasoner") return { model: FLASH_MODEL, thinking: { type: "enabled" } };
  if (m.includes("v4-flash")) return { model, thinking: { type: "disabled" } };
  // A client naming v4-pro cannot buy it: premium routing is server-owned and
  // gated on the plan, not on what the request asks for.
  if (m.includes("v4-pro")) return { model: FLASH_MODEL, thinking: { type: "enabled" } };
  return { model: FLASH_MODEL, thinking: { type: "disabled" } };
}

/**
 * Choose the lane.
 *
 * 🔴 ONLY High EVER REACHES THE PREMIUM LANE. An entitled account does not get
 * v4-pro for "hi" — the owner was explicit: "Do not make every Enterprise
 * request use Pro—only the intended High lane." Instant and ordinary Medium
 * stay on Flash for every plan, which is also what keeps the margin model true.
 */
export function chooseModel(request: ModelRequest): ModelChoice {
  const capabilities = resolvePlanCapabilities(request.plan, request.status);
  const askedForGlm = request.requestedModel.toLowerCase().startsWith("glm");

  if (askedForGlm) {
    return { capabilities, dropEffortSelectors: true, lane: "glm", model: request.requestedModel, thinking: undefined };
  }

  // The top lane, when it is switched on and the account reaches it.
  if (request.effortHigh && capabilities.highestReasoningTier && request.glmHighMode && request.glmConfigured) {
    return { capabilities, dropEffortSelectors: true, lane: "glm", model: request.glmModel, thinking: undefined };
  }

  // The premium reasoning lane.
  if (request.effortHigh && capabilities.premiumReasoning && request.proHighMode) {
    // v4-pro reasons natively; it takes no thinking selector and no effort field.
    return { capabilities, dropEffortSelectors: true, lane: "pro", model: PRO_MODEL, thinking: undefined };
  }

  const alias = resolveAlias(request.requestedModel);
  // A High turn that did NOT qualify still gets the fast model's own deep
  // thinking rather than an error — a student who picked High is never refused,
  // they simply are not upgraded.
  const thinking: ThinkingMode = request.effortHigh ? { type: "enabled" } : alias.thinking;
  return {
    capabilities,
    dropEffortSelectors: false,
    lane: thinking?.type === "enabled" ? "flash-thinking" : "flash",
    model: alias.model,
    thinking,
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
