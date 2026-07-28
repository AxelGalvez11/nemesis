// What the non-token services cost us, reported per app.
//
// The AI token bill is computed inside the metering valve (supabase/functions/
// _shared/llm-cost.ts). This is the web app's half: voice — the single biggest
// non-token cost, and the one that decides whether the Max plan makes money.
//
// SCOPE, since 2026-07-27: the STREAMING lane only. The batch (upload-and-
// enhance) lane moved to supabase/functions/nemesis-transcribe along with the
// AssemblyAI key, and its rate table went with it —
// supabase/functions/_shared/voice-cost.ts. Deliberately not duplicated here:
// one table per lane, in the process that pays the bill, so a re-price cannot
// land in one copy and miss the other.

import { phServerCapture } from "@/lib/posthog-server";

/** Voice providers this app still pays directly. */
export type VoiceProvider = "assemblyai_streaming";

/**
 * USD per HOUR of audio, read off the provider's own pricing page on PRICE_REV:
 * assemblyai.com/pricing (Universal-Streaming $0.15/hr).
 */
export const VOICE_USD_PER_HOUR: Readonly<Record<VoiceProvider, number>> = {
  assemblyai_streaming: 0.15,
};

/** Price list revision, stamped on every event so a later price change cannot
 *  retroactively rewrite what an earlier month cost. A re-price is a NEW rev,
 *  never an edit. Kept in step with _shared/voice-cost.ts's PRICE_REV so the
 *  two lanes' events stay comparable in one query. */
export const PRICE_REV = "2026-07-27";

/** Dollar cost of transcribing `seconds` of audio with `provider`. */
export function voiceCostUsd(provider: VoiceProvider, seconds: number): number {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const usd = (safeSeconds / 3600) * VOICE_USD_PER_HOUR[provider];
  // Nine decimals — a few seconds of audio is worth millionths of a dollar.
  return Math.round(usd * 1e9) / 1e9;
}

export interface VoiceCostEvent {
  userId: string;
  provider: VoiceProvider;
  seconds: number;
  /** Which lane spent it — "live" (streaming copilot) or "recording" (batch upload). */
  lane: "live" | "recording";
}

/**
 * Report one voice charge to PostHog, where it joins the valve's $ai_generation
 * events on the same `client` property. Never throws: a missing cost report must
 * never break a transcript the student is waiting on.
 */
export async function reportVoiceCost(event: VoiceCostEvent): Promise<void> {
  const seconds = Number.isFinite(event.seconds) && event.seconds > 0 ? Math.round(event.seconds) : 0;
  if (!event.userId || seconds <= 0) return;

  await phServerCapture(event.userId, "nemesis_service_cost", {
    client: "web",
    cost_usd: voiceCostUsd(event.provider, seconds),
    lane: event.lane,
    price_rev: PRICE_REV,
    provider: event.provider,
    seconds,
    service: "voice",
  });
}
