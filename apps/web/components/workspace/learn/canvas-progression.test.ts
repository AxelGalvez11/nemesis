import assert from "node:assert/strict";
import test from "node:test";

import { composerControl, offersAdvance, type ProgressionInput } from "./canvas-progression";

const state = (over: Partial<ProgressionInput> = {}): ProgressionInput => ({
  actionType: null,
  awaitingDemonstration: false,
  feedbackPassed: false,
  hasFeedback: false,
  ...over,
});

test("🔴 N3: a required demonstration offers NO way past it", () => {
  // The one that matters. If this ever returns true, retrieval can be bypassed by pressing a
  // control instead of producing an answer — and every screen still looks correct.
  assert.equal(
    offersAdvance(state({ actionType: "retrieve", awaitingDemonstration: true })),
    false,
    "a learner must not be able to press past a question they have been asked",
  );
});

test("exposition states offer it — the learner is reading and pressing on is the next move", () => {
  assert.equal(offersAdvance(state({ actionType: "show_correction" })), true);
  assert.equal(offersAdvance(state({ actionType: "contrast" })), true);
  assert.equal(offersAdvance(state({ feedbackPassed: false, hasFeedback: true })), true);
});

test("a PASSED verdict offers nothing, because it advances by itself", () => {
  assert.equal(
    offersAdvance(state({ feedbackPassed: true, hasFeedback: true })),
    false,
    "a control beside something already moving on is a second way to do one thing",
  );
});

test("🔴 states with nothing to advance past do not offer a control wired to nothing", () => {
  assert.equal(offersAdvance(state()), false, "the empty state has nothing to acknowledge");
  assert.equal(offersAdvance(state({ actionType: "defer" })), false, "nothing is owed and nothing is being read");
});

test("feedback outranks the action underneath it, exactly as the renderer does", () => {
  // The policy has already decided the next question while the learner is still reading a verdict.
  // What is ON SCREEN is the verdict, so that is what decides.
  assert.equal(
    offersAdvance(state({ actionType: "retrieve", awaitingDemonstration: true, hasFeedback: true })),
    true,
    "a verdict being read is an exposition state even when a retrieval is queued behind it",
  );
  assert.equal(
    offersAdvance(state({ actionType: "retrieve", feedbackPassed: true, hasFeedback: true })),
    false,
    "a passed verdict is still silent even with a retrieval queued behind it",
  );
});

// ── §I's whole rule, as a table ───────────────────────────────────────────────
//
//   exposition   empty composer  ->  ✓            response begins  ->  send
//   production   empty composer  ->  NO CONTROL   response exists   ->  send

test("🔴 §I: the four states, and the control each one shows", () => {
  const exposition = { advanceAvailable: true };
  const production = { advanceAvailable: false };

  assert.equal(composerControl({ ...exposition, hasResponse: false }), "advance");
  assert.equal(composerControl({ ...exposition, hasResponse: true }), "send");
  assert.equal(
    composerControl({ ...production, hasResponse: false }),
    "none",
    "a required demonstration must offer NO control — absent, not disabled",
  );
  assert.equal(composerControl({ ...production, hasResponse: true }), "send");
});

test("🔴 there is never both a ✓ and a send, and the type is what guarantees it", () => {
  // Exhaustive over both inputs: every combination yields exactly ONE control, because the
  // return type cannot hold two. Written as a pair of booleans this property would be a
  // convention; here it is not expressible otherwise.
  for (const hasResponse of [true, false]) {
    for (const advanceAvailable of [true, false]) {
      const control = composerControl({ advanceAvailable, hasResponse });
      assert.ok(["send", "advance", "none"].includes(control), `unexpected control: ${control}`);
    }
  }
});

test("a response outranks ✓ in exposition — typing turns the same control into send", () => {
  // §I: "Clearing the composer while still in an exposition state may return it to ✓."
  assert.equal(composerControl({ advanceAvailable: true, hasResponse: true }), "send");
  assert.equal(composerControl({ advanceAvailable: true, hasResponse: false }), "advance");
});
