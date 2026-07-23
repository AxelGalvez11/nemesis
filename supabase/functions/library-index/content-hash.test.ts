import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { contentHash } from "./content-hash.ts";

Deno.test("same inputs hash the same", async () => {
  assertEquals(await contentHash("A", "body"), await contentHash("A", "body"));
});

Deno.test("a title change changes the hash", async () => {
  assertNotEquals(await contentHash("A", "body"), await contentHash("B", "body"));
});

Deno.test("a content change changes the hash", async () => {
  assertNotEquals(await contentHash("A", "body"), await contentHash("A", "body2"));
});

Deno.test("field boundaries are unambiguous", async () => {
  // "AB"+"" and "A"+"B" must not collide
  assertNotEquals(await contentHash("AB", ""), await contentHash("A", "B"));
});

Deno.test("hash is 64 hex chars", async () => {
  const hash = await contentHash("A", "body");
  assertEquals(/^[0-9a-f]{64}$/.test(hash), true);
});
