import assert from "node:assert/strict";
import { test } from "node:test";

import { applyChatEffort, isChatEffort, toolsAllowed } from "./chat-effort";
import { classifyChatRequest } from "./chat-routing";

test("instant forces the fast non-thinking model and drops high effort", () => {
  const research = classifyChatRequest("write a research report with citations");
  assert.equal(research.reasoningEffort, "high");
  const instant = applyChatEffort(research, "instant");
  assert.equal(instant.model, "deepseek-chat");
  assert.equal(instant.reasoningEffort, undefined);
});

test("medium leaves the route's model alone but drops its automatic high effort", () => {
  const research = classifyChatRequest("write a research report with citations");
  const medium = applyChatEffort(research, "medium");
  assert.equal(medium.model, research.model);
  assert.equal(medium.reasoningEffort, undefined);
});

test("high adds the effort flag without changing the route's model", () => {
  const learning = classifyChatRequest("explain how beta blockers work");
  const high = applyChatEffort(learning, "high");
  assert.equal(high.model, learning.model);
  assert.equal(high.reasoningEffort, "high");
});

// CHANGED 2026-07-24, and this used to assert the opposite. Saving at High was
// recorded below as "a known limitation": the dial set reasoningEffort, that
// stripped the tools, and the save came back as prose having written nothing. But
// the dial is a STORED preference that persists across sessions, so a student who
// picked High once got a chat that silently stopped saving — with nothing on screen
// to explain it. A limitation the user cannot see is a bug. The specific, fresher
// instruction ("make me flashcards") now beats the standing one.
test("high keeps its tools on a save, because the alternative is saving nothing", () => {
  const save = classifyChatRequest("make me flashcards on beta blockers");
  const high = applyChatEffort(save, "high");
  assert.equal(high.reasoningEffort, undefined);
  assert.equal(high.model, "deepseek-chat");
  assert.equal(toolsAllowed(high), true);
});

test("web search survives every effort level", () => {
  const current = classifyChatRequest("what is the latest news on this?");
  assert.equal(current.searchWeb, true);
  for (const effort of ["instant", "medium", "high"] as const) {
    assert.equal(applyChatEffort(current, effort).searchWeb, true, `${effort} dropped web search`);
  }
});

// 🔴 THIS TEST USED TO ASSERT THE OPPOSITE, and the assertion was the bug.
// It read "tools ride instant turns but never reasoner or high-effort turns",
// and it passed for as long as it existed — pinning a restriction that was
// only ever true because our own stream dropped `reasoning_content` and could
// not echo it back on a tool round. The reasoner has always supported tool
// calls; we were not sending the field.
//
// The cost was precise and exactly inverted: the deepest routes — a hard
// question, or a student who deliberately turned the effort dial up — were the
// only ones that could not open their own Library, read their calendar, or
// search the web. Turning the dial to High made Nemesis less able to look
// anything up.
test("every route keeps its tools, including the reasoner and High effort", () => {
  const chatty = classifyChatRequest("hello");
  const thinking = classifyChatRequest("explain osmosis");
  assert.equal(thinking.model, "deepseek-reasoner", "the premise of this test: that route does think");
  for (const effort of ["instant", "medium", "high"] as const) {
    assert.equal(toolsAllowed(applyChatEffort(chatty, effort)), true, `chat turn at ${effort}`);
    assert.equal(toolsAllowed(applyChatEffort(thinking, effort)), true, `reasoner turn at ${effort}`);
  }
});

// The regression this batch fixes: a save request phrased like a lesson used to
// route to the reasoner (LEARNING_PATTERN matches "flashcards"/"quiz"), which
// stripped its tools, so the save never ran. These must keep tools at EVERY
// effort level — see the High case above for why that now includes High.
test("save requests keep their tools at the default effort", () => {
  for (const prompt of [
    "make me flashcards on beta blockers",
    "create a deck for pharmacology and add ten cards",
    "generate a practice test on ACE inhibitors",
    "build a mind map of the RAAS pathway",
    "add these to my deck",
  ]) {
    for (const effort of ["instant", "medium", "high"] as const) {
      const decision = applyChatEffort(classifyChatRequest(prompt), effort);
      assert.equal(toolsAllowed(decision), true, `${prompt} @ ${effort}`);
    }
  }
});

test("effort values are validated before use", () => {
  assert.equal(isChatEffort("instant"), true);
  assert.equal(isChatEffort("highest"), false);
  assert.equal(isChatEffort(null), false);
});
