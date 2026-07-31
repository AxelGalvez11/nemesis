import assert from "node:assert/strict";
import test from "node:test";
import { buildWireMessages, HISTORY_CHAR_BUDGET } from "@/lib/workspace/chat-api";
import type { SessionMessage } from "@/lib/workspace/sessions-store";

test("BUDGET: artifact notes are counted inside the history budget, not added after it", () => {
  // A long conversation that also carries a big recording write-up. If the
  // expansion happens after the trim, the wire blows the budget it enforced.
  const history: SessionMessage[] = [];
  for (let i = 0; i < 25; i += 1) {
    history.push({ at: "", content: `turn ${i} ${"z".repeat(900)}`, role: i % 2 ? "assistant" : "user" });
  }
  history.push({
    at: "",
    content: "Recording saved.",
    role: "assistant",
    outputs: [{ id: "r", kind: "recording", notes: "N".repeat(9_000), title: "Lecture" }],
  });
  const wire = buildWireMessages(history, "make flashcards from this");
  const historyChars = wire
    .filter((m) => m.role !== "system")
    .map((m) => m.content.length)
    .reduce((a, b) => a + b, 0);
  const asked = "make flashcards from this".length;
  assert.ok(
    historyChars - asked <= HISTORY_CHAR_BUDGET,
    `history on the wire is ${historyChars - asked} chars, over the ${HISTORY_CHAR_BUDGET} budget`,
  );
  // And the write-up genuinely made it — otherwise this passes for the wrong reason.
  assert.ok(wire.some((m) => m.content.includes("Produced in this conversation")), "artifact note missing");
});
