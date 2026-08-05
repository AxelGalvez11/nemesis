import assert from "node:assert/strict";
import test from "node:test";

import { applyChatEffort, toolsAllowed } from "./chat-effort";
import { classifyChatRequest } from "./chat-routing";
import { detectsWorkspaceIntent } from "./workspace-intent";

// ── The acceptance cases (owner 2026-08-05, verbatim) ───────────────────────
// These are the exact phrasings that used to LOSE their workspace tools to
// the current-events word list ("today", "schedule", "update", "recent") and
// come back as "I cannot see your calendar". Each must classify as workspace
// intent, ride the tools-capable model, and survive the High effort dial.

const MUST_KEEP_TOOLS = [
  "organize my schedule",
  "Help me organize my schedule.",
  "what do I have today?",
  "update my pharmacology notes",
  "show me recent lectures",
  "clean up my study material",
  "what's on my schedule today",
  // "give me an update on my calendar" reads as a SAVE ("...on my calendar" is
  // the save anchor) — either flag is fine, because both guarantee the tools.
  "give me an update on my calendar",
  "Show me everything this semester.",
  "Clean up my Library.",
  "Move this deck into Pharmacology.",
  "Where are my hypertension notes?",
  "Do I have anything due next week?",
  "Which lectures haven't I studied yet?",
  "Organize everything I uploaded today.",
];

test("🔴 workspace questions never lose their tools — not to news words, not to the effort dial", () => {
  for (const prompt of MUST_KEEP_TOOLS) {
    const decision = classifyChatRequest(prompt);
    assert.equal(decision.model, "deepseek-chat", `wrong model: ${prompt}`);
    assert.equal(
      decision.workspaceIntent === true || decision.savesToWorkspace === true,
      true,
      `neither workspace flag set: ${prompt}`,
    );
    assert.equal(toolsAllowed(decision), true, `tools stripped: ${prompt}`);
    // The stored High preference must not silently blind a workspace turn.
    assert.equal(toolsAllowed(applyChatEffort(decision, "high")), true, `High dial stripped tools: ${prompt}`);
  }
});

test("an explicit research ask keeps the research pipeline, workspace words or not", () => {
  const decision = classifyChatRequest("Write a literature review with peer-reviewed sources about urban heat islands");
  assert.equal(decision.route, "research");
  assert.equal(decision.workspaceIntent, undefined);
});

test("workspace reads never buy a web search unless the web was asked for", () => {
  for (const prompt of ["what's on my schedule today", "what do I have today?", "organize my schedule"]) {
    assert.equal(classifyChatRequest(prompt).searchWeb, false, prompt);
  }
  // An explicit web ask keeps it — deepseek-chat can search AND hold tools.
  const explicit = classifyChatRequest("search the web for my university's exam schedule policy");
  assert.equal(explicit.searchWeb, true);
  assert.equal(explicit.model, "deepseek-chat");
});

test("a save still outranks the workspace read — it carries the stronger instruction", () => {
  const decision = classifyChatRequest("add my exam to my calendar for Oct 14");
  assert.equal(decision.savesToWorkspace, true);
  assert.equal(decision.workspaceIntent, undefined);
  assert.equal(decision.model, "deepseek-chat");
});

// ── What must NOT fire ──────────────────────────────────────────────────────
// Subject matter is never a workspace signal: "my immune system" belongs to
// no product page, and the news words keep meaning news when they are news.

test("learning and news questions keep their original routes", () => {
  for (const prompt of [
    "explain the Krebs cycle",
    "how does the Mayan calendar work",
    "what's the latest news",
    "who won the game today",
    "what's the weather tomorrow",
    "write a test for this function",
    "review the causes of the French Revolution",
    "explain how my immune system fights infection",
    "check my answer to problem 3",
  ]) {
    assert.equal(detectsWorkspaceIntent(prompt), false, `false positive: ${prompt}`);
  }
  // And the news route still exists at all — the fix must not eat it.
  assert.equal(classifyChatRequest("who won the game today").route, "current");
  assert.equal(classifyChatRequest("what's the latest news").model, "deepseek-reasoner");
});
