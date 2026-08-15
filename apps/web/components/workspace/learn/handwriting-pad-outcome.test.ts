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
