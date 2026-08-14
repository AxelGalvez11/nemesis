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
import {
  modifierCeilingHoldsBands,
  mostValuable,
  value,
  type SelectionReason,
} from "./next-action-value";
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

// ── the band guarantee, which was false before it was checked ───────────────

test("🔴🔴 no combination of modifiers can lift an action out of its band", () => {
  // 🔴 THIS WAS ALREADY BROKEN, UNDER A COMMENT PROMISING IT WAS CHECKED. The header read "the gaps
  // are wide enough that the modifiers below cannot cross them, and that is checked by a test".
  // There was no test, and the arithmetic did not hold: failures added up to 1,000 and `just-worked`
  // subtracted 1,500, a 2,500 swing across a smallest band gap of 2,000.
  //
  // Derived from the bands rather than restated, so moving a band re-runs the check.
  const { smallestGap, worstSwing } = modifierCeilingHoldsBands();
  assert.ok(
    worstSwing < smallestGap,
    `modifiers can swing ${worstSwing} across a smallest band gap of ${smallestGap}`,
  );
});

test("🔴 the concrete inversion that used to exist: a due ✓ never outranks a provisional one", () => {
  // The case the arithmetic above produced. Failing five times and finally getting it right leaves
  // an objective `correct` WITH five unresolved attempts in its history — the maximum uprank — while
  // a recognition-only ✓ that was just worked takes the maximum downrank. Scored directly, `due`
  // beat `provisional`, inverting the one ordering §31.2 exists to hold.
  const dueAfterAStruggle = at({
    evidence: ["a", "b", "c", "d", "e"].map(miss),
    interveningActs: 4,
    state: state({
      demonstratedAt: "independent",
      evidenceCount: 6,
      lastEvidenceAt: "2026-08-14T12:00:00.000Z",
      status: "correct",
    }),
  });
  const provisionalJustWorked = at({
    interveningActs: 0,
    state: state({
      demonstratedAt: "recognition",
      evidenceCount: 1,
      lastEvidenceAt: "2026-08-14T12:00:00.000Z",
      status: "correct",
    }),
  });
  assert.ok(score(provisionalJustWorked) > score(dueAfterAStruggle));
});

// ── prerequisites: I11's edge, walked ───────────────────────────────────────

test("🔴🔴 the step underneath outranks an equally-untouched step that unlocks nothing", () => {
  // Owner's definition of done: Nemesis "identifies missing prerequisites". The learner missed the
  // downstream edge, so the thing it starts from is now the useful move — not the same question
  // again, and not an unrelated question that happens to sort first.
  const underneath = at({ blockedDependents: 1 });
  const unrelated = at();
  assert.ok(score(underneath) > score(unrelated));
  assert.ok(reasons(underneath).includes("unlocks-other-work"));
  assert.equal(reasons(unrelated).includes("unlocks-other-work"), false);
});

test("🔴 more work stuck behind it is worth more, up to a bound", () => {
  const one = score(at({ blockedDependents: 1 }));
  const three = score(at({ blockedDependents: 3 }));
  const ten = score(at({ blockedDependents: 10 }));
  assert.ok(three > one, "a hub term is the more useful move");
  assert.equal(ten, three, "…but not unboundedly — ten stuck dependents is not ten times a hub");
});

test("🔴🔴 a prerequisite the learner has ALREADY DEMONSTRATED is not promoted", () => {
  // 🔴 THE CALIBRATION THAT KEEPS THIS FROM BECOMING A CURRICULUM. Every upstream term in a document
  // has dependents; promoting on that alone would pin the foundations of every chain permanently
  // above everything built on them. What earns the promotion is that the learner is STUCK on
  // something downstream AND has not settled this. Sending someone who missed step two back to a
  // step one they have proved twice reads as losing the thread, exactly like re-asking does.
  const proven = state({
    demonstratedAt: "independent",
    evidenceCount: 2,
    lastEvidenceAt: "2026-08-14T12:00:00.000Z",
    status: "correct",
  });
  const promoted = at({ blockedDependents: 3, state: proven });
  const plain = at({ state: proven });
  assert.equal(score(promoted), score(plain));
  assert.equal(reasons(promoted).includes("unlocks-other-work"), false);
});

test("🔴 a prerequisite still never outranks an answer the learner is owed", () => {
  // The band rule, against the newest modifier. Someone standing in front of a correction must not
  // have it pulled away because three other things are stuck behind a different objective.
  const owedAnswer = at({ action: CORRECTION, state: state({ status: "incorrect" }) });
  const hub = at({
    blockedDependents: 3,
    evidence: ["a", "b", "c", "d", "e"].map(miss),
    interveningActs: 3,
    state: state({ evidenceCount: 5, lastEvidenceAt: "2026-08-14T12:00:00.000Z", status: "incorrect" }),
  });
  assert.ok(score(owedAnswer) > score(hub));
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
