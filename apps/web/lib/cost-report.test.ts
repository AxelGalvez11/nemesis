import assert from "node:assert/strict";
import test from "node:test";

import { VOICE_USD_PER_HOUR, voiceCostUsd } from "@/lib/cost-report";

// The BATCH lane's rates and batchProviderFor moved with the lane itself, to
// supabase/functions/_shared/voice-cost.ts — their tests live beside them, in
// supabase/functions/_shared/voice-cost.test.ts (Deno).

test("voiceCostUsd: one hour costs exactly the provider's hourly rate", () => {
  assert.equal(voiceCostUsd("assemblyai_streaming", 3600), VOICE_USD_PER_HOUR.assemblyai_streaming);
});

test("voiceCostUsd: ten minutes of the live copilot is two and a half cents", () => {
  assert.equal(voiceCostUsd("assemblyai_streaming", 600), 0.025);
});

test("voiceCostUsd: junk or negative durations cost nothing, never NaN", () => {
  assert.equal(voiceCostUsd("assemblyai_streaming", -30), 0);
  assert.equal(voiceCostUsd("assemblyai_streaming", Number.NaN), 0);
});
