// Per-slot model routing, env-driven. Any slot may name a REASONER-class model (e.g.
// "deepseek-reasoner"): llm.ts detects it (isReasonerModel) and switches that call to the
// JSON-in-text protocol with automatic fallback to the chat-class model — so flipping
// LLM_RESEARCH_MODEL / LLM_VERIFY_MODEL to the reasoner is a pure config change, no deploy.
// Latency guidance: reasoner belongs in background slots (research synthesis, faithfulness
// verify), NOT the interactive classify/generate path.
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
