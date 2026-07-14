// Tests for the dynamic intent-line gate + safety fallback (intent-line.ts). The networked
// generation is integration-tested live; here we pin the flag + the fail-safe contract.
// Run: deno test --allow-env supabase/functions/ask/
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dynamicIntentEnabled, generateIntentLine } from "./intent-line.ts";

Deno.test("flag is OFF by default", () => {
  Deno.env.delete("DYNAMIC_INTENT");
  assertEquals(dynamicIntentEnabled(), false);
  Deno.env.set("DYNAMIC_INTENT", "on");
  assertEquals(dynamicIntentEnabled(), true);
  Deno.env.delete("DYNAMIC_INTENT");
});

Deno.test("returns null with no LLM key (fail-safe → client shows its template)", async () => {
  const savedGeneric = Deno.env.get("LLM_API_KEY");
  const savedDeep = Deno.env.get("DEEPSEEK_API_KEY");
  const savedOpenai = Deno.env.get("OPENAI_API_KEY");
  Deno.env.delete("LLM_API_KEY");
  Deno.env.delete("DEEPSEEK_API_KEY");
  Deno.env.delete("OPENAI_API_KEY");
  try {
    assertEquals(await generateIntentLine("does metformin interact with alcohol", "somekey"), null);
  } finally {
    if (savedGeneric) Deno.env.set("LLM_API_KEY", savedGeneric);
    if (savedDeep) Deno.env.set("DEEPSEEK_API_KEY", savedDeep);
    if (savedOpenai) Deno.env.set("OPENAI_API_KEY", savedOpenai);
  }
});
