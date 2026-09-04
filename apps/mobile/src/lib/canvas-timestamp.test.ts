// Deno unit tests (repo convention).
// Run: deno test --no-check --unstable-sloppy-imports --allow-read apps/mobile/src/lib/canvas-timestamp.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { turnTimestamp } from "./canvas-timestamp.ts";

// The exact AM/PM spacing Intl emits varies by ICU data (a plain space in some builds, a
// narrow no-break space in others) — computing the expected time through the same
// toLocaleTimeString call keeps the test honest about the DAY-BOUNDARY logic instead of
// pinning an environment-specific glyph.
function time(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const NOW = new Date("2026-09-01T19:26:00.000").getTime(); // a Tuesday, local time

Deno.test("turnTimestamp: same calendar day reads 'Today'", () => {
  assertEquals(turnTimestamp(new Date(NOW).toISOString(), NOW), `Today, ${time(NOW)}`);
});

Deno.test("turnTimestamp: one midnight back reads 'Yesterday'", () => {
  const yesterday = NOW - 20 * 60 * 60 * 1000; // 20h earlier, still crosses one midnight
  assertEquals(turnTimestamp(new Date(yesterday).toISOString(), NOW), `Yesterday, ${time(yesterday)}`);
});

Deno.test("turnTimestamp: two or more midnights back reads a weekday date", () => {
  const lastWeek = NOW - 8 * 24 * 60 * 60 * 1000;
  const then = new Date(lastWeek);
  const expectedDate = then.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  assertEquals(turnTimestamp(then.toISOString(), NOW), `${expectedDate}, ${time(lastWeek)}`);
});

Deno.test("turnTimestamp: an invalid moment returns empty rather than 'Invalid Date'", () => {
  assertEquals(turnTimestamp("not a date", NOW), "");
});
