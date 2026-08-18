import assert from "node:assert/strict";
import { test } from "node:test";

import type { AnswerSink, HostedTaskShape } from "./canvas-hosting";
import type { CanvasState } from "./canvas-model";
import { composerIntent } from "./composer-intent";

// 🔴🔴🔴 THE DEFECT THIS FILE PINS: A TYPED ANSWER WAS ROUTED TO "START THIS CANVAS".
//
// `preContent = canvas.state === "empty" || canvas.state === "sources_attached"` decided whether the
// composer got an `onStart` handler, and the composer routed `if (onStart) … else if (answering) …`.
// Nothing advances `canvas.state` when the policy stages a question, so on every canvas that had
// material attached and had never had send pressed — the common shape — a real answer to a real
// question went to `begin()`. No judge, no evidence row, no error.
//
// Confirmed in production, not reasoned: the single typed answer that DID reach the judge sits on
// canvas `796a6045`, stored at `learn`. The stored state is the discriminator.

const QUESTION: HostedTaskShape = {
  answered: false,
  id: "prompt-1",
  index: 0,
  kind: "question",
  placeholder: "Type your answer…",
  prompt: "What happens to clearance when hepatic blood flow falls?",
  total: 1,
};

const policySink: AnswerSink = { kind: "policy", task: QUESTION };
const stageSink: AnswerSink = { kind: "stage", task: { ...QUESTION, kind: "recall" } };
const noSink: AnswerSink = { kind: "none" };

/** Every state a canvas can be stored in, so no branch is exercised on one hand-picked value. */
const EVERY_STATE: readonly CanvasState[] = [
  "empty", "sources_attached", "orient", "learn", "recall",
  "test", "diagnose", "targeted_relearn", "retest", "complete",
];

// ── The invariant ───────────────────────────────────────────────────────────

test("🔴🔴 a staged question outranks EVERY stored state — a submission is an answer", () => {
  // The owner's rule, exhaustively: "if Nemesis is visibly asking the learner a question,
  // submitting through the primary composer is an answer to that question."
  for (const canvasState of EVERY_STATE) {
    const intent = composerIntent({
      awaitingAnswer: true,
      canvasState,
      policyPresenting: true,
      sink: policySink,
    });
    assert.equal(intent.kind, "answer", `state ${canvasState} outranked a live question`);
    assert.equal(intent.kind === "answer" && intent.sink, "policy");
    assert.equal(intent.kind === "answer" && intent.task.id, "prompt-1");
  }
});

test("🔴 the exact production shape: material attached, question on screen, never pressed send", () => {
  // `sources_attached` + a hosted task. This returned `start` for the whole life of the defect.
  const intent = composerIntent({
    awaitingAnswer: true,
    canvasState: "sources_attached",
    policyPresenting: true,
    sink: policySink,
  });
  assert.equal(intent.kind, "answer");
});

test("🔴 a stage task is answered too, and names its own receiver", () => {
  const intent = composerIntent({
    awaitingAnswer: false,
    canvasState: "recall",
    policyPresenting: false,
    sink: stageSink,
  });
  assert.equal(intent.kind, "answer");
  assert.equal(intent.kind === "answer" && intent.sink, "stage");
});

// ── Starting still works, which is the half a narrower predicate would break ──

test("material attached and nothing being asked still means START", () => {
  // §3: attach a file, type an instruction (or nothing at all), press send.
  for (const canvasState of ["empty", "sources_attached"] as const) {
    const intent = composerIntent({
      awaitingAnswer: false,
      canvasState,
      policyPresenting: false,
      sink: noSink,
    });
    assert.equal(intent.kind, "start", `${canvasState} lost its ability to start`);
  }
});

// ── Never `start` once anything is on the surface ────────────────────────────

test("🔴 the policy presenting ANYTHING means the canvas has begun, whatever the state says", () => {
  // A lesson, a correction, or a verdict just given. `begin()` here re-titles the canvas and
  // regenerates it, so this branch is the only one that can destroy the learner's work.
  const intent = composerIntent({
    awaitingAnswer: false,
    canvasState: "sources_attached",
    policyPresenting: true,
    sink: noSink,
  });
  assert.equal(intent.kind, "ask", "a verdict on screen was treated as a canvas that had not begun");
});

test("🔴 awaiting an answer with nowhere to put it degrades to ASK, never to START", () => {
  // Unreachable today — `use-policy-runtime` hosts a task for `retrieve` AND `recognise`, which is
  // every action that awaits one. This pins the DIRECTION of failure for whatever action type is
  // added next: treating an answer as a question wastes a reply; treating it as a start destroys
  // the answer, the title and the question.
  const intent = composerIntent({
    awaitingAnswer: true,
    canvasState: "sources_attached",
    policyPresenting: true,
    sink: noSink,
  });
  assert.equal(intent.kind, "ask");
});

test("🔴 a spent stage task does not fall through to START", () => {
  const intent = composerIntent({
    awaitingAnswer: false,
    canvasState: "sources_attached",
    policyPresenting: false,
    sink: { kind: "stage", task: { ...QUESTION, answered: true } },
  });
  assert.equal(intent.kind, "ask");
});

test("a task with no placeholder is not an answer surface, and is still not a start", () => {
  const intent = composerIntent({
    awaitingAnswer: false,
    canvasState: "empty",
    policyPresenting: false,
    sink: { kind: "policy", task: { ...QUESTION, placeholder: "" } },
  });
  assert.equal(intent.kind, "ask");
});

// ── The ordinary conversational case ────────────────────────────────────────

test("a canvas with content and nothing being asked is an ASK", () => {
  for (const canvasState of ["learn", "targeted_relearn", "complete"] as const) {
    const intent = composerIntent({
      awaitingAnswer: false,
      canvasState,
      policyPresenting: false,
      sink: noSink,
    });
    assert.equal(intent.kind, "ask");
  }
});

// ── Calibration: the broken predicate, restored, must not produce these answers ──

test("🔴 CALIBRATION — the old predicate reddens the invariant above", () => {
  // The exact code that shipped, restored here so this file proves it is genuinely different rather
  // than merely asserting the new one. A guard that passes on both implementations protects nothing.
  const brokenIntent = (canvasState: CanvasState, sink: AnswerSink) =>
    canvasState === "empty" || canvasState === "sources_attached"
      ? { kind: "start" as const }
      : sink.kind !== "none"
        ? { kind: "answer" as const }
        : { kind: "ask" as const };

  assert.equal(
    brokenIntent("sources_attached", policySink).kind,
    "start",
    "the old predicate must still demonstrate the defect, or this calibration is meaningless",
  );
  assert.notEqual(
    brokenIntent("sources_attached", policySink).kind,
    composerIntent({
      awaitingAnswer: true,
      canvasState: "sources_attached",
      policyPresenting: true,
      sink: policySink,
    }).kind,
    "the new intent agrees with the broken one on the exact case that lost every typed answer",
  );
});
