// node:test so the same file runs under Deno and Node (repo precedent:
// entitlements.test.ts).
import assert from "node:assert/strict";
import { test } from "node:test";

import { WORK_CASES } from "./work-class-cases.ts";
import {
  ATTACHMENT_MARKER,
  carriesAttachment,
  classifyWork,
  escalationCandidate,
  promptOnly,
} from "./work-class.ts";

for (const scenario of WORK_CASES) {
  test(`${scenario.workClass}: ${scenario.prompt.slice(0, 60)}`, () => {
    const got = classifyWork({ prompt: scenario.prompt });
    assert.equal(got.workClass, scenario.workClass, scenario.note);
    assert.equal(got.reason, scenario.reason, scenario.note);
  });
}

// ── the two ceilings ────────────────────────────────────────────────────────
//
// Both of these are about what the REQUEST can survive, so they have to beat
// the hardest prompt in the set. A test that only tried them against "hi" would
// pass while the ceiling did nothing.

const HARDEST = WORK_CASES.find((entry) => entry.workClass === "complex")!.prompt;

test("a pinned tool never gets thinking, however hard the question", () => {
  // DeepSeek answers a forced tool_choice in thinking mode with a 400 reading
  // "Thinking mode does not support this tool_choice". Nothing reaching the
  // valve sends one today — which is exactly why this is worth pinning now, in
  // the change that first lets the SERVER switch thinking on.
  const got = classifyWork({ forcesTool: true, prompt: HARDEST });
  assert.equal(got.workClass, "simple");
  assert.equal(got.reason, "forced_tool");
});

test("a client that cannot echo reasoning never gets thinking when tools ride", () => {
  // A thinking turn must echo `reasoning_content` back on every tool round. The
  // phone does not, and phone builds already installed will keep not doing it
  // long after this gateway deploys. Switching thinking on underneath them would
  // break tool rounds in a shipped build.
  const got = classifyWork({ prompt: HARDEST, toolsWithoutReasoningEcho: true });
  assert.equal(got.workClass, "simple");
  assert.equal(got.reason, "no_reasoning_echo");
});

test("the ceilings beat each other in a fixed order, so the reason is never ambiguous", () => {
  const got = classifyWork({ forcesTool: true, prompt: HARDEST, toolsWithoutReasoningEcho: true });
  assert.equal(got.reason, "forced_tool");
});

// ── attachments ─────────────────────────────────────────────────────────────

test("a bare upload is standard work, not small talk", () => {
  // The student typed nothing because they had nothing to add, not because they
  // had nothing to ask. Reading a lecture deserves the thinking model.
  const got = classifyWork({ hasAttachment: true, prompt: "" });
  assert.equal(got.workClass, "standard");
});

test("an empty turn with no attachment stays at the floor", () => {
  assert.equal(classifyWork({ prompt: "" }).workClass, "simple");
  assert.equal(classifyWork({ prompt: "   \n " }).workClass, "simple");
});

test("🔴 the attachment's OWN text never classifies the turn", () => {
  // Attachment text is pasted INTO the user message. A 40,000-word lecture would
  // trip the extended-request rule on every single upload and buy the premium
  // model for a student who typed four words. Web learned this once already,
  // when one slide reading "Smith et al., 2024" bought a paid web search on
  // every upload.
  const deck = `${ATTACHMENT_MARKER}lecture.pdf\n${"compare and contrast every conflicting source ".repeat(200)}`;
  const wire = `show me my deck\n\n${deck}`;
  assert.equal(carriesAttachment(wire), true);
  assert.equal(promptOnly(wire), "show me my deck");
  assert.equal(
    classifyWork({ hasAttachment: true, prompt: promptOnly(wire) }).workClass,
    "simple",
    "the deck's words decided the tier",
  );
});

test("an upload with nothing typed leaves no prompt behind", () => {
  // prepareChatAttachments trims the wire text, so the header STARTS the string
  // and there is no blank line in front of it. Matching only "\n\n### Attachment"
  // returned the whole lecture as though the student had typed it.
  const wire = `${ATTACHMENT_MARKER}notes.pdf\nthe entire lecture goes here`;
  assert.equal(promptOnly(wire), "");
});

// ── field-agnosticism, stated as a test ─────────────────────────────────────

test("🔴 the same structure in two disciplines gets the same class", () => {
  // The failure this guards against is a router that reads subject matter. Each
  // pair differs ONLY in its nouns.
  const pairs: [string, string][] = [
    ["Compare my professor's dosing table with the current guideline", "Compare my professor's load table with the current standard"],
    ["Explain why this drug needs a loading dose", "Explain why this footing needs a wider base"],
    ["Make me flashcards on antibiotics", "Make me flashcards on easements"],
    ["Has the FDA approved it yet?", "Has the council approved it yet?"],
  ];
  for (const [a, b] of pairs) {
    assert.equal(
      classifyWork({ prompt: a }).workClass,
      classifyWork({ prompt: b }).workClass,
      `"${a}" and "${b}" are the same question about different things`,
    );
  }
});

// ── what we watch and do not act on ─────────────────────────────────────────

test("two source reads on an ordinary turn are flagged, not promoted", () => {
  assert.equal(escalationCandidate(["search_library", "search_web"], "standard"), true);
  assert.equal(escalationCandidate(["search_library", "search_web"], "complex"), false, "already complex — nothing to escalate");
  assert.equal(escalationCandidate(["search_library"], "standard"), false, "one source is not a comparison");
  assert.equal(escalationCandidate(["search_library", "search_library"], "standard"), false, "the same tool twice is one source");
  assert.equal(
    escalationCandidate(["add_flashcards", "create_library_note"], "standard"),
    false,
    "writing two artifacts is not reading two sources",
  );
});
