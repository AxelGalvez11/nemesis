// Tests for the trusted-web chat source (web-source.ts) — the flag gate, the storage-rejection
// safety posture, and the trust filter. The networked fetch is integration-tested live.
// Run: deno test --allow-env supabase/functions/ask/
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchTrustedWeb, webInChatEnabled } from "./web-source.ts";
import { assertCommercialFriendly } from "../core-source-sync/license.ts";
import { webTrust } from "./research/web-research.ts";

Deno.test("flag is OFF by default", () => {
  Deno.env.delete("WEB_IN_CHAT");
  assertEquals(webInChatEnabled(), false);
  Deno.env.set("WEB_IN_CHAT", "on");
  assertEquals(webInChatEnabled(), true);
  Deno.env.delete("WEB_IN_CHAT");
});

Deno.test("web_trusted license is never storable (surface-live-only safety posture)", () => {
  // cc_by_nc → commercial_use_allowed false → assertCommercialFriendly throws. Web content can be
  // cited live but must never be ingested/stored.
  assertThrows(() => assertCommercialFriendly("cc_by_nc"));
});

Deno.test("trust filter classes the web tiers the chat source keeps vs drops", () => {
  // high/medium survive into candidates; low (blogs/SEO) is dropped by fetchTrustedWeb.
  assertEquals(webTrust("https://www.nejm.org/x"), "high");
  assertEquals(webTrust("https://www.cochrane.org/x"), "high");
  assertEquals(webTrust("https://med.harvard.edu/x"), "high");
  assertEquals(webTrust("https://www.cdc.gov/x"), "high");
  assertEquals(webTrust("https://www.healthline.com/x"), "medium");
  assert(webTrust("https://random-health-blog.substack.com/x") === "low");
});

Deno.test("fetchTrustedWeb returns [] with no search key configured (fail-safe)", async () => {
  const url = Deno.env.get("WEB_RECON_API_URL");
  const key = Deno.env.get("WEB_RECON_API_KEY");
  Deno.env.delete("WEB_RECON_API_URL");
  Deno.env.delete("WEB_RECON_API_KEY");
  try {
    assertEquals(await fetchTrustedWeb("metformin cardiovascular outcomes", 5), []);
  } finally {
    if (url) Deno.env.set("WEB_RECON_API_URL", url);
    if (key) Deno.env.set("WEB_RECON_API_KEY", key);
  }
});

Deno.test("fetchTrustedWeb returns [] on empty query", async () => {
  assertEquals(await fetchTrustedWeb("   ", 5), []);
});
