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

// ── The production acceptance prompts, verbatim ─────────────────────────────
// Owner 2026-08-05, after the pass failed: "Pin all ten production acceptance
// prompts verbatim as routing tests. Do not only test paraphrases." Copied
// character for character from the owner's own numbered list.
//
// 🔴 NINE, not ten, and the gap is deliberate rather than an omission. The
// owner's test 9 was an UPLOAD ("one clearly classifiable upload → course; one
// ambiguous upload → Inbox"), which never passes through routing at all — there
// is no message to classify. Substituting a plausible sentence for it would be
// exactly the paraphrase the instruction forbids, so it is named here and
// checked where it actually lives: chat-attachments.test.ts and
// course-filing.test.ts for the filing decision, plus the production pass for
// the upload itself.

export const ACCEPTANCE_PROMPTS = [
  "Help me organize my schedule.",
  "What do I have today?",
  "Show me everything this semester.",
  "Check my calendar for duplicates or conflicting exam dates.",
  "Show me how my Library is organized.",
  "Clean up my Library.",
  "Show me what I need to study.",
  "Move this deck into Pharmacology.",
  // (9) upload — no prompt; see the note above.
  "Organize everything for Pharmacology, make sure my calendar is accurate, and tell me what I should study next.",
];

test("🔴 every acceptance prompt reaches the tools-capable model with tools attached", () => {
  for (const prompt of ACCEPTANCE_PROMPTS) {
    const decision = classifyChatRequest(prompt);
    assert.equal(decision.model, "deepseek-chat", `wrong model: ${prompt}`);
    assert.equal(
      decision.workspaceIntent === true || decision.savesToWorkspace === true,
      true,
      `neither workspace flag set: ${prompt}`,
    );
    assert.equal(toolsAllowed(decision), true, `tools stripped: ${prompt}`);
    assert.equal(toolsAllowed(applyChatEffort(decision, "high")), true, `High dial stripped tools: ${prompt}`);
    assert.equal(decision.searchWeb, false, `bought a web search it did not need: ${prompt}`);
  }
});

test("saving a document to the Library is a workspace turn too", () => {
  // Not one of the owner's numbered prompts — the save route is what carries
  // acceptance test 9's upload once a file is attached, so it is checked
  // separately rather than smuggled into the verbatim list above.
  const decision = classifyChatRequest("Save this lecture to my Library.");
  assert.equal(decision.savesToWorkspace === true || decision.workspaceIntent === true, true);
  assert.equal(toolsAllowed(decision), true);
});

// ── Asking what to study ────────────────────────────────────────────────────
// Acceptance test 7 failed here: "Show me what I need to study." matched no
// workspace rule, LEARNING_PATTERN then caught the word "study", and the turn
// went to deepseek-reasoner with ZERO tools attached.

test("🔴 asking what to study is a workspace question, not a tutoring one", () => {
  for (const prompt of [
    "what should I study",
    "what do I need to study",
    "show me what I need to study",
    "what should I review",
    "what do I need to review",
    "what should I work on",
    "what am I behind on",
    "what is due for studying",
    "show my study workload",
    "What should I study next?",
    "what should I focus on first",
  ]) {
    assert.equal(detectsWorkspaceIntent(prompt), true, `missed: ${prompt}`);
    const decision = classifyChatRequest(prompt);
    assert.equal(decision.model, "deepseek-chat", `wrong model: ${prompt}`);
    assert.equal(toolsAllowed(decision), true, `tools stripped: ${prompt}`);
  }
});

test("🔴 tutoring keeps the thinking model — the study rule matches a SHAPE, not the word", () => {
  // If this ever goes red, Nemesis has started answering "teach me X" without
  // its reasoner, which is a straight downgrade of the thing it is mainly for.
  for (const prompt of [
    "teach me about biology",
    "explain beta blockers",
    "help me study for exam 2",
    "study guide for pharmacokinetics",
    "what is the best way to study organic chemistry",
    "what do I need to know about beta blockers",
    "I need to study harder",
    "review the causes of the French Revolution",
  ]) {
    assert.equal(detectsWorkspaceIntent(prompt), false, `false positive: ${prompt}`);
  }
});

test("getting ready for a dated thing reads the workspace first", () => {
  // Named in the owner's original brief as a target workflow. Delete PREPARE_RE
  // alone if it ever feels more like tutoring than planning.
  for (const prompt of ["get me ready for Exam 2", "help me prepare for the OSCE exam"]) {
    assert.equal(detectsWorkspaceIntent(prompt), true, `missed: ${prompt}`);
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

// ── Asking Nemesis to CREATE something ──────────────────────────────────────
//
// 🔴 FOUND IN PRODUCTION during the Phase 2 acceptance pass, 2026-08-05. Every
// other rule in this module matches a request to READ, ORGANISE or CHOOSE.
// Nothing matched a request to CREATE unless the student said "my", so this —
//
//   "Add an exam called Phase 2 Probe Exam on 2026-09-15 from 13:30 to 14:30."
//
// — reached deepseek-reasoner with ZERO tools attached, and Nemesis answered:
//
//   "I can't add events to your calendar from this environment — I have no
//    access to it right now, and nothing has been scheduled."
//
// The calendar incident, word for word, through the one verb nobody tested.

test("🔴 asking to add an event carries the tools that can add it", () => {
  // The exact production message, verbatim.
  const decision = classifyChatRequest("Add an exam called Phase 2 Probe Exam on 2026-09-15 from 13:30 to 14:30.");
  assert.equal(decision.workspaceIntent, true);
  assert.equal(decision.model, "deepseek-chat");
  assert.equal(toolsAllowed(decision), true);
});

test("creating anything in the workspace is a workspace turn", () => {
  for (const prompt of [
    "Add an exam on September 15 at 1:30pm.",
    "Create a note about today's lecture.",
    "Schedule a lab on Friday at 2pm.",
    "Book a study session for Thursday.",
    "Make me some flashcards on beta blockers.",
    "Put a reminder on Friday for the pharmacology quiz.",
    "Save a note with these dates.",
    "Set up a practice test for Chapter 4.",
    "Write down a note about the lecture I just had.",
  ]) {
    const decision = classifyChatRequest(prompt);
    assert.equal(decision.workspaceIntent === true || decision.savesToWorkspace === true, true, `missed: ${prompt}`);
    assert.equal(toolsAllowed(decision), true, `tools stripped: ${prompt}`);
  }
});

test("🔴 writing something is not filing something — those keep the thinking model", () => {
  // The noun anchor is what makes the creation rule safe. A verb aimed at
  // something the workspace does not hold is ordinary work, and stealing it
  // would make Nemesis worse at its main job.
  for (const prompt of [
    "Make a table comparing ACE inhibitors and ARBs.",
    "Create a mnemonic for the cranial nerves.",
    "Write me an essay about the French Revolution.",
    "Add more detail to that explanation.",
    "Explain the Krebs cycle to me.",
    "What is the event horizon of a black hole?",
  ]) {
    assert.equal(detectsWorkspaceIntent(prompt), false, `stolen from the thinking model: ${prompt}`);
  }
});

test("🔴 a singular 'class' is a workspace noun — `classes?` never matched it", () => {
  // Second production miss of the same run: "My Tuesday Class on 2026-09-15 is
  // cancelled." went to deepseek-reasoner with zero tools and Nemesis answered
  // "I can't edit your calendar". The possessive rule was correct; the noun list
  // was not. `classes?` means "classe" plus an optional "s".
  for (const prompt of [
    "My Tuesday Class on 2026-09-15 is cancelled. Just that one meeting, keep the rest of the term.",
    "My class on Tuesday is cancelled",
    "Cancel my Tuesday Class on 2026-09-15.",
    "when is my next class",
  ]) {
    assert.equal(detectsWorkspaceIntent(prompt), true, `missed: ${prompt}`);
    assert.equal(toolsAllowed(classifyChatRequest(prompt)), true, `tools stripped: ${prompt}`);
  }
  // The plural still works.
  assert.equal(detectsWorkspaceIntent("show me my classes this semester"), true);
});
