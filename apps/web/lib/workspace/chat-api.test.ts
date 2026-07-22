import assert from "node:assert/strict";
import { test } from "node:test";

import { buildWireMessages, CHAT_SYSTEM_PROMPT } from "@/lib/workspace/chat-api";
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

test("the user's message is still the last thing sent", () => {
  const wire = buildWireMessages([], "calculate the dose");
  const last = wire.at(-1);
  assert.equal(last?.role, "user");
  assert.equal(last?.content, "calculate the dose");
});
