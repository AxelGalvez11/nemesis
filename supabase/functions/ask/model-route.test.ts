// Tests for per-mode model routing. The CRITICAL guarantee is DEFAULT-OFF: with no
// routing env set, routeModel() returns the caller's legacy model with NO thinking
// field, so production behavior is byte-identical until the routing is switched on.
// Run: deno test supabase/functions/ask/model-route.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { groundingEnabled, modelRoutingEnabled, routeModel } from "./model-route.ts";

const ROUTING_ENV = [
  "MODEL_ROUTING_ENABLED",
  "GROUNDING_ENABLED",
  "ROUTE_CLASSIFY_MODEL",
  "ROUTE_GENERATE_FAST_MODEL",
  "ROUTE_GENERATE_THOROUGH_MODEL",
  "ROUTE_RESEARCH_MODEL",
  "ROUTE_THOROUGH_EFFORT",
  "ROUTE_RESEARCH_EFFORT",
];

function clearEnv() {
  for (const k of ROUTING_ENV) Deno.env.delete(k);
}

function withEnv(env: Record<string, string>, fn: () => void) {
  clearEnv();
  for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);
  try {
    fn();
  } finally {
    clearEnv();
  }
}

// ---- DEFAULT-OFF: the safety guarantee ----

Deno.test("routeModel: disabled by default returns legacy model, no thinking", () => {
  clearEnv();
  for (const role of ["classify", "generate", "research"] as const) {
    const c = routeModel(role, { legacyModel: "gpt-4.1-mini", style: "thorough" });
    assertEquals(c.model, "gpt-4.1-mini", `${role} keeps legacy model`);
    assertEquals(c.thinking, undefined, `${role} sends no thinking field when off`);
    assertEquals(c.reasoningEffort, undefined, `${role} sends no effort when off`);
  }
});

Deno.test("routeModel: an explicitly disabled flag is still off", () => {
  withEnv({ MODEL_ROUTING_ENABLED: "0" }, () => {
    const c = routeModel("generate", { legacyModel: "gpt-4o-mini", style: "plain" });
    assertEquals(c.model, "gpt-4o-mini");
    assertEquals(c.thinking, undefined);
  });
});

Deno.test("modelRoutingEnabled: accepts 1/true (case-insensitive), rejects others", () => {
  for (const v of ["1", "true", "TRUE", "True"]) {
    withEnv({ MODEL_ROUTING_ENABLED: v }, () => assert(modelRoutingEnabled(), `'${v}' enables`));
  }
  for (const v of ["0", "false", "", "yes", "on"]) {
    withEnv({ MODEL_ROUTING_ENABLED: v }, () => assert(!modelRoutingEnabled(), `'${v}' stays off`));
  }
  clearEnv();
  assert(!modelRoutingEnabled(), "unset stays off");
});

Deno.test("groundingEnabled: off by default; follows MODEL_ROUTING_ENABLED; independently overridable", () => {
  clearEnv();
  assert(!groundingEnabled(), "off by default — prod prompt unchanged");
  withEnv({ MODEL_ROUTING_ENABLED: "1" }, () => assert(groundingEnabled(), "rides with the DeepSeek routing experiment"));
  withEnv({ GROUNDING_ENABLED: "1" }, () => assert(groundingEnabled(), "can be forced on alone (e.g. OpenAI A/B)"));
  withEnv({ MODEL_ROUTING_ENABLED: "1", GROUNDING_ENABLED: "0" }, () => assert(!groundingEnabled(), "GROUNDING_ENABLED=0 overrides routing-on"));
});

// ---- ENABLED: the three modes ----

Deno.test("routeModel: Fast (plain) -> flash NON-thinking", () => {
  withEnv({ MODEL_ROUTING_ENABLED: "1" }, () => {
    const c = routeModel("generate", { legacyModel: "x", style: "plain" });
    assertEquals(c.model, "deepseek-v4-flash");
    assertEquals(c.thinking, "disabled");
    assertEquals(c.reasoningEffort, undefined);
  });
});

Deno.test("routeModel: default register (undefined style) -> flash NON-thinking", () => {
  withEnv({ MODEL_ROUTING_ENABLED: "1" }, () => {
    const c = routeModel("generate", { legacyModel: "x" });
    assertEquals(c.model, "deepseek-v4-flash");
    assertEquals(c.thinking, "disabled");
  });
});

Deno.test("routeModel: Thorough -> flash THINKING high (callTool runs it via auto + fallback)", () => {
  withEnv({ MODEL_ROUTING_ENABLED: "1" }, () => {
    const c = routeModel("generate", { legacyModel: "x", style: "thorough" });
    assertEquals(c.model, "deepseek-v4-flash");
    assertEquals(c.thinking, "enabled");
    assertEquals(c.reasoningEffort, "high");
  });
});

Deno.test("routeModel: Deep Research -> pro THINKING high (strongest tier, auto + fallback)", () => {
  withEnv({ MODEL_ROUTING_ENABLED: "1" }, () => {
    const c = routeModel("research", { legacyModel: "x" });
    assertEquals(c.model, "deepseek-v4-pro");
    assertEquals(c.thinking, "enabled");
    assertEquals(c.reasoningEffort, "high");
  });
});

Deno.test("routeModel: classify -> flash NON-thinking", () => {
  withEnv({ MODEL_ROUTING_ENABLED: "1" }, () => {
    const c = routeModel("classify", { legacyModel: "x" });
    assertEquals(c.model, "deepseek-v4-flash");
    assertEquals(c.thinking, "disabled");
  });
});

// ---- ENABLED: env overrides (tune models/effort without a code change) ----

Deno.test("routeModel: per-role model + effort overrides are honored", () => {
  withEnv({
    MODEL_ROUTING_ENABLED: "1",
    ROUTE_CLASSIFY_MODEL: "classify-x",
    ROUTE_GENERATE_FAST_MODEL: "fast-x",
    ROUTE_GENERATE_THOROUGH_MODEL: "thorough-x",
    ROUTE_RESEARCH_MODEL: "research-x",
    ROUTE_THOROUGH_EFFORT: "max",
    ROUTE_RESEARCH_EFFORT: "max",
  }, () => {
    assertEquals(routeModel("classify", { legacyModel: "x" }).model, "classify-x");
    assertEquals(routeModel("generate", { legacyModel: "x", style: "plain" }).model, "fast-x");
    const thorough = routeModel("generate", { legacyModel: "x", style: "thorough" });
    assertEquals(thorough.model, "thorough-x");
    assertEquals(thorough.reasoningEffort, "max");
    const research = routeModel("research", { legacyModel: "x" });
    assertEquals(research.model, "research-x");
    assertEquals(research.reasoningEffort, "max");
  });
});
