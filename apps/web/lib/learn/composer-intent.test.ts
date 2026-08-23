import assert from "node:assert/strict";
import { test } from "node:test";

import { answerSink, type AnswerSink, type HostedTask, type HostedTaskShape } from "./canvas-hosting";
import type { CanvasState } from "./canvas-model";
import type { UserQuestion } from "./clarify-question";
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

const DEPTH: UserQuestion = {
  id: "course-depth",
  invitesWritten: true,
  options: [
    { description: "The major ideas.", id: "survey", label: "Overview" },
    { description: "Comparable to a college course.", id: "academic", label: "Academic" },
  ],
  prompt: "How deep should this course go?",
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
      policyHasContent: true,
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
    policyHasContent: true,
    sink: policySink,
  });
  assert.equal(intent.kind, "answer");
});

test("🔴 a stage task is answered too, and names its own receiver", () => {
  const intent = composerIntent({
    awaitingAnswer: false,
    canvasState: "recall",
    policyHasContent: false,
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
      policyHasContent: false,
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
    policyHasContent: true,
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
    policyHasContent: true,
    sink: noSink,
  });
  assert.equal(intent.kind, "ask");
});

test("🔴 a spent stage task does not fall through to START", () => {
  const intent = composerIntent({
    awaitingAnswer: false,
    canvasState: "sources_attached",
    policyHasContent: false,
    sink: { kind: "stage", task: { ...QUESTION, answered: true } },
  });
  assert.equal(intent.kind, "ask");
});

test("a task with no placeholder is not an answer surface, and is still not a start", () => {
  const intent = composerIntent({
    awaitingAnswer: false,
    canvasState: "empty",
    policyHasContent: false,
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
      policyHasContent: false,
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
      policyHasContent: true,
      sink: policySink,
    }).kind,
    "the new intent agrees with the broken one on the exact case that lost every typed answer",
  );
});

// ── Clarification: Nemesis asking the LEARNER, and the same destruction it could cause ──

test("🔴🔴 a pending clarification is never a START, on any stored state", () => {
  // The whole reason this lives in `AnswerSink` instead of beside it in session state. The card is
  // on screen with the primary composer under it; the learner types "academic" rather than tapping.
  // Held anywhere this union cannot see, that submission reaches `begin()` on a canvas that has not
  // begun — which re-titles it and regenerates it. Same destruction as the original defect, new door.
  for (const canvasState of EVERY_STATE) {
    const intent = composerIntent({
      awaitingAnswer: false,
      canvasState,
      policyHasContent: false,
      sink: { kind: "clarify", question: DEPTH },
    });
    assert.equal(intent.kind, "clarify", `state ${canvasState} swallowed a pending clarification`);
    assert.equal(intent.kind === "clarify" && intent.question.id, "course-depth");
  }
});

test("🔴 a clarification is its OWN kind, so it can never be filed as evidence", () => {
  // `answer` reaches a judge and writes a `learner_evidence` row against an objective. Picking
  // "Academic" over "Overview" demonstrates nothing about what somebody knows, so the two must not
  // share a kind: a consumer that forgot to check a flag would file a preference as knowledge, and
  // nothing would fail.
  const intent = composerIntent({
    awaitingAnswer: false,
    canvasState: "learn",
    policyHasContent: false,
    sink: { kind: "clarify", question: DEPTH },
  });
  assert.notEqual(intent.kind, "answer");
  assert.equal(Object.hasOwn(intent, "task"), false, "a clarification must carry no task");
});

test("🔴 a REAL question outranks a clarification, so no owed answer is read as a preference", () => {
  // The redundant second witness. `answerSink` ranks a hosted task first and the session refuses to
  // stage a clarification while an answer is owed, so both would have to fail for this to matter.
  // The direction is what is pinned: a clarification waiting its turn is recoverable, an answer to
  // a real question filed as a preference is a lost observation and a wrong evidence row.
  const hosted: HostedTask = {
    knowledgeType: "association",
    operation: "recall",
    task: QUESTION,
    tempo: "instant",
  };
  const sink = answerSink({
    clarifying: DEPTH,
    hosted,
    regions: { document: true, policy: true, reply: false, sharing: false, stages: false },
    stageTask: null,
  });
  assert.equal(sink.kind, "policy");

  const intent = composerIntent({
    awaitingAnswer: true,
    canvasState: "sources_attached",
    policyHasContent: true,
    sink,
  });
  assert.equal(intent.kind, "answer");
});

test("no clarification pending leaves every existing sink exactly where it was", () => {
  const sink = answerSink({
    clarifying: null,
    hosted: null,
    regions: { document: true, policy: false, reply: false, sharing: false, stages: false },
    stageTask: null,
  });
  assert.equal(sink.kind, "none");
  assert.equal(
    composerIntent({
      awaitingAnswer: false,
      canvasState: "sources_attached",
      policyHasContent: false,
      sink,
    }).kind,
    "start",
    "an absent clarification must not cost a fresh canvas its ability to start",
  );
});
