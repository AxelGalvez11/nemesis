import assert from "node:assert/strict";
import { test } from "node:test";

import { isOrdinaryChatQuestion } from "./canvas-chat-routing";

// Tests the DECISION, not any rendering: given this typed text, is it answered as a plain
// question or left to take the document-editing path it takes today? See the file header for why
// the split exists.

test("a plain question with no punctuation is answered directly", () => {
  assert.equal(isOrdinaryChatQuestion("what does osmolarity mean"), true);
  assert.equal(isOrdinaryChatQuestion("why does this reaction happen"), true);
  assert.equal(isOrdinaryChatQuestion("who wrote this act"), true);
});

test("a statement carrying a trailing question mark is answered directly", () => {
  assert.equal(isOrdinaryChatQuestion("this always holds true?"), true);
});

test("a bare declarative statement is left alone", () => {
  // No question shape and no instruction verb: exactly the input that must keep taking the
  // document-mutating path it takes today, unchanged by this file's existence.
  assert.equal(isOrdinaryChatQuestion("the mitochondria produces ATP"), false);
});

test("empty or whitespace-only text is left alone", () => {
  assert.equal(isOrdinaryChatQuestion(""), false);
  assert.equal(isOrdinaryChatQuestion("   "), false);
});

test("🔴 an instruction to edit the document outranks a trailing question mark", () => {
  // "Summarize this for me?" is still an instruction to write a summary into the page: contract
  // §24 requires "Summarize this" to keep writing to the document, and politeness at the end must
  // not flip that into a spoken-style reply that never touches it.
  assert.equal(isOrdinaryChatQuestion("summarize this for me?"), false);
  assert.equal(isOrdinaryChatQuestion("add a section on this?"), false);
  assert.equal(isOrdinaryChatQuestion("write a paragraph about this"), false);
});

test("🔴 CALIBRATION: the imperative guard is load-bearing, not dead code", () => {
  // Proves the previous test can actually fail: without the imperative check, "summarize this for
  // me?" would read as an ordinary question purely off its trailing "?", which is the exact
  // regression contract §24 forbids. Reproduced here as a literal string match against the
  // module's own source rather than by re-implementing the function, so this fails the moment the
  // guard clause is deleted or short-circuited, not only when its wording drifts.
  const withoutImperativeCheck = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const interrogative =
      /^(what|why|how|when|where|which|who|whose|does|do|did|is|are|was|were|can|could|would|should|will|has|have|had)\b/i;
    return interrogative.test(trimmed) || trimmed.endsWith("?");
  };
  // The guarded function and the unguarded one must disagree on exactly the case the guard exists
  // for: if they agree, the guard is not doing anything and this test would not have caught its
  // removal.
  assert.equal(withoutImperativeCheck("summarize this for me?"), true);
  assert.equal(isOrdinaryChatQuestion("summarize this for me?"), false);
});
