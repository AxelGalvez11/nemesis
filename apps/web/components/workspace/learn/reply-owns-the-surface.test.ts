import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { answerSink, composeSurface } from "@/lib/learn/canvas-hosting";
import { composerIntent } from "@/lib/learn/composer-intent";

import { canvasPresentation } from "./canvas-presence";

// 🔴🔴🔴 ONE SCREEN, TWO TURNS. Reported by the owner twice on 2026-08-20, with screenshots.
//
// He asked *"what can you do?"* on a canvas that was teaching him functional groups. Nemesis
// answered correctly. But the teaching card and its Continue stayed exactly where they were at the
// top of the page, and the answer was stapled on underneath, most of a screen further down. He read
// that as Nemesis being unable to stop teaching, and asked the fair question: *"is this a prompt
// problem?"*
//
// It was not. `learning-canvas.tsx` rendered the reply as an unconditional sibling of the policy's
// region — no relationship between the two existed anywhere, so nothing was deciding to keep both;
// both simply painted. A prompt cannot reach that, and no amount of teaching-controller tuning
// would have: the controller was never asked.
//
// The rule now lives in `composeSurface`, next to the asymmetry it already enforced (two things may
// share the surface, two ANSWER surfaces may not). A reply is a turn, and two TURNS may not.

const TEACH_SCREEN = { canvasState: "learn", policyPresenting: true } as const;

// ── The reported defect ─────────────────────────────────────────────────────

test("🔴🔴 a reply takes the surface from a claim being taught", () => {
  // Calibration: delete `&& !displacedByReply` from `policy` in composeSurface and this reddens
  // alone. It is the exact screenshot: a teach screen up, an answer arriving, both on the page.
  const regions = composeSurface({ ...TEACH_SCREEN, replyOnScreen: true });
  assert.equal(regions.reply, true, "the answer Nemesis just gave is not on the surface");
  assert.equal(regions.policy, false, "the teaching screen is still painting underneath the answer");
});

test("the teaching screen is there the moment the reply is not", () => {
  // The other half, and it is what makes this a displacement rather than a deletion. Nothing about
  // the policy changed; it is standing behind the reply and comes straight back.
  const regions = composeSurface({ ...TEACH_SCREEN, replyOnScreen: false });
  assert.equal(regions.policy, true);
  assert.equal(regions.reply, false);
});

test("a canvas with no reply is composed exactly as it was", () => {
  // 🔴 THE INPUTS ARE OPTIONAL AND ABSENT MUST MEAN "AS BEFORE". Every existing caller and every
  // existing test in `canvas-hosting.test.ts` passes neither; if the defaults were the other way
  // round this change would silently rewrite the surface for canvases that have never seen a reply.
  assert.deepEqual(
    composeSurface(TEACH_SCREEN),
    composeSurface({ ...TEACH_SCREEN, answerOwed: false, replyOnScreen: false }),
  );
});

// ── The one thing a reply may never push off the page ────────────────────────

test("🔴🔴 an OWED QUESTION is not displaced, and that is the owner's own invariant", () => {
  // *"If Nemesis is VISIBLY asking the learner a question, submitting through the primary composer
  // is an answer to that question."* Hide the question and read the next submission as an answer
  // and "visibly" is a lie; hide it and read the submission as a question and a real answer is
  // silently discarded. So an owed question stays, and the reply appears with it.
  //
  // Calibration: drop `&& !answerOwed` from `displacedByReply` and this reddens alone.
  const regions = composeSurface({ ...TEACH_SCREEN, answerOwed: true, replyOnScreen: true });
  assert.equal(regions.policy, true, "a question the learner owes an answer to was taken off screen");
  assert.equal(regions.reply, true, "and the answer to what they asked has to be there too");
});

test("🔴 the answer still routes to the policy while both are up", () => {
  // `answerSink` reads `regions.policy`, so this follows from the line above rather than being a
  // second rule — which is the point of expressing displacement as a region.
  const regions = composeSurface({ ...TEACH_SCREEN, answerOwed: true, replyOnScreen: true });
  const task = { answered: false, placeholder: "Type your answer", promptId: "p1" };
  const sink = answerSink({ hosted: { task } as never, regions, stageTask: null });
  assert.equal(sink.kind, "policy");
});

test("🔴🔴 and nothing can be answered while the question is NOT on screen", () => {
  // The converse, which could not even be stated before this change. A displaced screen loses its
  // answer routing by the same act that takes it off the page, so a submission cannot land on a
  // question the learner cannot see.
  const regions = composeSurface({ ...TEACH_SCREEN, replyOnScreen: true });
  const task = { answered: false, placeholder: "Type your answer", promptId: "p1" };
  assert.equal(answerSink({ hosted: { task } as never, regions, stageTask: null }).kind, "none");
});

// ── The destructive branch this change comes closest to opening ──────────────

test("🔴🔴🔴 a reply on an un-begun canvas is an ASK, never a start", () => {
  // THE regression risk in this whole change, and the reason `composerIntent` takes existence
  // rather than visibility.
  //
  // `begun` is `sink.kind !== "none" || awaitingAnswer || policyHasContent`. Displacing the policy
  // region nulls the sink as well (the test above), so feeding the VISIBLE value in here would
  // knock out two of the three terms at once — and `start` calls `begin()`, which re-titles the
  // canvas and regenerates it. Material dropped on the front door attaches, resolves and asks
  // without anyone pressing send, so `sources_attached` with a live lesson is the COMMON shape,
  // not an edge case.
  //
  // Calibration: pass `regions.policy` instead of `policyPresenting` at the call site in
  // `learning-canvas.tsx` and this reddens.
  const regions = composeSurface({ canvasState: "sources_attached", policyPresenting: true, replyOnScreen: true });
  const intent = composerIntent({
    awaitingAnswer: false,
    canvasState: "sources_attached",
    policyHasContent: true,
    sink: answerSink({ hosted: null, regions, stageTask: null }),
  });
  assert.equal(intent.kind, "ask", "the learner's next sentence would have restarted their canvas");
});

test("a genuinely un-begun canvas can still be started", () => {
  // The other side of the same guard: this must not have been fixed by making `start` unreachable.
  const intent = composerIntent({
    awaitingAnswer: false,
    canvasState: "empty",
    policyHasContent: false,
    sink: { kind: "none" },
  });
  assert.equal(intent.kind, "start");
});

// ── What the learner is looking at ───────────────────────────────────────────

test("🔴🔴 a canvas holding an answer is never reported as QUIET", () => {
  // `quiet` renders "Nemesis has your material but hasn't found anything to ask you about yet" with
  // a Try again beside it. That was being painted directly above a perfectly good answer, because
  // "is there anything on this surface?" did not count a reply as anything. A begun canvas with no
  // blocks and no decision is exactly the shape the owner's screenshots were taken on.
  //
  // Calibration: remove the `regions.reply` arm from the presence ladder and this reddens alone.
  const { presence } = canvasPresentation({
    blocks: 0,
    canvasState: "learn",
    policyPresenting: false,
    replyOnScreen: true,
    working: false,
  });
  assert.equal(presence, "reply");
});

test("a reply outranks a document, and yields to a question it may not displace", () => {
  const overDocument = canvasPresentation({
    blocks: 4,
    canvasState: "learn",
    policyPresenting: false,
    replyOnScreen: true,
    working: false,
  });
  assert.equal(overDocument.presence, "reply");

  const underOwedQuestion = canvasPresentation({
    answerOwed: true,
    blocks: 0,
    canvasState: "learn",
    policyPresenting: true,
    replyOnScreen: true,
    working: false,
  });
  assert.equal(underOwedQuestion.presence, "task", "the ask is what the learner is being held to");
});

test("🔴 a reply is not reported as WORK IN FLIGHT", () => {
  // `preparing` names a step that is genuinely running. An answer already given is not one, and a
  // canvas that says it is thinking while showing a finished answer is theatre.
  const { presence } = canvasPresentation({
    blocks: 0,
    canvasState: "learn",
    policyPresenting: false,
    replyOnScreen: true,
    working: true,
  });
  assert.equal(presence, "reply");
});

// ── Wiring: the decisions above are the ones the component actually makes ─────

const CANVAS = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
const HOME = readFileSync(new URL("./canvas-home.tsx", import.meta.url), "utf8");

/** Comments stripped, because a guard that matches its own explanation proves nothing. */
function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const canvasCode = code(CANVAS);
const homeCode = code(HOME);

test("🔴🔴 the reply renders from the REGION, not from the raw state", () => {
  // The defect was two places each answering "is a reply on screen?" with no relationship between
  // them. Reading `session.aside` directly here again would restore exactly that: the composition
  // would decide the policy yields while the render site decided something else.
  assert.match(canvasCode, /\{regions\.reply && session\.aside && \(/);
  assert.ok(
    !/\{session\.aside && session\.aside\.blockId === null && \(/.test(canvasCode),
    "the render site is back to deciding for itself whether a reply is showing",
  );
});

test("🔴🔴 the intent is given the UNDISPLACED value", () => {
  // Named explicitly rather than by shape: `policyHasContent: policyPresenting` is the whole fix
  // for the destructive branch above, and `policyHasContent: regions.policy` is the bug.
  assert.match(canvasCode, /policyHasContent: policyPresenting,/);
  assert.ok(!/policyHasContent: regions\.policy/.test(canvasCode), "the intent is reading visibility");
});

test("🔴🔴 a displaced teaching screen has a way back", () => {
  // `no-screen-is-a-dead-end.test.ts` states the rule: a `deliberate` screen's ONLY exit is its
  // Continue, and `continueOwner` withholds that the moment `regions.policy` is false. Every route
  // through `submit()` fires `new_turn`, which clears this reply and sets the next one, so typing
  // can never get the learner back. Without this control the lesson is gone for the session.
  const back = canvasCode.slice(canvasCode.indexOf("policyPresenting && !regions.policy"));
  assert.ok(back.length > 0, "the back-to-the-lesson control is gone, and nothing else restores a displaced screen");
  assert.match(back.slice(0, 700), /dismiss_aside/, "it does not actually clear the reply");
  assert.match(back.slice(0, 700), /BACK_TO_LESSON/);
});

test("🔴 the way back is offered ONLY when something is being held", () => {
  // On an ordinary conversational canvas there is no lesson behind the reply, and a button offering
  // to return to one would be a control that does nothing — this codebase's most-repeated defect.
  assert.ok(
    !/\{policyPresenting &&\s*\(/.test(canvasCode),
    "the control is gated on the policy having content alone, so it shows when nothing is displaced",
  );
});

// ── Record a lecture: the control is withdrawn, the capability is not ─────────

test("🔴 neither composer offers 'Record a lecture'", () => {
  // Owner call, 2026-08-20. Both surfaces had their own copy of the menu, which is why this checks
  // both: fixing one and missing the other is how the front door and the canvas came to disagree
  // about what the `+` does in the first place.
  assert.ok(!/Record a lecture/.test(canvasCode), "the canvas composer still offers it");
  assert.ok(!/Record a lecture/.test(homeCode), "the front door still offers it");
  assert.ok(!/onRecord=/.test(canvasCode), "the canvas still hands the composer a record handler");
});

test("🔴🔴 the recorder itself is still wired, so this is a hidden control and not a deleted feature", () => {
  // "Remove the control, not the feature" — the owner's standing correction. Re-offering this must
  // be one prop and one menu item, not a rebuild; a guard that only checked the menu was gone would
  // pass just as happily against a deletion.
  assert.match(canvasCode, /<CanvasRecorder/, "the canvas recorder was deleted rather than hidden");
  assert.match(homeCode, /<CanvasRecorder/, "the front door recorder was deleted rather than hidden");
});
