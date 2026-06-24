// Per-mode model routing for the /ask engine.
//
// DEFAULT-OFF BY DESIGN: unless MODEL_ROUTING_ENABLED is "1"/"true", routeModel()
// returns the caller's existing (legacy) model with NO thinking field. That makes the
// whole module a no-op in production until it is explicitly switched on — so this can
// land safely and the DeepSeek-V4 cutover stays a separate, deliberate env change
// gated on a faithfulness/citation re-validation run.
//
// When enabled, it maps the product's three registers onto DeepSeek V4:
//   Fast (plain)      -> v4-flash, non-thinking      (quick gist, lowest latency/cost)
//   Thorough          -> v4-flash, thinking          (deeper register, CoT before answer)
//   Deep Research     -> v4-pro,   thinking          (hardest multi-doc reasoning, 1M ctx)
//   classify + light  -> v4-flash, non-thinking      (function-calling, fast)
// Every model id + effort is env-overridable so we can retune without a deploy.
// Thinking mode is toggled per the DeepSeek API: body {"thinking":{"type":...}} +
// optional reasoning_effort (see llm.ts). deepseek-chat/-reasoner deprecate 2026-07-24.

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

  switch (role) {
    case "classify":
      return { model: env("ROUTE_CLASSIFY_MODEL", FLASH), thinking: "disabled" };
    case "research":
      return {
        model: env("ROUTE_RESEARCH_MODEL", PRO),
        thinking: "enabled",
        reasoningEffort: env("ROUTE_RESEARCH_EFFORT", "high"),
      };
    case "generate":
      if (opts.style === "thorough") {
        return {
          model: env("ROUTE_GENERATE_THOROUGH_MODEL", FLASH),
          thinking: "enabled",
          reasoningEffort: env("ROUTE_THOROUGH_EFFORT", "high"),
        };
      }
      // Fast (plain) and the standard/default register both use the quick non-thinking path.
      return { model: env("ROUTE_GENERATE_FAST_MODEL", FLASH), thinking: "disabled" };
  }
}
