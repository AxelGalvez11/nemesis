import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// ── the drill card shows it is hearing you ───────────────────────────────────
//
// Owner, 2026-08-31: *"Shouldn't it include a waveform like the dictation?"*
// The attempt hook was ALREADY publishing a live level (use-pronunciation-
// attempt.ts feeds the same channel dictation does); the card just never drew
// it. Source assertions, because the component wraps a hook that opens a real
// microphone and cannot run here.

const card = readFileSync(new URL("./spoken-example.tsx", import.meta.url), "utf8");

test("🔴 the live dictation strip renders while recording — the same bars, the same channel", () => {
  // Calibration: swap in a decorative animation, or a second component, and
  // this reddens. The whole point of CanvasVoiceBars is that it is fed by the
  // real level, so a dead microphone is VISIBLE.
  assert.match(card, /attempt\.recording && \(/, "the strip is no longer gated on recording");
  assert.match(card, /<CanvasVoiceBars live \/>/, "the strip is not the shared live component");
});

test("🔴 the sentence stays readable while the strip shows", () => {
  // The learner has to READ the line while saying it, so the bars must sit in
  // their own block AFTER the utterance, never replace it. Calibration: move
  // the strip above `<p lang=` — or wrap the sentence in the recording
  // conditional — and the order assertion reddens.
  const sentence = card.indexOf("lang={locale}");
  const strip = card.indexOf("attempt-waveform");
  assert.ok(sentence > 0 && strip > sentence, "the waveform no longer sits below the sentence");
});
