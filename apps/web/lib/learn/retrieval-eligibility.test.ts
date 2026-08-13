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

test("🔴 ACCEPTANCE: the interval a learner WAITS is the interval the owner RULED", () => {
  // 🔴 THIS IS THE TEST THE OLD ONES COULD NOT BE, AND IT IS RED ON PURPOSE UNTIL THE CONJUNCTION
  // IN `teaching-policy.ts` IS RESOLVED. Read the failure message before changing anything here.
  //
  // Every other test in this file asks the PREDICATE what it thinks, or asks the DECISION about one
  // hand-picked age. Neither can catch the defect that is actually present: `chooseNextTeachingAction`
  // gates the `correct` branch on `!actedJustNow && eligibleForRetrieval(...)`, and `actedJustNow`
  // is measured against `ACT_AGAIN_AFTER_MS` — a SEPARATE, LONGER constant. So what a learner waits
  // is `max(ACT_AGAIN_AFTER_MS, RETRIEVAL_ELIGIBLE_AFTER_MS)`, and the owner's ruling is inert
  // wherever it lands below one hour.
  //
  // So this does not sample. It SWEEPS for the age at which the objective actually becomes askable
  // again and compares that to the ruled constant. A constant is only a knob if nothing downstream
  // can out-vote it, and that is a property of the decision, never of a source file.
  const MINUTE = 60_000;
  let waited: number | null = null;
  for (let mins = 1; mins <= 24 * 60; mins += 1) {
    if (decideNext({ evidence: correctAt(ago(mins * MINUTE)), now: NOW, objectives: ONLY })) {
      waited = mins * MINUTE;
      break;
    }
  }

  assert.notEqual(waited, null, "a demonstrated objective must become askable again within a day");
  assert.equal(
    waited,
    RETRIEVAL_ELIGIBLE_AFTER_MS,
    `the owner ruled ${RETRIEVAL_ELIGIBLE_AFTER_MS / MINUTE} min, but a learner waits ${
      waited! / MINUTE
    } min — a second constant is overriding the one value that is supposed to govern tempo`,
  );
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
  // 🔴 UPDATE, 2026-08-13 — THE OWNER RULED TEN MINUTES, AND THIS TEST STAYS STRUCTURAL ANYWAY.
  // THAT IS A DELIBERATE REFUSAL, NOT AN OMISSION. Read this before "finishing the job".
  //
  // The note above predicted the guard would become load-bearing below one hour. It became
  // something worse: DOMINANT. `actedJustNow` is measured against `ACT_AGAIN_AFTER_MS` (1 h), so
  // the conjunction makes a learner wait `max(1 h, tempo)` and the owner's ten minutes never takes
  // effect. The two windows were never collapsed — they are INVERTED, and the wrong one wins.
  //
  // The behavioural version of this test is now writable: ages 10–59 min separate the windows
  // (eligible, yet "just acted"), so a case at 30 min asserting `null` would pass, and deleting
  // `!actedJustNow` would turn it red. It would calibrate perfectly — and it would assert, as a
  // protected invariant, that the owner's ruling does not take effect for another fifty minutes.
  // A test that pins the defect is worse than no test, so it is not written. The invariant stays
  // pinned structurally: `actedJustNow` must be checked before eligibility, so layer 1 composes
  // with tempo rather than competing with it.
  //
  // Layer 1 itself is not at risk in the meantime. At a ten-minute tempo, `eligibleForRetrieval`
  // alone already refuses anything answered ninety seconds ago.
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
  // 🔴 THIS TEST HAS A BLIND SPOT AND IT COST THE TEAM THE WHOLE TEMPO RULING. It reads ONE FILE.
  // `ACT_AGAIN_AFTER_MS` lives in `teaching-policy.ts`, is an interval over the same elapsed time,
  // and is conjoined into the same decision — a second knob governing tempo, older than this one
  // and currently the one that wins. This test asserted "exactly one exported value governs tempo"
  // and stayed green throughout. It is not wrong, it is NARROW: it guards this file against growing
  // a scheduler. The claim about the DECISION is the sweep test above, and that is where a future
  // second knob will actually be caught.
  //
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
