import assert from "node:assert/strict";

import type { SessionMessage } from "@/lib/workspace/sessions-store";

import { buildNotebookWireMessages } from "./chat";

// Injects instructions + source titles into the system message; the user text is last.
{
  const msgs = buildNotebookWireMessages({
    instructions: "Quiz me hard.",
    sourceNames: ["ACE inhibitors", "Beta blockers"],
    history: [],
    userText: "hi",
  });
  assert.equal(msgs[0]?.role, "system");
  assert.match(msgs[0]?.content ?? "", /Quiz me hard\./);
  assert.match(msgs[0]?.content ?? "", /ACE inhibitors/);
  assert.match(msgs[0]?.content ?? "", /Beta blockers/);
  assert.deepEqual(msgs.at(-1), { content: "hi", role: "user" });
}

// Omits the instruction + source blocks when both are empty (system + user only).
{
  const msgs = buildNotebookWireMessages({ instructions: null, sourceNames: [], history: [], userText: "hi" });
  assert.equal(msgs.length, 2);
  assert.doesNotMatch(msgs[0]?.content ?? "", /instructions from the student/);
  assert.doesNotMatch(msgs[0]?.content ?? "", /Sources the student added/);
}

// Whitespace-only instructions + blank source names are treated as empty.
{
  const msgs = buildNotebookWireMessages({ instructions: "   ", sourceNames: ["  ", ""], history: [], userText: "x" });
  assert.doesNotMatch(msgs[0]?.content ?? "", /instructions from the student/);
  assert.doesNotMatch(msgs[0]?.content ?? "", /Sources the student added/);
}

// Prior history sits between the system message and the new user message.
{
  const history: SessionMessage[] = [
    { role: "user", content: "first", at: "" },
    { role: "assistant", content: "answer", at: "" },
  ];
  const msgs = buildNotebookWireMessages({ instructions: null, sourceNames: [], history, userText: "second" });
  assert.equal(msgs.length, 4);
  assert.deepEqual(msgs[1], { content: "first", role: "user" });
  assert.deepEqual(msgs[2], { content: "answer", role: "assistant" });
  assert.deepEqual(msgs.at(-1), { content: "second", role: "user" });
}

console.log("notebooks/chat.test.ts: all assertions passed");
