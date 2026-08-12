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
 * The renderers that COLLECT AN ANSWER, or report on answers already collected.
 *
 * 🔴 THIS LIST SHRANK AT STEP 7b, AND THE SHRINKAGE IS THE FEATURE — read the reasons before
 * concluding it eroded. It used to hold every six-stage renderer, because whole-page ownership
 * meant exactly one thing could paint at all. Composition allows READING MATERIAL beside a hosted
 * task; it still forbids a second ANSWER SURFACE. Three renderers left the list, each for a stated
 * reason:
 *
 *   <CanvasDocument   — reading material. Collects nothing, writes no evidence. A document beside a
 *                       question is the entire point of 7b (docs/canvas-task-hosting.md §3).
 *   <CanvasEmpty      — a pre-content state: no document and no answer exists yet.
 *   <SourcesAttached  — a pre-content state, same reason.
 *
 * Everything below owns an answer and writes evidence through `session`, so none may paint while
 * the policy is contributing: two answer surfaces on one composer means one of them silently loses
 * the learner's work, or the policy's prompt id receives an answer typed at a recall card.
 */
const ANSWER_SURFACES = ["<CanvasRecall", "<CanvasTest", "<CanvasDiagnosis", "<CanvasComplete"];

test("🔴 every answer-collecting stage renders INSIDE the evidence-stage region", async () => {
  const source = await SOURCE;
  const opens = source.indexOf("{regions.stages && (");
  assert.notEqual(opens, -1, "the evidence-stage region is gone");
  const closes = source.indexOf("</>\n        )}", opens);
  assert.notEqual(closes, -1, "the evidence-stage region's close is gone");

  for (const stage of ANSWER_SURFACES) {
    // 🔴 EVERY OCCURRENCE, NOT THE FIRST ONE. Checking only the first is a guard that cannot see
    // the defect it is for: the realistic regression ADDS a second render site outside the region
    // — `{canvas.state === "recall" && <CanvasRecall …>}` as a sibling — and leaves the original in
    // place. This was calibrated with exactly that edit, and the first-occurrence version stayed
    // green through it.
    const sites: number[] = [];
    for (let at = source.indexOf(stage); at !== -1; at = source.indexOf(stage, at + 1)) sites.push(at);
    assert.notEqual(sites.length, 0, `${stage} is no longer rendered at all`);
    for (const at of sites) {
      assert.ok(
        at > opens && at < closes,
        `${stage} renders outside the evidence-stage region — it could paint beside a hosted task, and both would claim the composer`,
      );
    }
  }
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
    /<CanvasPolicyView runtime=\{policy\} sharing=\{regions\.document\} \/>/,
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
