import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { answerSink } from "./canvas-hosting";

// 🔴🔴🔴 EVERY TYPED ANSWER ON A DOCUMENT-STARTED CANVAS WAS THROWN AWAY.
//
// `canvas.state` stays `sources_attached` after material is attached, and nothing advances it when
// the policy runtime stages a question. `preContent` was `state === "empty" || state ===
// "sources_attached"`, so it stayed TRUE with a real question on screen, `onStart` was still handed
// to the composer, and the composer routes starting ABOVE answering:
//
//     if (onStart) onStart(value);
//     else if (answering) onAnswer(...);
//     else onAsk(value);
//
// So the learner read a question, typed an answer, pressed a button labelled `Submit answer`, and
// the text went to `begin()`. A model call, a re-titled canvas, a different question, and no
// evidence row — with no error, because nothing failed.
//
// 🔴 MEASURED IN A REAL BROWSER, NOT REASONED: eight attempts, zero rows, `learner_evidence` seeing
// only a GET and never a POST, and production holding ZERO `typed` rows across fourteen days.
// Handwriting was unaffected, because the writing sheet submits by its own path — which is exactly
// why this survived: the one modality that worked was the one nobody suspected.
//
// 🔴 AND IT BLOCKED MORE THAN TYPING. `recognitionPreferred` needs two consecutive unresolved
// UNAIDED attempts, read out of `learner_evidence`. Attempts that never record cannot accumulate,
// so multiple choice could never be offered to anyone, ever.

const REGIONS_WITH_POLICY = { policy: true, stages: false } as never;
const hosted = { task: { id: "t1" } } as never;

/** The predicate as `learning-canvas.tsx` computes it. */
const preContent = (state: string, sinkKind: string) =>
  (state === "empty" || state === "sources_attached") && sinkKind === "none";

test("🔴 a canvas that is ASKING is not pre-content, whatever its stored state says", () => {
  // The defect, exactly. Before the fix this was `true` and the answer went to `begin()`.
  const sink = answerSink({ hosted, regions: REGIONS_WITH_POLICY, stageTask: null });
  assert.equal(sink.kind, "policy", "a hosted task in the policy region IS an answer surface");
  assert.equal(
    preContent("sources_attached", sink.kind),
    false,
    "a question is on screen — a submission here is an ANSWER, not an instruction to start",
  );
});

test("🔴 the composer must therefore not be handed onStart while a question is staged", () => {
  // The wiring, which is the half a predicate test cannot see. `onStart={preContent ? … : null}`.
  const source = readFileSync(new URL("../../components/workspace/learn/learning-canvas.tsx", import.meta.url), "utf8");
  const line = source.split("\n").find((l) => l.includes("const preContent ="));
  assert.ok(line, "preContent must still be computed in one place");
  assert.match(
    line,
    /sink\.kind === "none"/,
    "preContent must consult the answer sink, or the routing bug returns exactly as it was",
  );
  assert.match(source, /onStart=\{preContent \? /, "onStart must stay gated on preContent");
});

// ── what must NOT have changed ──────────────────────────────────────────────

test("🔴 a canvas with material and NO question still starts on send", () => {
  // §3: uploading without a prompt must work. An empty box is a real submission in exactly this
  // state, and narrowing `preContent` too far would silently remove that.
  const sink = answerSink({ hosted: null, regions: REGIONS_WITH_POLICY, stageTask: null });
  assert.equal(sink.kind, "none");
  assert.equal(preContent("sources_attached", sink.kind), true);
});

test("an untouched empty canvas is still pre-content", () => {
  assert.equal(preContent("empty", "none"), true);
});

test("🔴 a canvas that has genuinely moved on is not pre-content either", () => {
  // The original property, unchanged: once the canvas has content, a submission is a question or an
  // answer and must never be routed into `begin`, which re-titles and regenerates.
  assert.equal(preContent("teaching", "none"), false);
  assert.equal(preContent("teaching", "policy"), false);
});
