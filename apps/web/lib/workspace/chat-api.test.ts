import assert from "node:assert/strict";
import { test } from "node:test";

import { buildWireMessages, CHAT_SYSTEM_PROMPT, chatSystemPrompt } from "@/lib/workspace/chat-api";
import { toolsAllowed } from "@/lib/workspace/chat-effort";
import { classifyChatRequest } from "@/lib/workspace/chat-routing";
import type { SessionMessage } from "@/lib/workspace/sessions-store";

const message = (role: SessionMessage["role"], content: string): SessionMessage =>
  ({ content, id: `${role}-${content.slice(0, 8)}`, role } as SessionMessage);

const systemText = (text: string) =>
  buildWireMessages([], text).filter((wire) => wire.role === "system").map((wire) => wire.content).join("\n");

test("the base prompt always carries the self-check rule", () => {
  assert.match(CHAT_SYSTEM_PROMPT, /Check your own work before you answer/);
  assert.match(systemText("hey"), /Check your own work before you answer/);
});

test("a matched skill reaches the wire as its own system message", () => {
  const wire = buildWireMessages([], "make me flashcards on ACE inhibitors");
  const skill = wire.find((entry) => entry.role === "system" && entry.content.startsWith("SKILL — "));
  assert.ok(skill, "expected a skill system message");
  assert.match(skill.content, /Every card tests ONE fact/);
});

test("skills sit after the base prompt and before the conversation", () => {
  const wire = buildWireMessages([message("user", "earlier"), message("assistant", "ok")], "cite your sources");
  const skillIndex = wire.findIndex((entry) => entry.content.startsWith("SKILL — "));
  const firstNonSystem = wire.findIndex((entry) => entry.role !== "system");
  assert.ok(skillIndex > 0, "skill must follow the base prompt");
  assert.ok(skillIndex < firstNonSystem, "skill must precede the conversation");
});

test("an ordinary turn adds no skill message at all", () => {
  const wire = buildWireMessages([], "thanks!");
  assert.equal(wire.filter((entry) => entry.content.startsWith("SKILL — ")).length, 0);
  assert.equal(wire.filter((entry) => entry.role === "system").length, 1);
});

// The prompt used to promise the workspace tools on EVERY turn, including the
// reasoner routes that go out without any. Told it could add cards and told to
// "state plainly what you created", the model wrote "[Calling tool:
// add_flashcards ...]" as prose and reported 14 cards saved to a deck the
// student does not have. The claim and the tools now come from one boolean.
test("a tool-less turn is told it has no tools, and never told to report a write", () => {
  const noTools = chatSystemPrompt(false);
  assert.doesNotMatch(noTools, /through your tools/);
  assert.doesNotMatch(noTools, /After any write, state plainly/);
  assert.match(noTools, /This turn carries no tools/);
  assert.match(noTools, /Calling tool/);
  // And the rigor rules survive the swap.
  assert.match(noTools, /Check your own work before you answer/);
  assert.match(CHAT_SYSTEM_PROMPT, /through your tools/);
});

test("buildWireMessages derives the tools claim from the route, not from hope", () => {
  // "explain osmosis" routes to the reasoner, which carries no tools.
  const learning = classifyChatRequest("explain osmosis");
  assert.equal(toolsAllowed(learning), false);
  assert.match(systemText("explain osmosis"), /This turn carries no tools/);
  // A save keeps deepseek-chat, so the tools paragraph is true and stays.
  assert.equal(toolsAllowed(classifyChatRequest("make me flashcards on ACE inhibitors")), true);
  assert.match(systemText("make me flashcards on ACE inhibitors"), /through your tools/);
});

test("the user's message is still the last thing sent", () => {
  const wire = buildWireMessages([], "calculate the dose");
  const last = wire.at(-1);
  assert.equal(last?.role, "user");
  assert.equal(last?.content, "calculate the dose");
});
