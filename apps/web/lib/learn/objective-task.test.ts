import assert from "node:assert/strict";
import { test } from "node:test";

import type { ResponseEvaluation } from "./canvas-model";
import type { KnowledgeObject } from "./knowledge-types";
import { objectivesForKnowledge } from "./learning-objective";
import {
  evidenceFromEvaluation,
  objectiveAsTask,
  objectivePromptText,
  retrievalPromptFor,
  unobtainedEvidence,
} from "./objective-task";

// Minted through the real function rather than hand-written, so a change to how sides are resolved
// shows up here instead of being papered over by a fixture that agrees with the old rules.
const KNOWLEDGE: KnowledgeObject = {
  id: "k1",
  identityKey: "association:v2:8589ff53b101b420",
  pair: { id: "t1:r1", left: "losartan", leftRole: "generic", right: "Cozaar", rightRole: "brand" },
  relationKind: "brand|generic",
  statement: "losartan — Cozaar",
  type: "association",
};
const [GENERIC_TO_BRAND, BRAND_TO_GENERIC] = objectivesForKnowledge(KNOWLEDGE);

const EVALUATION: ResponseEvaluation = {
  confidence: 0.9,
  demonstrated: ["the brand name"],
  feedback: "That's the one.",
  misconceptions: [],
  missing: [],
  verdict: "understood",
};

// ── the crossing where six things have already died ─────────────────────────

test("🔴 the two directions of one pair ask OPPOSITE questions", () => {
  // The defect this exists for is silent and passes every other test: build the cue from
  // `pair.left` and BOTH objectives print "What is the brand for losartan?" while carrying
  // opposite identity keys. Every downstream report then reads correctly — one direction
  // demonstrated, the reverse still unknown — and the reverse is unknown only because the learner
  // was never actually asked it.
  const forward = retrievalPromptFor(GENERIC_TO_BRAND!, "p1");
  const reverse = retrievalPromptFor(BRAND_TO_GENERIC!, "p2");

  assert.notEqual(forward.prompt, reverse.prompt);
  assert.match(forward.prompt, /losartan/);
  assert.equal(forward.expectedAnswer, "Cozaar");
  assert.match(reverse.prompt, /Cozaar/);
  assert.equal(reverse.expectedAnswer, "losartan");
  // And what one asks for is what the other gives.
  assert.equal(forward.expectedAnswer, BRAND_TO_GENERIC!.cue);
  assert.equal(reverse.expectedAnswer, GENERIC_TO_BRAND!.cue);
});

test("the question names the role the learner must produce, never a column position", () => {
  // "the right-hand value" means opposite things in a `Generic | Brand` glossary and a
  // `Brand | Generic` revision sheet. The role is what the learner is actually asked for.
  assert.match(objectivePromptText(GENERIC_TO_BRAND!), /brand/i);
  assert.match(objectivePromptText(BRAND_TO_GENERIC!), /generic/i);
  for (const wording of [objectivePromptText(GENERIC_TO_BRAND!), objectivePromptText(BRAND_TO_GENERIC!)]) {
    assert.equal(/left|right|column|first|second/i.test(wording), false, wording);
  }
});

test("a headerless pair still asks something, without inventing a role", () => {
  const headerless = objectivesForKnowledge({
    ...KNOWLEDGE,
    pair: { id: "t2:r1", left: "kanji", right: "reading" },
  });
  const wording = objectivePromptText(headerless[0]!);
  assert.match(wording, /kanji|reading/);
  assert.equal(/undefined|null/.test(wording), false);
});

test("the task carries the answer as reference evidence and NO canvas concept", () => {
  const prompt = retrievalPromptFor(GENERIC_TO_BRAND!, "p1");
  const task = objectiveAsTask(GENERIC_TO_BRAND!, prompt, { text: "Cozaar", via: "typed" });
  assert.equal(task.expectedEvidence.referenceAnswer, "Cozaar");
  // 🔴 A per-canvas concept id on a durable objective would be identity leaking back in from the
  // session — the exact thing the objective layer exists to remove.
  assert.equal(task.objective.conceptId, null);
  assert.equal(task.task, "name");
});

// ── the evaluator decides, not the button and not string equality ───────────

test("🔴 the verdict comes from the evaluator even when the text matches exactly", () => {
  // A `said === expected` shortcut is the tempting version of this and it is wrong twice: it marks
  // a correct answer wrong over capitalisation or a synonym, and — the part that changes teaching
  // — it cannot tell a wrong answer from a specific competing belief.
  const prompt = retrievalPromptFor(GENERIC_TO_BRAND!, "p1");
  const evidence = evidenceFromEvaluation({
    canvasId: "c1",
    evaluation: { ...EVALUATION, verdict: "incorrect" },
    objectiveRowId: "row-1",
    occurredAt: "2026-08-11T12:00:00.000Z",
    prompt,
    response: { text: "Cozaar", via: "typed" },
  });
  assert.equal(evidence.verdict, "incorrect");
});

test("a judged answer always obtained a demonstration — including a wrong one", () => {
  const prompt = retrievalPromptFor(GENERIC_TO_BRAND!, "p1");
  const evidence = evidenceFromEvaluation({
    canvasId: "c1",
    evaluation: { ...EVALUATION, verdict: "incorrect" },
    objectiveRowId: "row-1",
    occurredAt: "2026-08-11T12:00:00.000Z",
    prompt,
    response: { text: "Diovan", via: "typed" },
  });
  assert.equal(evidence.demonstrationObtained, true);
});

test("🔴 an opportunity that produced nothing carries NO verdict", () => {
  const prompt = retrievalPromptFor(GENERIC_TO_BRAND!, "p1");
  const evidence = unobtainedEvidence({
    canvasId: "c1",
    objectiveRowId: "row-1",
    occurredAt: "2026-08-11T12:00:00.000Z",
    prompt,
    responseText: null,
  });
  assert.equal(evidence.demonstrationObtained, false);
  assert.equal(evidence.verdict, null);
});

// ── one performance, one row ────────────────────────────────────────────────

test("🔴 the evidence is keyed by the TASK, so one prompt can only ever be one demonstration", () => {
  // A fresh id minted at submit time would give a double click two ids and two rows for one
  // performance — and `demonstrationCount` is what the policy reads to decide whether a capability
  // has been shown repeatedly, so the learner would be credited with practice they never did.
  const prompt = retrievalPromptFor(GENERIC_TO_BRAND!, "task-abc");
  const base = {
    canvasId: "c1",
    evaluation: EVALUATION,
    objectiveRowId: "row-1",
    prompt,
    response: { text: "Cozaar", via: "typed" as const },
  };
  const first = evidenceFromEvaluation({ ...base, occurredAt: "2026-08-11T12:00:00.000Z" });
  const second = evidenceFromEvaluation({ ...base, occurredAt: "2026-08-11T12:00:03.000Z" });

  assert.equal(first.responseId, "task-abc");
  assert.equal(first.taskId, "task-abc");
  // Same prompt, later clock: still the same key, so the unique index collapses them.
  assert.equal(second.responseId, first.responseId);
});

test("a different prompt is a different demonstration", () => {
  const one = evidenceFromEvaluation({
    canvasId: "c1",
    evaluation: EVALUATION,
    objectiveRowId: "row-1",
    occurredAt: "2026-08-11T12:00:00.000Z",
    prompt: retrievalPromptFor(GENERIC_TO_BRAND!, "task-1"),
    response: { text: "Cozaar", via: "typed" },
  });
  const two = evidenceFromEvaluation({
    canvasId: "c1",
    evaluation: EVALUATION,
    objectiveRowId: "row-1",
    occurredAt: "2026-08-11T13:00:00.000Z",
    prompt: retrievalPromptFor(GENERIC_TO_BRAND!, "task-2"),
    response: { text: "Cozaar", via: "typed" },
  });
  assert.notEqual(one.responseId, two.responseId);
});

test("what the learner said is kept, and the evaluator is named", () => {
  const evidence = evidenceFromEvaluation({
    canvasId: "c1",
    evaluation: EVALUATION,
    objectiveRowId: "row-1",
    occurredAt: "2026-08-11T12:00:00.000Z",
    prompt: retrievalPromptFor(GENERIC_TO_BRAND!, "task-1"),
    response: { text: "Cozaar", via: "typed" },
  });
  assert.equal(evidence.responseText, "Cozaar");
  assert.ok(evidence.evaluatorVersion);
});
