import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  SIDEBAR_ZONE,
  SWIPE_DISTANCE,
  daySwipeIntent,
  gridSwipeIntent,
} from "./calendar-gestures.ts";

const W = 402; // iPhone 17 Pro points
const third = W * SIDEBAR_ZONE;

// --- Month / year grid ------------------------------------------------------------

Deno.test("grid: dragging right opens the sidebar, and NEVER changes the month", () => {
  assertEquals(gridSwipeIntent(80, 0, 0, 0), "sidebar");
});

Deno.test("grid: dragging left does nothing rather than guessing", () => {
  // The old behaviour stepped the month here; horizontal is the sidebar's axis now.
  assertEquals(gridSwipeIntent(-80, 0, 0, 0), "none");
});

Deno.test("grid: vertical steps the period, up is forward", () => {
  assertEquals(gridSwipeIntent(0, -80, 0, 0), "next");
  assertEquals(gridSwipeIntent(0, 80, 0, 0), "prev");
});

Deno.test("grid: a sloppy diagonal resolves to ONE axis, never both", () => {
  // Mostly sideways with a bit of drift -> sidebar, not sidebar AND a month step.
  assertEquals(gridSwipeIntent(90, 30, 0, 0), "sidebar");
  // Mostly vertical with a bit of drift -> a month step.
  assertEquals(gridSwipeIntent(30, -90, 0, 0), "next");
});

Deno.test("grid: a tap or a wobble is not a swipe", () => {
  assertEquals(gridSwipeIntent(5, 3, 0, 0), "none");
  assertEquals(gridSwipeIntent(0, SWIPE_DISTANCE - 1, 0, 0), "none");
});

Deno.test("grid: a fast flick counts even when short", () => {
  assertEquals(gridSwipeIntent(12, 0, 900, 0), "sidebar");
  assertEquals(gridSwipeIntent(0, -12, 0, -900), "next");
});

// --- Day view ---------------------------------------------------------------------

Deno.test("day: the right two thirds step the day, both directions", () => {
  assertEquals(daySwipeIntent(W * 0.5, W, -80, 0), "next");
  assertEquals(daySwipeIntent(W * 0.9, W, 80, 0), "prev");
  // Exactly on the boundary belongs to the day, not the sidebar.
  assertEquals(daySwipeIntent(third, W, -80, 0), "next");
});

Deno.test("day: the left third is the sidebar, so there is always a way out", () => {
  assertEquals(daySwipeIntent(10, W, 80, 0), "sidebar");
  assertEquals(daySwipeIntent(third - 1, W, 80, 0), "sidebar");
});

Deno.test("day: dragging LEFT from the left third does nothing, it is not a day step", () => {
  // Otherwise the sidebar zone would quietly still change the day.
  assertEquals(daySwipeIntent(10, W, -80, 0), "none");
});

Deno.test("day: the zone is judged where the finger went DOWN, not where it ended", () => {
  // Starts in the left third and travels far right — still the sidebar.
  assertEquals(daySwipeIntent(20, W, 300, 0), "sidebar");
});

Deno.test("day: an unknown width must not make the whole screen the sidebar zone", () => {
  assertEquals(daySwipeIntent(0, 0, 80, 0), "prev");
  assertEquals(daySwipeIntent(0, 0, -80, 0), "next");
});

Deno.test("day: a tap is not a swipe", () => {
  assertEquals(daySwipeIntent(W * 0.5, W, 4, 0), "none");
});
