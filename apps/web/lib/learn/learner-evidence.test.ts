import assert from "node:assert/strict";
import { test } from "node:test";

import {
  projectAll,
  projectLearnerState,
  type EvidenceVerdict,
  type LearnerEvidence,
} from "./learner-evidence";

const OBJ = "recall:v1:61fe6de64c05d6fc";
const OTHER = "recall:v1:6e557ca6e17fc8bc";

function ev(
  id: string,
  occurredAt: string,
  verdict: EvidenceVerdict | null,
  extra: Partial<LearnerEvidence> = {},
): LearnerEvidence {
  return {
    demonstrationObtained: verdict !== null,
    id,
    objectiveIdentityKey: OBJ,
    occurredAt,
    verdict,
    ...extra,
  };
}

// ── absence of evidence is not negative evidence ────────────────────────────

test("🔴 an objective with no evidence is UNKNOWN, not weak", () => {
  const state = projectLearnerState(OBJ, []);
  assert.equal(state.status, "unknown");
  assert.equal(state.evidenceCount, 0);
  assert.equal(state.latestVerdict, null);
  assert.equal(state.lastEvidenceAt, null);
  // The whole point: none of these are what "we have not asked" means.
  for (const wrong of ["incorrect", "partial", "not_demonstrated"]) {
    assert.notEqual(state.status, wrong);
  }
});

test("evidence for a DIFFERENT objective leaves this one unknown", () => {
  // Otherwise "they know something nearby" quietly becomes "they know this", which is the
  // learner × concept mistake that objective identity exists to prevent.
  const state = projectLearnerState(OBJ, [{ ...ev("e1", "2026-08-01T10:00:00Z", "strong"), objectiveIdentityKey: OTHER }]);
  assert.equal(state.status, "unknown");
  assert.equal(state.evidenceCount, 0);
});

test("🔴 revealing the answer is NOT_DEMONSTRATED, never INCORRECT", () => {
  // An opportunity was given and nothing came back. Nothing was contradicted, so recording this as
  // `incorrect` would be absence of evidence stored as negative evidence — the same defect as
  // defaulting an unasked learner to "knows the basics", one layer deeper.
  const state = projectLearnerState(OBJ, [ev("e1", "2026-08-01T10:00:00Z", null)]);
  assert.equal(state.status, "not_demonstrated");
  assert.notEqual(state.status, "incorrect");
  assert.equal(state.evidenceCount, 1, "it IS evidence — an opportunity was recorded");
  assert.equal(state.demonstrationCount, 0, "but no demonstration was obtained");
  assert.equal(state.latestVerdict, null);
});

// ── the vocabulary stays distinct ───────────────────────────────────────────

test("each judged verdict projects to its own status", () => {
  const at = "2026-08-01T10:00:00Z";
  const statusOf = (v: EvidenceVerdict) => projectLearnerState(OBJ, [ev("e1", at, v)]).status;
  assert.equal(statusOf("strong"), "correct");
  assert.equal(statusOf("understood"), "correct");
  assert.equal(statusOf("partial"), "partial");
  assert.equal(statusOf("incorrect"), "incorrect");
  // 🔴 A MISCONCEPTION IS NOT MERELY AN ERROR. It says a specific competing model is in the way,
  // which calls for teaching against that model rather than another attempt at retrieval.
  assert.equal(statusOf("misconception"), "misconception");
});

test("strong and understood both read as correct, and the difference survives", () => {
  const at = "2026-08-01T10:00:00Z";
  const strong = projectLearnerState(OBJ, [ev("e1", at, "strong")]);
  const understood = projectLearnerState(OBJ, [ev("e1", at, "understood")]);
  assert.equal(strong.status, understood.status);
  // Flattening them into one status the policy cannot un-flatten would throw away the distinction
  // between "recalled instantly after a week" and "got there in the end".
  assert.notEqual(strong.latestVerdict, understood.latestVerdict);
});

// ── recomputable from the log ───────────────────────────────────────────────
//
// 🔴 THE TESTS THAT ACTUALLY DISCRIMINATE. A single-pass projection test passes trivially. What
// makes "the evidence table is truth, the state is a projection" TRUE is that the same log gives
// the same state however it arrives and however many times a row appears — a database returns rows
// in whatever order it likes, and a replayed or retried write delivers one twice.

const LOG: LearnerEvidence[] = [
  ev("e1", "2026-08-01T10:00:00Z", "incorrect"),
  ev("e2", "2026-08-03T10:00:00Z", null),
  ev("e3", "2026-08-05T10:00:00Z", "understood"),
  ev("e4", "2026-08-07T10:00:00Z", "strong"),
];

test("🔴 the same evidence in any order gives the same state", () => {
  const expected = projectLearnerState(OBJ, LOG);
  const orderings = [
    [...LOG].reverse(),
    [LOG[2]!, LOG[0]!, LOG[3]!, LOG[1]!],
    [LOG[3]!, LOG[2]!, LOG[1]!, LOG[0]!],
    [LOG[1]!, LOG[3]!, LOG[0]!, LOG[2]!],
  ];
  for (const [i, ordering] of orderings.entries()) {
    assert.deepEqual(projectLearnerState(OBJ, ordering), expected, `ordering ${i}`);
  }
});

test("🔴 replaying a row twice does not change the state", () => {
  const expected = projectLearnerState(OBJ, LOG);
  const withDuplicates = [...LOG, LOG[1]!, LOG[3]!, LOG[3]!];
  assert.deepEqual(projectLearnerState(OBJ, withDuplicates), expected);
  assert.equal(projectLearnerState(OBJ, withDuplicates).evidenceCount, 4);
});

test("🔴 evidence sharing a timestamp still resolves the same way every time", () => {
  // The trap underneath the two tests above: sorting on time ALONE leaves ties broken by input
  // order, so a tied log would project differently depending on how the database returned it —
  // order-dependence that only appears once two events land in the same second.
  const tie = "2026-08-09T10:00:00Z";
  const tied = [ev("b", tie, "incorrect"), ev("a", tie, "strong")];
  const first = projectLearnerState(OBJ, tied);
  const second = projectLearnerState(OBJ, [...tied].reverse());
  assert.deepEqual(first, second);
  // And the tiebreak is the id, deterministically: "b" sorts last, so its verdict is the latest.
  assert.equal(first.status, "incorrect");
});

test("the latest event decides the status, and the history stays in the log", () => {
  const state = projectLearnerState(OBJ, LOG);
  // Started incorrect, revealed once, then demonstrated twice. Someone who has just corrected a
  // misconception is not still holding it.
  assert.equal(state.status, "correct");
  assert.equal(state.latestVerdict, "strong");
  assert.equal(state.evidenceCount, 4);
  assert.equal(state.demonstrationCount, 3);
  assert.equal(state.lastEvidenceAt, "2026-08-07T10:00:00Z");
});

test("a reveal after a success reports not_demonstrated, but the earlier verdict survives", () => {
  // The status is about the latest opportunity; `latestVerdict` still names the last thing actually
  // shown, so a policy can tell "they knew it and just blanked" from "they have never shown it".
  const state = projectLearnerState(OBJ, [...LOG, ev("e5", "2026-08-08T10:00:00Z", null)]);
  assert.equal(state.status, "not_demonstrated");
  assert.equal(state.latestVerdict, "strong");
  assert.equal(state.demonstrationCount, 3);
});

// ── rebuilding from scratch ─────────────────────────────────────────────────

test("🔴 discarding a projection and rebuilding it from the log gives the identical state", () => {
  // The owner's rule stated as a test: the evidence table is truth and the state is a cache. If
  // these two ever differed, the cache would be a second, disagreeing copy of the truth — and
  // nothing in the system compares them, so the disagreement would never surface.
  const live = projectLearnerState(OBJ, LOG);
  const rebuilt = projectLearnerState(OBJ, JSON.parse(JSON.stringify([...LOG].reverse())));
  assert.deepEqual(rebuilt, live);
});

test("projectAll keeps objectives apart and invents none", () => {
  const mixed = [
    ev("e1", "2026-08-01T10:00:00Z", "strong"),
    { ...ev("e2", "2026-08-02T10:00:00Z", "incorrect"), objectiveIdentityKey: OTHER },
  ];
  const all = projectAll(mixed);
  assert.equal(all.size, 2);
  assert.equal(all.get(OBJ)!.status, "correct");
  assert.equal(all.get(OTHER)!.status, "incorrect");
  // 🔴 An objective nobody has evidence for is ABSENT rather than fabricated as `unknown` here —
  // a caller must ask for it by key, and gets `unknown` from projectLearnerState.
  assert.equal(all.has("recall:v1:neverseen"), false);
  assert.equal(projectLearnerState("recall:v1:neverseen", mixed).status, "unknown");
});

test("provenance does not filter what a later canvas can see", () => {
  // 🔴 THE WHOLE POINT OF STEP 5. Evidence carries the canvas that produced it, but state is read
  // across every canvas — otherwise Nemesis accumulates sessions instead of a learner.
  const fromA = ev("e1", "2026-08-01T10:00:00Z", "strong", { canvasId: "canvas-A" });
  const state = projectLearnerState(OBJ, [fromA]);
  assert.equal(state.status, "correct");
  assert.equal(state.evidenceCount, 1);
});
