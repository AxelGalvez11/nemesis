import assert from "node:assert/strict";
import { test } from "node:test";

import { CANVAS_STATES, type CanvasState } from "./canvas-model";
import {
  answerSink,
  composeSurface,
  isEvidenceStage,
  tempoFor,
  type HostedTask,
  type HostedTaskShape,
} from "./canvas-hosting";

const shape = (id: string): HostedTaskShape => ({
  answered: false,
  id,
  index: 0,
  kind: "question",
  placeholder: "Type your answer…",
  prompt: "What is valsartan sold as?",
  total: 1,
});

const hosted = (id = "policy-1"): HostedTask => ({
  knowledgeType: "association",
  operation: "recall",
  task: shape(id),
  tempo: "instant",
});

// ── the composition 7b exists to allow ──────────────────────────────────────

test("🔴 prose and a hosted task coexist — this IS step 7b", () => {
  // The whole point. Before this, a canvas holding a document could not also present a question:
  // one runtime took the page and the document was hidden behind it.
  const regions = composeSurface({ canvasState: "learn", policyPresenting: true });
  assert.equal(regions.document, true, "the document must stay on screen beside a task");
  assert.equal(regions.policy, true, "the task must be presentable beside a document");
});

test("unsupported material stays readable when the policy has nothing to ask", () => {
  // A canvas whose knowledge the policy cannot represent is not a canvas the learner loses.
  const regions = composeSurface({ canvasState: "learn", policyPresenting: false });
  assert.equal(regions.document, true);
  assert.equal(regions.policy, false);
});

test("🔴 pure association recall works, and does NOT think it is sharing with a document", () => {
  // CALIBRATION: `sharing` was first wired to `regions.document`, which is also true for the
  // pre-content states. On `sources_attached` that made a task shrink to leave room for reading
  // material that does not exist — floating at the top of an empty surface beside a centred button.
  // And this is the COMMON shape: a canvas with sources attached and no generated lesson yet.
  const pre = composeSurface({ canvasState: "sources_attached", policyPresenting: true });
  assert.equal(pre.policy, true, "the task must still be presentable");
  assert.equal(pre.document, true, "the pre-content placeholder still paints");
  assert.equal(pre.sharing, false, "there is no document here to make room for");

  const withDocument = composeSurface({ canvasState: "learn", policyPresenting: true });
  assert.equal(withDocument.sharing, true, "a real document must be made room for");
});

test("sharing is never true without the policy actually presenting", () => {
  for (const state of CANVAS_STATES) {
    const regions = composeSurface({ canvasState: state, policyPresenting: false });
    assert.equal(regions.sharing, false, `${state}: nothing is being shared with`);
  }
});

// ── the invariant that replaces whole-page ownership ─────────────────────────

test("🔴 an evidence-collecting surface and a hosted task NEVER paint together", () => {
  // The narrowed form of the property the one-branch rule protected. Reading material may coexist
  // (asserted above); a second ANSWER surface may not, because both write evidence.
  for (const state of CANVAS_STATES) {
    const regions = composeSurface({ canvasState: state, policyPresenting: true });
    assert.equal(
      regions.stages && regions.policy,
      false,
      `${state}: two answer surfaces would both claim the composer`,
    );
  }
});

test("🔴 something always paints — no combination produces a blank canvas", () => {
  // CALIBRATION, AND THIS ONE FOUND A REAL DEFECT. The first version only checked the
  // no-presentation case and passed, while `composeSurface` computed `stages: evidenceStage &&
  // !policyPresenting`: mid-test with a task pending, the stage stood down for the task and the
  // task stood down for the stage, and the learner got a blank canvas with no error. Asserting
  // over BOTH values is what catches it.
  for (const state of CANVAS_STATES) {
    for (const presenting of [true, false]) {
      const regions = composeSurface({ canvasState: state, policyPresenting: presenting });
      assert.equal(
        regions.document || regions.stages || regions.policy,
        true,
        `${state} (presenting=${presenting}) paints nothing at all`,
      );
    }
  }
});

test("a run already under way is not interrupted by a task", () => {
  // The learner is partway through the six-stage machine and has given it answers. Painting a
  // policy question over it would strand those.
  const regions = composeSurface({ canvasState: "test", policyPresenting: true });
  assert.equal(regions.stages, true, "the run in progress keeps the surface");
  assert.equal(regions.policy, false, "the task waits — decideNext is stateless, so nothing is lost");
});

// ── one answer sink ─────────────────────────────────────────────────────────

test("🔴 the sink is never ambiguous, for any combination of inputs", () => {
  // CALIBRATION: this test was written against a deliberately broken `answerSink` that returned
  // `{ kind: "policy" }` whenever `hosted` was non-null, ignoring `regions`. That version routes an
  // answer typed at a recall card to the policy's prompt id — evidence written against a question
  // nobody was asked — and it went RED here on the `recall` state. The union type makes two sinks
  // unrepresentable; this makes choosing the WRONG one detectable.
  for (const state of CANVAS_STATES) {
    for (const hasHosted of [true, false]) {
      for (const hasStage of [true, false]) {
        const regions = composeSurface({ canvasState: state, policyPresenting: hasHosted });
        const sink = answerSink({
          hosted: hasHosted ? hosted() : null,
          regions,
          stageTask: hasStage ? shape("stage-1") : null,
        });
        if (sink.kind === "policy") {
          assert.equal(regions.policy, true, `${state}: routed to a task that is not on screen`);
          assert.equal(regions.stages, false, `${state}: routed past a painting stage`);
        }
        if (sink.kind === "stage") {
          assert.equal(regions.stages, true, `${state}: routed to a stage that is not on screen`);
          assert.equal(regions.policy, false, `${state}: routed past a hosted task`);
        }
      }
    }
  }
});

test("a stage task left over from a finished run is never answered", () => {
  // The realistic leak: the six-stage machine's `activeTask` outlives its surface. Routing to it
  // would send the answer somewhere the learner cannot see.
  const regions = composeSurface({ canvasState: "learn", policyPresenting: true });
  const sink = answerSink({ hosted: hosted(), regions, stageTask: shape("stale") });
  assert.equal(sink.kind, "policy");
  assert.equal(sink.task.id, "policy-1");
});

test("nothing being asked routes nowhere", () => {
  const regions = composeSurface({ canvasState: "learn", policyPresenting: false });
  assert.equal(answerSink({ hosted: null, regions, stageTask: null }).kind, "none");
});

// ── variable tempo, structurally ────────────────────────────────────────────

test("association recall is instant; anything else is given room to think", () => {
  assert.equal(tempoFor({ knowledgeType: "association", operation: "recall" }), "instant");
  // 🔴 The DEFAULT DIRECTION is the safe one. A knowledge type arriving from Brain must not be
  // rushed into the one-second retrieval shell — that is how a mechanism gets drilled as a
  // flashcard (§14.2).
  assert.equal(tempoFor({ knowledgeType: "causal", operation: "explain" }), "deliberate");
  assert.equal(tempoFor({ knowledgeType: "association", operation: "discriminate" }), "deliberate");
  assert.equal(tempoFor({ knowledgeType: "causal", operation: "recall" }), "deliberate");
});

test("isEvidenceStage names exactly the answer-collecting states", () => {
  const collecting: CanvasState[] = ["recall", "test", "retest", "diagnose", "complete"];
  for (const state of CANVAS_STATES) {
    assert.equal(isEvidenceStage(state), collecting.includes(state), state);
  }
});
