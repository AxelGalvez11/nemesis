// Deno unit tests (repo convention) for the review screen's grade confirm hold.
// Run: deno test --no-check apps/mobile/src/lib/grade-confirm.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { confirmHoldRemaining, gradeButtonState } from "./grade-confirm.ts";

Deno.test("a fast grade waits out the rest of the hold so the button is readable", () => {
  assertEquals(confirmHoldRemaining(0, 900), 900);
  assertEquals(confirmHoldRemaining(120, 900), 780);
  assertEquals(confirmHoldRemaining(899, 900), 1);
});

Deno.test("a slow grade adds no wait at all — it was already on screen long enough", () => {
  assertEquals(confirmHoldRemaining(900, 900), 0);
  assertEquals(confirmHoldRemaining(4200, 900), 0);
});

Deno.test("the remainder is never negative, whatever the clock does", () => {
  // Wall-clock time can jump backwards (NTP correction, manual clock change), so
  // elapsed can come out negative. A negative wait would be passed to setTimeout,
  // which treats it as 0 — harmless, but the invariant belongs here, not there.
  assertEquals(confirmHoldRemaining(-500, 900), 900);
  assertEquals(confirmHoldRemaining(0, 0), 0);
});

Deno.test("during the hold the graded button is lit and the other three are hidden", () => {
  assertEquals(gradeButtonState("good", "good", true), "lit");
  assertEquals(gradeButtonState("again", "good", true), "hidden");
  assertEquals(gradeButtonState("hard", "good", true), "hidden");
  assertEquals(gradeButtonState("easy", "good", true), "hidden");
});

Deno.test("tapping Again lights Again, not Good", () => {
  assertEquals(gradeButtonState("again", "again", true), "lit");
  assertEquals(gradeButtonState("good", "again", true), "hidden");
});

Deno.test("exactly one button is ever lit", () => {
  const ratings = ["again", "hard", "good", "easy"];
  for (const flashed of ratings) {
    const lit = ratings.filter((r) => gradeButtonState(r, flashed, true) === "lit");
    assertEquals(lit, [flashed]);
  }
});

Deno.test("with no hold running the row is idle, or dimmed while a grade is in flight", () => {
  assertEquals(gradeButtonState("good", null, false), "idle");
  assertEquals(gradeButtonState("again", null, false), "idle");
  // grading with no flash is the retry-after-failure case: the hold has ended and
  // cleared, but a fresh grade is on the wire. The whole row dims, none of it
  // disappears — hiding three buttons here would read as a confirmation that
  // never came.
  assertEquals(gradeButtonState("good", null, true), "dimmed");
});

Deno.test("the hold outranks the in-flight dim, so the lit button is never half-faded", () => {
  // Both flags are true for the whole confirm hold. If `grading` won, the button
  // the student is meant to read would render at 0.5 opacity.
  assertEquals(gradeButtonState("good", "good", true), "lit");
});
