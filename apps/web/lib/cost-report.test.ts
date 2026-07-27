import assert from "node:assert/strict";
import test from "node:test";

import { VOICE_USD_PER_HOUR, voiceCostUsd } from "@/lib/cost-report";

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
