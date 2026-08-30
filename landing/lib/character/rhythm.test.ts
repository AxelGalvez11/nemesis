// The one rule the owner gave about the cycle, checked over the whole cycle.
//
// 🔴 THE FIRST BLOCK IS THE INSTRUCTION, TRANSCRIBED. *"When it's following the mouse, it should
// not be doing the expressions."* That is a claim about every step there is, not about the step a
// screenshot happened to catch, and the way it breaks in future is somebody adding a seventeenth
// face or a third kind of rest and pairing it with the wrong one. So it is walked, not sampled.

import { describe, expect, it } from "vitest";

import { BEATS, REST } from "./body";
import { FACES, FEELINGS, HOLD_SECONDS, WATCHING, beatAt } from "./rhythm";

/** Long enough to pass through every face and every beat several times over. */
const RUN = Array.from({ length: 400 }, (_, step) => beatAt(step));

describe("watching you and wearing a face never happen together", () => {
  it("wears nothing but neutral while it follows the cursor", () => {
    for (const beat of RUN) if (beat.watching) expect(beat.face).toBe(WATCHING);
  });

  it("follows nothing while it wears one of the fifteen", () => {
    for (const beat of RUN) if (beat.face !== WATCHING) expect(beat.watching).toBe(false);
  });

  it("never claims to be watching during an animation", () => {
    // Those states are `baseFace: false`, so the renderer would refuse to steer them anyway.
    // Asking and being refused is not the same as not asking, and only one of them is legible.
    for (const beat of RUN) if (beat.state !== REST) expect(beat.watching).toBe(false);
  });
});

describe("the two lists partition the sixteen", () => {
  it("splits neutral off from the rest, losing none of them", () => {
    expect(FEELINGS).not.toContain(WATCHING);
    expect([WATCHING, ...FEELINGS].sort()).toEqual([...FACES].sort());
    expect(FEELINGS).toHaveLength(FACES.length - 1);
  });

  it("gets through all fifteen", () => {
    const worn = new Set(RUN.filter((b) => !b.watching && b.state === REST).map((b) => b.face));
    expect([...worn].sort()).toEqual([...FEELINGS].sort());
  });

  it("does not settle into one face-and-beat pairing", () => {
    // Fifteen against two: the pair only comes back round after thirty feelings. A future edit
    // that makes the two lists the same length would quietly turn this page into a two-step loop.
    expect(FEELINGS.length % BEATS.length).not.toBe(0);
  });
});

describe("he is not more interested in you than in himself", () => {
  it("spends the same number of rests on each", () => {
    const rests = RUN.filter((b) => b.state === REST);
    const watched = rests.filter((b) => b.watching).length;
    expect(watched * 2).toBe(rests.length);
  });

  it("alternates rather than running one kind and then the other", () => {
    const rests = RUN.filter((b) => b.state === REST).map((b) => b.watching);
    for (let i = 1; i < rests.length; i += 1) expect(rests[i]).not.toBe(rests[i - 1]);
  });

  it("holds a rest long enough to be read as a mood rather than a flicker", () => {
    expect(HOLD_SECONDS).toBeGreaterThanOrEqual(4);
  });
});
