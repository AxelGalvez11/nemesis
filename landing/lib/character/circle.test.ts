// The circle rule, checked against the vendored state table itself.
//
// 🔴 THE POINT OF THESE IS THE SECOND BLOCK, NOT THE FIRST. Asserting that the cycle is round is
// easy and would still pass if `keepsTheCircle` returned `true` unconditionally. The block that
// gives the first one its meaning is the one that names states which MUST fail — including the
// two the owner had explicitly kept the day before, because those are the ones a future edit is
// most likely to put back.

import { describe, expect, it } from "vitest";

import { BEATS, CYCLE, REST, keepsTheCircle } from "./circle";
import { STATES, type StateId } from "../bloub/states";

describe("the character stays a circle", () => {
  it("plays only states that leave the body round", () => {
    const breaks = CYCLE.filter((state) => !keepsTheCircle(state));
    expect(breaks).toEqual([]);
  });

  it("rests on idle and beats on wink and wide", () => {
    expect(REST).toBe("idle");
    expect([...BEATS]).toEqual(["wink", "wide"]);
  });

  // 🔴 A LIVE RULE, NOT A TAUTOLOGY. Each of these reshapes in a different way, so a
  // `keepsTheCircle` that lost any ONE of its four tests would fail here rather than quietly
  // widening what the page can play.
  it.each([
    // baseBody: false — the state draws its own silhouette.
    ["egg", "another shape entirely"],
    ["hexagon", "another shape entirely"],
    ["sleep", "the silhouette squashes"],
    ["alert", "the body becomes an exclamation mark"],
    // dots — the body breaks up or throws pieces off.
    ["thinking", "the body splits into three dots"],
    ["burst", "the body collapses and sprays particles"],
    // arcs — decor thrown around it.
    ["orbit", "rings around the body"],
    ["swirl", "rings around the body, with baseBody still true"],
    ["comet", "ribbons around the body"],
    // notif — the badge, which cuts a notch out of the crown to seat itself.
    ["notify", "a notch bitten out for the badge"],
  ])("refuses %s (%s)", (state) => {
    expect(keepsTheCircle(state as StateId)).toBe(false);
  });

  // 🔴 `swirl` IS THE ONE THAT PROVES `baseBody` ALONE IS NOT ENOUGH. It is the only state in
  // the table that keeps the resting body AND throws decor around it, so a rule that checked
  // only `baseBody` would let it through. If this ever fails because swirl changed upstream,
  // find another state with the same shape rather than deleting the case.
  it("has at least one state that is round-bodied yet still refused", () => {
    const roundBodied = STATES.filter((s) => s.baseBody).map((s) => s.id);
    const refused = roundBodied.filter((id) => !keepsTheCircle(id));
    expect(refused.length).toBeGreaterThan(0);
  });

  // The rule has to leave the page something to play. Three is what the table allows today; the
  // assertion is that it is neither zero nor everything.
  it("leaves a small, non-empty set of the fifteen states", () => {
    const round = STATES.map((s) => s.id).filter(keepsTheCircle);
    expect(round.length).toBeGreaterThan(0);
    expect(round.length).toBeLessThan(STATES.length / 2);
    expect(CYCLE.every((state) => round.includes(state))).toBe(true);
  });
});
