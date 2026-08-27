// The shape rule, checked against the vendored state table itself.
//
// 🔴 THIS FILE WAS `circle.test.ts` AND EVERY ASSERTION IN IT IS UNCHANGED. The body rests as a
// squircle now (owner, 2026-08-26) and the rule it obeys did not move: nothing the page plays may
// change the body's shape. See the note at the top of `body.ts` for why a new resting shape is not
// a reversal of the rule about reshaping.
//
// 🔴 THE POINT OF THESE IS THE SECOND BLOCK, NOT THE FIRST. Asserting that the cycle keeps its
// shape is easy and would still pass if `keepsItsShape` returned `true` unconditionally. The block that
// gives the first one its meaning is the one that names states which MUST fail — including the
// two the owner had explicitly kept the day before, because those are the ones a future edit is
// most likely to put back.

import { describe, expect, it } from "vitest";

import { BEATS, CYCLE, REST, SHAPE, keepsItsShape } from "./body";
import { SHAPE_BY_ID } from "../bloub/skins";
import { STATES, type StateId } from "../bloub/states";

describe("the character keeps one shape", () => {
  it("plays only states that leave the body the shape it rests in", () => {
    const breaks = CYCLE.filter((state) => !keepsItsShape(state));
    expect(breaks).toEqual([]);
  });

  // 🔴 THE SHAPE IS ONE OF UPSTREAM'S, WHICH IS THE HALF A STRING LITERAL CANNOT PROMISE. `SHAPE`
  // is handed to `BloubBot` as a plain string and looked up in a `Map<string, …>`, so a typo does
  // not fail to compile — it silently falls through to no shape at all and the character is a ball
  // again, which is exactly the report this change came from.
  it("rests in a shape the vendored table actually has", () => {
    expect(SHAPE_BY_ID.has(SHAPE)).toBe(true);
  });

  it("rests on idle and beats on wink and wide", () => {
    expect(REST).toBe("idle");
    expect([...BEATS]).toEqual(["wink", "wide"]);
  });

  // 🔴 A LIVE RULE, NOT A TAUTOLOGY. Each of these reshapes in a different way, so a
  // `keepsItsShape` that lost any ONE of its four tests would fail here rather than quietly
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
    expect(keepsItsShape(state as StateId)).toBe(false);
  });

  // 🔴 `swirl` IS THE ONE THAT PROVES `baseBody` ALONE IS NOT ENOUGH. It is the only state in
  // the table that keeps the resting body AND throws decor around it, so a rule that checked
  // only `baseBody` would let it through. If this ever fails because swirl changed upstream,
  // find another state with the same shape rather than deleting the case.
  it("has at least one state that keeps the resting body yet is still refused", () => {
    const restBodied = STATES.filter((s) => s.baseBody).map((s) => s.id);
    const refused = restBodied.filter((id) => !keepsItsShape(id));
    expect(refused.length).toBeGreaterThan(0);
  });

  // The rule has to leave the page something to play. Three is what the table allows today; the
  // assertion is that it is neither zero nor everything.
  it("leaves a small, non-empty set of the fifteen states", () => {
    const kept = STATES.map((s) => s.id).filter(keepsItsShape);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(STATES.length / 2);
    expect(CYCLE.every((state) => kept.includes(state))).toBe(true);
  });
});
