import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isFresh, parsePmids } from "./cache.ts";

Deno.test("isFresh: within TTL is fresh", () => {
  const now = Date.parse("2026-07-02T00:00:00Z");
  const fetchedAt = "2026-06-20T00:00:00Z"; // 12 days ago
  assertEquals(isFresh(fetchedAt, now, 30), true);
});

Deno.test("isFresh: past TTL is stale", () => {
  const now = Date.parse("2026-07-02T00:00:00Z");
  const fetchedAt = "2026-05-01T00:00:00Z"; // ~62 days ago
  assertEquals(isFresh(fetchedAt, now, 30), false);
});

Deno.test("isFresh: exactly at the TTL boundary is stale (strict greater-than)", () => {
  const now = Date.parse("2026-07-02T00:00:00Z");
  const cutoffMs = 30 * 24 * 3600 * 1000;
  const fetchedAt = new Date(now - cutoffMs).toISOString();
  assertEquals(isFresh(fetchedAt, now, 30), false);
});

Deno.test("parsePmids: filters non-string and non-numeric-id entries, caps at max", () => {
  const input = ["123", "abc", 456, "78901234", "", "1".repeat(10), null, "5"];
  assertEquals(parsePmids(input, 4), ["123", "78901234", "5"]);
});

Deno.test("parsePmids: returns empty array for non-array input", () => {
  assertEquals(parsePmids(null, 24), []);
  assertEquals(parsePmids("123", 24), []);
  assertEquals(parsePmids(undefined, 24), []);
});

Deno.test("parsePmids: caps batch size at max", () => {
  const ids = Array.from({ length: 30 }, (_, i) => String(i + 1));
  assertEquals(parsePmids(ids, 24).length, 24);
});
