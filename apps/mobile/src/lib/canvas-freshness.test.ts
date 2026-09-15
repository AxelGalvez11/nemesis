// Deno unit tests (repo convention).
// Run: deno test --no-check --unstable-sloppy-imports --allow-read apps/mobile/src/lib/canvas-freshness.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isFresh } from "./canvas-freshness.ts";

const NOW = new Date("2026-09-01T12:00:00.000Z").getTime();
const MIN = 60_000;

function iso(msAgo: number): string {
  return new Date(NOW - msAgo).toISOString();
}

Deno.test("isFresh: true inside the five-minute window, false outside it", () => {
  assertEquals(isFresh(iso(0), NOW), true);
  assertEquals(isFresh(iso(1 * MIN), NOW), true);
  assertEquals(isFresh(iso(4 * MIN + 59_000), NOW), true);
  assertEquals(isFresh(iso(5 * MIN), NOW), false);
  assertEquals(isFresh(iso(6 * MIN), NOW), false);
  assertEquals(isFresh(iso(60 * MIN), NOW), false);
});

Deno.test("isFresh: a future timestamp (clock skew) still reads fresh, never negative", () => {
  assertEquals(isFresh(iso(-30_000), NOW), true);
});

Deno.test("isFresh: an unparsable timestamp is never fresh", () => {
  assertEquals(isFresh("not a date", NOW), false);
});
