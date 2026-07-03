import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveSubQuestions } from "./plan.ts";

Deno.test("resolveSubQuestions: non-empty provided list is used verbatim, planned() never invoked", async () => {
  let plannedCalled = false;
  const provided = ["Question A", "Question B"];
  const result = await resolveSubQuestions(provided, async () => {
    plannedCalled = true;
    return ["should not appear"];
  });
  assertEquals(result, provided);
  assertEquals(plannedCalled, false);
});

Deno.test("resolveSubQuestions: undefined provided falls back to planned()", async () => {
  let plannedCalled = false;
  const result = await resolveSubQuestions(undefined, async () => {
    plannedCalled = true;
    return ["planned one", "planned two"];
  });
  assertEquals(result, ["planned one", "planned two"]);
  assertEquals(plannedCalled, true);
});

Deno.test("resolveSubQuestions: empty provided array falls back to planned()", async () => {
  let plannedCalled = false;
  const result = await resolveSubQuestions([], async () => {
    plannedCalled = true;
    return ["planned"];
  });
  assertEquals(result, ["planned"]);
  assertEquals(plannedCalled, true);
});

Deno.test("resolveSubQuestions: provided list is returned as a new array (not the same reference)", async () => {
  const provided = ["Q1"];
  const result = await resolveSubQuestions(provided, async () => ["unused"]);
  assertEquals(result, provided);
});
