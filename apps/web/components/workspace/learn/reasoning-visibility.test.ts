// Two channels, shown two different ways, and the asymmetry is the design.
//
// 🔴🔴 Owner, 2026-08-21: *"show the plan and hide internal thoughts."* Those are not two views of
// one thing. A PLAN is a commitment the model can be held to and `turn-router.ts` refuses one that
// claims work the turn did not do. THOUGHTS are `reasoning_content` — guesses, contradictions and
// abandoned branches — genuinely useful for checking working and genuinely misleading printed as
// prose, because a branch the model talked itself out of reads exactly like a conclusion.
//
// What earns a place on screen unasked is the claim that can be checked. Everything below pins that
// split, in both directions.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const REASONING = readFileSync(new URL("./canvas-reasoning.tsx", import.meta.url), "utf8");
const CHAT = readFileSync(new URL("./canvas-chat.ts", import.meta.url), "utf8");
const SESSION = readFileSync(new URL("./use-canvas-session.ts", import.meta.url), "utf8");
const CANVAS = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
const STREAM = readFileSync(new URL("../../../lib/workspace/chat-stream.ts", import.meta.url), "utf8");
const API = readFileSync(new URL("../../../lib/workspace/chat-api.ts", import.meta.url), "utf8");

test("🔴 the thoughts are a separate channel from the answer, all the way down", () => {
  // The stream has always split them; what was missing was anything asking for the second one.
  assert.match(STREAM, /reasoning_content/);
  assert.match(STREAM, /onReasoning\?: CompletionDeltaHandler/);
  assert.match(API, /onReasoning\?: CompletionDeltaHandler/, "the transport still drops the working");
  assert.match(CHAT, /onReasoning:/, "the canvas turn no longer captures the working");
  // 🔴 AND NEVER MERGED. One accumulator each; a single one would put half-formed guesses into the
  // text a learner reads as fact.
  assert.ok(!/accumulated \+= delta\.reasoning_content/.test(STREAM), "the two channels were merged");
});

test("🔴 the working is collapsed by default, and labelled when opened", () => {
  assert.match(REASONING, /useState\(false\)/, "the disclosure opens by default");
  assert.match(REASONING, /Show thinking/);
  assert.match(REASONING, /Not its answer, and not checked/, "the working is presented as an answer");
});

// 🔴 A PROMISE IS ABOUT THE WAIT; WORKING IS ABOUT THE ANSWER. Showing the plan after the answer
// lands is noise — the learner can see what was done — and showing the working before it lands is
// a stream of guesses about an answer that does not exist yet.
test("🔴 the plan shows only while the turn runs, the working only after", () => {
  assert.match(REASONING, /const showPlan = working && Boolean\(plan\)/);
  assert.match(REASONING, /const showThinking = !working && thinking\.trim\(\)\.length > 0/);
  // Nothing renders when there is neither. No empty control, no placeholder.
  assert.match(REASONING, /if \(!showPlan && !showThinking\) return null;/);
});

// 🔴🔴 THE CAPTION SLOT BELONGS TO WORK THAT IS RUNNING, AND THE PLAN COMES LAST IN IT.
// `thinking-phases.ts` allows only the name of a genuinely executing step there. A plan is a claim
// about work TO COME, so it may fill the slot when nothing truer is available and must never
// displace a search that is actually in flight.
test("🔴 a real step outranks a stated intention in the caption", () => {
  assert.match(CANVAS, /busy\.kind !== null \? busy\.label : policy\.phase \? THINKING_COPY\[policy\.phase\] : session\.plan/);
});

// 🔴 THE TIMING IS THE WHOLE REASON THE PLAN IS A CALLBACK. `plan` also rides home on the decision,
// and that arrives WITH the answer — too late for a line whose job is to be read during the wait.
test("🔴 the plan is reported when it is stated, not when the turn returns", () => {
  assert.match(CHAT, /onPlan\?\.\(read\?\.plan \?\? null\)/);
  assert.match(SESSION, /setPlan\(plan\)/);
  assert.match(SESSION, /setPlan\(null\)/, "the plan outlives its turn");
});

// 🔴 THE WORKING HANGS OFF THE ASIDE, WHICH IS WHAT STOPS IT OUTLIVING ITS ANSWER. Kept in its own
// state it would still be on screen under the NEXT reply — one turn's reasoning attributed to
// another, the same class of mistake as resolving a citation against the wrong list.
test("🔴 the working cannot be shown beside an answer it did not produce", () => {
  assert.match(SESSION, /thinking\?: string;/, "the aside no longer carries the working");
  assert.match(SESSION, /thinking: result\.thinking/);
  assert.match(CANVAS, /thinking=\{session\.aside\?\.thinking \?\? ""\}/);
});

// 🔴🔴 AND THE HONEST LIMIT, RECORDED RATHER THAN LEFT TO BE DISCOVERED. The conversational turn
// runs on `deepseek-chat`, which emits no `reasoning_content` at all — the reasoner is reached only
// by `canvas-api.ts`'s RESCUE call after a parse fails. So the capture is correct and the control
// is dormant on this path today. It renders nothing rather than an empty box, and switching it on
// means routing replies through a slower, dearer model, which is the owner's call.
test("🔴 the dormancy is written down where the next reader will find it", () => {
  assert.match(CHAT, /deepseek-chat.*does not emit `reasoning_content`/s);
  assert.match(CHAT, /model: "deepseek-chat"/, "the reply route changed without this note moving");
});
