import assert from "node:assert/strict";
import { test } from "node:test";

import { CANVAS_STATES, type CanvasState } from "./canvas-model";
import {
  actionKey,
  answerSink,
  composeSurface,
  isEvidenceStage,
  materialOwnsAttention,
  NO_ACTION,
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

test("🔴🔴 THE TASK OWNS ATTENTION: a document does not paint beneath a live question", () => {
  // 🔴 THIS TEST ASSERTED THE OPPOSITE, AND THE REVERSAL IS THE OWNER'S. Step 7b made prose and a
  // task coexist, to answer "the policy owned 0 of 6 canvases" — sound for that problem. Then he met
  // the result: his canvas asked "What follows from increasing resistance, and why?" and printed
  // "What Acceptance B1 Covers" underneath, several paragraphs telling him what the document he had
  // just uploaded contained.
  //
  //     "Never explain the material merely because it exists. Explain what the learner needs because
  //      of what they just demonstrated."
  //     "Could the learner meaningfully perform the current cognitive action without this text?
  //      If yes, do not render the text."
  const regions = composeSurface({ canvasState: "learn", policyPresenting: true });
  assert.equal(regions.policy, true, "the task still presents");
  assert.equal(regions.document, false, "and nothing competes with it for attention");
});

test("🔴 but content that IS the action still paints beside the task", () => {
  // 🔴 THE CALIBRATION, AND THE DEFECT THIS FIX COULD OTHERWISE BECOME. "Summarize this" writes into
  // the same blocks as a generated overview — the rows are indistinguishable — so an unconditional
  // suppression would answer an explicit request with a blank page.
  const asked = composeSurface({
    canvasState: "learn",
    materialIsTheAction: true,
    policyPresenting: true,
  });
  assert.equal(asked.document, true);
  assert.equal(asked.policy, true);
});

// ── attention returns to the task, which the first version never did ────────

test("🔴🔴 material the learner asked for owns attention only until the action moves on", () => {
  // 🔴 THE DEFECT THIS REPLACES, WHICH SHIPPED AND WHICH THE OWNER WOULD HAVE MET AGAIN. The first
  // version of this rule was a session boolean, `learnerAskedForContent`, set by the command path
  // and NEVER CLEARED — `setAskedForContent(true)` was its only call. So one "explain this" put
  // general material back underneath every subsequent question for the rest of the session, and the
  // overview the owner had just had removed returned one interaction later.
  //
  // Owner, correcting the encoding: "The invariant is that the current cognitive action owns
  // attention… What I don't want is stale/general document material competing with the active task."
  const askedDuring = actionKey({ objectiveId: "o1", type: "retrieve" });

  // While that retrieval is still what the learner is doing, the material they asked for IS the act.
  assert.equal(
    materialOwnsAttention({ actionInFlight: askedDuring, requestedDuring: askedDuring }),
    true,
  );

  // They answer; the policy now owes them the correction. Different action — the same blocks are
  // background now, and nothing had to clear a flag for that to be true.
  assert.equal(
    materialOwnsAttention({
      actionInFlight: actionKey({ objectiveId: "o1", type: "show_correction" }),
      requestedDuring: askedDuring,
    }),
    false,
  );

  // And it does not leak sideways to a different objective's retrieval either.
  assert.equal(
    materialOwnsAttention({
      actionInFlight: actionKey({ objectiveId: "o2", type: "retrieve" }),
      requestedDuring: askedDuring,
    }),
    false,
  );
});

test("🔴 a learner who never asked never owns attention with material", () => {
  assert.equal(
    materialOwnsAttention({ actionInFlight: NO_ACTION, requestedDuring: null }),
    false,
    "null is 'never asked', and must not match the no-action key",
  );
});

test("material asked for with nothing in flight keeps the surface it was asked on", () => {
  // Asking to read while the policy has nothing to say is the ordinary reading case. It must not be
  // suppressed the moment a task appears, but it also must not be suppressed BEFORE one does.
  assert.equal(
    materialOwnsAttention({ actionInFlight: NO_ACTION, requestedDuring: NO_ACTION }),
    true,
  );
  const regions = composeSurface({
    canvasState: "learn",
    materialIsTheAction: true,
    policyPresenting: false,
  });
  assert.equal(regions.document, true);
});

test("🔴 a contrast names several objectives and still keys stably", () => {
  // `contrast` carries `objectiveIds`, not `objectiveId`. Keying off the missing field would make
  // every contrast look like the same action, so material requested during one would paint under
  // the next.
  const first = actionKey({ objectiveIds: ["a", "b"], type: "contrast" });
  assert.equal(first, actionKey({ objectiveIds: ["a", "b"], type: "contrast" }), "stable");
  assert.notEqual(first, actionKey({ objectiveIds: ["a", "c"], type: "contrast" }));
  assert.notEqual(first, actionKey({ objectiveId: "a", type: "retrieve" }));
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

test("🔴 a legacy run does NOT keep the surface — the policy takes it", () => {
  // 🔴 THIS TEST ASSERTED THE EXACT OPPOSITE UNTIL THE SIX-STAGE MACHINE WAS RETIRED, AND WHAT IT
  // ENCODED IS KEPT HERE BECAUSE IT IS THE REASON THE DEFECT SURVIVED SO LONG:
  //
  //     "The learner is partway through the six-stage machine and has given it answers. Painting a
  //      policy question over it would strand those."
  //
  // The premise is false. **The legacy arm has never written a `learner_evidence` row** — from the
  // call graph: `recordEvidence` has exactly one caller and it is in the policy arm. Answers given
  // to a legacy run accumulate in `canvas.document` and produce nothing durable about the learner.
  //
  // 🔴 NOT from that table being empty, which I first cited and which proves nothing: a real row
  // was written from the live policy canvas and deliberately deleted afterwards, so the zero is
  // successful cleanup rather than a dead write path. See `canvas-hosting.ts` for the full note.
  //
  // So the precedence handed the surface to the arm that cannot learn anything, and kept it there.
  // That is how the owner met a fixed six-question quiz on their own canvas.
  const regions = composeSurface({ canvasState: "test", policyPresenting: true });
  assert.equal(regions.policy, true, "the policy takes the surface");
  assert.equal(regions.stages, false, "the legacy arm stands down");
});

test("🔴 …but the legacy arm still paints when the policy has NOTHING to say", () => {
  // The inversion must not become a deletion. Until Canvas UI removes the stage components, a
  // canvas in an evidence stage with no policy question must still paint SOMETHING — "neither arm"
  // is the blank-canvas failure the old comment correctly feared, just arrived from the other side.
  const regions = composeSurface({ canvasState: "test", policyPresenting: false });
  assert.equal(regions.stages, true, "the fallback still paints");
  assert.equal(regions.policy, false);
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

// ── RUNTIME-003: hosting is indifferent to how many objectives a task targets ─

test("🔴 acceptance 5: a task targeting several objectives still shares the surface with the document", () => {
  // The point of RUNTIME-003 is what it does NOT require: no causal-specific page runtime, no
  // second layout, no "mode". A task covering four links of a mechanism is hosted by exactly the
  // rules that host a one-word retrieval, beside reading material that stays visible.
  //
  // 🔴 THIS LOOKS TAUTOLOGICAL AND IS NOT. It is a guard against the obvious future edit — giving
  // composition a reason to care about the target count, so a multi-objective task gets "its own"
  // presentation and quietly takes the page back. Whole-page ownership is the scaffolding step 7b
  // removed; this is what stops it growing back through a side door.
  const regions = composeSurface({ canvasState: "learn", policyPresenting: true });

  // 🔴 THE GUARD SURVIVES THE OWNER'S REVERSAL, AND IT IS THE HALF THAT MATTERS. What this test
  // exists to stop is composition growing a reason to care about the TARGET COUNT — a
  // multi-objective task getting "its own" presentation and taking the page back. That is still
  // asserted. What changed is that the document no longer paints beneath ANY live task, so the
  // reading assertion moved rather than the rule: one task, one presentation, whatever it targets.
  assert.equal(regions.policy, true);
  assert.equal(regions.document, false, "no task paints over reading material — the owner's rule");
  assert.equal(regions.sharing, true, "and the task still knows a real document is behind it");
});

test("🔴 a multi-objective task is still exactly ONE answer surface", () => {
  // Several objectives is not several places to answer. If a task targeting four things ever
  // produced more than one sink, one of those answers would be routed to a question nobody asked —
  // which is the corruption `AnswerSink` is a union to prevent, arriving with a target set.
  const regions = composeSurface({ canvasState: "learn", policyPresenting: true });
  const sink = answerSink({ hosted: hosted("multi-objective"), regions, stageTask: null });

  assert.equal(sink.kind, "policy");
  assert.equal(sink.kind === "policy" && sink.task.id, "multi-objective");
});

// ── §24: a reading state is no longer a promise that there is anything to read ───────────────────

test("🔴 an EMPTY reading state is not shared with — the same defect, through the door §24 opened", () => {
  // 🔴 THE ASSUMPTION THAT JUST EXPIRED. `learn` used to imply blocks, because reaching it meant
  // `generateLesson` had run. Since §24 removed the opening summary, a document canvas sits in
  // `learn` with ZERO blocks as the ordinary case — so "a reading state" and "there is something to
  // read" have come apart, and only the second one may make a task shrink.
  //
  // Left unfixed this reproduces, exactly, the bug this file already records one state over: the
  // question floats at the top of an empty surface instead of sitting where the learner is looking.
  const emptyLearn = composeSurface({
    canvasState: "learn",
    hasReadingMaterial: false,
    policyPresenting: true,
  });
  assert.equal(emptyLearn.policy, true, "the question is still presented");
  // 🔴 `document` IS NOW FALSE HERE FOR A SECOND, INDEPENDENT REASON, AND THE ORIGINAL ONE IS WHAT
  // THIS TEST IS ABOUT. It was written against `sharing`: a task told it is sharing with material
  // that is not there shrinks and floats at the top of an empty surface. That assertion is below and
  // is untouched. The region itself no longer paints beneath a live task at all — the owner's rule —
  // so this line records the new value rather than the old promise about material attached later.
  assert.equal(emptyLearn.document, false, "nothing paints beneath a live task");
  assert.equal(emptyLearn.sharing, false, "🔴 but there is nothing to make room for");

  const withBlocks = composeSurface({
    canvasState: "learn",
    hasReadingMaterial: true,
    policyPresenting: true,
  });
  assert.equal(withBlocks.sharing, true, "and real material is still made room for");
});

test("🔴 the reading material question NEVER overrides the pre-content rule", () => {
  // Two independent reasons a task must not shrink, and neither may cancel the other out. A
  // `sources_attached` canvas paints a placeholder; claiming it holds reading material must not
  // resurrect the layout that rule was written to prevent.
  const pre = composeSurface({
    canvasState: "sources_attached",
    hasReadingMaterial: true,
    policyPresenting: true,
  });
  assert.equal(pre.sharing, false, "a placeholder is not reading material, whatever it is told");
});

test("🔴 an unstated reading question reads as the PRE-§24 layout, never as an empty page", () => {
  // Absent must degrade to "assume there is material", which is what every caller meant before this
  // input existed. The opposite default would silently stop a task making room for a document that
  // IS there — a regression that looks like nothing and is invisible in a screenshot.
  assert.equal(composeSurface({ canvasState: "learn", policyPresenting: true }).sharing, true);
});
