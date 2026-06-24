// Per-mode model routing for the /ask engine.
//
// DEFAULT-OFF BY DESIGN: unless MODEL_ROUTING_ENABLED is "1"/"true", routeModel()
// returns the caller's existing (legacy) model with NO thinking field. That makes the
// whole module a no-op in production until it is explicitly switched on — so this can
// land safely and the DeepSeek-V4 cutover stays a separate, deliberate env change
// gated on a faithfulness/citation re-validation run.
//
// When enabled, it maps the product's registers onto DeepSeek V4:
//   Fast (plain)      -> v4-flash, non-thinking
//   Thorough          -> v4-flash, non-thinking   (deeper via prompt + wider retrieval, same tier)
//   Deep Research     -> v4-pro,   non-thinking   (stronger model + 1M context for long reports)
//   classify + light  -> v4-flash, non-thinking
//
// WHY NON-THINKING EVERYWHERE (verified 2026-06-24 against the live API): the engine gets structured
// output by FORCING a tool call (callTool -> tool_choice:{function}), and DeepSeek V4 thinking mode
// REJECTS a forced tool_choice — HTTP 400 "Thinking mode does not support this tool_choice". V4 also
// defaults thinking ON, so every call MUST send {"thinking":{"type":"disabled"}} or it 400s. Unlocking
// real chain-of-thought would require switching these sites to tool_choice:"auto" + a no-tool-call
// fallback (the model CAN reason+call a tool when not forced) — separate future work. Model ids are
// env-overridable (ROUTE_*). deepseek-chat/-reasoner deprecate 2026-07-24.

export type ThinkingMode = "enabled" | "disabled";

export interface ModelChoice {
  model: string;
  /** Omitted entirely when routing is off, so the legacy/OpenAI request shape is unchanged. */
  thinking?: ThinkingMode;
  /** DeepSeek reasoning_effort (e.g. "high"/"max"); only set for thinking registers. */
  reasoningEffort?: string;
}

export type GenStyle = "plain" | "thorough" | undefined;
export type Role = "classify" | "generate" | "research";

const FLASH = "deepseek-v4-flash";
const PRO = "deepseek-v4-pro";

export function modelRoutingEnabled(): boolean {
  const v = (Deno.env.get("MODEL_ROUTING_ENABLED") ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}

function env(name: string, fallback: string): string {
  const v = Deno.env.get(name);
  return v && v.length > 0 ? v : fallback;
}

/**
 * Resolve the model + thinking flags for a call site. `legacyModel` is the model the
 * caller uses today; it is returned verbatim (with no thinking field) whenever routing
 * is disabled, guaranteeing zero behavior change until the cutover.
 */
export function routeModel(role: Role, opts: { style?: GenStyle; legacyModel: string }): ModelChoice {
  if (!modelRoutingEnabled()) return { model: opts.legacyModel };

  // All call sites force a tool call for guaranteed structured output, so thinking MUST be disabled
  // (forced tool_choice + thinking = HTTP 400). The register depth difference is carried by the
  // prompt + retrieval breadth, and Deep Research additionally steps up to the stronger pro model.
  switch (role) {
    case "classify":
      return { model: env("ROUTE_CLASSIFY_MODEL", FLASH), thinking: "disabled" };
    case "research":
      return { model: env("ROUTE_RESEARCH_MODEL", PRO), thinking: "disabled" };
    case "generate":
      if (opts.style === "thorough") {
        return { model: env("ROUTE_GENERATE_THOROUGH_MODEL", FLASH), thinking: "disabled" };
      }
      // Fast (plain) and the standard/default register both use the quick non-thinking path.
      return { model: env("ROUTE_GENERATE_FAST_MODEL", FLASH), thinking: "disabled" };
  }
}
