// Does the predicted-retrievability curve behave the way the reasoning it was adapted from claims?

import assert from "node:assert/strict";
import { test } from "node:test";

import type { LearnerEvidence } from "./learner-evidence";
import { retrievabilityFor } from "./retention-model";

const NOW = new Date("2026-08-15T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

let counter = 0;
function row(over: Partial<LearnerEvidence> = {}): LearnerEvidence {
  counter += 1;
  return {
    demonstrationObtained: true,
    id: `e${counter}`,
    objectiveIdentityKey: "o1",
    occurredAt: daysAgo(0),
    verdict: "understood",
    ...over,
  };
}

test("no evidence at all is unknown, not forgotten", () => {
  assert.equal(retrievabilityFor([], NOW), null);
});

test("🔴 a revealed answer or a give-up is not a pass — nothing to estimate from", () => {
  const evidence = [row({ demonstrationObtained: false, verdict: null })];
  assert.equal(retrievabilityFor(evidence, NOW), null);
});

test("only ever missed it — no successful retrieval to decay from", () => {
  const evidence = [row({ occurredAt: daysAgo(5), verdict: "incorrect" })];
  assert.equal(retrievabilityFor(evidence, NOW), null);
});

test("just passed: retrievability is close to 1", () => {
  const evidence = [row({ occurredAt: daysAgo(0), verdict: "understood" })];
  const r = retrievabilityFor(evidence, NOW)!;
  assert.ok(r > 0.95, `expected close to 1 right after a pass, got ${r}`);
});

test("🔴 retrievability falls as elapsed time grows, never rises on its own", () => {
  const soon = retrievabilityFor([row({ occurredAt: daysAgo(1), verdict: "understood" })], NOW)!;
  const later = retrievabilityFor([row({ occurredAt: daysAgo(10), verdict: "understood" })], NOW)!;
  const muchLater = retrievabilityFor([row({ occurredAt: daysAgo(60), verdict: "understood" })], NOW)!;
  assert.ok(soon > later, `${soon} should exceed ${later}`);
  assert.ok(later > muchLater, `${later} should exceed ${muchLater}`);
});

test("a stronger initial grade decays more slowly than a weaker one, at the same elapsed time", () => {
  const strong = retrievabilityFor([row({ occurredAt: daysAgo(5), verdict: "strong" })], NOW)!;
  const understood = retrievabilityFor([row({ occurredAt: daysAgo(5), verdict: "understood" })], NOW)!;
  assert.ok(strong > understood, `"strong" (${strong}) should outlast "understood" (${understood})`);
});

test("surviving a longer gap before answering again is worth more than answering immediately", () => {
  // Passing again after a long wait is real evidence of durability; passing again ten seconds later
  // is evidence of short-term memory. The second pass should grant less additional stability.
  const longGap = retrievabilityFor(
    [row({ occurredAt: daysAgo(30), verdict: "understood" }), row({ occurredAt: daysAgo(20), verdict: "understood" })],
    NOW,
  )!;
  const shortGap = retrievabilityFor(
    [row({ occurredAt: daysAgo(30), verdict: "understood" }), row({ occurredAt: daysAgo(29.9), verdict: "understood" })],
    NOW,
  )!;
  assert.ok(longGap > shortGap, `surviving the longer gap (${longGap}) should predict better retention than the short one (${shortGap})`);
});

test("a miss cuts stability, so retrievability after a fail-then-pass trails a clean pass", () => {
  const clean = retrievabilityFor([row({ occurredAt: daysAgo(10), verdict: "understood" })], NOW)!;
  const withAMiss = retrievabilityFor(
    [row({ occurredAt: daysAgo(20), verdict: "incorrect" }), row({ occurredAt: daysAgo(10), verdict: "understood" })],
    NOW,
  )!;
  assert.ok(clean >= withAMiss, `a history with a miss (${withAMiss}) should not predict better than a clean pass (${clean})`);
});

test("🔴 undated evidence is excluded, not backfilled to now", () => {
  const evidence = [row({ occurredAt: "not-a-real-date", verdict: "understood" })];
  assert.equal(retrievabilityFor(evidence, NOW), null);
});

test("🔴 an untrusted verdict is not folded — the same gate projectLearnerState applies", () => {
  // Below TRUSTED_ENOUGH_TO_UPDATE_STATE (0.4): the judge itself was not confident, so this must not
  // grant stability retention-model.ts would otherwise read as a real pass.
  const evidence = [row({ confidence: 0.1, occurredAt: daysAgo(5), verdict: "understood" })];
  assert.equal(retrievabilityFor(evidence, NOW), null);
});

test("confidence at or above the trust threshold is folded normally", () => {
  const evidence = [row({ confidence: 0.4, occurredAt: daysAgo(0), verdict: "understood" })];
  assert.notEqual(retrievabilityFor(evidence, NOW), null);
});

test("no clock is read internally — the same evidence and `now` always produce the same number", () => {
  const evidence = [row({ occurredAt: daysAgo(3), verdict: "strong" })];
  assert.equal(retrievabilityFor(evidence, NOW), retrievabilityFor(evidence, NOW));
});
