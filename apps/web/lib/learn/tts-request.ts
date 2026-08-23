// ONE utterance, ONE provider, ONE request — decided here and nowhere else.
//
// 🔴🔴 THIS FILE EXISTS BECAUSE "ONLY THE SELECTED PROVIDER IS INVOLVED" HAS TO BE PROVABLE RATHER
// THAN PROMISED. Owner, 2026-08-22: *"If the user has selected an xAI voice, only the xAI path
// should be involved… If the user has selected an Azure voice, only Azure should be involved."*
// While the endpoint and the body were assembled inline inside a `fetch(...)` call in a React hook,
// the only way to check that was to read the hook and believe it. Pulled out here it is a pure
// function returning ONE url and ONE body, which a test can assert on directly — including the
// negative: an xAI plan never names an Azure endpoint, and an Azure plan never names xAI's.
//
// 🔴 EXHAUSTIVE ON THE PROVIDER, NOT A CHAIN OF `if`s WITH A FALLTHROUGH. A future third provider
// makes this a compile error rather than a silent default to xAI, which is the specific way a
// router quietly stops routing.
//
// 🔴 THE RATE SENT HERE IS THE SYNTHESIS RATE AND IT IS THE ROUTER'S, NEVER THE LISTENER'S. What the
// learner sets in the player is `playbackRate` on the audio element — instant, free, and applied to
// audio that already exists. Sending their choice here instead is what used to make changing the
// speed re-synthesise the whole answer.
//
// PURE. Builds a request; makes none.

import type { ReadingProvider } from "@/lib/speech/reading-voice";

export interface TtsRequestInput {
  /** Which synthesiser. Comes from the selected voice, never from a separate setting. */
  readonly provider: ReadingProvider;
  readonly text: string;
  /** The provider's own voice id. Omitted lets the provider's default stand. */
  readonly voiceId?: string;
  /** BCP-47, or `auto`. Required for Azure — its route refuses without one, deliberately. */
  readonly locale?: string;
  /** Synthesis pace, from `speech-route.ts`. Not the listener's playback speed. */
  readonly rate?: number;
  /** The caller's Supabase access token. */
  readonly token: string;
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
}

export interface TtsRequestPlan {
  readonly url: string;
  readonly init: RequestInit;
  /** Echoed back so a caller can log or assert which lane ran without re-deriving it. */
  readonly provider: ReadingProvider;
}

/**
 * Where this utterance is sent, and what is sent with it.
 *
 * 🔴 TWO PROVIDERS, TWO DOORS, AND THE DIFFERENCE IS WHERE A CREDENTIAL SITS. Azure's key is in
 * Vercel, so it is reached through a Next route; xAI's is in Supabase function secrets, so it is
 * reached through `nemesis-speak`. That is exactly the sort of thing a caller should not have to
 * know — it names a provider and this picks the door.
 */
export function ttsRequest(input: TtsRequestInput): TtsRequestPlan {
  const locale = input.locale?.trim();

  if (input.provider === "azure") {
    return {
      init: {
        // 🔴 `fallback` LETS A REGION MISS RESOLVE RATHER THAN 404. `es-AR` with no Argentine voice
        // should be read by a Spanish one, not refused.
        body: JSON.stringify({
          fallback: true,
          ...(locale ? { locale } : {}),
          ...(typeof input.rate === "number" ? { rate: input.rate } : {}),
          text: input.text,
          // 🔴 NAMED WHEN THE LEARNER HAS CHOSEN, AND THE ROUTE SKIPS ITS CATALOGUE ROUND TRIP WHEN
          // IT IS. That fetch is ~700KB from Azure in front of the fetch that makes the sound; on a
          // cold instance it was most of the perceived lag the owner reported.
          ...(input.voiceId ? { voice: input.voiceId } : {}),
        }),
        headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
        method: "POST",
      },
      provider: "azure",
      url: "/api/speech/tts",
    };
  }

  return {
    init: {
      // 🔴 OMITTED WHEN UNSET RATHER THAN SENT AS A DEFAULT. `nemesis-speak` already has defaults for
      // both, and sending `locale: "auto"` explicitly would make the function unable to tell "the
      // caller chose auto" from "the caller is an older bundle that sends neither".
      body: JSON.stringify({
        text: input.text,
        ...(locale && locale !== "auto" ? { locale } : {}),
        ...(typeof input.rate === "number" ? { speed: input.rate } : {}),
        ...(input.voiceId ? { voice: input.voiceId } : {}),
      }),
      headers: {
        apikey: input.supabaseAnonKey,
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
    provider: "xai",
    url: `${input.supabaseUrl}/functions/v1/nemesis-speak`,
  };
}
