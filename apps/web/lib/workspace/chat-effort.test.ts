import assert from "node:assert/strict";
import { test } from "node:test";

import { applyChatEffort, isChatEffort, toolsAllowed } from "./chat-effort";
import { DEFAULT_INTENT, type ChatIntent } from "./chat-intent";
import { decisionFromIntent } from "./chat-routing";

// The phrases these tests used to be written against ("write a research report with citations",
// "make me flashcards on beta blockers") are now read by a model, so they are exercised in
// `scripts/chat-intent-acceptance.mts`. What the dial does to a decision is still pure code, and
// these still pin it — stated as the decision each phrase produces.
const decide = (over: Partial<ChatIntent>) => decisionFromIntent({ ...DEFAULT_INTENT, ...over });

test("instant forces the fast non-thinking model and drops high effort", () => {
  const research = decide({ mode: "research", needsWeb: true });
  assert.equal(research.reasoningEffort, "high");
  const instant = applyChatEffort(research, "instant");
  assert.equal(instant.model, "deepseek-chat");
  assert.equal(instant.reasoningEffort, undefined);
});

test("medium leaves the route's model alone but drops its automatic high effort", () => {
  const research = decide({ mode: "research", needsWeb: true });
  const medium = applyChatEffort(research, "medium");
  assert.equal(medium.model, research.model);
  assert.equal(medium.reasoningEffort, undefined);
});

test("high adds the effort flag without changing the route's model", () => {
  const learning = decide({ mode: "learning" });
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
  const save = decide({ mode: "learning", workspace: "write" });
  const high = applyChatEffort(save, "high");
  assert.equal(high.reasoningEffort, undefined);
  assert.equal(high.model, "deepseek-chat");
  assert.equal(toolsAllowed(high), true);
});

test("web search survives every effort level", () => {
  const current = decide({ mode: "current", needsWeb: true });
  assert.equal(current.searchWeb, true);
  for (const effort of ["instant", "medium", "high"] as const) {
    assert.equal(applyChatEffort(current, effort).searchWeb, true, `${effort} dropped web search`);
  }
});

test("tools ride instant turns but never reasoner or high-effort turns", () => {
  // A NON-save prompt for the high case: a save now keeps its tools at High on
  // purpose (see the test above), so asserting it here would pin the old bug.
  const chatty = decide({});
  assert.equal(toolsAllowed(applyChatEffort(chatty, "instant")), true);
  assert.equal(toolsAllowed(applyChatEffort(chatty, "high")), false);
  assert.equal(toolsAllowed(applyChatEffort(decide({ mode: "learning" }), "medium")), false);
});

// The regression this batch fixes: a save request phrased like a lesson used to
// route to the reasoner (LEARNING_PATTERN matches "flashcards"/"quiz"), which
// stripped its tools, so the save never ran. These must keep tools at EVERY
// effort level — see the High case above for why that now includes High.
test("a workspace turn keeps its tools at every effort, whatever mode it is in", () => {
  for (const mode of ["conversation", "learning", "current", "research"] as const) {
    for (const workspace of ["read", "write"] as const) {
      for (const effort of ["instant", "medium", "high"] as const) {
        const decision = applyChatEffort(decide({ mode, workspace }), effort);
        assert.equal(toolsAllowed(decision), true, `${mode}/${workspace} @ ${effort}`);
      }
    }
  }
});

test("effort values are validated before use", () => {
  assert.equal(isChatEffort("instant"), true);
  assert.equal(isChatEffort("highest"), false);
  assert.equal(isChatEffort(null), false);
});
