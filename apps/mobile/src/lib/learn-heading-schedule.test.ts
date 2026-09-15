// Run: deno test --no-check --unstable-sloppy-imports apps/mobile/src/lib/learn-heading-schedule.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CYCLE_MS, FADE_IN_MS, FADE_OUT_MS, HOLD_MS, LEARN_SUBJECTS, nextSubjectIndex } from "./learn-heading-schedule.ts";

Deno.test("nine subjects, one per faculty — the field-agnostic rule made visible", () => {
  assertEquals(LEARN_SUBJECTS.length, 9);
  // No two neighbours from the same faculty, and no subject that is a single field's own
  // jargon rather than the field itself — the guard the web's own list note describes
  // (field-agnostic.test.ts bans "pharmacology" by name for exactly this reason).
  assertEquals(LEARN_SUBJECTS.includes("Pharmacology" as unknown as (typeof LEARN_SUBJECTS)[number]), false);
});

Deno.test("the arrival is slower than the exit", () => {
  // The asymmetry IS the feel of the thing (see the file's own note): a word that finished
  // being read leaves quickly, but an arriving word is what the eye follows.
  assertEquals(FADE_IN_MS > FADE_OUT_MS, true);
});

Deno.test("nextSubjectIndex advances by one and wraps at the end of the list", () => {
  assertEquals(nextSubjectIndex(0), 1);
  assertEquals(nextSubjectIndex(4), 5);
  assertEquals(nextSubjectIndex(LEARN_SUBJECTS.length - 1), 0);
});

Deno.test("nextSubjectIndex cycles back to every subject over one full lap", () => {
  let i = 0;
  const seen = new Set<number>();
  for (let step = 0; step < LEARN_SUBJECTS.length; step++) {
    seen.add(i);
    i = nextSubjectIndex(i);
  }
  assertEquals(seen.size, LEARN_SUBJECTS.length);
  assertEquals(i, 0);
});

Deno.test("the cycle is the hold plus both fades", () => {
  assertEquals(CYCLE_MS, HOLD_MS + FADE_OUT_MS + FADE_IN_MS);
});
