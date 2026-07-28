import { assert, assertEquals } from "jsr:@std/assert@1";

import { BATCH_USD_PER_HOUR, batchCostUsd, batchProviderFor } from "./voice-cost.ts";

Deno.test("batchCostUsd: one hour costs exactly the provider's hourly rate", () => {
  assertEquals(batchCostUsd("assemblyai_batch", 3600), BATCH_USD_PER_HOUR.assemblyai_batch);
  assertEquals(batchCostUsd("assemblyai_batch_universal2", 3600), BATCH_USD_PER_HOUR.assemblyai_batch_universal2);
  assertEquals(batchCostUsd("groq_whisper_turbo", 3600), BATCH_USD_PER_HOUR.groq_whisper_turbo);
});

Deno.test("batchCostUsd: a 25-minute lecture recording on the cheap lane is under a cent", () => {
  assertEquals(batchCostUsd("groq_whisper_turbo", 25 * 60), 0.016666667);
});

Deno.test("batchCostUsd: junk or negative durations cost nothing, never NaN", () => {
  assertEquals(batchCostUsd("groq_whisper_turbo", -30), 0);
  assertEquals(batchCostUsd("groq_whisper_turbo", Number.NaN), 0);
});

Deno.test("batchProviderFor: only a job that REPORTS Universal-2 gets the cheap rate", () => {
  assertEquals(batchProviderFor("universal-2"), "assemblyai_batch_universal2");
  // The field may echo as a list (speech_models) or a bare string (speech_model),
  // and neither spelling is confirmed for this account — both are handled.
  assertEquals(batchProviderFor(["universal-2"]), "assemblyai_batch_universal2");
  assertEquals(batchProviderFor("Universal_2"), "assemblyai_batch_universal2");
});

Deno.test("batchProviderFor: anything else bills at the PRO rate, never the cheap one", () => {
  // The direction that matters. An ignored request field, a renamed model, a
  // provider that stops echoing it at all — every one of these must over-report
  // rather than quietly understate a recording.
  for (
    const unknown of [
      "universal-3-5-pro",
      "slam-1",
      "",
      undefined,
      null,
      42,
      [],
      {},
      ["universal-3-5-pro", "universal-2"],
    ]
  ) {
    assertEquals(
      batchProviderFor(unknown),
      "assemblyai_batch",
      `${JSON.stringify(unknown)} must not read as Universal-2`,
    );
  }
});

Deno.test("the cheap batch tier really is cheaper, and both carry diarization", () => {
  assert(BATCH_USD_PER_HOUR.assemblyai_batch_universal2 < BATCH_USD_PER_HOUR.assemblyai_batch);
  // 0.15 + 0.02 and 0.21 + 0.02 — the add-on is in both, because submit always
  // asks for speaker labels.
  assertEquals(BATCH_USD_PER_HOUR.assemblyai_batch_universal2, 0.17);
  assertEquals(BATCH_USD_PER_HOUR.assemblyai_batch, 0.23);
});
