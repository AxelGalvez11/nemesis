// Step 1: classify intent + entity mentions + safety flags (Claude Haiku, forced
// tool_use -> guaranteed structured). Cheap + fast; the heavy reasoning is in generate.

import { callTool } from "./llm.ts";
import { CLASSIFY_SYSTEM, CLASSIFY_TOOL } from "./prompts.ts";
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
  return {
    intent: input.intent,
    entity_mentions: input.entity_mentions ?? [],
    safety_flags: input.safety_flags ?? [],
    model,
  };
}
