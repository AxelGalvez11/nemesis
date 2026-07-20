import assert from "node:assert/strict";

import type { SessionMessage } from "@/lib/workspace/sessions-store";

import { buildNotebookWireMessages, buildSourceContext } from "./chat";

// The workspace serves every field; medicine is supported but is not the default identity.
assert.match(buildNotebookWireMessages({ instructions: null, sources: [], history: [], userText: "Explain eigenvectors" })[0]?.content ?? "", /any discipline/);
assert.doesNotMatch(buildNotebookWireMessages({ instructions: null, sources: [], history: [], userText: "Explain eigenvectors" })[0]?.content ?? "", /health-sciences students/i);

// Injects instructions + source TEXT (not just the title) into the system message; user text is last.
{
  const msgs = buildNotebookWireMessages({
    instructions: "Quiz me hard.",
    sources: [{ name: "ACE inhibitors", content: "ACE inhibitors block angiotensin-converting enzyme." }],
    history: [],
    userText: "hi",
  });
  assert.equal(msgs[0]?.role, "system");
  assert.match(msgs[0]?.content ?? "", /Quiz me hard\./);
  assert.match(msgs[0]?.content ?? "", /### Source: ACE inhibitors/);
  assert.match(msgs[0]?.content ?? "", /block angiotensin-converting enzyme/); // the CONTENT, not just the title
  assert.deepEqual(msgs.at(-1), { content: "hi", role: "user" });
}

// Omits the instruction + source blocks when both are empty (system + user only).
{
  const msgs = buildNotebookWireMessages({ instructions: null, sources: [], history: [], userText: "hi" });
  assert.equal(msgs.length, 2);
  assert.doesNotMatch(msgs[0]?.content ?? "", /instructions from the student/);
  assert.doesNotMatch(msgs[0]?.content ?? "", /Sources the student added/);
}

// Whitespace-only instructions + content-less sources are treated as empty.
{
  const msgs = buildNotebookWireMessages({
    instructions: "   ",
    sources: [{ name: "empty", content: "   " }, { name: "nulled", content: null }],
    history: [],
    userText: "x",
  });
  assert.doesNotMatch(msgs[0]?.content ?? "", /instructions from the student/);
  assert.doesNotMatch(msgs[0]?.content ?? "", /Sources the student added/);
}

// Prior history sits between the system message and the new user message.
{
  const history: SessionMessage[] = [
    { role: "user", content: "first", at: "" },
    { role: "assistant", content: "answer", at: "" },
  ];
  const msgs = buildNotebookWireMessages({ instructions: null, sources: [], history, userText: "second" });
  assert.equal(msgs.length, 4);
  assert.deepEqual(msgs[1], { content: "first", role: "user" });
  assert.deepEqual(msgs[2], { content: "answer", role: "assistant" });
  assert.deepEqual(msgs.at(-1), { content: "second", role: "user" });
}

// buildSourceContext: includes each source's text, truncates to the budget, notes omissions.
{
  const ctx = buildSourceContext(
    [
      { name: "A", content: "aaaa" },
      { name: "B", content: "bbbb" },
      { name: "C", content: "cccc" },
    ],
    6, // budget: A (4 chars) fits, B is clipped to the remaining 2, C is dropped
  );
  assert.match(ctx, /### Source: A/);
  assert.match(ctx, /aaaa/);
  assert.match(ctx, /\[truncated\]/);
  assert.match(ctx, /1 more source not shown/);
}

// buildSourceContext: skips content-less sources; empty overall → "".
{
  assert.equal(buildSourceContext([{ name: "x", content: "" }, { name: "y", content: null }]), "");
}

console.log("notebooks/chat.test.ts: all assertions passed");
