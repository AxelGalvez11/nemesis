import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildUnsubscribeUrl, signUnsubscribe, verifyUnsubscribe } from "./unsubscribe-token.ts";

const SECRET = "service-role-key-stands-in-as-the-hmac-secret";

Deno.test("signUnsubscribe is deterministic and verifies its own token", async () => {
  const t1 = await signUnsubscribe("user-A", SECRET);
  const t2 = await signUnsubscribe("user-A", SECRET);
  assertEquals(t1, t2); // same user + secret → same token (so the link is stable)
  assert(await verifyUnsubscribe("user-A", t1, SECRET));
});

Deno.test("a token for one user does NOT unsubscribe another (no cross-user unsubscribe)", async () => {
  const tokenA = await signUnsubscribe("user-A", SECRET);
  assertEquals(await verifyUnsubscribe("user-B", tokenA, SECRET), false);
});

Deno.test("a token signed with a different secret fails (tamper / wrong key)", async () => {
  const tokenA = await signUnsubscribe("user-A", SECRET);
  assertEquals(await verifyUnsubscribe("user-A", tokenA, "other-secret"), false);
  assertEquals(await verifyUnsubscribe("user-A", "deadbeef", SECRET), false);
  assertEquals(await verifyUnsubscribe("user-A", "", SECRET), false);
});

Deno.test("buildUnsubscribeUrl points at the watch-digest function with the user + token", () => {
  const url = buildUnsubscribeUrl("https://proj.supabase.co", "user-A", "abc123");
  assert(url.startsWith("https://proj.supabase.co/functions/v1/watch-digest?"));
  assert(url.includes("unsubscribe=user-A"));
  assert(url.includes("token=abc123"));
});
