import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { ResolvedObjective } from "./canvas-knowledge";
import type { KnowledgeObject } from "./knowledge-types";
import type { LearnerEvidence } from "./learner-evidence";
import { objectivesForKnowledge } from "./learning-objective";
import { projectLearnerState } from "./learner-evidence";
import { decideNext } from "./policy-runtime";
import { ACT_AGAIN_AFTER_MS } from "./teaching-policy";

// D6: can a learner answer their way out of a correction?
//
// 🔴 THE MEASURED DEFECT. One objective, nothing else to prefer. Every route in — no attempt, a
// wrong answer, a partial answer — produced `show_correction`, at every elapsed time out to a YEAR.
// The correction screen has no answer box, and evidence only changes by answering, so status could
// never leave `incorrect`. Get something wrong once and Nemesis showed you the answer, then showed
// you the same answer every time that objective came round, for ever, and never asked you again.
// **The one thing that would fix their state was the one thing they were never offered.**
//
// 🔴 AND THE INTENT WAS ALREADY WRITTEN DOWN. The policy's own reasons said the answer is worth
// stating "before another attempt" and "before asking again". There was no again. Someone wrote the
// sequence correctly and built the first half of it.
//
// These tests walk the whole loop rather than checking one branch, because what broke was not a
// branch — it was that the branches never led anywhere.

const KNOWLEDGE: KnowledgeObject = {
  id: "k1",
  identityKey: "association:v2:8589ff53b101b420",
  pair: { id: "t1:r1", left: "losartan", leftRole: "generic", right: "Cozaar", rightRole: "brand" },
  relationKind: "brand|generic",
  statement: "losartan — Cozaar",
  type: "association",
  unanchoredProvenance: [],
};
const [FORWARD] = objectivesForKnowledge(KNOWLEDGE);
const ONE: ResolvedObjective[] = [{ knowledge: KNOWLEDGE, objective: { ...FORWARD!, rowId: "row-forward" } }];
const KEY = FORWARD!.identityKey;

function at(iso: string): Date {
  return new Date(iso);
}
function ev(id: string, occurredAt: Date, verdict: LearnerEvidence["verdict"]): LearnerEvidence {
  return {
    demonstrationObtained: verdict !== null,
    id,
    objectiveIdentityKey: KEY,
    occurredAt: occurredAt.toISOString(),
    verdict,
  };
}
function decide(input: { evidence: LearnerEvidence[]; now: Date; correctionsShown?: Set<string> }) {
  return decideNext({
    correctionsShown: input.correctionsShown ?? new Set(),
    evidence: input.evidence,
    now: input.now,
    objectives: ONE,
  });
}

// ── the loop, walked end to end ─────────────────────────────────────────────

test("🔴 a learner can now answer their way out of a correction", () => {
  const wrongAt = at("2026-08-13T09:00:00Z");
  const evidence = [ev("e1", wrongAt, "incorrect")];

  // 1. They have just got it wrong. The answer is what is owed, and it is stated.
  const justWrong = decide({ evidence, now: new Date(wrongAt.getTime() + 1_000) });
  assert.equal(justWrong?.action.type, "show_correction", "the correction still comes when it is earned");

  // 2. They read it and press Got it. Repeating the same card is the loop that looks like teaching
  //    and is not, so the objective is held rather than re-shown.
  const afterReading = decide({
    correctionsShown: new Set([KEY]),
    evidence,
    now: new Date(wrongAt.getTime() + 2_000),
  });
  assert.equal(afterReading?.action.type, "defer", "the same correction is not served twice");

  // 3. 🔴 THE STEP THAT DID NOT EXIST. Once the correction has had its moment, what is owed is the
  //    attempt it was stated in aid of.
  const later = decide({
    correctionsShown: new Set([KEY]),
    evidence,
    now: new Date(wrongAt.getTime() + ACT_AGAIN_AFTER_MS + 1_000),
  });
  assert.equal(later?.action.type, "retrieve", "the objective becomes answerable again");

  // 4. And answering it moves the learner's state, which is the whole point: before this, status
  //    could not leave `incorrect` because nothing could ever produce new evidence for it.
  const rightAt = new Date(wrongAt.getTime() + ACT_AGAIN_AFTER_MS + 60_000);
  const answered = [...evidence, ev("e2", rightAt, "understood")];
  assert.equal(
    projectLearnerState(KEY, answered).status,
    "correct",
    "the correction led somewhere: status left `incorrect`, which it previously could not do",
  );
  // Nothing is owed on this objective any more, and `decideNext` says that by returning null rather
  // than by naming an action — `advance` is the absence of an answer to "what next", not an answer.
  assert.equal(
    decide({ correctionsShown: new Set([KEY]), evidence: answered, now: new Date(rightAt.getTime() + 1_000) }),
    null,
  );
});

test("🔴 the closed loop is open across every elapsed time and all three routes in", () => {
  // Integration's measurement, inverted. That grid was `correction` in all 21 cells.
  const wrongAt = at("2026-08-13T09:00:00Z");
  const elapsed = {
    "1 hour and a minute": ACT_AGAIN_AFTER_MS + 60_000,
    "1 day": 24 * 3600_000,
    "1 year": 365 * 24 * 3600_000,
    "30 days": 30 * 24 * 3600_000,
    "2 hours": 2 * 3600_000,
  };
  for (const [label, ms] of Object.entries(elapsed)) {
    for (const verdict of [null, "incorrect", "partial"] as const) {
      const decision = decide({
        correctionsShown: new Set([KEY]),
        evidence: [ev("e1", wrongAt, verdict)],
        now: new Date(wrongAt.getTime() + ms),
      });
      assert.equal(
        decision?.action.type,
        "retrieve",
        `${verdict ?? "no attempt"} after ${label} must be askable again, not corrected again`,
      );
    }
  }
});

// ── 🔴 the trap that would have inverted the fix ────────────────────────────

test("🔴 the correction is NOT suppressed by the acknowledgement that precedes it", () => {
  // `acknowledge()` fills `actedOn` when the learner clears the FEEDBACK screen after answering —
  // which happens BEFORE any correction has been displayed. Had the policy read that set as "they
  // have seen the answer", it would defer at the exact moment the correction is owed, and someone
  // who got a question wrong would never be shown the answer AT ALL. This is that failure, written
  // as a test: if `correctionsShown` were ever filled at feedback time, this goes red.
  const wrongAt = at("2026-08-13T09:00:00Z");
  const decision = decide({
    correctionsShown: new Set([KEY]),
    evidence: [ev("e1", wrongAt, "incorrect")],
    now: new Date(wrongAt.getTime() + 1_000),
  });
  assert.equal(decision?.action.type, "defer", "a set filled too early turns the correction into a hold");

  // …which is why the runtime fills it only when the thing acknowledged WAS the correction.
  const runtime = readFileSync(
    new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url),
    "utf8",
  );
  // 🔴 FROM THE ACKNOWLEDGEMENT, NOT THE FIRST MENTION. The first `setCorrectionsShown` in the
  // file is the `useState` declaration, and a guard that matched there would read the wrong 260
  // characters and pass on prose instead of on the condition it exists to pin.
  const ackAt = runtime.indexOf("const acknowledge");
  assert.ok(ackAt !== -1, "the acknowledgement must be findable for this guard to mean anything");
  const at_ = runtime.indexOf("setCorrectionsShown", ackAt);
  assert.ok(at_ !== -1, "the runtime must record corrections at all");
  assert.match(
    runtime.slice(Math.max(0, at_ - 260), at_),
    /decision\?\.action\.type === "show_correction"/,
    "recording a correction must be conditional on a correction having been the thing on screen",
  );
});

test("🔴 receiving a correction still writes no evidence", () => {
  // The hard invariant this whole design rests on: viewing is not evidence. The fix adds session
  // state precisely so that reading an answer never has to become a durable claim about a learner.
  const wrongAt = at("2026-08-13T09:00:00Z");
  const evidence = [ev("e1", wrongAt, "incorrect")];
  const before = decide({ evidence, now: new Date(wrongAt.getTime() + 1_000) });
  const after = decide({
    correctionsShown: new Set([KEY]),
    evidence,
    now: new Date(wrongAt.getTime() + 2_000),
  });
  assert.equal(before?.state.evidenceCount, 1);
  assert.equal(after?.state.evidenceCount, 1, "reading the answer added nothing to the log");
  assert.equal(after?.state.demonstrationCount, before?.state.demonstrationCount);
});

test("a correction never shown is never assumed to have been", () => {
  // Absent means not shown. A caller that does not track it gets the honest reading, and the
  // learner still gets their answer.
  const wrongAt = at("2026-08-13T09:00:00Z");
  const decision = decideNext({
    evidence: [ev("e1", wrongAt, "incorrect")],
    now: new Date(wrongAt.getTime() + 1_000),
    objectives: ONE,
  });
  assert.equal(decision?.action.type, "show_correction");
});
