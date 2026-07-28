import assert from "node:assert/strict";
import test from "node:test";

import { batchProviderFor, VOICE_USD_PER_HOUR, voiceCostUsd } from "@/lib/cost-report";

test("voiceCostUsd: one hour costs exactly the provider's hourly rate", () => {
  assert.equal(voiceCostUsd("assemblyai_streaming", 3600), VOICE_USD_PER_HOUR.assemblyai_streaming);
  assert.equal(voiceCostUsd("assemblyai_batch", 3600), VOICE_USD_PER_HOUR.assemblyai_batch);
  assert.equal(voiceCostUsd("groq_whisper_turbo", 3600), VOICE_USD_PER_HOUR.groq_whisper_turbo);
});

test("voiceCostUsd: a 25-minute lecture recording on the cheap lane is under a cent", () => {
  const usd = voiceCostUsd("groq_whisper_turbo", 25 * 60);
  assert.equal(usd, 0.016666667);
});

test("voiceCostUsd: the streaming lane costs ~3.75x the batch turbo lane", () => {
  const streaming = voiceCostUsd("assemblyai_streaming", 600);
  const turbo = voiceCostUsd("groq_whisper_turbo", 600);
  assert.equal(Math.round((streaming / turbo) * 100) / 100, 3.75);
});

test("voiceCostUsd: junk or negative durations cost nothing, never NaN", () => {
  assert.equal(voiceCostUsd("groq_whisper_turbo", -30), 0);
  assert.equal(voiceCostUsd("groq_whisper_turbo", Number.NaN), 0);
});

test("batchProviderFor: only a job that REPORTS Universal-2 gets the cheap rate", () => {
  assert.equal(batchProviderFor("universal-2"), "assemblyai_batch_universal2");
  // The field may echo as a list (speech_models) or a bare string (speech_model),
  // and neither spelling is confirmed for this account — both are handled.
  assert.equal(batchProviderFor(["universal-2"]), "assemblyai_batch_universal2");
  assert.equal(batchProviderFor("Universal_2"), "assemblyai_batch_universal2");
});

test("batchProviderFor: anything else bills at the PRO rate, never the cheap one", () => {
  // The direction that matters. An ignored request field, a renamed model, a
  // provider that stops echoing it at all — every one of these must over-report
  // rather than quietly understate a recording.
  for (const unknown of ["universal-3-5-pro", "slam-1", "", undefined, null, 42, [], {}, ["universal-3-5-pro", "universal-2"]]) {
    assert.equal(batchProviderFor(unknown), "assemblyai_batch", `${JSON.stringify(unknown)} must not read as Universal-2`);
  }
});

test("the cheap batch tier really is cheaper, and both carry diarization", () => {
  assert.ok(VOICE_USD_PER_HOUR.assemblyai_batch_universal2 < VOICE_USD_PER_HOUR.assemblyai_batch);
  // 0.15 + 0.02 and 0.21 + 0.02 — the add-on is in both, because submit always
  // asks for speaker labels.
  assert.equal(VOICE_USD_PER_HOUR.assemblyai_batch_universal2, 0.17);
  assert.equal(VOICE_USD_PER_HOUR.assemblyai_batch, 0.23);
});
