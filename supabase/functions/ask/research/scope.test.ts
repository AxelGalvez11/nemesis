import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeScope } from "./scope.ts";

Deno.test("normalizeScope: a specific question (needs=false) yields no clarification", () => {
  const r = normalizeScope(false, []);
  assertEquals(r.needs_clarification, false);
  assertEquals(r.questions.length, 0);
});

Deno.test("normalizeScope: needs=true clamps to 3 questions, trims + dedupes chips", () => {
  const r = normalizeScope(true, [
    { text: "  Which indication? ", chips: ["T2D", "Weight", "t2d", " "] },
    { text: "Efficacy or safety?", chips: ["Efficacy", "Safety", "Both"] },
    { text: "Population?", chips: ["Adults"] },
    { text: "Dropped 4th", chips: ["x"] },
  ]);
  assertEquals(r.needs_clarification, true);
  assertEquals(r.questions.length, 3); // clamped to MAX_QUESTIONS
  assertEquals(r.questions[0].text, "Which indication?"); // trimmed
  assertEquals(r.questions[0].chips, ["T2D", "Weight"]); // case-insensitive dedupe + empties dropped
});

Deno.test("normalizeScope: needs=true but no usable question degrades to no clarification", () => {
  const r = normalizeScope(true, [{ text: "   ", chips: [] }, "bad", 7]);
  assertEquals(r.needs_clarification, false);
  assertEquals(r.questions.length, 0);
});

Deno.test("normalizeScope: needs=false ignores any returned questions", () => {
  const r = normalizeScope(false, [{ text: "Q", chips: ["a"] }]);
  assertEquals(r.needs_clarification, false);
  assertEquals(r.questions.length, 0);
});

Deno.test("normalizeScope: a non-true needs value is treated as false", () => {
  assertEquals(normalizeScope("yes", [{ text: "Q", chips: ["a"] }]).needs_clarification, false);
  assertEquals(normalizeScope(1, [{ text: "Q", chips: ["a"] }]).needs_clarification, false);
});
