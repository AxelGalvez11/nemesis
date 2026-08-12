import assert from "node:assert/strict";
import { test } from "node:test";

import type { KnowledgeObject } from "./knowledge-types";
import { projectLearnerState, type LearnerEvidence } from "./learner-evidence";
import { objectivesForKnowledge } from "./learning-objective";
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
};
const [GENERIC_TO_BRAND, BRAND_TO_GENERIC] = objectivesForKnowledge(KNOWLEDGE);
const NOW = new Date("2026-08-11T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

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

function decide(evidence: LearnerEvidence[], now: Date = NOW): TeachingAction {
  return chooseNextTeachingAction({
    knowledgeObject: KNOWLEDGE,
    learnerState: projectLearnerState(GENERIC_TO_BRAND!.identityKey, evidence),
    now,
    objective: GENERIC_TO_BRAND!,
    recentEvidence: evidence,
  });
}

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
  const action = decide([ev("e1", ago(5 * 60_000), "understood")]);
  assert.equal(action.type, "advance");
});

test("a demonstration from long ago still advances — no `strong` state was invented", () => {
  // 🔴 Step 5 projects six states and this policy adds none. Distinguishing "one fresh correct" from
  // "repeated delayed correct" needs retention data that does not exist yet; inventing a seventh
  // state inside the policy would put a fact about the learner somewhere nothing else can read.
  const action = decide([ev("e1", ago(90 * 24 * 3600_000), "strong")]);
  assert.equal(action.type, "advance");
});

// ── a reveal is not a wrong answer ──────────────────────────────────────────

test("🔴 giving up gets the answer shown, never a correction of something they did not say", () => {
  const action = decide([ev("e1", ago(2 * 3600_000), null)]);
  assert.equal(action.type, "show_correction");
  assert.match(action.because, /no usable demonstration/i);
  // They did not produce an incorrect answer, so nothing may read as "incorrect".
  assert.equal(/wrong|incorrect|contradict/i.test(action.because), false);
});

test("a wrong answer is corrected, and says so", () => {
  const action = decide([ev("e1", ago(2 * 3600_000), "incorrect")]);
  assert.equal(action.type, "show_correction");
  assert.match(action.because, /contradicted/i);
});

// ── not the identical question a millisecond later ──────────────────────────

test("🔴 the same correction is not shown twice in a row", () => {
  // §9: do not necessarily ask the identical question one millisecond after correcting. Showing the
  // same sentence twice is a loop that looks like teaching and is not.
  const evidence = [ev("e1", ago(3 * 3600_000), "incorrect"), ev("e2", ago(60_000), "incorrect")];
  const action = decide(evidence);
  assert.equal(action.type, "defer");
  assert.match(action.because, /intervening work/i);
});

test("after intervening time, the objective is corrected again rather than held for ever", () => {
  const evidence = [
    ev("e1", ago(5 * 3600_000), "incorrect"),
    ev("e2", ago(ACT_AGAIN_AFTER_MS + 60_000), "incorrect"),
  ];
  assert.equal(decide(evidence).type, "show_correction");
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
  const evidence = [ev("e1", ago(2 * 3600_000), "understood")];
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
