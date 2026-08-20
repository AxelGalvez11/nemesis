import assert from "node:assert/strict";

import { buildWireMessages } from "./chat-api";
import { applyChatEffort, toolsAllowed } from "./chat-effort";
import { DEFAULT_INTENT, type ChatIntent } from "./chat-intent";
import {
  ATTACHMENT_ONLY_DECISION,
  attachmentNames,
  decisionFromIntent,
  promptWithoutAttachments,
  routeInstruction,
  SAVE_INSTRUCTION,
  WORKSPACE_INSTRUCTION,
} from "./chat-routing";

// 🔴 WHAT THIS FILE STOPPED TESTING, AND WHERE THAT COVERAGE WENT.
//
// It used to assert that "make me flashcards on beta blockers" classified as a save, that "create a
// test on brand generic of top 100 drugs" did too, that "help me prepare for my test" did not, and
// about sixty more phrasings besides. Every one of those came from a real student hitting a real
// bug, and they were worth pinning — but they were pinning a REGEX, and the regex is gone. A
// phrasing test against a model is not a unit test: it needs the model, it costs money, and it can
// legitimately disagree.
//
// So the phrasings moved to `scripts/chat-intent-acceptance.mts`, which runs them against the live
// model and reports what it decides. Run it with `pnpm --filter @nemesis/web chat-intent`. What
// stays here is the half that is genuinely deterministic: given a decision, what does this turn do?
// That is where every one of those incidents actually landed — a save that lost its tools, a
// calendar read promoted onto a model that cannot carry them.

const intent = (over: Partial<ChatIntent>): ChatIntent => ({ ...DEFAULT_INTENT, ...over });

// ── the tools rule, which is the whole reason those incidents happened ───────
// A turn that touches the student's own data MUST ride deepseek-chat: our stream does not retain
// the reasoning content a thinking model has to echo back on a tool round, so a reasoner turn has
// no tools at all. Asserted at every mode, including the two that would otherwise take the
// reasoner, because "make me flashcards about the latest COVID variants" is exactly that shape.
for (const mode of ["conversation", "learning", "current", "research"] as const) {
  for (const workspace of ["read", "write"] as const) {
    const decision = decisionFromIntent(intent({ mode, workspace }));
    assert.equal(decision.model, "deepseek-chat", `${mode}/${workspace}`);
    assert.equal(decision.reasoningEffort, undefined, `${mode}/${workspace}`);
    assert.equal(toolsAllowed(decision), true, `${mode}/${workspace}`);
    // And the dial cannot take them back off — the "High effort saved nothing" bug.
    for (const effort of ["instant", "medium", "high"] as const) {
      assert.equal(toolsAllowed(applyChatEffort(decision, effort)), true, `${mode}/${workspace} @ ${effort}`);
    }
  }
}

// The two flags are load-bearing further down the pipeline, not labels: savesToWorkspace is what
// applyChatEffort reads to keep the tools, and workspaceIntent is what fetches the snapshot.
assert.equal(decisionFromIntent(intent({ workspace: "write" })).savesToWorkspace, true);
assert.equal(decisionFromIntent(intent({ workspace: "write" })).workspaceIntent, undefined);
assert.equal(decisionFromIntent(intent({ workspace: "read" })).workspaceIntent, true);
assert.equal(decisionFromIntent(intent({ workspace: "read" })).savesToWorkspace, undefined);
assert.equal(decisionFromIntent(DEFAULT_INTENT).savesToWorkspace, undefined);
assert.equal(decisionFromIntent(DEFAULT_INTENT).workspaceIntent, undefined);

// ── the thinking model goes where thinking helps ─────────────────────────────
for (const mode of ["learning", "current", "research"] as const) {
  assert.equal(decisionFromIntent(intent({ mode })).model, "deepseek-reasoner", mode);
}
assert.equal(decisionFromIntent(intent({ mode: "conversation" })).model, "deepseek-chat");

// Research is the one route that spends high effort by default — and never when it would strip
// tools back off a turn that needs them.
assert.equal(decisionFromIntent(intent({ mode: "research" })).reasoningEffort, "high");
assert.equal(decisionFromIntent(intent({ mode: "research", workspace: "read" })).reasoningEffort, undefined);

// ── web ──────────────────────────────────────────────────────────────────────
// A conversational turn that needs the web becomes a current-events turn, so the route instruction
// it carries actually mentions the live results it is about to be given.
{
  const decision = decisionFromIntent(intent({ needsWeb: true, webQuery: "EU AI Act status 2026" }));
  assert.equal(decision.route, "current");
  assert.equal(decision.searchWeb, true);
  assert.equal(decision.webQuery, "EU AI Act status 2026");
}
// A mode the model named for itself is kept — a research turn stays research.
assert.equal(decisionFromIntent(intent({ mode: "research", needsWeb: true })).route, "research");
// No search, no query: a query without a search is a contradiction, and the expensive half loses.
assert.equal(decisionFromIntent(intent({ webQuery: "anything" })).webQuery, undefined);

// ── the instructions a turn carries ──────────────────────────────────────────
assert.match(routeInstruction("learning"), /learner's level/);
assert.match(routeInstruction("research"), /limitations/);
assert.doesNotMatch(routeInstruction("current"), /teach|quiz|lesson/i);

// Routing correctly only buys the tools; it does not make the model reach for them. Without this
// line a model handed a tool and a blank page writes the test out in prose, which is exactly what
// the student reported (owner 2026-07-28).
{
  const save = decisionFromIntent(intent({ mode: "learning", workspace: "write" }));
  const saveTurn = buildWireMessages([], "create a test on the krebs cycle", save);
  assert.ok(saveTurn[0]?.content.includes(SAVE_INSTRUCTION), "a save turn carries the save instruction");
  // Still there on the High dial, which keeps a save's tools and must therefore keep its orders.
  const high = applyChatEffort(save, "high");
  assert.equal(toolsAllowed(high), true, "High must not strip a save's tools");
  assert.ok(buildWireMessages([], "create a test on the krebs cycle", high)[0]?.content.includes(SAVE_INSTRUCTION));

  const read = decisionFromIntent(intent({ workspace: "read" }));
  assert.ok(buildWireMessages([], "what's due this week", read)[0]?.content.includes(WORKSPACE_INSTRUCTION));

  const plain = buildWireMessages([], "explain how beta blockers lower blood pressure");
  assert.ok(!plain[0]?.content.includes(SAVE_INSTRUCTION), "an ordinary question does not");
  assert.ok(!plain[0]?.content.includes(WORKSPACE_INSTRUCTION), "nor does it claim to be about their workspace");
}

// ── what the intent call is allowed to read ──────────────────────────────────
// The regression raising the attachment budget amplified: a lecture slide citing a recent year
// tripped the web matcher, buying a paid search on every upload. The matcher is gone, but the split
// still matters — the model deciding what a turn IS must read what the student typed, not forty
// pages of somebody else's slides.
{
  const wireText = "summarise this\n\n### Attachment: week3.pptx\nType: application/pptx\n\nAdapted from Smith et al., 2024. Updated guidance.";
  assert.equal(promptWithoutAttachments(wireText), "summarise this");
  assert.deepEqual(attachmentNames(wireText), ["week3.pptx"]);
}
// Files attached with NOTHING typed — the commonest case. prepareChatAttachments trims the wire
// text, so the header STARTS the string and there is no leading blank line to match on. A fixture
// with an imaginary blank line is what let an earlier fix pass its test and do nothing on screen.
{
  const wireText = `${"".trim()}\n\n### Attachment: week3.pptx\nType: application/pptx\n\nAdapted from Smith et al., 2024.`.trim();
  assert.ok(wireText.startsWith("### Attachment: "), "the real shape has no leading blank line");
  assert.equal(promptWithoutAttachments(wireText), "");
  assert.deepEqual(attachmentNames(wireText), ["week3.pptx"]);
}
assert.equal(promptWithoutAttachments("what is the latest guidance"), "what is the latest guidance");
assert.deepEqual(attachmentNames("no files here"), []);
assert.deepEqual(
  attachmentNames("read these\n\n### Attachment: a.pdf\nx\n\n### Attachment: b.pptx\ny"),
  ["a.pdf", "b.pptx"],
);

// A bare upload is a learning turn on the model that reads a lecture well, and never a web turn:
// the only text that could have asked for a search is the file itself.
assert.equal(ATTACHMENT_ONLY_DECISION.searchWeb, false);
assert.equal(ATTACHMENT_ONLY_DECISION.route, "learning");

console.log("chat-routing.test.ts OK");
