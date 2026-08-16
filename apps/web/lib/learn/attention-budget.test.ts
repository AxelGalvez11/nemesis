import assert from "node:assert/strict";
import { test } from "node:test";

import {
  actsOnObjective,
  attentionShare,
  availableFromWindows,
  MAX_IDLE_MS,
  msOnObjective,
  type TeachingAct,
} from "./attention-budget";

// THE COST TERM THAT DID NOT EXIST, AND WHY EACH PIECE OF IT REFUSES RATHER THAN GUESSES.
//
// 🔴 `docs/canvas-teaching-policy-audit.md` §3 measured the consequence of having no cost term at
// all: eight consecutive misses on one objective, every one answered "ask again", with untouched
// material losing every round. These tests hold the two properties that make a cost term honest —
// it never counts time the learner was not there, and it never invents a deadline nobody gave.

const act = (key: string, atMs: number): TeachingAct => ({ action: "retrieve", atMs, objectiveIdentityKey: key });

test("🔴 a break in the middle of a sitting is not attention, and every gap is clipped", () => {
  const acts = [act("a", 0), act("a", 60_000), act("b", 90_000)];
  // a: 0->60s counts in full; 60s->90s is b's start, so a's second act costs 30s.
  assert.equal(msOnObjective({ acts, maxIdleMs: MAX_IDLE_MS, nowMs: 120_000, objectiveIdentityKey: "a" }), 90_000);

  // 🔴 THE INTERRUPTION CAN LAND ANYWHERE, NOT ONLY AT THE END. My first version clipped only the
  // trailing gap, on the reasoning that a learner who walks away does so from whatever is on screen.
  // They also walk away mid-session and come back to the same objective, and an unclipped middle gap
  // would report forty minutes of attention on one fact.
  const withBreak = [act("a", 0), act("a", 40 * 60_000), act("a", 40 * 60_000 + 1_000)];
  const spent = msOnObjective({
    acts: withBreak,
    maxIdleMs: MAX_IDLE_MS,
    nowMs: 40 * 60_000 + 2_000,
    objectiveIdentityKey: "a",
  });
  assert.ok(spent <= MAX_IDLE_MS * 3, `a 40-minute break must not become attention, got ${spent}ms`);
});

test("🔴 the most recent act is measured to now, so an objective in flight is not free", () => {
  const acts = [act("a", 0)];
  assert.equal(msOnObjective({ acts, maxIdleMs: MAX_IDLE_MS, nowMs: 30_000, objectiveIdentityKey: "a" }), 30_000);
});

test("🔴 a count and a duration are different costs, and both are reported", () => {
  // Four quick attempts and one long one spend comparable minutes and mean completely different
  // things. A controller that saw only minutes could not tell a learner bouncing off something from
  // a learner working on it.
  const bouncing = [act("a", 0), act("a", 2_000), act("a", 4_000), act("a", 6_000)];
  const working = [act("a", 0)];
  assert.equal(actsOnObjective("a", bouncing), 4);
  assert.equal(actsOnObjective("a", working), 1);
});

test("🔴🔴 no scheduled window means UNKNOWN, and unknown is never unlimited", () => {
  const soon = [{ endMs: 10_000_000, startMs: 9_000_000 }];
  // A block starting in three hours says nothing about how long THIS sitting has, and treating the
  // gap until it as available time would tell the controller it has hours when the learner is about
  // to close the tab.
  assert.equal(availableFromWindows(soon, 1_000), null);
  // Inside the window, the answer is what is left of it.
  assert.equal(availableFromWindows(soon, 9_500_000), 500_000);
  // Past it, unknown again — never zero, which would read as "you are out of time".
  assert.equal(availableFromWindows(soon, 10_000_001), null);
  assert.equal(availableFromWindows([], 1_000), null);
});

test("🔴 overlapping windows take the SOONEST end, because that is the one that actually bounds", () => {
  const windows = [
    { endMs: 5_000, startMs: 0 },
    { endMs: 9_000, startMs: 0 },
  ];
  assert.equal(availableFromWindows(windows, 1_000), 4_000);
});

test("🔴 the same three minutes is a lot of a short sitting and nothing in a long one", () => {
  // 🔴 THIS IS THE ONE NUMBER THAT MAKES THE SAME CONTROLLER BEHAVE DIFFERENTLY UNDER DIFFERENT
  // BUDGETS WITHOUT A MODE. The owner's ruling was explicit: time is state, not a separate cram
  // mode. A share does that with a plain division over two measured quantities.
  const short = attentionShare(3 * 60_000, { activeMs: 2 * 60_000, availableMs: 8 * 60_000 });
  const long = attentionShare(3 * 60_000, { activeMs: 30 * 60_000, availableMs: 5 * 60 * 60_000 });
  assert.ok(short !== null && long !== null);
  assert.ok(short > 0.25, `three minutes of a ten-minute sitting is substantial, got ${short}`);
  assert.ok(long < 0.03, `three minutes of a six-hour sitting is not, got ${long}`);
});

test("🔴 an unknown budget still yields a share from what has been spent, and never divides by zero", () => {
  assert.equal(attentionShare(0, { activeMs: 0, availableMs: null }), null);
  const share = attentionShare(60_000, { activeMs: 300_000, availableMs: null });
  assert.equal(share, 0.2);
});
