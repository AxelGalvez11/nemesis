// What the selector can now discriminate that "the first owed objective" could not.
//
// 🔴 THE OLD RULE'S CEILING WAS NOT ITS TIERS, IT WAS WHAT HAPPENED INSIDE ONE. Between an objective
// failed three times and one failed once it had nothing to say, and fell back to whichever identity
// key sorted first — a decision nobody made, that a learner experiences as the system losing the
// thread. These tests are about the inside of a band.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { KnowledgeObject } from "./knowledge-types";
import type { LearnerEvidence, LearnerObjectiveState } from "./learner-evidence";
import { mostValuable, value, type SelectionReason } from "./next-action-value";
import type { TeachingAction } from "./teaching-policy";

const KNOWLEDGE: KnowledgeObject = {
  id: "k1",
  identityKey: "association:v2:8589ff53b101b420",
  pair: { id: "t1:r1", left: "losartan", leftRole: "generic", right: "Cozaar", rightRole: "brand" },
  relationKind: "brand|generic",
  statement: "losartan — Cozaar",
  type: "association",
  unanchoredProvenance: [],
};

const RETRIEVE: TeachingAction = { because: "…", objectiveId: "o1", type: "retrieve" };
const CORRECTION: TeachingAction = {
  because: "…",
  exposition: { mode: "deliberate" },
  objectiveId: "o1",
  type: "show_correction",
};

function state(over: Partial<LearnerObjectiveState> = {}): LearnerObjectiveState {
  return {
    demonstratedAt: null,
    demonstrationCount: 0,
    evidenceCount: 0,
    lastEvidenceAt: null,
    latestVerdict: null,
    objectiveIdentityKey: "o1",
    status: "unknown",
    ...over,
  };
}

function miss(id: string): LearnerEvidence {
  return {
    demonstrationObtained: true,
    id,
    objectiveEvidence: "contradicted",
    objectiveIdentityKey: "o1",
    occurredAt: "2026-08-14T12:00:00.000Z",
    verdict: "incorrect",
  };
}

const score = (input: Parameters<typeof value>[0]) => value(input).score;
const reasons = (input: Parameters<typeof value>[0]): SelectionReason[] => value(input).reasons;

const at = (over: Partial<Parameters<typeof value>[0]> = {}) => ({
  action: RETRIEVE,
  evidence: [] as LearnerEvidence[],
  interveningActs: 1,
  knowledge: KNOWLEDGE,
  state: state(),
  ...over,
});

// ── the discrimination the old rule could not make ──────────────────────────

test("🔴🔴 an objective missed repeatedly outranks one missed once", () => {
  // The exact case the old selector resolved by hash order.
  const once = at({
    evidence: [miss("a")],
    state: state({ evidenceCount: 1, lastEvidenceAt: "2026-08-14T12:00:00.000Z", status: "incorrect" }),
  });
  const thrice = at({
    evidence: [miss("a"), miss("b"), miss("c")],
    state: state({ evidenceCount: 3, lastEvidenceAt: "2026-08-14T12:00:00.000Z", status: "incorrect" }),
  });
  assert.ok(score(thrice) > score(once), "the one they keep missing is worth more");
  assert.ok(reasons(thrice).includes("repeatedly-unresolved"));
  assert.equal(reasons(once).includes("repeatedly-unresolved"), false, "one miss is not a pattern");
});

test("🔴 and it outranks something never asked, which is what 'returns to failed material' means", () => {
  const untouched = at();
  const missedTwice = at({
    evidence: [miss("a"), miss("b")],
    state: state({ evidenceCount: 2, lastEvidenceAt: "2026-08-14T12:00:00.000Z", status: "incorrect" }),
  });
  assert.ok(score(missedTwice) > score(untouched));
});

test("🔴 a SINGLE miss ties with something never asked — the old accepted behaviour, unchanged", () => {
  // 🔴 THE CALIBRATION FOR THE TEST ABOVE. The previous selector held "never asked" and "asked and
  // missed" in ONE tier above review, and splitting them is what broke a pinned contract test the
  // first time. The repeat count is what promotes; the status alone must not.
  const untouched = at();
  const missedOnce = at({
    evidence: [miss("a")],
    state: state({ evidenceCount: 1, lastEvidenceAt: "2026-08-14T12:00:00.000Z", status: "incorrect" }),
  });
  assert.equal(score(missedOnce), score(untouched));
});

// ── the bands, and that modifiers cannot cross them ─────────────────────────

test("🔴🔴 no amount of repeated failure outranks an answer the learner is owed", () => {
  // The rule the bands exist to hold. Someone standing in front of a correction must not have it
  // pulled out from under them because a different objective has been missed five times.
  const owedAnswer = at({ action: CORRECTION, state: state({ status: "incorrect" }) });
  const missedFiveTimes = at({
    evidence: ["a", "b", "c", "d", "e", "f", "g"].map(miss),
    state: state({ evidenceCount: 7, lastEvidenceAt: "2026-08-14T12:00:00.000Z", status: "incorrect" }),
  });
  assert.ok(score(owedAnswer) > score(missedFiveTimes), "an exposition outranks any retrieval");
  assert.ok(reasons(owedAnswer).includes("owed-an-answer"));
});

test("🔴 review is the least urgent thing, and a recognised ✓ outranks a produced one", () => {
  const produced = at({
    state: state({ demonstratedAt: "independent", lastEvidenceAt: "2026-08-14T12:00:00.000Z", status: "correct" }),
  });
  const recognisedOnly = at({
    state: state({ demonstratedAt: "recognition", lastEvidenceAt: "2026-08-14T12:00:00.000Z", status: "correct" }),
  });
  const unknown = at();
  assert.ok(score(unknown) > score(recognisedOnly), "an unknown outranks a provisional ✓");
  assert.ok(score(recognisedOnly) > score(produced), "a false ✓ is invisible and compounds — probe it first");
  assert.ok(reasons(recognisedOnly).includes("recognised-not-produced"));
  assert.ok(reasons(produced).includes("due-again"));
});

// ── working memory ──────────────────────────────────────────────────────────

test("🔴 something just worked is ranked DOWN, never removed", () => {
  // 🔴 A PENALTY RATHER THAN A FILTER, AND THE DIFFERENCE IS A BLANK PAGE. The old selector dropped
  // deferred candidates entirely, so a session where everything had just been touched had nothing
  // left to offer. Ranked down, the least-recently-worked thing still wins.
  const justWorked = at({
    interveningActs: 0,
    state: state({ evidenceCount: 1, lastEvidenceAt: "2026-08-14T12:00:00.000Z", status: "incorrect" }),
  });
  const displaced = at({
    interveningActs: 2,
    state: state({ evidenceCount: 1, lastEvidenceAt: "2026-08-14T12:00:00.000Z", status: "incorrect" }),
  });
  assert.ok(score(displaced) > score(justWorked));
  assert.ok(reasons(justWorked).includes("just-worked"));
  assert.ok(reasons(displaced).includes("displaced-since"));
  assert.ok(score(justWorked) > 0, "ranked down, not excluded");
});

test("🔴 an objective nobody has ever touched is never penalised as 'just worked'", () => {
  // It has no last-evidence time, so there is nothing recent about it. Penalising it would suppress
  // exactly the cheapest information available at the start of a session.
  assert.equal(reasons(at({ interveningActs: 0 })).includes("just-worked"), false);
});

// ── the trace ───────────────────────────────────────────────────────────────

test("🔴 every decision carries the terms that produced it", () => {
  // The selector's output has to be answerable in words, or "why did Nemesis ask me this?" resolves
  // to a float nobody can argue with.
  const decided = value(at({
    evidence: [miss("a"), miss("b")],
    interveningActs: 3,
    state: state({ evidenceCount: 2, lastEvidenceAt: "2026-08-14T12:00:00.000Z", status: "incorrect" }),
  }));
  assert.deepEqual(decided.reasons, ["fell-short", "repeatedly-unresolved", "displaced-since"]);
});

test("mostValuable keeps the caller's order on a tie, so the same state asks the same question", () => {
  const items = [{ n: 1 }, { n: 2 }, { n: 3 }];
  const flat = () => ({ reasons: [] as SelectionReason[], score: 5 });
  assert.deepEqual(mostValuable(items, flat), { n: 1 });
  assert.equal(mostValuable([], flat), undefined);
  assert.deepEqual(mostValuable(items, (i) => ({ reasons: [], score: i.n })), { n: 3 });
});
