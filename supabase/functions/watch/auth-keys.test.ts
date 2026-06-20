// deno test supabase/functions/watch/auth-keys.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { acceptedCallerKeys } from "./auth-keys.ts";

Deno.test("legacy service key only (no new secret keys)", () => {
  const keys = acceptedCallerKeys("legacy-service-role", undefined);
  assert(keys.has("legacy-service-role"));
  assertEquals(keys.size, 1);
});

Deno.test("new secret keys dict is accepted alongside the legacy key", () => {
  const keys = acceptedCallerKeys("legacy", JSON.stringify({ default: "sb_secret_abc", billing: "sb_secret_xyz" }));
  assert(keys.has("legacy"));
  assert(keys.has("sb_secret_abc"));
  assert(keys.has("sb_secret_xyz"));
  assertEquals(keys.size, 3);
});

Deno.test("malformed SUPABASE_SECRET_KEYS falls back to just the legacy key", () => {
  const keys = acceptedCallerKeys("legacy", "{not json");
  assertEquals([...keys], ["legacy"]);
});

Deno.test("empty legacy key + secret keys → only the secret keys (no empty credential)", () => {
  const keys = acceptedCallerKeys("", JSON.stringify({ default: "sb_secret_only" }));
  assert(keys.has("sb_secret_only"));
  assert(!keys.has(""));
  assertEquals(keys.size, 1);
});

Deno.test("an array (wrong shape) is ignored, not spread as values", () => {
  const keys = acceptedCallerKeys("legacy", JSON.stringify(["sb_secret_x"]));
  assertEquals([...keys], ["legacy"]);
});

Deno.test("non-string dict values are dropped", () => {
  const keys = acceptedCallerKeys("legacy", JSON.stringify({ default: "sb_secret_ok", weird: 123, nope: null }));
  assert(keys.has("sb_secret_ok"));
  assertEquals(keys.size, 2); // legacy + sb_secret_ok
});

Deno.test("nothing configured → empty set (function will treat as not-configured / reject)", () => {
  const keys = acceptedCallerKeys("", undefined);
  assertEquals(keys.size, 0);
});
