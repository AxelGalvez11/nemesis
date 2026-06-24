// Step 1: classify intent + entity mentions + safety flags (Claude Haiku, forced
// tool_use -> guaranteed structured). Cheap + fast; the heavy reasoning is in generate.

import { callTool } from "./llm.ts";
import { CLASSIFY_SYSTEM, CLASSIFY_TOOL, INTENTS, SAFETY_FLAGS } from "./prompts.ts";
import type { Intent, SafetyFlag } from "../../../packages/shared/src/answer.ts";

// DeepSeek-V3 (deepseek-chat) supports function calling; the reasoner (R1) does
// not, so both steps use deepseek-chat. Swap via LLM_BASE_URL + this id.
const CLASSIFY_MODEL = Deno.env.get("LLM_CLASSIFY_MODEL") ?? "deepseek-chat";

export interface Classification {
  intent: Intent;
  entity_mentions: string[];
  safety_flags: SafetyFlag[];
  model: string;
}

interface ClassifyToolInput {
  intent: Intent;
  entity_mentions?: string[];
  safety_flags?: SafetyFlag[];
}

const VALID_INTENTS = new Set<Intent>(INTENTS);
const VALID_FLAGS = new Set<SafetyFlag>(SAFETY_FLAGS);

/**
 * Defend against the classifier returning an intent OUTSIDE the union. The model is
 * told (CLASSIFY_TOOL) that intent is an enum, but the provider does not always
 * enforce tool-arg enums, so it can put a SafetyFlag value (observed:
 * "medication_change_request" on "should I stop my sertraline?") or any string in the
 * intent field. Such a value is silently unrecognized by every intent-keyed safety set
 * (SAFETY_FLOOR_INTENTS, ROUTE_TO_PROFESSIONAL_INTENTS), so it drops BOTH the required
 * safety floor AND the professional-routing backstop — and a terse answer can then omit
 * the clinician steer entirely. Fail-safe: preserve the leaked value as a safety flag
 * when it is a valid one, then remap the intent to health_context — a personal-decision
 * intent that carries the floor and (v10) the routing backstop. Pure + immutable.
 */
export function normalizeClassification(
  intent: string,
  flags: readonly SafetyFlag[],
): { intent: Intent; safety_flags: SafetyFlag[] } {
  if (VALID_INTENTS.has(intent as Intent)) {
    return { intent: intent as Intent, safety_flags: [...flags] };
  }
  const preserved = VALID_FLAGS.has(intent as SafetyFlag) && !flags.includes(intent as SafetyFlag)
    ? [...flags, intent as SafetyFlag]
    : [...flags];
  return { intent: "health_context", safety_flags: preserved };
}

export async function classify(question: string, apiKey: string): Promise<Classification> {
  const { input, model } = await callTool<ClassifyToolInput>(
    {
      model: CLASSIFY_MODEL,
      max_tokens: 512,
      temperature: 0,
      system: CLASSIFY_SYSTEM,
      tools: [CLASSIFY_TOOL],
      messages: [{ role: "user", content: question }],
    },
    "classify",
    apiKey,
  );
  const norm = normalizeClassification(input.intent, input.safety_flags ?? []);
  return {
    intent: norm.intent,
    entity_mentions: input.entity_mentions ?? [],
    safety_flags: norm.safety_flags,
    model,
  };
}
