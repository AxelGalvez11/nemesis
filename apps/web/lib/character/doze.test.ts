// When the character falls asleep, and the two things that must never let it.
//
// Owner, 2026-08-26: *"bloub has nice animations called burst, sleep, thinking, i want those"*.
// `sleep` had been in the catalogue for weeks with nothing able to make it true.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ANIMATION_BY_ID, FACE_BY_ID } from "@/lib/avatar";

import { DOZE_AFTER_MS, isDozing } from "./doze";
import { ACTIVITY_STATE } from "./stations";

const awake = { idleMs: 0, working: false, away: false };

test("🔴🔴 it never sleeps while Nemesis is working, however long the learner has sat still", () => {
  // A learner who asked a question and then took their hands off the mouse is the ORDINARY case:
  // they are waiting. A character asleep through the wait says nobody is home.
  assert.equal(isDozing({ ...awake, idleMs: DOZE_AFTER_MS * 100, working: true }), false);
});

test("🔴 nor while the character is away, because 'nothing happened' is true by definition there", () => {
  assert.equal(isDozing({ ...awake, idleMs: DOZE_AFTER_MS * 100, away: true }), false);
});

test("it sleeps once nothing has happened for long enough, and not a moment before", () => {
  assert.equal(isDozing({ ...awake, idleMs: DOZE_AFTER_MS - 1 }), false);
  assert.equal(isDozing({ ...awake, idleMs: DOZE_AFTER_MS }), true);
});

test("🔴 the threshold is minutes, because the commonest thing a learner does is READ", () => {
  // Reading a page of a lesson involves no pointer, no key and no turn. Anything close to a
  // minute is a character that falls asleep in the middle of the actual work. The risk is
  // entirely one-sided: too long and nobody sees it, which costs nothing.
  assert.ok(DOZE_AFTER_MS >= 120_000, `${DOZE_AFTER_MS}ms is short enough to sleep through reading`);
});

test("🔴🔴 sleeping is scheduled, reaches a real animation, and shuts its eyes", () => {
  const id = ACTIVITY_STATE.dozing;
  const animation = ANIMATION_BY_ID.get(id);
  assert.ok(animation, `dozing schedules "${id}", which is not in the catalogue`);
  // 🔴 THE EYES CLOSING IS THE FEATURE HERE, AND IT IS THE SAME PROPERTY THAT MADE `thinking` WRONG
  // WHILE WORKING (see thinking-figure.test.ts). The rule was never "eyes always": it is that the
  // character keeps its face while it WORKS, and this is the opposite of working.
  assert.ok(
    animation.steps.every((step) => FACE_BY_ID.get(step.face)?.eyeAlpha === 0),
    "the sleeping character has its eyes open",
  );
});

test("🔴🔴 the three layers compose in the order that makes a click land", () => {
  // 🔴 REPOINTED 2026-08-27 when the montage went in between them. The order IS the behaviour:
  //
  //   usePoke      what a click asked for. Beats everything: a click must be answered.
  //   useMontage   the resting faces, which only run when nothing else is happening.
  //   useDoze      asleep, which beats a montage — a sleeping character is not pulling faces.
  //
  // Source-text, because the order lives in three lines and no test can reach a hook chain.
  const dock = readFileSync(new URL("../../components/character/character-dock.tsx", import.meta.url), "utf8");
  assert.match(dock, /const \{ state: poked[^}]*\} = usePoke\(state\);/, "usePoke stopped taking the surface's own state");
  // 🔴 REPOINTED 2026-08-30 (SECOND TIME THAT DAY): the montage's fourth argument is gone again.
  // It was an absorbed-stretch number handed DOWN from a clock the dock ran itself — and a dock
  // running its own attention clock beside the montage's is the two-clock bug this whole change
  // removes (`attention.ts`). The hook owns the one clock and hands back both answers. None of
  // that touches the order this test is about: a poke still goes in, a doze still wraps.
  assert.match(dock, /const \{ state: varied, absorbed \} = useMontage\(poked, atRest, poking\);/, "the montage no longer wraps the poke, so a click is overwritten by a resting face");
  assert.match(dock, /const shown = useDoze\(varied, hidden, !atRest\);/, "the doze layer no longer wraps the montage, or is deriving `working` from a layered state");

  // 🔴🔴 AND `atRest` COMES FROM THE SURFACE'S OWN STATE, NEVER FROM A LAYERED ONE. Derived from
  // the result, a montage face reads as "Nemesis is working": the doze clock resets every nine
  // seconds and the character never sleeps again. Nothing would fail.
  assert.match(dock, /const atRest = state === ACTIVITY_STATE\.resting;/, "`atRest` is being derived from something other than the surface's own state");
});
