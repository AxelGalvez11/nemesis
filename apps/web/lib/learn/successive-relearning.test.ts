// Does the retention path ALREADY do successive relearning? Measured, not assumed.
//
// 🔴🔴 THIS FILE IS AN AUDIT THAT BECAME A TEST, AND IT DELIBERATELY BUILDS NOTHING. The August 2026
// review asked for "successful retrieval → leave it → meaningful delay → successful retrieval again,
// with repeated successes increasing the retention state". Nemesis already has durable evidence,
// a forgetting curve, an eligibility window, `defer`/`revisit`, and cross-session learner state — so
// the honest question was whether those are WIRED to each other or merely present, and a second
// scheduler would have been the wrong answer either way.
//
// The finding: the path is complete. What was missing was any test that walked it end to end, so a
// future edit could have broken one link with everything else still green. That is what this is.

import assert from "node:assert/strict";
import { test } from "node:test";

import { PHARMACOKINETICS, resolved } from "./__fixtures__/three-disciplines";
import type { LearnerEvidence } from "./learner-evidence";
import { projectLearnerState } from "./learner-evidence";
import { value } from "./next-action-value";
import { retrievabilityFor } from "./retention-model";
import { eligibleForRetrieval, RETRIEVAL_ELIGIBLE_AFTER_MS } from "./retrieval-eligibility";
import { chooseNextTeachingAction } from "./teaching-policy";

const ENTRY = resolved(PHARMACOKINETICS);
const KEY = ENTRY.objective.identityKey;
const DAY = 86_400_000;
const START = Date.parse("2026-08-01T09:00:00.000Z");

function pass(id: string, atMs: number, canvasId = "canvas-1"): LearnerEvidence {
  return {
    canvasId,
    demonstrationObtained: true,
    id,
    objectiveEvidence: "demonstrated",
    objectiveIdentityKey: KEY,
    occurredAt: new Date(atMs).toISOString(),
    scaffoldRung: "independent",
    taskForm: "direct",
    verdict: "understood",
  };
}

function decide(evidence: readonly LearnerEvidence[], now: Date) {
  return chooseNextTeachingAction({
    knowledgeObject: ENTRY.knowledge,
    learnerState: projectLearnerState(KEY, evidence),
    now,
    objective: ENTRY.objective,
    recentEvidence: evidence,
  });
}

test("🔴 a fresh pass is left alone; a stale one is asked again", () => {
  const first = [pass("e1", START)];

  // Minutes later: another retrieval would measure the last few minutes, not memory. The policy says
  // so, and says it as `advance` rather than by running out of things to do.
  const soon = decide(first, new Date(START + 60_000));
  assert.equal(soon.type, "advance");

  // 🔴 DIMINISHING RETURNS, MADE CHECKABLE. "Another minute here is worth less than moving forward"
  // is exactly what this branch is, and it is reached from a CORRECT state — not from an empty one.
  assert.equal(eligibleForRetrieval({ lastEvidenceAt: first[0]!.occurredAt, now: new Date(START + 60_000) }), false);

  // Past the window, the same state asks again, at full unaided demand.
  const later = decide(first, new Date(START + RETRIEVAL_ELIGIBLE_AFTER_MS + 1));
  assert.equal(later.type, "retrieve");
  assert.equal(later.type === "retrieve" && later.rung, "independent");
});

test("🔴🔴 repeated spaced successes raise the retention state rather than resetting it", () => {
  const oneSuccess = [pass("e1", START)];
  const twoSuccesses = [pass("e1", START), pass("e2", START + 3 * DAY)];
  const threeSuccesses = [...twoSuccesses, pass("e3", START + 10 * DAY)];

  // Measured at the SAME elapsed time since the most recent pass, so the only thing that differs is
  // how many spaced successes came before it.
  const after = (rows: readonly LearnerEvidence[], lastAtMs: number) =>
    retrievabilityFor(rows, new Date(lastAtMs + 2 * DAY))!;

  const one = after(oneSuccess, START);
  const two = after(twoSuccesses, START + 3 * DAY);
  const three = after(threeSuccesses, START + 10 * DAY);

  assert.ok(one > 0 && one < 1);
  assert.ok(two > one, `a second spaced success must buy more than the first alone (${two} vs ${one})`);
  assert.ok(three > two, `a third must buy more again (${three} vs ${two})`);
});

test("🔴 the forgetting estimate is what makes an old objective outrank a fresh one", () => {
  // 🔴 THE LINK THAT WOULD DIE SILENTLY. `retrievabilityFor` could be perfect and unread; the
  // selector is where it turns into a decision, and the only visible symptom of it being unwired
  // would be a learner never being brought back to anything.
  const rows = [pass("e1", START)];
  const state = projectLearnerState(KEY, rows);
  const scoreAt = (days: number) =>
    value({
      action: { because: "due", objectiveId: KEY, rung: "independent", type: "retrieve" },
      evidence: rows,
      interveningActs: 3,
      knowledge: ENTRY.knowledge,
      retrievability: retrievabilityFor(rows, new Date(START + days * DAY)),
      state,
    });

  const soon = scoreAt(1);
  const stale = scoreAt(30);
  assert.ok(stale.score > soon.score, "an objective the learner is losing must outrank one they still hold");
  assert.ok(stale.reasons.includes("increasingly-overdue"));
});

test("🔴 the record crosses sittings — it is keyed on the objective, never on the canvas", () => {
  // 🔴 SUCCESSIVE RELEARNING IS ONLY SUCCESSIVE IF YESTERDAY SURVIVES. Rows written on two different
  // canvases are two sittings with the same person, and the projection must read them as one history
  // — a `canvasId` filter anywhere in this path would silently reset every learner every session.
  const acrossSittings = [pass("e1", START, "canvas-monday"), pass("e2", START + 4 * DAY, "canvas-friday")];
  const state = projectLearnerState(KEY, acrossSittings);
  assert.equal(state.demonstrationCount, 2);
  assert.equal(state.status, "correct");
  assert.ok(retrievabilityFor(acrossSittings, new Date(START + 5 * DAY))! > 0);
});
