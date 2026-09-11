import assert from "node:assert/strict";
import { test } from "node:test";

import { boardWireMessages } from "./board-turn";

const systemOf = (place?: "board" | "chat") => boardWireMessages({ message: "Quiz me on the causes of inflation", history: [], place })[0]!.content;

test("🔴 a workspace chat is not told it is a card on a board, and a learner asking to be tested gets asked", () => {
  const chat = systemOf("chat");
  assert.doesNotMatch(chat, /one card on a visual board/);
  assert.match(chat, /a conversation in the learner's workspace/);
  assert.doesNotMatch(chat, /prepared for them separately/, "nothing prepares a test beside a workspace chat");
  assert.match(chat, /ask one question at a time and wait for their answer/);
  assert.match(chat, /Never mention any card, panel or button/, "the screen rule still holds");
});

test("the board keeps its own wording when no place is given", () => {
  for (const board of [systemOf(), systemOf("board")]) {
    assert.match(board, /one card on a visual board/);
    assert.match(board, /prepared for them separately/);
    assert.doesNotMatch(board, /ask one question at a time/);
  }
});
