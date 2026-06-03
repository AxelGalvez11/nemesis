// Step 1: classify intent + entity mentions + safety flags (Claude Haiku, forced
// tool_use -> guaranteed structured). Cheap + fast; the heavy reasoning is in generate.

import { callTool } from "./anthropic.ts";
import { CLASSIFY_SYSTEM, CLASSIFY_TOOL } from "./prompts.ts";
import type { Intent, SafetyFlag } from "../../../packages/shared/src/answer.ts";

const CLASSIFY_MODEL = "claude-haiku-4-5-20251001";

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

export async function classify(question: string, apiKey: string): Promise<Classification> {
  const { input, model } = await callTool<ClassifyToolInput>(
    {
      model: CLASSIFY_MODEL,
      max_tokens: 512,
      system: [{ type: "text", text: CLASSIFY_SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [CLASSIFY_TOOL],
      messages: [{ role: "user", content: question }],
    },
    "classify",
    apiKey,
  );
  return {
    intent: input.intent,
    entity_mentions: input.entity_mentions ?? [],
    safety_flags: input.safety_flags ?? [],
    model,
  };
}
