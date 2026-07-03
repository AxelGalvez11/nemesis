import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { timeUntil } from "./relative-time.ts";

const NOW = new Date("2026-07-03T12:00:00Z");

Deno.test("relative-time: a couple of hours out reads 'in 2 h'", () => {
  assertEquals(timeUntil("2026-07-03T14:00:00Z", NOW), "in 2 h");
});

Deno.test("relative-time: a few days out reads 'in 3 d'", () => {
  assertEquals(timeUntil("2026-07-06T12:00:00Z", NOW), "in 3 d");
});

Deno.test("relative-time: under an hour rounds to minutes", () => {
  assertEquals(timeUntil("2026-07-03T12:45:00Z", NOW), "in 45 min");
});

Deno.test("relative-time: past or now reads 'due now'", () => {
  assertEquals(timeUntil("2026-07-03T12:00:00Z", NOW), "due now");
  assertEquals(timeUntil("2026-07-03T09:00:00Z", NOW), "due now");
});

Deno.test("relative-time: an invalid date is empty (no crash)", () => {
  assertEquals(timeUntil("not-a-date", NOW), "");
  assertEquals(timeUntil("", NOW), "");
});

Deno.test("relative-time: rounds hours down (1 h 59 m → 'in 1 h')", () => {
  assertEquals(timeUntil("2026-07-03T13:59:00Z", NOW), "in 1 h");
});
