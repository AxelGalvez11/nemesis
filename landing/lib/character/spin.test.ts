// The poke-turn's pacing.
//
// 🔴 THE CASE THAT MATTERS IS THE SHAPE OF THE CURVE, NOT ITS ENDPOINTS. Any easing starts at 0
// and finishes at 1; what the owner asked for was "smoothly", and the way that request fails is
// by inheriting the entrance's `easeOutQuint`, which puts two thirds of a full revolution into
// the first fifth of the time. So the assertion below is about where the halfway point falls.

import { describe, expect, it } from "vitest";

import { SPIN_STEP, SPIN_TIME, spinTour } from "./spin";

describe("the poke turn", () => {
  it("starts at nothing and finishes the full circuit", () => {
    expect(spinTour(0)).toBe(0);
    expect(spinTour(SPIN_TIME)).toBe(1);
  });

  it("clamps rather than overshooting or reversing", () => {
    expect(spinTour(-5)).toBe(0);
    expect(spinTour(SPIN_TIME * 10)).toBe(1);
  });

  it("never goes backwards", () => {
    let previous = -1;
    for (let i = 0; i <= 60; i += 1) {
      const value = spinTour((SPIN_TIME * i) / 60);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  // 🔴 THIS IS THE "SMOOTHLY" TEST. Half the turn at half the time, within a hair. An ease-out
  // curve puts the halfway point far earlier — `easeOutQuint` reaches 0.5 at 13% of its duration
  // — so swapping the curve back to the entrance's fails here rather than shipping a whip-crack.
  it("is halfway round at halfway through", () => {
    expect(spinTour(SPIN_TIME / 2)).toBeCloseTo(0.5, 5);
  });

  // Slow at the ends, quickest through the middle: that is what makes it read as something with
  // weight being turned. Measured as travel per equal slice of time.
  it("moves fastest in the middle and slowest at both ends", () => {
    const slice = SPIN_TIME / 10;
    const travel = (from: number) => spinTour(from + slice) - spinTour(from);
    const opening = travel(0);
    const middle = travel(SPIN_TIME * 0.45);
    const closing = travel(SPIN_TIME - slice);
    expect(middle).toBeGreaterThan(opening);
    expect(middle).toBeGreaterThan(closing);
    expect(opening).toBeCloseTo(closing, 5);
  });

  // 🔴 THE NaN GUARD, AND IT IS NOT PEDANTRY. `BotEngine.lookAtTime` divides by this, and on the
  // frame a look is set the numerator is zero too. A zero here makes that 0/0, and one NaN in the
  // gaze is permanent — the engine refuses every later target and the character stops looking
  // anywhere for the life of the page.
  it("gives the engine a non-zero step shorter than a frame", () => {
    expect(SPIN_STEP).toBeGreaterThan(0);
    // 1/120s, the shortest frame worth planning for.
    expect(SPIN_STEP).toBeLessThan(1 / 120);
  });

  it("takes longer than the entrance's arrival, which is the point of having its own", () => {
    // TURN_TIME, from the vendored gaze table. Read rather than imported so a change upstream
    // shows up here as a decision to make instead of an assertion that quietly still passes.
    expect(SPIN_TIME).toBeGreaterThan(1.1);
  });
});
