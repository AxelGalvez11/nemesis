import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { modelFor } from "./model-router.ts";

const KEYS = [
  "LLM_CLASSIFY_MODEL",
  "LLM_SCOPE_MODEL",
  "LLM_GENERATE_MODEL",
  "LLM_RESEARCH_MODEL",
  "LLM_VERIFY_MODEL",
] as const;

Deno.test("modelFor returns DeepSeek defaults for every slot", () => {
  withCleanEnv(() => {
    assertEquals(modelFor("classify"), "deepseek-chat");
    assertEquals(modelFor("scope"), "deepseek-chat");
    assertEquals(modelFor("generate"), "deepseek-chat");
    assertEquals(modelFor("research"), "deepseek-chat");
    assertEquals(modelFor("verify"), "deepseek-chat");
  });
});

Deno.test("modelFor routes slot overrides with fallback chains", () => {
  withCleanEnv(() => {
    Deno.env.set("LLM_CLASSIFY_MODEL", "cheap-classifier");
    Deno.env.set("LLM_GENERATE_MODEL", "strong-generator");
    assertEquals(modelFor("scope"), "cheap-classifier");
    assertEquals(modelFor("research"), "strong-generator");
    assertEquals(modelFor("verify"), "strong-generator");

    Deno.env.set("LLM_SCOPE_MODEL", "scope-specialist");
    Deno.env.set("LLM_RESEARCH_MODEL", "research-specialist");
    Deno.env.set("LLM_VERIFY_MODEL", "verifier");
    assertEquals(modelFor("scope"), "scope-specialist");
    assertEquals(modelFor("research"), "research-specialist");
    assertEquals(modelFor("verify"), "verifier");
  });
});

function withCleanEnv(fn: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const key of KEYS) {
    previous.set(key, Deno.env.get(key));
    Deno.env.delete(key);
  }
  try {
    fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}
