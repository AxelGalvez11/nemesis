import assert from "node:assert/strict";
import { test } from "node:test";

import { chatMessages } from "./canvas-chat";

test("canvas chat keeps the question distinct from course and web source context", () => {
  const messages = chatMessages({
    canvasTitle: "Hypertension",
    materialContext: "The lecture says target X.",
    question: "What do current guidelines say?",
    webContext: "1. Current guidance says Y.",
  });
  const last = messages.at(-1);
  assert.equal(last?.role, "user");
  assert.doesNotMatch(last?.content ?? "", /target X|guidance says Y/);
  assert.ok(messages.some((message) => message.role === "system" && /ATTACHED COURSE/.test(message.content)));
  assert.ok(messages.some((message) => message.role === "system" && /PROVISIONAL EXTERNAL/.test(message.content)));
  assert.match(messages[0]?.content ?? "", /Course expects:/);
  assert.match(messages[0]?.content ?? "", /External\/current evidence:/);
});
