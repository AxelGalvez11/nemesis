import assert from "node:assert/strict";
import test from "node:test";

import { activityLabel, reasoningPhrase } from "./chat-activity";

test("activityLabel names the round after the first call", () => {
  assert.equal(activityLabel([{ name: "search_library" }, { name: "read_library_note" }]), "Searching your library");
});

test("activityLabel falls back for unknown tools and empty rounds", () => {
  assert.equal(activityLabel([{ name: "brand_new_tool" }]), "Working on it");
  assert.equal(activityLabel([]), "Working on it");
});

test("reasoningPhrase returns the last legible line", () => {
  const reasoning = "Let me think about this.\n\n- First, check the sources\nThe user wants recent approvals";
  assert.equal(reasoningPhrase(reasoning), "The user wants recent approvals");
});

test("reasoningPhrase strips list markers and bold", () => {
  assert.equal(reasoningPhrase("# Plan\n- **Compare** the two dates"), "Compare the two dates");
});

test("reasoningPhrase keeps the tail of an overlong line", () => {
  const long = `start ${"x".repeat(200)} the very end of the thought`;
  const phrase = reasoningPhrase(long);
  assert.ok(phrase);
  assert.ok(phrase.startsWith("…"));
  assert.ok(phrase.endsWith("the very end of the thought"));
  assert.ok(phrase.length <= 92);
});

test("reasoningPhrase returns null when nothing legible has streamed yet", () => {
  assert.equal(reasoningPhrase(""), null);
  assert.equal(reasoningPhrase("- \n# \n a"), null);
});
