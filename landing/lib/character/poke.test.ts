// The click reaction: the one state allowed to break the shape rule, and how fast it plays.
//
// 🔴 THE FIRST BLOCK IS THE IMPORTANT ONE AND IT ASSERTS A FAILURE. Everywhere else in this
// folder a test proves something obeys the rule; here it proves the opposite on purpose, so that
// the exception is a written-down decision rather than a state that quietly slipped past a check
// nobody ran on it. If `keepsItsShape(POKE)` ever starts returning true, either the vendored
// animation changed underneath us or somebody has picked a different reaction — and both are
// things to look at, not to let through.
//
// 🔴 THE SECOND BLOCK MEASURES THE REAL COMPLAINT. The owner's words were "it's going to lag
// before it actually does the burst", and a lag is a number: how far into its own animation the
// body has collapsed, so many milliseconds after the click. That is checked against the vendored
// pose function itself rather than against a constant copied out of it.

import { describe, expect, it } from "vitest";

import { BURST_MEASURED, BURST_PACE, BURST_TIME, POKE } from "./poke";
import { CYCLE, keepsItsShape } from "./body";
import { SPIN_TIME } from "./spin";
import { STATE_BY_ID } from "../bloub/states";

/** The body's width in radius units, `t` seconds into a state's own animation. */
function widthAt(t: number): number {
  const radii = STATE_BY_ID.get(POKE)!.pose(t).sil.radii;
  return Math.max(...radii);
}

describe("the poke reaction is a deliberate exception", () => {
  it("is a state the shape rule refuses", () => {
    expect(keepsItsShape(POKE)).toBe(false);
  });

  it("is refused for both reasons the rule has, not just one", () => {
    const def = STATE_BY_ID.get(POKE)!;
    expect(def.baseBody).toBe(false);
    expect(def.pose(def.duration * 0.3).dots.length).toBeGreaterThan(0);
  });

  it("is not in the cycle, because the cycle is what the rule still governs", () => {
    expect(CYCLE).not.toContain(POKE);
    for (const state of CYCLE) expect(keepsItsShape(state)).toBe(true);
  });
});

describe("the burst plays faster than it was measured", () => {
  it("reads its measured length from the table rather than repeating it", () => {
    expect(BURST_MEASURED).toBe(STATE_BY_ID.get(POKE)!.duration);
  });

  it("is quicker than measured, and quicker than the turn it runs inside", () => {
    expect(BURST_TIME).toBeLessThan(BURST_MEASURED);
    expect(BURST_TIME).toBeLessThan(SPIN_TIME);
    expect(BURST_PACE).toBeGreaterThan(1);
  });

  it("leaves the turn visibly running once the body is back", () => {
    // The whole reason both gestures fit in one click: the body has to be whole again, with the
    // eyes back, while there is still turn left to see. Half a second is the floor for "visible".
    const def = STATE_BY_ID.get(POKE)!;
    const eyesBack = def.duration * 0.87; // `eyeAlpha` reaches 1 at 2.25s of 2.6s
    expect(def.pose(eyesBack).eyeAlpha).toBe(1);
    expect(SPIN_TIME - eyesBack / BURST_PACE).toBeGreaterThan(0.5);
  });

  it("hands over to the faster clock where the two readings agree", () => {
    // 🔴 THE ASSERTION THAT KEEPS THE SPEED-UP INVISIBLE, and the reason the loop waits for the
    // cross-fade instead of cutting. At the hand-over the engine stops reading the state at real
    // time and starts reading it at `BURST_PACE` times real, which is a jump forward through its
    // own animation. It is only unnoticeable because the collapse has flattened out by then.
    // Raise the pace, or land the seam earlier, and this is what catches it.
    const morph = STATE_BY_ID.get(POKE)!.morph;
    const jump = Math.abs(widthAt(morph * BURST_PACE) - widthAt(morph)) / widthAt(0);
    expect(jump).toBeLessThan(0.02);
  });

  it("is whole again by the time it hands back to the cycle", () => {
    // Cutting away mid-explosion would leave a dot to fade into a resting body. The state
    // re-forms at 2.4s of its own 2.6s, so the hold has to cover the whole thing.
    expect(widthAt(BURST_TIME * BURST_PACE) / widthAt(0)).toBeGreaterThan(0.99);
  });
});
