import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { noteChromeShown } from "./note-chrome.ts";

Deno.test("reading down the note puts the controls away", () => {
  assertEquals(noteChromeShown(true, 400, 340), false);
});

Deno.test("scrolling back up brings them straight back", () => {
  assertEquals(noteChromeShown(false, 340, 400), true);
});

Deno.test("the top of a note always shows them, whichever way it just moved", () => {
  // The case that would otherwise strand a student: open a note already
  // scrolled, flick down once, and there is no control anywhere on screen.
  assertEquals(noteChromeShown(false, 0, 200), true);
  assertEquals(noteChromeShown(false, 12, 4), true);
});

Deno.test("a resting finger's dribble changes nothing in either state", () => {
  // Scroll views emit a steady stream of one- and two-point updates. Acting on
  // them would flicker the controls the whole time a note is being read.
  assertEquals(noteChromeShown(true, 402, 400), true);
  assertEquals(noteChromeShown(false, 402, 400), false);
  assertEquals(noteChromeShown(true, 398, 400), true);
  assertEquals(noteChromeShown(false, 398, 400), false);
});

Deno.test("no movement at all holds whatever the screen is doing", () => {
  assertEquals(noteChromeShown(true, 400, 400), true);
  assertEquals(noteChromeShown(false, 400, 400), false);
});

Deno.test("the slop is a floor, not a rounding — one point past it acts", () => {
  assertEquals(noteChromeShown(true, 407, 400), false);
  assertEquals(noteChromeShown(false, 393, 400), true);
});

Deno.test("a long fling down hides them and does not toggle back", () => {
  let shown = true;
  for (const [now, before] of [[200, 60], [600, 200], [1400, 600], [1900, 1400]]) {
    shown = noteChromeShown(shown, now, before);
  }
  assertEquals(shown, false);
});
