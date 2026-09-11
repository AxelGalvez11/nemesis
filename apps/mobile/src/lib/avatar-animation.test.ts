// Deno unit tests (repo convention). Run:
// deno test --no-check --unstable-sloppy-imports --allow-read apps/mobile/src/lib/avatar-animation.test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { animationForTurnState } from "./avatar-animation.ts";
import { ANIMATION_BY_ID } from "../learn/avatar.ts";

Deno.test("a turn in flight plays the engine's thinking routine", () => {
  assertEquals(animationForTurnState("sending"), "thinking");
});

Deno.test("no turn in flight plays the engine's idle routine", () => {
  assertEquals(animationForTurnState("idle"), "idle");
});

// The round-trip: a name that does not resolve makes `playedFaceAt` return null and the
// character draws nothing, silently — a typo here would pass the two assertions above and
// still blank the screen. See lib/avatar/play.ts's `playedFaceAt`.
Deno.test("both animation ids the helper can return actually exist in the catalogue", () => {
  assert(ANIMATION_BY_ID.get(animationForTurnState("sending")), "thinking must resolve");
  assert(ANIMATION_BY_ID.get(animationForTurnState("idle")), "idle must resolve");
});
