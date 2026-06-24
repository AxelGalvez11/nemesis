// Per-mode model routing for the /ask engine.
//
// DEFAULT-OFF BY DESIGN: unless MODEL_ROUTING_ENABLED is "1"/"true", routeModel()
// returns the caller's existing (legacy) model with NO thinking field. That makes the
// whole module a no-op in production until it is explicitly switched on — so this can
// land safely and the DeepSeek-V4 cutover stays a separate, deliberate env change
// gated on a faithfulness/citation re-validation run.
//
// When enabled, it maps the product's registers onto DeepSeek V4:
//   Fast (plain)      -> v4-flash, non-thinking   (quick gist, lowest latency)
//   Thorough          -> v4-flash, thinking       (reasons before answering)
//   Deep Research     -> v4-pro,   thinking       (strongest model for long multi-paper reports)
//   classify + light  -> v4-flash, non-thinking   (fast, structured)
//
// THINKING vs OUR FORCED STRUCTURED OUTPUT (verified 2026-06-24 against the live API): a FORCED
// tool_choice is REJECTED in thinking mode (HTTP 400). callTool (llm.ts) resolves this — it runs the
// thinking registers with tool_choice:"auto" (the model reasons, then chooses to call the form) and
// FALLS BACK to the forced non-thinking path if a call doesn't materialize, so the structured-output
// guarantee always holds. V4 defaults thinking ON, so non-thinking roles must send "disabled"
// explicitly. Model ids + efforts are env-overridable (ROUTE_*). deepseek-chat/-reasoner deprecate 2026-07-24.

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

/** Quote-as-you-cite grounding toggle (Phase 1). Defaults to following MODEL_ROUTING_ENABLED — grounding
 *  rides with the DeepSeek experiment — but can be forced on/off independently via GROUNDING_ENABLED
 *  (e.g. to A/B grounding on the current OpenAI engine). Off by default, so prod is unchanged. */
export function groundingEnabled(): boolean {
  const v = (Deno.env.get("GROUNDING_ENABLED") ?? "").trim().toLowerCase();
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return modelRoutingEnabled();
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

  // Thinking is safe here because callTool runs it via tool_choice:"auto" and falls back to the
  // forced non-thinking path if a call doesn't materialize (llm.ts) — the structured-output guarantee
  // holds. Fast + classify stay non-thinking for latency; Thorough + Deep Research reason first.
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
