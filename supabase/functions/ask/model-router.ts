export type ModelSlot = "classify" | "scope" | "generate" | "research" | "verify";

export function modelFor(slot: ModelSlot): string {
  if (slot === "classify") return Deno.env.get("LLM_CLASSIFY_MODEL") ?? "deepseek-chat";
  if (slot === "scope") {
    return Deno.env.get("LLM_SCOPE_MODEL") ??
      Deno.env.get("LLM_CLASSIFY_MODEL") ??
      "deepseek-chat";
  }
  if (slot === "research") {
    return Deno.env.get("LLM_RESEARCH_MODEL") ??
      Deno.env.get("LLM_GENERATE_MODEL") ??
      "deepseek-chat";
  }
  if (slot === "verify") {
    return Deno.env.get("LLM_VERIFY_MODEL") ??
      Deno.env.get("LLM_GENERATE_MODEL") ??
      "deepseek-chat";
  }
  return Deno.env.get("LLM_GENERATE_MODEL") ?? "deepseek-chat";
}
