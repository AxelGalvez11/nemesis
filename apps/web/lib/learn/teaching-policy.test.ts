import assert from "node:assert/strict";
import { test } from "node:test";

import type { KnowledgeObject } from "./knowledge-types";
import { projectLearnerState, type LearnerEvidence } from "./learner-evidence";
import { objectivesForKnowledge } from "./learning-objective";
import { RETRIEVAL_ELIGIBLE_AFTER_MS } from "./retrieval-eligibility";
import { ACT_AGAIN_AFTER_MS, chooseNextTeachingAction, type TeachingAction } from "./teaching-policy";

// The real objects, not hand-written ids: a knowledge object through the real minting function, so
// a change to identity shows up here rather than being papered over by a fixture.
const KNOWLEDGE: KnowledgeObject = {
  id: "k1",
  identityKey: "association:v2:8589ff53b101b420",
  pair: { id: "t1:r1", left: "losartan", leftRole: "generic", right: "Cozaar", rightRole: "brand" },
  relationKind: "brand|generic",
  statement: "losartan — Cozaar",
  type: "association",
  unanchoredProvenance: [],
};
const [GENERIC_TO_BRAND, BRAND_TO_GENERIC] = objectivesForKnowledge(KNOWLEDGE);
const NOW = new Date("2026-08-11T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

/**
 * 🔴 A FRACTION OF THE TEMPO, NEVER A LITERAL. A fixture that writes "ten minutes" to mean "recent"
 * is asserting a relationship to `RETRIEVAL_ELIGIBLE_AFTER_MS` without saying so, and it stops being
 * true the moment that constant moves. That is not hypothetical: these ages were literals, the owner
 * ruled the tempo to exactly the literal, and tests that meant "still suppressed" landed on the
 * inclusive boundary and started meaning "due".
 */
const RECENT_MS = RETRIEVAL_ELIGIBLE_AFTER_MS / 2;

function ev(id: string, occurredAt: string, verdict: LearnerEvidence["verdict"], extra: Partial<LearnerEvidence> = {}): LearnerEvidence {
  return {
    demonstrationObtained: verdict !== null,
    id,
    objectiveIdentityKey: GENERIC_TO_BRAND!.identityKey,
    occurredAt,
    verdict,
    ...extra,
  };
}

function decide(
  evidence: LearnerEvidence[],
  now: Date = NOW,
  correctionAlreadyShown = false,
): TeachingAction {
  return chooseNextTeachingAction({
    correctionAlreadyShown,
    knowledgeObject: KNOWLEDGE,
    learnerState: projectLearnerState(GENERIC_TO_BRAND!.identityKey, evidence),
    now,
    objective: GENERIC_TO_BRAND!,
    recentEvidence: evidence,
  });
}

/** Comfortably inside `ACT_AGAIN_AFTER_MS` — "they have just done this". */
const JUST_NOW_MS = 60_000;

// ── unknown means Nemesis lacks evidence, not that the learner lacks knowledge ──

test("🔴 an objective with no evidence is ASKED, never lectured", () => {
  // Opening with "you haven't learned this yet, first read this" asserts something nobody has
  // observed, and spends the learner's attention on material they may already hold. Asking costs
  // seconds and settles it. This is "prefer a task that reveals the learner over a question about
  // them", executed.
  const action = decide([]);
  assert.equal(action.type, "retrieve");
  assert.notEqual(action.type, "show_correction");
  assert.match(action.because, /no evidence/i);
});

test("the retrieval names the objective it is evidence for", () => {
  const action = decide([]);
  assert.equal(action.type === "retrieve" ? action.objectiveId : null, GENERIC_TO_BRAND!.identityKey);
});

// ── correct advances; no Test stage re-verifies what just worked ────────────

test("🔴 a demonstrated objective advances rather than being re-tested", () => {
  // The fixed sequence would ask again because the session template says there are more Recall
  // steps left. Nothing here requires a separate stage to re-verify what was just shown to work.
  const action = decide([ev("e1", ago(RECENT_MS), "understood")]);
  assert.equal(action.type, "advance");
});

test("🔴 a demonstration from long ago becomes ASKABLE again — without inventing a state", () => {
  // 🔴 THIS TEST USED TO ASSERT `advance`, AND THAT ASSERTION WAS THE DEFECT WRITTEN DOWN. Ninety
  // days after a correct answer the policy still refused to ask, and because `decideNext` never
  // selects an `advance`, the objective was not deprioritised — it was excluded, permanently.
  //
  // Its real concern survives untouched and is now asserted directly: the policy invents NO seventh
  // learner state. `projectLearnerState` still says `correct`, still takes no clock, and is
  // unchanged by any of this. Status is a fact about what the learner did; eligibility is a policy
  // over that fact. Keeping them separate is the whole design — a projection that decayed its own
  // status would be `response → 1-4 → that IS learner state` by another road.
  const evidence = [ev("e1", ago(90 * 24 * 3600_000), "strong")];

  const state = projectLearnerState(GENERIC_TO_BRAND!.identityKey, evidence);
  assert.equal(state.status, "correct", "the learner DID demonstrate it; time does not make that untrue");
  assert.equal(state.demonstrationCount, 1);

  assert.equal(decide(evidence).type, "retrieve", "and after ninety days it may be asked again");
});

// ── a reveal is not a wrong answer ──────────────────────────────────────────

test("🔴 giving up gets the answer shown, never a correction of something they did not say", () => {
  // 🔴 THE TIMING MOVED INSIDE THE WINDOW AND THE INTENT DID NOT. This asserted the wording of a
  // correction while dating the evidence two hours back — where the answer is no longer what is
  // owed. The thing being tested is that a learner who gave up is never told they were wrong, and
  // that is about the moment the correction is shown, so the moment is now the one the test names.
  const action = decide([ev("e1", ago(JUST_NOW_MS), null)]);
  assert.equal(action.type, "show_correction");
  assert.match(action.because, /no usable demonstration/i);
  // They did not produce an incorrect answer, so nothing may read as "incorrect".
  assert.equal(/wrong|incorrect|contradict/i.test(action.because), false);
});

test("a wrong answer is corrected, and says so", () => {
  const action = decide([ev("e1", ago(JUST_NOW_MS), "incorrect")]);
  assert.equal(action.type, "show_correction");
  assert.match(action.because, /contradicted/i);
});

// ── not the identical question a millisecond later ──────────────────────────

test("🔴 the same correction is not shown twice in a row", () => {
  // §9: do not necessarily ask the identical question one millisecond after correcting. Showing the
  // same sentence twice is a loop that looks like teaching and is not.
  //
  // 🔴 THE PRECONDITION IS NOW STATED RATHER THAN STOOD IN FOR. This used to reach `defer` through
  // `state.evidenceCount > 1` — "they have been assessed more than once" used as a proxy for "they
  // have been shown the answer". The two are different facts, and the proxy is why a learner who got
  // something wrong ONCE never deferred at all. "Twice in a row" now requires that there was a first
  // time, which is what the sentence says.
  const evidence = [ev("e1", ago(3 * 3600_000), "incorrect"), ev("e2", ago(JUST_NOW_MS), "incorrect")];
  const action = decide(evidence, NOW, true);
  assert.equal(action.type, "defer");
  assert.match(action.because, /intervening work/i);
});

test("🔴 a second wrong answer gets its own correction — being wrong twice does not withhold the answer", () => {
  // The other side of the proxy above, and it was a real defect on its own. `evidenceCount > 1`
  // deferred whenever a learner had been assessed twice, so answering wrongly a SECOND time —
  // a fresh attempt, a fresh mistake — was met with silence rather than the answer.
  const evidence = [ev("e1", ago(3 * 3600_000), "incorrect"), ev("e2", ago(JUST_NOW_MS), "incorrect")];
  assert.equal(decide(evidence, NOW, false).type, "show_correction");
});

test("🔴 after the correction has had its moment, the objective is ASKED again — not corrected for ever", () => {
  // 🔴 THIS TEST USED TO ASSERT THE DEFECT, UNDER THE NAME "corrected again rather than held for
  // ever". It was written to stop an over-correction — an objective held indefinitely — and pinned
  // the opposite failure instead: `show_correction` at every elapsed time out to a year, on a screen
  // with no answer box, so status could never leave `incorrect` and the learner could never answer
  // their way out. A passing test named the behaviour it was preventing.
  const evidence = [
    ev("e1", ago(5 * 3600_000), "incorrect"),
    ev("e2", ago(ACT_AGAIN_AFTER_MS + 60_000), "incorrect"),
  ];
  const action = decide(evidence);
  assert.equal(action.type, "retrieve");
  assert.match(action.because, /asking is what is owed/i);
});

// ── §33, executed: scaffolding is a decision made from THIS evidence, not a fallback ────────────

test("a single wrong answer asks again unaided — one miss is not a pattern", () => {
  const evidence = [ev("e1", ago(ACT_AGAIN_AFTER_MS + 60_000), "incorrect")];
  const action = decide(evidence);
  assert.equal(action.type, "retrieve");
  assert.equal((action as { rung?: string }).rung, "independent");
  assert.doesNotMatch(action.because, /narrows the scope/i);
});

test("🔴 two straight misses narrows the next ask, and says so in `because`", () => {
  // The exact evidence shape the test above this one already builds — reused rather than
  // reinvented, and now read for what it means about SCAFFOLDING rather than only about timing.
  const evidence = [
    ev("e1", ago(5 * 3600_000), "incorrect"),
    ev("e2", ago(ACT_AGAIN_AFTER_MS + 60_000), "incorrect"),
  ];
  const action = decide(evidence);
  assert.equal(action.type, "retrieve");
  assert.equal((action as { rung?: string }).rung, "narrowed");
  assert.match(action.because, /2 unaided attempts.*narrows the scope/i);
});

test("🔴 a demonstrated recall in between clears the streak — scaffolding reads THIS run, not the whole history", () => {
  const evidence = [
    ev("e1", ago(10 * 3600_000), "incorrect"),
    ev("e2", ago(8 * 3600_000), "incorrect"),
    ev("e3", ago(6 * 3600_000), "understood"),
    ev("e4", ago(ACT_AGAIN_AFTER_MS + 60_000), "incorrect"),
  ];
  const action = decide(evidence);
  assert.equal(action.type, "retrieve");
  assert.equal((action as { rung?: string }).rung, "independent", "the understood row between the misses must reset the run");
});

test("the provisional-recognition probe always asks unaided, even after repeated misses elsewhere", () => {
  // §31.2's production probe exists specifically to test whether recognition-level success
  // generalises. Scaffolding it down would make the probe ask the same kind of question it is
  // meant to look past, and the result would prove nothing about production.
  const priorMisses = [
    ev("e1", ago(20 * 3600_000), "incorrect"),
    ev("e2", ago(15 * 3600_000), "incorrect"),
    ev("e3", ago(10 * 3600_000), "understood", { scaffoldRung: "recognition" }),
  ];
  const action = decide(priorMisses);
  assert.equal(action.type, "retrieve");
  assert.equal((action as { rung?: string }).rung, "independent");
});

test("🔴 the way back is open however long it has been, and from all three states", () => {
  // Integration measured the closed loop across every elapsed time and all three routes in. This is
  // that table, inverted: the same grid must now reach a retrieval everywhere.
  for (const elapsed of [2 * 3600_000, 24 * 3600_000, 30 * 24 * 3600_000, 365 * 24 * 3600_000]) {
    for (const verdict of [null, "incorrect", "partial"] as const) {
      const action = decide([ev("e1", ago(elapsed), verdict)]);
      assert.equal(action.type, "retrieve", `${verdict ?? "no attempt"} after ${elapsed}ms must be askable again`);
    }
  }
});

test("the very first wrong answer is corrected immediately, not deferred", () => {
  // Deferring on the first mistake would leave a learner staring at a wrong answer with no reply.
  assert.equal(decide([ev("e1", ago(1_000), "incorrect")]).type, "show_correction");
});

// ── a competing model changes the pedagogy, not just the wording ────────────

test("🔴 a misconception contrasts the pair instead of saying 'wrong, try again'", () => {
  // The learner is not failing to remember — they are remembering something else, so another plain
  // retrieval returns the same wrong answer. This is the first place the KIND of evidence changes
  // what happens, which is the point of typed knowledge at all.
  const action = decide([ev("e1", ago(2 * 3600_000), "misconception", { misconceptions: ["valsartan is sold as Diovan, not Cozaar"] })]);
  assert.equal(action.type, "contrast");
  assert.deepEqual(action.type === "contrast" ? action.competingWith : [], ["valsartan is sold as Diovan, not Cozaar"]);
});

test("one wrong competing answer is enough to act on — two are not required", () => {
  // §11: the learner model stores events; the policy decides how hard to respond. Waiting for a
  // second identical mistake before doing anything different would discard the first one.
  const action = decide([ev("e1", ago(30_000), "misconception", { misconceptions: ["Diovan is valsartan"] })]);
  assert.equal(action.type, "contrast");
});

test("competing answers are deduplicated across repeats", () => {
  const action = decide([
    ev("e1", ago(3 * 3600_000), "misconception", { misconceptions: ["Diovan is valsartan"] }),
    ev("e2", ago(2 * 3600_000), "misconception", { misconceptions: ["Diovan is valsartan"] }),
  ]);
  assert.deepEqual(action.type === "contrast" ? action.competingWith : null, ["Diovan is valsartan"]);
});

// ── one decision, no sequence ───────────────────────────────────────────────

test("🔴 the policy has no memory: the same state always gives the same action", () => {
  // If calling it repeatedly walked through teach → recall → test, that would be the six-stage
  // machine hiding in a new file. Nothing accumulates inside; the loop is outside.
  const evidence = [ev("e1", ago(4 * 3600_000), "incorrect")];
  const first = decide(evidence);
  for (let i = 0; i < 5; i += 1) assert.deepEqual(decide(evidence), first);
});

test("the action depends only on the state, not on the order evidence arrives in", () => {
  const evidence = [
    ev("e1", ago(9 * 3600_000), null),
    ev("e2", ago(6 * 3600_000), "incorrect"),
    ev("e3", ago(3 * 3600_000), "understood"),
  ];
  assert.deepEqual(decide([...evidence].reverse()), decide(evidence));
});

// ── directionality: one fact, two independent capabilities ──────────────────

test("🔴 demonstrating one direction leaves the other UNKNOWN", () => {
  // The strongest acceptance case for the whole architecture: a global learner model that collapsed
  // a fact into one vague "known" would answer `advance` for both.
  // 🔴 THE GAP IS DELIBERATELY INSIDE THE SUPPRESSION WINDOW. At two hours both directions would now
  // answer `retrieve` — the demonstrated one because its review came due, the other because it was
  // never asked — and this test would pass while having lost the very thing it exists to detect. A
  // collapsed "knows losartan/Cozaar" model must still be distinguishable here, so the demonstration
  // is recent enough that the two directions give DIFFERENT answers.
  //
  // 🔴 WHICH IS EXACTLY WHY THE AGE IS DERIVED. Written as a literal ten minutes, this test went red
  // the day the owner ruled ten minutes — the demonstrated direction became due, both answered
  // `retrieve`, and the strongest acceptance case in the file lost its discriminating power to a
  // number chosen elsewhere. A fixture that means "inside the window" must be defined by the window.
  const evidence = [ev("e1", ago(RECENT_MS), "understood")];
  const forward = decide(evidence);
  const reverse = chooseNextTeachingAction({
    knowledgeObject: KNOWLEDGE,
    learnerState: projectLearnerState(BRAND_TO_GENERIC!.identityKey, evidence),
    now: NOW,
    objective: BRAND_TO_GENERIC!,
    recentEvidence: evidence,
  });
  assert.equal(forward.type, "advance", "generic → brand was demonstrated");
  assert.equal(reverse.type, "retrieve", "brand → generic never was");
  assert.notEqual(GENERIC_TO_BRAND!.identityKey, BRAND_TO_GENERIC!.identityKey);
});

// ── no user-level shortcut ──────────────────────────────────────────────────

test("🔴 the policy reads objective evidence, never a learner-level label", async () => {
  // A `learnerLevel` / `masteryLevel` / `globalDifficulty` shortcut would leak one objective's
  // result into unrelated ones — the global mode this architecture exists to remove.
  const { readFile } = await import("node:fs/promises");
  const source = (await readFile(new URL("./teaching-policy.ts", import.meta.url), "utf8"))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  for (const forbidden of ["learnerLevel", "masteryLevel", "globalDifficulty", "user.level"]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} is a learner-level shortcut`);
  }
});
