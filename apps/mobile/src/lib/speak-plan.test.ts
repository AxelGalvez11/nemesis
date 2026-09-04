// Deno unit tests (repo convention). Run:
// deno test --no-check --unstable-sloppy-imports --allow-read apps/mobile/src/lib/speak-plan.test.ts
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hasSpeakableContent, speakSteps } from "./speak-plan.ts";
import type { ReplyUtterance } from "../learn/speech.ts";

function utterance(text: string): ReplyUtterance {
  return { locale: "auto", provider: "xai", speed: 1, text };
}

Deno.test("an empty plan has nothing speakable", () => {
  assertFalse(hasSpeakableContent([]));
});

Deno.test("a plan with one utterance is speakable", () => {
  assert(hasSpeakableContent([utterance("Hello there.")]));
});

Deno.test("steps keep the plan's own order and index", () => {
  const plan = [utterance("first"), utterance("second"), utterance("third")];
  const steps = speakSteps(plan);
  assertEquals(steps.map((s) => s.utterance.text), ["first", "second", "third"]);
  assertEquals(steps.map((s) => s.index), [0, 1, 2]);
});

Deno.test("only the final step is marked last", () => {
  const steps = speakSteps([utterance("a"), utterance("b")]);
  assertEquals(steps[0]?.isLast, false);
  assertEquals(steps[1]?.isLast, true);
});

Deno.test("a single-utterance plan's only step is last", () => {
  const steps = speakSteps([utterance("only")]);
  assertEquals(steps[0]?.isLast, true);
});

Deno.test("an empty plan has no steps to play", () => {
  assertEquals(speakSteps([]), []);
});
