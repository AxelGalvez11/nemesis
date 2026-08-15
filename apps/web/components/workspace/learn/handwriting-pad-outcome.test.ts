import assert from "node:assert/strict";
import test from "node:test";

import { captureOutcome } from "./handwriting-pad-outcome";
import type { HandwritingObservation } from "@/lib/handwriting/types";

function observation(over: Partial<HandwritingObservation> = {}): HandwritingObservation {
  return {
    abstained: false,
    abstentionReason: null,
    items: [],
    model: "test-model",
    spatialRelations: [],
    transcription: "",
    transcriptionConfidence: 0.9,
    ...over,
  };
}

test("no response at all reads as a message, never as text", () => {
  const outcome = captureOutcome(null);
  assert.equal(outcome.kind, "message");
});

test("a specific server error is shown over the generic fallback", () => {
  const outcome = captureOutcome(null, "That image is too large to read. Try a smaller one.");
  assert.deepEqual(outcome, { kind: "message", message: "That image is too large to read. Try a smaller one." });
});

test("a blank or absent server error still falls back to the generic message", () => {
  assert.notEqual(captureOutcome(null, "").kind, undefined);
  assert.equal((captureOutcome(null, "") as { message: string }).message.length > 0, true);
  assert.deepEqual(captureOutcome(null, "   "), captureOutcome(null));
  assert.deepEqual(captureOutcome(null, undefined), captureOutcome(null));
});

test("a server error is ignored once a real observation comes back", () => {
  // A caller only has a server error to offer on the null-observation path — this pins that a
  // leftover error string from a PREVIOUS failed attempt could never leak onto a later success.
  const outcome = captureOutcome(observation({ transcription: "hello" }), "stale error from before");
  assert.deepEqual(outcome, { kind: "text", text: "hello" });
});

test("🔴 an abstained observation NEVER produces text, even one carrying a transcription", () => {
  // 🔴 CALIBRATION: delete the `if (observation.abstained)` branch in handwriting-pad-outcome.ts —
  // this reddens, because the function would then fall through to the transcription below and
  // hand the learner's composer a reading the model itself said it was not confident about.
  //
  // The transcription field is populated here on purpose, even though vision.ts's own parser
  // already clears it on a real abstained reply (see vision.test.ts) — this test is a second,
  // independent guard at the layer that actually decides what reaches the composer, so the two
  // do not depend on each other to both stay correct.
  const outcome = captureOutcome(observation({ abstained: true, abstentionReason: "too blurred to read", transcription: "a guess" }));
  assert.equal(outcome.kind, "message", "abstained must never become text, however confident-looking the leftover fields are");
});

test("an abstained reason composes into one readable sentence", () => {
  const outcome = captureOutcome(observation({ abstained: true, abstentionReason: "the photo is too dark to read." }));
  assert.equal(outcome.kind, "message");
  if (outcome.kind === "message") {
    assert.equal(outcome.message, "The photo is too dark to read. You can type instead.");
  }
});

test("an abstained observation with no usable reason still produces a real message", () => {
  const outcome = captureOutcome(observation({ abstained: true, abstentionReason: "   " }));
  assert.equal(outcome.kind, "message");
  if (outcome.kind === "message") assert.ok(outcome.message.length > 0);
});

test("a confident but blank reading is a message, not an empty text submission", () => {
  const outcome = captureOutcome(observation({ transcription: "   " }));
  assert.equal(outcome.kind, "message");
});

test("a real transcription becomes text, trimmed", () => {
  const outcome = captureOutcome(observation({ transcription: "  Na+ enters the cell  " }));
  assert.deepEqual(outcome, { kind: "text", text: "Na+ enters the cell" });
});
