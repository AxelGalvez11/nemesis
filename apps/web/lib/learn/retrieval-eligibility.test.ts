import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { KnowledgeObject } from "./knowledge-types";
import { projectLearnerState, type LearnerEvidence } from "./learner-evidence";
import type { StoredObjective } from "./learner-store";
import { objectivesForKnowledge } from "./learning-objective";
import type { ResolvedObjective } from "./canvas-knowledge";
import { decideNext } from "./policy-runtime";
import { eligibleForRetrieval, RETRIEVAL_ELIGIBLE_AFTER_MS } from "./retrieval-eligibility";

const KNOWLEDGE: KnowledgeObject = {
  id: "k1",
  identityKey: "association:v2:8589ff53b101b420",
  pair: { id: "t1:r1", left: "losartan", leftRole: "generic", right: "Cozaar", rightRole: "brand" },
  relationKind: "brand|generic",
  statement: "losartan — Cozaar",
  type: "association",
};

const NOW = new Date("2026-08-13T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

/** 🔴 EXACTLY ONE. The whole defect lives here: reordering has no back to move anything to. */
const ONLY: ResolvedObjective[] = [
  { knowledge: KNOWLEDGE, objective: { ...objectivesForKnowledge(KNOWLEDGE)[0]!, rowId: "row-1" } as StoredObjective },
];
const KEY = ONLY[0]!.objective.identityKey;

const correctAt = (occurredAt: string): LearnerEvidence[] => [
  { demonstrationObtained: true, id: "e1", objectiveIdentityKey: KEY, occurredAt, verdict: "strong" },
];

// ── the acceptance criterion, stated by Brain and executed here ──────────────────────────────────

test("🔴 ACCEPTANCE: one objective, answered correctly, is eligible again after the interval", () => {
  // This is the canonical statement of the defect it fixes. With a single objective there is no
  // queue to reorder and no other material to interleave, so a correct answer used to empty the
  // canvas permanently: `correct 1 minute ago → null`, and `correct 365 days ago → null` too.
  const justNow = decideNext({ evidence: correctAt(ago(60_000)), now: NOW, objectives: ONLY });
  assert.equal(justNow, null, "layer 1: the thing just answered is not asked again");

  const longAfter = decideNext({
    evidence: correctAt(ago(RETRIEVAL_ELIGIBLE_AFTER_MS * 3)),
    now: NOW,
    objectives: ONLY,
  });
  assert.notEqual(longAfter, null, "🔴 a single-objective canvas must not be permanently empty");
  assert.equal(longAfter?.action.type, "retrieve");
  assert.equal(longAfter?.objective.identityKey, KEY);
});

test("🔴 ACCEPTANCE: `projectLearnerState` is byte-identical either way", () => {
  // Eligibility must not reach into the projection. `correct` staying `correct` is RIGHT — the
  // learner did demonstrate it, and elapsed time does not make that untrue. A projection that
  // decayed its own status would be the forbidden `response → 1-4 → that IS learner state` arriving
  // by a different road, and every consumer of learner state would silently inherit a clock.
  const recent = projectLearnerState(KEY, correctAt(ago(60_000)));
  const ancient = projectLearnerState(KEY, correctAt(ago(365 * 24 * 3600_000)));

  // Same evidence shape, wildly different ages, and only `lastEvidenceAt` may differ.
  assert.equal(recent.status, "correct");
  assert.equal(ancient.status, "correct");
  assert.deepEqual({ ...recent, lastEvidenceAt: null }, { ...ancient, lastEvidenceAt: null });
});

// ── layer 1 must hold whatever tempo the owner later chooses ─────────────────────────────────────

test("🔴 suppression is guarded SEPARATELY from eligibility, so tempo cannot delete it", () => {
  // 🔴 THIS IS A SOURCE ASSERTION AND IT HAS TO BE, WHICH IS WORTH STATING RATHER THAN HIDING.
  //
  // A first version of this test drove `decideNext` with one-second-old evidence and asserted null,
  // claiming to prove the suppression guard was load-bearing. It passed with the guard DELETED —
  // because `RETRIEVAL_ELIGIBLE_AFTER_MS` currently equals `ACT_AGAIN_AFTER_MS`, so "eligible" and
  // "not just acted" are the same instant and no evidence age can separate them. The test was
  // passing for the wrong reason, which is worse than not existing.
  //
  // The guard is genuinely defensive: it becomes load-bearing the moment the owner sets a tempo
  // SHORTER than one hour, and it costs nothing until then. Since no behavioural input can reach
  // that state today, the invariant is pinned structurally — `actedJustNow` must be checked before
  // eligibility, so layer 1 composes with tempo rather than competing with it.
  const code = readFileSync(new URL("./teaching-policy.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  const gate = code.indexOf("eligibleForRetrieval(");
  assert.notEqual(gate, -1, "the policy must consult eligibility");
  const condition = code.slice(code.lastIndexOf("if (", gate), gate);
  assert.ok(
    condition.includes("!actedJustNow &&"),
    "suppression must be checked BEFORE eligibility — otherwise a short interval reopens the immediate repeat",
  );

  // And the predicate itself genuinely honours an injected interval, which is what makes the
  // structural guard meaningful rather than decorative.
  assert.equal(eligibleForRetrieval({ eligibleAfterMs: 0, lastEvidenceAt: ago(1), now: NOW }), true);
});

// ── the predicate itself ─────────────────────────────────────────────────────────────────────────

test("eligibility is a function of elapsed time and nothing else", () => {
  const after = RETRIEVAL_ELIGIBLE_AFTER_MS;
  assert.equal(eligibleForRetrieval({ lastEvidenceAt: ago(after - 1), now: NOW }), false);
  assert.equal(eligibleForRetrieval({ lastEvidenceAt: ago(after), now: NOW }), true, "the boundary is inclusive");
  assert.equal(eligibleForRetrieval({ lastEvidenceAt: null, now: NOW }), true, "never observed is not a wait");
});

test("🔴 ONE knob, and it stays one knob", () => {
  // 🔴 THE SPECIFIC FAILURE THIS GUARDS AGAINST. A second parameter here — difficulty, stability,
  // ease, a per-objective multiplier — is the moment this becomes a spaced-repetition system
  // invented inside the teaching policy, which is the thing this codebase was explicitly told not to
  // grow. FSRS belongs downstream of evidence and supersedes this file rather than negotiating with
  // it. If a second number is ever genuinely needed, that is a Brain decision, not a quiet edit.
  const source = readFileSync(new URL("./retrieval-eligibility.ts", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const constants = [...code.matchAll(/export const (\w+)/g)].map((m) => m[1]);
  assert.deepEqual(constants, ["RETRIEVAL_ELIGIBLE_AFTER_MS"], "exactly one exported value governs tempo");

  for (const forbidden of ["difficulty", "stability", "ease", "interval *", "streak"]) {
    assert.equal(code.includes(forbidden), false, `"${forbidden}" would be a second scheduler`);
  }
  // And it must not reach for learner state beyond a timestamp.
  assert.equal(code.includes("demonstrationCount"), false, "eligibility is time, not a count");
  assert.equal(code.includes("verdict"), false, "eligibility does not read what the answer showed");
});
