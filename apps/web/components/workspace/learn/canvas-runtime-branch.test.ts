import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// The one failure this file exists to catch cannot be caught by testing a function, because it
// does not live in one: "the policy decided retrieve, and the Learn stage painted anyway". That is
// a fact about the JSX — about whether the six-stage machine is behind ONE branch or behind six
// conditions that each have to remember to say "unless the policy owns this".
//
// So this reads the component's source. Crude, and the alternative is a DOM test harness this app
// does not have; the property being checked is structural, and structure is what the source says.

const SOURCE = readFile(new URL("./learning-canvas.tsx", import.meta.url), "utf8");

/**
 * The renderers that COLLECTED AN ANSWER, or reported on answers already collected.
 *
 * 🔴 THEY ARE ALL DELETED NOW, AND THIS LIST IS WHY THE FILE STILL HAS A JOB. It used to name the
 * six-stage renderers so a test could prove each one painted INSIDE `{regions.stages && (…)}` —
 * confined, so it could never appear beside a hosted task and have both claim the composer.
 *
 * Confinement is no longer the bound. `canvas-stages.tsx` is gone, the region with it, and a task
 * now COMPOSES on top of reading material instead of replacing the page. So the invariant this file
 * exists for — never two answer surfaces on one composer — is satisfied by there being exactly one.
 *
 * 🔴 WHICH MAKES THE CHECK STRICTER, NOT LOOSER. "Confined to a region" permitted these to exist;
 * "absent" does not. The realistic regression is someone reintroducing a stage renderer because a
 * single state needs a special screen, and the composer silently acquires a rival.
 */
const ANSWER_SURFACES = ["<CanvasRecall", "<CanvasTest", "<CanvasDiagnosis", "<CanvasComplete"];

test("🔴 no answer-collecting stage renders on the canvas at all", async () => {
  const source = await SOURCE;

  for (const stage of ANSWER_SURFACES) {
    assert.ok(
      !source.includes(stage),
      `${stage} is back — it would paint beside a hosted task and both would claim the composer. A task composes on top of reading material now; it does not get its own page.`,
    );
  }

  // And the region that used to confine them must not return either: reintroducing it is how the
  // stages would come back one at a time, each looking locally reasonable.
  assert.ok(
    !source.includes("{regions.stages && ("),
    "the evidence-stage region is back — there is nothing left that legitimately needs it",
  );

  // 🔴 The pre-content renderer is NOT an answer surface and must survive all of this. It was filed
  // inside the deleted `canvas-stages.tsx` and came within one commit of going with it, which would
  // have painted nothing for every user who has added no material yet.
  assert.ok(source.includes("<CanvasEmpty"), "CanvasEmpty stopped rendering — an empty canvas now paints nothing");
});

test("🔴 the region rule is DERIVED, never re-decided in the component", async () => {
  // What replaces "one branch as high as it goes". `composeSurface` guarantees `regions.stages` and
  // `regions.policy` are never both true; that guarantee is worth nothing unless the component asks
  // it rather than recomputing the condition inline. An inline `canvas.state === "recall" &&
  // !policy.task` would drift from the module on the first edit, and the drift is invisible —
  // both versions look correct read on their own.
  const source = await SOURCE;
  assert.match(source, /composeSurface\(\{/, "the component no longer derives its regions");
  assert.match(source, /answerSink\(\{/, "the component no longer derives its answer route");
  // 🔴 And the whole-page flag must not come back under any name. This is the specific regression
  // the migration is most likely to suffer: someone reintroduces a single boolean because one
  // branch is easier to reason about, and the document disappears again.
  assert.equal(
    /const policyOwns\s*=/.test(source),
    false,
    "whole-page ownership is back — 7b replaced it with composition",
  );
});

test("🔴 a task sharing the surface does not push the document off it", async () => {
  // The way this migration ships hollow. `composeSurface` can say `document: true, policy: true`
  // and every structural test passes — while the policy's region still claims `min-h-full`, the
  // document starts one full viewport below the fold, and the learner sees exactly what they saw
  // before: one thing. "Coexisting" would be true of the DOM and false of the experience.
  const source = await SOURCE;
  assert.match(
    source,
    /<CanvasPolicyView runtime=\{policy\} sharing=\{regions\.sharing\} \/>/,
    "the policy's region is not told whether it is sharing the surface",
  );
  const view = await readFile(new URL("./canvas-policy-view.tsx", import.meta.url), "utf8");
  // 🔴 NO UNCONDITIONAL FULL-HEIGHT CLAIM ANYWHERE IN THE REGION. Calibrated by reverting
  // `regionHeight` to a bare "min-h-full pb-40": that goes red here while leaving all 2,271 other
  // tests green, which is precisely the blind spot being covered.
  assert.match(view, /function regionHeight/, "the region no longer decides its own height");
  assert.equal(
    /className="flex min-h-full/.test(view),
    false,
    "a hard-coded full-height region would bury the document below the fold",
  );
});

test("🔴 a canvas whose knowledge is still resolving paints NEITHER runtime", async () => {
  // Defaulting to "not the policy" while the round trip is in flight does not merely flicker: the
  // stage machine's own effects run, and it starts generating a lesson for a canvas the policy is
  // about to contribute to.
  const source = await SOURCE;
  const guard = source.indexOf('policy.status === "loading"');
  assert.notEqual(guard, -1, "the loading state is no longer waited for");
  // 🔴 RE-POINTED FROM THE DELETED BRANCH TO THE COMPOSITION THAT REPLACED IT. The property is
  // identical — nothing may render before the wait — and `composeSurface` is now the first thing
  // that decides what renders, so it is the correct landmark.
  assert.ok(
    guard < source.indexOf("composeSurface({"),
    "the wait must come before anything renders",
  );
});

// ── the fast-retrieval presentation ────────────────────────────────────────

test("🔴 the retrieval screen carries the question and NOTHING else", async () => {
  // An associative fact is answered in about a second, so anything else on the page is read BEFORE
  // the answer is produced and costs the very thing being measured. Every addition here arrives
  // reasonable — a hint, a counter, a "1 of 4", a skip button — and each one is another thing to
  // read first. The rule is easier to hold than to relitigate: this branch renders one heading.
  const source = await readFile(new URL("./canvas-policy-view.tsx", import.meta.url), "utf8");
  const from = source.indexOf('decision.action.type === "retrieve"');
  const to = source.indexOf("if (decision.action.type ===", from + 10);
  assert.ok(from !== -1 && to > from, "the retrieve branch moved");
  const branch = source.slice(from, to);

  for (const forbidden of ["<button", "<p ", "<ul", "<li", "<span"]) {
    assert.equal(branch.includes(forbidden), false, `the retrieval screen grew a ${forbidden}`);
  }
  assert.match(branch, /text-center/, "the question must be centred, not a left-aligned document section");
});

test("🔴 removing the 'I don't know' CONTROL did not remove the meaning", async () => {
  // The button wrote evidence saying no demonstration was obtained. If its removal left a typed
  // admission to reach the evaluator, the verdict would come back `incorrect` and "we still do not
  // know" would be stored as "they got it wrong" — absence of evidence as negative evidence.
  const runtime = await readFile(new URL("./use-policy-runtime.ts", import.meta.url), "utf8");
  assert.match(runtime, /isAdmissionOfNotKnowing/, "a typed admission is no longer routed anywhere");
  const submitAt = runtime.indexOf("const submit = useCallback");
  const judgeAt = runtime.indexOf("evaluateLearningResponse(", submitAt);
  const admissionAt = runtime.indexOf("isAdmissionOfNotKnowing", submitAt);
  assert.ok(admissionAt !== -1 && admissionAt < judgeAt, "the admission check must come BEFORE the judge");
});

test("the session composer drops the attach control but keeps answering", async () => {
  const composer = await readFile(new URL("./canvas-composer.tsx", import.meta.url), "utf8");
  assert.match(composer, /\{!inSession && \(/, "the attach control is no longer conditional");
  // 🔴 The mic and submit are NOT conditional — dropping them would remove ways to answer, which is
  // the opposite of the point.
  assert.match(composer, /aria-label=\{answering \? "Answer out loud" : "Dictate"\}/);
  assert.match(composer, /aria-label=\{answering \? "Submit answer" : "Send"\}/);
  // A permanently painted scrollbar track inside a one-line control.
  assert.match(composer, /overflow-hidden/);
});

test("🔴 the composer has exactly ONE answer route, and it comes from the sink", async () => {
  // A second answer box for the policy would be the one thing the composer's own header says it
  // exists to prevent. Step 7b adds a sharper failure than a second box: the SAME box wired to two
  // receivers. Before composition `task={policyOwns ? policyTask : session.activeTask}` was safe
  // because ownership was all-or-nothing; once a task can sit beside a document, that ternary can
  // hand an answer typed at a recall card to the policy's prompt id.
  const source = await SOURCE;
  assert.match(source, /task=\{sink\.kind === "none" \? null : sink\.task\}/, "the task is not the sink's");
  assert.match(source, /sink\.kind === "policy"\s*\n?\s*\? \(text, via, tookMs\) => void policy\.submit/);
  assert.match(source, /policy\.submit\(text, via, tookMs\)/);

  // 🔴 THE COMPOSER IS RENDERED ONCE. Two <CanvasComposer> sites — one per runtime — would give the
  // page two answer boxes again while every assertion above still passed.
  const composers = source.split("<CanvasComposer").length - 1;
  assert.equal(composers, 1, "there is more than one composer on the canvas");
});
