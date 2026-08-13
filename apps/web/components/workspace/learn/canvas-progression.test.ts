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

// ── sending material with nothing typed (UX brief §3) ───────────────────────

test("🔴 attached material makes the empty composer sendable — §3", () => {
  // §3: "Attach + send with no text means 'learn this material with me.' Infer it." §26 lists it
  // as its own criterion: "a file may be sent with no accompanying text". Before this, the send
  // control was absent with a file staged and nothing typed, so the only way to start was the
  // dedicated "Help me learn this" screen §1 deletes.
  assert.equal(
    composerControl({ advanceAvailable: false, hasResponse: false, hasAttachment: true }),
    "send",
  );
  // And it is still absent with nothing at all — an empty canvas offers no control to press.
  assert.equal(
    composerControl({ advanceAvailable: false, hasResponse: false, hasAttachment: false }),
    "none",
  );
});

test("🔴 N3 SURVIVES §3: a production state with nothing typed still offers NO control", () => {
  // The regression this exists to catch, and it is the dangerous direction: widening "what counts
  // as sendable" is exactly how a required demonstration silently becomes skippable, while every
  // screen still looks correct.
  //
  // The guarantee is structural rather than a promise — attachments are only ever pending on a
  // canvas that has not begun, where there is no prompt, no objective and no evidence to bypass,
  // so `hasAttachment` and a live retrieval cannot be true together. This pins the default anyway,
  // because "cannot happen" is a claim about the caller and this is the function.
  assert.equal(
    composerControl({ advanceAvailable: false, hasResponse: false }),
    "none",
    "omitting hasAttachment must mean false — a defaulted-true flag would remove N3 everywhere at once",
  );
});

test("🔴 still never both, now across three inputs", () => {
  for (const hasResponse of [true, false]) {
    for (const advanceAvailable of [true, false]) {
      for (const hasAttachment of [true, false]) {
        const control = composerControl({ advanceAvailable, hasAttachment, hasResponse });
        assert.ok(["send", "advance", "none"].includes(control), `unexpected control: ${control}`);
      }
    }
  }
});
