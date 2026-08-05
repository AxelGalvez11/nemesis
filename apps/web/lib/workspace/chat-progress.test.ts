import assert from "node:assert/strict";
import { test } from "node:test";

import { PROGRESS_TICK_MS, waitingPhrase, WRITING_PHRASE } from "./chat-progress";

test("the wait opens on Thinking and never returns null", () => {
  assert.equal(waitingPhrase(0), "Thinking");
  assert.equal(waitingPhrase(-1), "Thinking");
});

test("the phrase actually changes as the wait grows — the whole point", () => {
  const seen = [0, 8_000, 20_000, 45_000, 90_000].map(waitingPhrase);
  assert.equal(new Set(seen).size, seen.length, `expected five distinct phrases, got ${JSON.stringify(seen)}`);
});

test("phrases only move forward, never flicker back", () => {
  let last = waitingPhrase(0);
  const order: string[] = [last];
  for (let elapsed = 0; elapsed <= 120_000; elapsed += 500) {
    const phrase = waitingPhrase(elapsed);
    if (phrase !== last) {
      assert.equal(order.includes(phrase), false, `${phrase} came back around at ${elapsed}ms`);
      order.push(phrase);
      last = phrase;
    }
  }
});

test("it settles rather than churning on a very long wait", () => {
  assert.equal(waitingPhrase(90_000), waitingPhrase(600_000));
});

test("no phrase promises progress the code cannot see", () => {
  const phrases = [0, 8_000, 20_000, 45_000, 90_000, 600_000].map(waitingPhrase).concat(WRITING_PHRASE);
  for (const phrase of phrases) {
    assert.doesNotMatch(phrase, /almost|nearly|finishing|last step|% /i, phrase);
  }
});

test("the tick is slow enough to read", () => {
  assert.ok(PROGRESS_TICK_MS >= 500, "a sub-half-second tick reads as a flicker");
});
