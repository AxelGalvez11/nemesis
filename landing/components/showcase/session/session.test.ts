import { describe, expect, it } from "vitest";

import { ACTS, CYCLE_SECONDS, SCRIPT, sessionState } from "./script";

/**
 * The owner's acceptance criteria for the showcase, as assertions.
 *
 * The brief was specific: "There should be essentially no moment where the
 * visitor wonders whether the animation froze", and the session must read as a
 * real lesson rather than a feature reel. Both are checkable because
 * `sessionState` is a pure function of one clock — step it finely, diff what
 * comes back, and stillness has a length in milliseconds.
 *
 * 🔴 THIS EXISTS BECAUSE THE DEFECT IT GUARDS SHIPPED ONCE. The showcase this
 * replaced held each finished scene for ~2s and then blanked the frame for
 * another ~1.5s between scenes, and that survived review because the only way
 * anyone had to judge it was watching — which, in a throttled tab delivering
 * about one animation frame per screenshot, shows almost nothing. The first
 * version of THIS session had a 1650ms stall at the end of every act for a
 * different reason, and this check is what found it.
 */

const STEP_MS = 25;
const STEPS = Math.round((CYCLE_SECONDS * 1000) / STEP_MS);

/** Everything a viewer could perceive, flattened so two moments can be compared. */
function vector(t: number): string {
  const s = sessionState(t);
  const r = (n: number) => Math.round(n * 200) / 200;
  return JSON.stringify([
    s.actIndex,
    r(s.actOpacity),
    r(s.figure.t),
    r(s.figure.opacity),
    s.figure.kind,
    s.surface.map((i) => [i.key, r(i.opacity), Math.round(i.lift * 4) / 4]),
    s.composer.groups.map((g) => r(g.opacity)),
    r(s.composer.sendOpacity),
    r(s.composer.sendPressed),
    s.composer.placeholder,
    r(s.continueButton.opacity),
    r(s.continueButton.pressed),
    r(s.thinking),
    s.cursor ? [s.cursor.to, r(s.cursor.visible), Math.round(s.cursor.progress * 200) / 200, r(s.cursor.pressing)] : null,
    s.outgoing ? r(s.outgoing.opacity) : null,
  ]);
}

describe("the session never stops moving", () => {
  it("has no still interval a visitor could read as frozen", () => {
    let previous = vector(0);
    let stillFrom = 0;
    let worst = { ms: 0, at: 0 };

    for (let i = 1; i <= STEPS; i++) {
      const current = vector((((i * STEP_MS) / 1000 / CYCLE_SECONDS) % 1 + 1) % 1);
      if (current === previous) continue;
      const ms = i * STEP_MS - stillFrom;
      if (ms > worst.ms) worst = { ms, at: stillFrom / 1000 };
      stillFrom = i * STEP_MS;
      previous = current;
    }
    const tail = STEPS * STEP_MS - stillFrom;
    if (tail > worst.ms) worst = { ms: tail, at: stillFrom / 1000 };

    // 250ms is where a still frame inside continuous motion starts to register.
    expect(worst, `longest still frame was ${worst.ms}ms at ${worst.at.toFixed(2)}s`).toMatchObject({});
    expect(worst.ms).toBeLessThan(250);
  });

  it("never shows an empty learning surface", () => {
    for (let i = 0; i <= STEPS; i++) {
      const t = (((i * STEP_MS) / 1000 / CYCLE_SECONDS) % 1 + 1) % 1;
      const s = sessionState(t);
      const somethingToRead =
        s.surface.some((item) => item.opacity > 0.06) ||
        s.thinking > 0.06 ||
        (s.outgoing?.opacity ?? 0) > 0.06;
      expect(somethingToRead, `nothing on the surface at ${((i * STEP_MS) / 1000).toFixed(2)}s`).toBe(true);
    }
  });

  it("wraps without a reset — the loop point is an ordinary handover", () => {
    // Just before 1 and just after 0 must differ by no more than any other
    // neighbouring pair, which is what makes the wrap invisible.
    const before = sessionState(1 - 1e-6);
    const after = sessionState(1e-6);
    expect(before.actIndex).toBe(ACTS - 1);
    expect(after.actIndex).toBe(0);
    // The last act is still on screen, fading, while the first arrives.
    expect(after.outgoing?.act.id).toBe(SCRIPT[ACTS - 1]!.id);
    expect(after.outgoing!.opacity).toBeGreaterThan(0.9);
    expect(after.actOpacity).toBeLessThan(0.1);
    // And it carries the whole leaving screen, not one line of it.
    expect(after.outgoing!.surface.length).toBeGreaterThanOrEqual(3);
  });
});

describe("it reads as a lesson, not a reel", () => {
  it("every act teaches, asks, takes an answer and responds", () => {
    for (let a = 0; a < ACTS; a++) {
      const at = (seconds: number) => sessionState((a * (CYCLE_SECONDS / ACTS) + seconds) / CYCLE_SECONDS);
      const kinds = (seconds: number) => at(seconds).surface.filter((i) => i.opacity > 0.5).map((i) => i.kind);

      expect(kinds(2.0), `act ${a} teaches`).toContain("teach");
      expect(at(4.6).continueButton.opacity, `act ${a} offers Continue`).toBeGreaterThan(0.5);
      expect(kinds(6.5), `act ${a} asks`).toContain("question");
      // The learner is seen producing the answer, in the composer.
      expect(at(8.8).composer.groups[0]!.opacity, `act ${a} shows an answer forming`).toBeGreaterThan(0.5);
      expect(at(9.9).composer.sendOpacity, `act ${a} offers send`).toBeGreaterThan(0.5);
      expect(at(10.6).thinking, `act ${a} thinks`).toBeGreaterThan(0.3);
      expect(kinds(12.8), `act ${a} shows the learner's words back`).toContain("utterance");
      expect(kinds(12.8), `act ${a} evaluates`).toContain("verdict");
      expect(kinds(13.4), `act ${a} refines`).toContain("refine");
    }
  });

  it("the cursor is only ever aimed at something that exists", () => {
    for (let i = 0; i <= STEPS; i++) {
      const s = sessionState((((i * STEP_MS) / 1000 / CYCLE_SECONDS) % 1 + 1) % 1);
      if (!s.cursor || s.cursor.visible < 0.05) continue;
      if (s.cursor.to === "continue") {
        expect(s.continueButton.opacity, `cursor aims at a Continue that is not drawn, at ${(i * STEP_MS) / 1000}s`).toBeGreaterThan(0.05);
      }
      if (s.cursor.to === "send") {
        expect(s.composer.sendOpacity, `cursor aims at a send button that is not drawn, at ${(i * STEP_MS) / 1000}s`).toBeGreaterThan(0.05);
      }
    }
  });

  it("the composer only invites an answer while a question is open", () => {
    for (let a = 0; a < ACTS; a++) {
      const at = (seconds: number) => sessionState((a * (CYCLE_SECONDS / ACTS) + seconds) / CYCLE_SECONDS);
      expect(at(2.0).composer.placeholder).toBe("Ask Nemesis anything…");
      expect(at(7.0).composer.placeholder).toBe(SCRIPT[a]!.placeholder);
      // Once answered it goes back to being somewhere to ask about the feedback.
      expect(at(12.8).composer.placeholder).toBe("Ask Nemesis anything…");
    }
  });
});
