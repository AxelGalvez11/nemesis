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

test("web search survives every effort level", () => {
  const current = classifyChatRequest("what is the latest news on this?");
  assert.equal(current.searchWeb, true);
  for (const effort of ["instant", "medium", "high"] as const) {
    assert.equal(applyChatEffort(current, effort).searchWeb, true, `${effort} dropped web search`);
  }
});

test("tools ride instant turns but never reasoner or high-effort turns", () => {
  const chatty = classifyChatRequest("add these to my deck");
  assert.equal(toolsAllowed(applyChatEffort(chatty, "instant")), true);
  assert.equal(toolsAllowed(applyChatEffort(chatty, "high")), false);
  assert.equal(toolsAllowed(applyChatEffort(classifyChatRequest("explain osmosis"), "medium")), false);
});

// The regression this batch fixes: a save request phrased like a lesson used to
// route to the reasoner (LEARNING_PATTERN matches "flashcards"/"quiz"), which
// stripped its tools, so the save never ran. At the DEFAULT effort these must
// now keep tools. (High effort is still a deliberate "think hard, no tools"
// mode — see the assertion above — so saving at High is a known limitation.)
test("save requests keep their tools at the default effort", () => {
  for (const prompt of [
    "make me flashcards on beta blockers",
    "create a deck for pharmacology and add ten cards",
    "generate a practice test on ACE inhibitors",
    "build a mind map of the RAAS pathway",
    "add these to my deck",
  ]) {
    const decision = applyChatEffort(classifyChatRequest(prompt), "medium");
    assert.equal(toolsAllowed(decision), true, prompt);
  }
});

test("effort values are validated before use", () => {
  assert.equal(isChatEffort("instant"), true);
  assert.equal(isChatEffort("highest"), false);
  assert.equal(isChatEffort(null), false);
});
