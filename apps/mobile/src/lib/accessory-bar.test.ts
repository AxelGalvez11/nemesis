// Deno unit tests (repo convention) for the keyboard-accessory bar geometry.
// Run: deno test --no-check apps/mobile/src/lib/accessory-bar.test.ts
//
// These tests exist for one reason: an `InputAccessoryView` whose child lays out
// to zero in EITHER axis renders as nothing at all, with no error and no warning,
// and no other test in this suite can see it. The note toolbar shipped invisible
// twice — once on height, once on width. So the rule that keeps it visible is
// arithmetic in accessory-bar.ts, and this file is what holds it.
import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ACCESSORY_BAR_HEIGHT,
  ACCESSORY_RAIL_PADDING,
  accessoryPillWidth,
  MIN_ACCESSORY_PILL_WIDTH,
} from "./accessory-bar.ts";

Deno.test("the bar has a real height — a zero here is an invisible toolbar", () => {
  assertStrictEquals(typeof ACCESSORY_BAR_HEIGHT, "number");
  assertEquals(ACCESSORY_BAR_HEIGHT > 0, true);
  // Matches control.lg in theme/tokens.ts. If that token changes, change this
  // together with it — the bar must stay exactly one control tall.
  assertStrictEquals(ACCESSORY_BAR_HEIGHT, 44);
});

Deno.test("the pill width is a definite number on every phone size", () => {
  // iPhone SE, 15, 15 Pro Max, and an iPad-width window.
  for (const windowWidth of [320, 375, 393, 430, 1024]) {
    const width = accessoryPillWidth(windowWidth);
    assertStrictEquals(Number.isFinite(width), true);
    assertEquals(width > 0, true);
    assertStrictEquals(width, windowWidth - ACCESSORY_RAIL_PADDING * 2);
  }
});

Deno.test("the pill never collapses, whatever the window reports", () => {
  // The failure mode this module exists to prevent: a measurement that has not
  // arrived yet (0), or arrives broken, must still leave a visible bar rather
  // than a zero-width sliver.
  for (const broken of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assertStrictEquals(accessoryPillWidth(broken), MIN_ACCESSORY_PILL_WIDTH);
  }
  // A window narrower than the floor still yields the floor, never a negative.
  assertStrictEquals(accessoryPillWidth(20), MIN_ACCESSORY_PILL_WIDTH);
});

Deno.test("the pill tracks the window, so rotation cannot leave it stale", () => {
  const portrait = accessoryPillWidth(393);
  const landscape = accessoryPillWidth(852);
  assertEquals(landscape > portrait, true);
});

Deno.test("a caller can override the rail padding without losing the floor", () => {
  assertStrictEquals(accessoryPillWidth(400, 0), 400);
  assertStrictEquals(accessoryPillWidth(400, 20), 360);
  assertStrictEquals(accessoryPillWidth(400, 1000), MIN_ACCESSORY_PILL_WIDTH);
});
