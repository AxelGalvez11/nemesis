// Deno unit tests (repo convention) for the live reasoning step trail.
// Run: deno test --no-check apps/mobile/src/lib/reasoning-steps.test.ts
import { assert, assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { EMPTY_TRAIL, MAX_KEPT_STEPS, pushStep, trailSummary } from "./reasoning-steps.ts";

Deno.test("pushStep: appends distinct steps and counts them", () => {
  const a = pushStep(EMPTY_TRAIL, "Searching the web");
  const b = pushStep(a, "Reading 3 sources");
  assertEquals(b.steps, ["Searching the web", "Reading 3 sources"]);
  assertEquals(b.count, 2);
});

Deno.test("pushStep: a repeated label is one step that took a while, not many steps", () => {
  // The phase label arrives many times a second while ONE step runs. Counting
  // each arrival would turn a two-step turn into "40 steps", which is the one
  // way a number on screen can actively lie.
  let trail = pushStep(EMPTY_TRAIL, "Searching the web");
  for (let i = 0; i < 40; i++) trail = pushStep(trail, "Searching the web");
  assertEquals(trail.count, 1);
  assertEquals(trail.steps, ["Searching the web"]);
});

Deno.test("pushStep: returns the SAME reference when nothing changed", () => {
  // Load-bearing for render cost: the component puts this object in a dependency
  // array, so a new object per reasoning chunk would re-render ~80x/sec.
  const one = pushStep(EMPTY_TRAIL, "Thinking it through");
  assertStrictEquals(pushStep(one, "Thinking it through"), one);
  assertStrictEquals(pushStep(one, "   "), one);
  assertStrictEquals(pushStep(one, ""), one);
});

Deno.test("pushStep: keeps the newest steps but the count keeps rising", () => {
  let trail = EMPTY_TRAIL;
  for (let i = 0; i < MAX_KEPT_STEPS + 5; i++) trail = pushStep(trail, `step ${i}`);
  assertEquals(trail.steps.length, MAX_KEPT_STEPS);
  // The tally tells the truth even though the early steps aged out of the list.
  assertEquals(trail.count, MAX_KEPT_STEPS + 5);
  assertEquals(trail.steps[trail.steps.length - 1], `step ${MAX_KEPT_STEPS + 4}`);
  assert(!trail.steps.includes("step 0"));
});

Deno.test("pushStep: never mutates the trail it was given", () => {
  const one = pushStep(EMPTY_TRAIL, "a");
  const two = pushStep(one, "b");
  assertEquals(one.steps, ["a"]);
  assertEquals(one.count, 1);
  assertEquals(two.count, 2);
});

Deno.test("trailSummary: both halves optional, separator only when both are present", () => {
  assertEquals(trailSummary(3, 12), "3 steps · 12s");
  // One step is not worth saying — the badge already names it.
  assertEquals(trailSummary(1, 12), "12s");
  // Under 2s would flash "0s" and vanish on a fast turn.
  assertEquals(trailSummary(3, 1), "3 steps");
  assertEquals(trailSummary(1, 0), "");
  assertEquals(trailSummary(0, 0), "");
});

console.log("reasoning-steps.test.ts OK");
