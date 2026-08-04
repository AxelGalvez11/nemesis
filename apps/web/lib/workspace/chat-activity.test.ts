import assert from "node:assert/strict";
import test from "node:test";

import { activityLabel } from "./chat-activity";

test("activityLabel names the round after the first call", () => {
  assert.equal(activityLabel([{ name: "search_library" }, { name: "read_library_note" }]), "Searching your library");
});

test("activityLabel falls back for unknown tools and empty rounds", () => {
  assert.equal(activityLabel([{ name: "brand_new_tool" }]), "Working on it");
  assert.equal(activityLabel([]), "Working on it");
});

test("the module exposes no reasoning-text preview", async () => {
  // The strip must never surface the model's own streamed thoughts (owner
  // 2026-08-04: raw "Result 1: …" lines are noise). If someone re-adds a
  // reasoning-to-label helper here, this fails and points at the decision.
  const exports = await import("./chat-activity");
  assert.equal("reasoningPhrase" in exports, false);
});
