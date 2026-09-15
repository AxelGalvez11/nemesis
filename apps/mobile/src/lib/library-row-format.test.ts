// Deno unit tests (repo convention).
// Run: deno test --no-check --unstable-sloppy-imports --allow-read --allow-env apps/mobile/src/lib/library-row-format.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { libraryModifiedLabel } from "./library-row-format.ts";

const NOW = new Date("2026-09-01T12:00:00.000Z").getTime();

function iso(msAgo: number): string {
  return new Date(NOW - msAgo).toISOString();
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

Deno.test("libraryModifiedLabel: relative phrasing inside a day, a calendar date past it", () => {
  assertEquals(libraryModifiedLabel(iso(0), NOW), "Modified just now");
  assertEquals(libraryModifiedLabel(iso(5 * HOUR), NOW), "Modified 5 hours ago");
  assertEquals(libraryModifiedLabel(iso(23 * HOUR), NOW), "Modified 23 hours ago");
  // Past a day: a calendar date, computed the same way the source does — no
  // locale hardcoded here, same precedent as relative-time.test.ts.
  const twoDaysAgo = iso(2 * DAY);
  assertEquals(
    libraryModifiedLabel(twoDaysAgo, NOW),
    `Modified ${new Date(twoDaysAgo).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
  );
  assertEquals(libraryModifiedLabel("not a date", NOW), "");
});
