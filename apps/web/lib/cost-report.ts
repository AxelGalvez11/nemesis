// What the non-token services cost us, reported per app.
//
// The AI token bill is computed inside the metering valve (supabase/functions/
// _shared/llm-cost.ts). This is the web app's half: voice — the single biggest
// non-token cost, and the one that decides whether the Max plan makes money.
//
// Phone recordings transcribe ON-DEVICE and cost $0, so every event this file emits
// is genuinely web spend; the `client` property still says so explicitly rather than
// leaving a reader to infer it.

import { phServerCapture } from "@/lib/posthog-server";

/** Voice providers we actually pay, by the lane they serve. */
export type VoiceProvider = "assemblyai_batch" | "assemblyai_streaming" | "groq_whisper_turbo";

/**
 * USD per HOUR of audio, read off each provider's own pricing page on PRICE_REV:
 * assemblyai.com/pricing (streaming $0.15/hr, async $0.21/hr) and groq.com/pricing
 * (whisper-large-v3-turbo $0.04/hr).
 */
export const VOICE_USD_PER_HOUR: Readonly<Record<VoiceProvider, number>> = {
  assemblyai_batch: 0.21,
  assemblyai_streaming: 0.15,
  groq_whisper_turbo: 0.04,
};

/** Price list revision, stamped on every event so a later price change cannot
 *  retroactively rewrite what an earlier month cost. */
export const PRICE_REV = "2026-07-24";

/** Dollar cost of transcribing `seconds` of audio with `provider`. */
export function voiceCostUsd(provider: VoiceProvider, seconds: number): number {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const usd = (safeSeconds / 3600) * VOICE_USD_PER_HOUR[provider];
  // Nine decimals — a few seconds of Groq audio is worth millionths of a dollar.
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
