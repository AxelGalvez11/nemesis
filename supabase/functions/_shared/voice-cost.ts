// What a minute of transcription costs us, on the BATCH lane.
//
// This lane moved out of the Next.js app and into `nemesis-transcribe`
// (owner 2026-07-27: "assembly should be in supabase now"), and the rate table
// came with it — one table, in the process that actually pays the bill. The web
// app keeps apps/web/lib/cost-report.ts for the STREAMING lane it still calls
// directly; the batch rates live here and only here, so a re-price cannot land
// in one copy and miss the other.

/** Batch providers we actually pay. Split by MODEL because the two AssemblyAI
 *  tiers differ by 35% an hour and which one ran is decided by AssemblyAI, not
 *  by us — see batchProviderFor. */
export type BatchVoiceProvider =
  | "assemblyai_batch"
  | "assemblyai_batch_universal2"
  | "groq_whisper_turbo";

/**
 * USD per HOUR of audio, read off each provider's own pricing page on PRICE_REV:
 * assemblyai.com/pricing (async Universal-2 $0.15/hr and Universal-3.5 Pro
 * $0.21/hr; standard speaker diarization +$0.02/hr on async) and groq.com/pricing
 * (whisper-large-v3-turbo $0.04/hr).
 *
 * Both AssemblyAI rates INCLUDE the +$0.02 diarization add-on, because this lane
 * always asks for speaker labels. A rate that left out an add-on we always buy
 * would under-report every recording.
 */
export const BATCH_USD_PER_HOUR: Readonly<Record<BatchVoiceProvider, number>> = {
  assemblyai_batch: 0.23,
  assemblyai_batch_universal2: 0.17,
  groq_whisper_turbo: 0.04,
};

/**
 * Which batch rate to bill, from the model AssemblyAI says it actually ran.
 *
 * The submit asks for Universal-2, the cheaper tier. Whether it GETS it is not
 * something this codebase can assert: the request field was taken from the
 * provider's docs, and a field name that is wrong or has moved is accepted and
 * ignored rather than rejected — the failure that looks like a saving on the
 * invoice and is not one. So the price is read back off the completed job
 * instead of assumed from what we asked for.
 *
 * ANYTHING unrecognised bills at the Pro rate. Guessing wrong in the cheap
 * direction makes the cost report quietly understate every recording, which is
 * the one error a margin figure must not make; guessing wrong in the expensive
 * direction is visible and safe.
 */
export function batchProviderFor(model: unknown): BatchVoiceProvider {
  const named = typeof model === "string"
    ? model
    : Array.isArray(model) && typeof model[0] === "string"
      ? model[0]
      : "";
  return named.toLowerCase().replace(/[^a-z0-9]/g, "") === "universal2"
    ? "assemblyai_batch_universal2"
    : "assemblyai_batch";
}

/** Price list revision, stamped on every event so a later price change cannot
 *  retroactively rewrite what an earlier month cost. A re-price is a NEW rev,
 *  never an edit. Kept in step with apps/web/lib/cost-report.ts's PRICE_REV so
 *  the two lanes' events stay comparable in one query. */
export const PRICE_REV = "2026-07-27";

/** Dollar cost of transcribing `seconds` of audio with `provider`. */
export function batchCostUsd(provider: BatchVoiceProvider, seconds: number): number {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const usd = (safeSeconds / 3600) * BATCH_USD_PER_HOUR[provider];
  // Nine decimals — a few seconds of Groq audio is worth millionths of a dollar.
  return Math.round(usd * 1e9) / 1e9;
}
