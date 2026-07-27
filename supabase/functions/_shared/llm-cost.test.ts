import { assertEquals } from "jsr:@std/assert@1";
import { costUsd, PRICES, resolveClient } from "./llm-cost.ts";

Deno.test("costUsd: bills cached input at the cached rate, not the miss rate", () => {
  // 1M prompt tokens, 900k of them served from cache, 100k output on v4-flash:
  // miss 100_000*0.14/1e6 = 0.014 | cached 900_000*0.0028/1e6 = 0.00252 | out 100_000*0.28/1e6 = 0.028
  // Billing all 1M input at the miss rate would be 0.168 — 3.8x this. That gap is the point.
  const { usd, priced } = costUsd("deepseek-v4-flash", {
    cacheHitTokens: 900_000,
    completionTokens: 100_000,
    promptTokens: 1_000_000,
  });
  assertEquals(priced, true);
  assertEquals(usd, 0.04452);
});

Deno.test("costUsd: a full cache miss costs the list input price", () => {
  const { usd } = costUsd("deepseek-v4-flash", {
    cacheHitTokens: 0,
    completionTokens: 0,
    promptTokens: 1_000_000,
  });
  assertEquals(usd, PRICES["deepseek-v4-flash"].inputPerM);
});

Deno.test("costUsd: the premium lanes cost multiples of the fast lane", () => {
  const split = { cacheHitTokens: 0, completionTokens: 1_000, promptTokens: 10_000 };
  const flash = costUsd("deepseek-v4-flash", split).usd!;
  const pro = costUsd("deepseek-v4-pro", split).usd!;
  const glm = costUsd("glm-5.2", split).usd!;
  assertEquals(Math.round((pro / flash) * 10) / 10, 3.1);
  assertEquals(Math.round(glm / flash), 11);
});

Deno.test("costUsd: an unknown model is UNPRICED, never $0", () => {
  const result = costUsd("some-new-model", { cacheHitTokens: 0, completionTokens: 500, promptTokens: 500 });
  assertEquals(result.priced, false);
  assertEquals(result.usd, null);
});

Deno.test("costUsd: model matching ignores case", () => {
  assertEquals(
    costUsd("DeepSeek-V4-Flash", { cacheHitTokens: 0, completionTokens: 0, promptTokens: 1_000_000 }).usd,
    0.14,
  );
});

Deno.test("costUsd: more cached tokens than prompt tokens can't go negative", () => {
  const { usd } = costUsd("deepseek-v4-flash", {
    cacheHitTokens: 5_000,
    completionTokens: 0,
    promptTokens: 1_000,
  });
  assertEquals(usd, (1_000 * 0.0028) / 1_000_000);
});

Deno.test("resolveClient: the explicit header wins over the key label", () => {
  assertEquals(resolveClient("ios", "Nemesis Web"), "ios");
  assertEquals(resolveClient("WEB", "Nemesis desktop"), "web");
});

Deno.test("resolveClient: falls back to the device-key label the client minted with", () => {
  assertEquals(resolveClient(null, "Nemesis Web"), "web");
  assertEquals(resolveClient(null, "Nemesis iPhone"), "ios");
  assertEquals(resolveClient(null, "Nemesis desktop"), "desktop");
  assertEquals(resolveClient(null, "Nemesis desktop — search (owner Mac)"), "desktop");
});

Deno.test("resolveClient: nothing recognisable is 'unknown', NOT web", () => {
  assertEquals(resolveClient(null, null), "unknown");
  assertEquals(resolveClient("", ""), "unknown");
  assertEquals(resolveClient("android", "some script"), "unknown");
});
