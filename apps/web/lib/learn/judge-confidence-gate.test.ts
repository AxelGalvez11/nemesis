import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CONFIDENCE_WHEN_UNSTATED, TRUSTED_ENOUGH_TO_UPDATE_STATE, verdictIsTrustworthy } from "./canvas-judge";
import { projectLearnerState, type LearnerEvidence } from "./learner-evidence";
import type { KnowledgeObject } from "./knowledge-types";
import { objectivesForKnowledge } from "./learning-objective";
import { chooseNextTeachingAction } from "./teaching-policy";

// An uncertain judgement is not a judgement.
//
// 🔴 THE MEASURED DEFECT. `projectLearnerState.status` was a pure function of the single most recent
// verdict, and `chooseNextTeachingAction` switches on it — so an unstable reading passed straight
// through to the next teaching action with nothing aware it was unstable. The SAME answer was read
// `partial 0.30` and `incorrect 0.90` six minutes apart, and those are different statuses, so they
// are different next actions for one learner who did one thing.
//
// 🔴 CONFIDENCE IS A FACT ABOUT THE JUDGEMENT. Its job is to decide whether a verdict counts at all,
// never to weight how well the learner did — that reading would make someone who explains their
// reasoning accumulate systematically WEAKER evidence than someone typing bare tokens.
//
// 🔴 AND THE GATE IS AT READ TIME, WHICH IS THE POINT AND NOT AN IMPLEMENTATION DETAIL. §5: no
// threshold about a signal may be computed at write time. Nothing new is stored; `confidence` was
// always on the row. Moving the number reinterprets every row ever written, and a `trusted` column
// would instead have frozen today's number into history where no migration could recover it.

const KNOWLEDGE: KnowledgeObject = {
  id: "k1",
  identityKey: "association:v2:8589ff53b101b420",
  pair: { id: "t1:r1", left: "losartan", leftRole: "generic", right: "Cozaar", rightRole: "brand" },
  relationKind: "brand|generic",
  statement: "losartan — Cozaar",
  type: "association",
  unanchoredProvenance: [],
};
const [OBJECTIVE] = objectivesForKnowledge(KNOWLEDGE);
const KEY = OBJECTIVE!.identityKey;
const NOW = new Date("2026-08-13T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

/** Below the gate by a clear margin, and below it however the constant is later retuned downward. */
const UNSURE = TRUSTED_ENOUGH_TO_UPDATE_STATE / 2;

function ev(
  id: string,
  occurredAt: string,
  verdict: LearnerEvidence["verdict"],
  confidence?: number,
): LearnerEvidence {
  return {
    demonstrationObtained: verdict !== null,
    id,
    objectiveIdentityKey: KEY,
    occurredAt,
    verdict,
    ...(confidence === undefined ? {} : { confidence }),
  };
}
const state = (evidence: LearnerEvidence[]) => projectLearnerState(KEY, evidence);

// ── the ceiling, which is the one thing about the constant that is not free ──

test("🔴 the gate sits strictly below the confidence an UNSTATED field becomes", () => {
  // `canvas-judge` turns a missing or unusable `confidence` into 0.5 deliberately, because 0 and 1
  // are both assertions we have no basis for. A gate at or above that would silently reclassify
  // every evaluation that merely omitted the field as "this learner demonstrated nothing" — turning
  // a formatting habit of the model into a claim about a person, for everyone at once.
  //
  // 🔴 ABSENCE OF A CONFIDENCE SIGNAL IS NOT EVIDENCE OF UNCERTAINTY.
  assert.ok(
    TRUSTED_ENOUGH_TO_UPDATE_STATE < CONFIDENCE_WHEN_UNSTATED,
    "a gate at or above the unstated default reads silence as failure",
  );
  assert.equal(verdictIsTrustworthy({ confidence: CONFIDENCE_WHEN_UNSTATED }), true);
});

test("the boundary is inclusive, and stated rather than left to be discovered", () => {
  assert.equal(verdictIsTrustworthy({ confidence: TRUSTED_ENOUGH_TO_UPDATE_STATE }), true);
  assert.equal(verdictIsTrustworthy({ confidence: TRUSTED_ENOUGH_TO_UPDATE_STATE - 0.01 }), false);
});

// ── what an uncertain verdict does, and does not, do ────────────────────────

test("🔴 an uncertain verdict establishes NOTHING — the status stays unknown", () => {
  // Not `not_demonstrated`, and the difference decides the teaching: `not_demonstrated` states the
  // answer, and stating an answer to someone whose response we merely could not read teaches them
  // something they may already know. `unknown` asks.
  const s = state([ev("e1", ago(60_000), "partial", UNSURE)]);
  assert.equal(s.status, "unknown");
  assert.equal(s.latestVerdict, null, "a verdict we will not stand behind is not the learner's latest verdict");
  assert.equal(s.demonstrationCount, 0, "nothing was demonstrated that we are willing to claim");
});

test("🔴 an uncertain verdict does not overwrite what the learner already established", () => {
  // The expensive case. Someone demonstrated this, then answered again and the judge could not tell.
  // Reading the uncertain verdict as state would take away a demonstration they actually made.
  const s = state([ev("e1", ago(3 * 3600_000), "understood"), ev("e2", ago(60_000), "incorrect", UNSURE)]);
  assert.equal(s.status, "correct", "their real demonstration still stands");
  assert.equal(s.latestVerdict, "understood");
});

test("🔴 and it does not quietly ABSOLVE them either — the gate is symmetric", () => {
  // The mirror image, and the reason the gate is not allowed to apply only downward. If an uncertain
  // reading could clear an established `incorrect`, the gate would be believing the judge when it
  // flatters and doubting it when it does not.
  const s = state([ev("e1", ago(3 * 3600_000), "incorrect"), ev("e2", ago(60_000), "understood", UNSURE)]);
  assert.equal(s.status, "incorrect", "an uncertain pass cannot retire a known gap");
});

test("🔴 the unstable pair Integration measured no longer produces two different states", () => {
  // The same answer read `partial 0.30` and `incorrect 0.90` six minutes apart. The uncertain one is
  // now skipped, so the two readings no longer make contradictory claims about one person.
  const prior = ev("e0", ago(5 * 3600_000), "understood");
  const readOneWay = state([prior, ev("e1", ago(60_000), "partial", 0.3)]);
  assert.equal(readOneWay.status, "correct", "the 0.30 reading concludes nothing");
  const readTheOther = state([prior, ev("e1", ago(60_000), "incorrect", 0.9)]);
  assert.equal(readTheOther.status, "incorrect", "the 0.90 reading is a real verdict and still counts");
});

// ── 🔴 what must NOT be gated ───────────────────────────────────────────────

test("🔴 an admission of not knowing carries no confidence and is trusted completely", () => {
  // D4. Someone who said "I don't know" told us something real, and it was never a judge's reading.
  // Treating absent confidence as low confidence would silently delete that whole state.
  const s = state([ev("e1", ago(60_000), null)]);
  assert.equal(s.status, "not_demonstrated");
  assert.equal(s.evidenceCount, 1);
});

test("🔴 every row written before the judge reported confidence still means what it meant", () => {
  const s = state([ev("e1", ago(30 * 24 * 3600_000), "understood"), ev("e2", ago(3600_000), "incorrect")]);
  assert.equal(s.status, "incorrect", "legacy rows are not retroactively distrusted");
  assert.equal(s.demonstrationCount, 2);
});

test("🔴 a confident verdict is untouched, at either end", () => {
  assert.equal(state([ev("e1", ago(60_000), "understood", 0.95)]).status, "correct");
  assert.equal(state([ev("e1", ago(60_000), "incorrect", 0.9)]).status, "incorrect");
  // The explained answer from the measured set — MORE informative and read less confidently. It must
  // remain a demonstration, or the gate ships the very inversion it was built to remove.
  assert.equal(state([ev("e1", ago(60_000), "understood", 0.5)]).status, "correct");
});

// ── the observation survives; only the conclusion is withheld ───────────────

test("🔴 the opportunity is still recorded — the row is written, and counted", () => {
  // "Writes its observation and updates no learner state." An uncertain judgement is NOT an outage:
  // the learner answered, we saw it and we timed it. Only the conclusion is missing.
  const s = state([ev("e1", ago(60_000), "partial", UNSURE)]);
  assert.equal(s.evidenceCount, 1, "an opportunity happened and the log says so");
  assert.equal(s.lastEvidenceAt, ago(60_000), "and the churn guard must see it, or the same question returns at once");
});

// ── 🔴 where it lands, which is what `main` made the condition of shipping ──

test("🔴 an uncertain verdict lands on ASK AGAIN, never on a correction", () => {
  // The whole point, and the reason this waited on D6. An uncertain reading of a CORRECT answer must
  // not send the learner into a correction — that teaches them something they may already know, and
  // before D6 it was a screen with no answer box that they could never leave.
  const action = chooseNextTeachingAction({
    knowledgeObject: KNOWLEDGE,
    learnerState: state([ev("e1", ago(60_000), "understood", UNSURE)]),
    now: NOW,
    objective: OBJECTIVE!,
    recentEvidence: [],
  });
  assert.equal(action.type, "retrieve", "asking is the only honest move when we could not read the answer");
});

test("a confident wrong answer still gets its correction — the gate did not disarm teaching", () => {
  const action = chooseNextTeachingAction({
    knowledgeObject: KNOWLEDGE,
    learnerState: state([ev("e1", ago(60_000), "incorrect", 0.9)]),
    now: NOW,
    objective: OBJECTIVE!,
    recentEvidence: [],
  });
  assert.equal(action.type, "show_correction");
});

// ── 🔴 no threshold was baked into a row ────────────────────────────────────

test("🔴 nothing about trust is written to the database — the decision stays revisable", () => {
  // §5: store what was measured, decide what it means where the decision can be changed. A
  // `trusted` column would mean every row written under today's number silently means something
  // different from every row written after someone retunes it, and no migration could recover what
  // was actually observed.
  const store = readFileSync(new URL("./learner-store.ts", import.meta.url), "utf8");
  for (const name of ["trusted", "trustworthy", "gated", "believable"]) {
    assert.equal(store.includes(`${name}:`), false, `"${name}" must not become a stored column`);
  }
  const evidence = readFileSync(new URL("./learner-evidence.ts", import.meta.url), "utf8");
  assert.match(
    evidence,
    /TRUSTED_ENOUGH_TO_UPDATE_STATE/,
    "the threshold is consulted where state is READ, which is what makes it revisable",
  );
});
