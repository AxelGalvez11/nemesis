// WHERE a decided utterance is actually sent — the last gap between `speech-route.ts` and a sound.
//
// 🔴🔴 THE ROUTER HAS BEEN CHOOSING AZURE SINCE §47 AND NOTHING HAS EVER CALLED IT. Every piece was
// built: `speech-route.ts` names a provider per utterance, `capabilities.ts` orders the providers
// per capability, and `/api/speech/tts` has been live, authenticated, catalogue-backed and
// streaming the whole time. `use-canvas-speech.ts` posted every utterance to `nemesis-speak`
// regardless, because nothing on that path ever read `provider`. A router whose decision nothing
// reads is a comment, and the owner heard the consequence directly: xAI reading a German sentence,
// because xAI was the only synthesiser any code path could reach.
//
// 🔴 AZURE IS CHOSEN ONLY WITH A REAL LOCALE IN HAND, WHICH IS NOT A SECOND GUESS AT §43'S RULE.
// `/api/speech/tts` refuses without one, by design — so planning an Azure call without a locale
// would be planning a 400. The router already refuses to invent a locale; this refuses to send a
// request that cannot succeed.
//
// PURE. No fetch, no token, no audio element. The hook still owns the I/O; this owns the decision,
// which is what makes each rule below a test rather than a promise.

import { isWellFormedLocale, LOCALE_UNSPECIFIED, type TtsProvider } from "./speech-route";

/** Azure, same-origin, bearer-authenticated. Streams MPEG back. */
export const AZURE_TTS_PATH = "/api/speech/tts";

/** xAI, through the Supabase function whose key already pays for the Canvas lane. */
export const XAI_SPEAK_FUNCTION = "nemesis-speak";

/** What `/api/speech/tts` accepts. `rate`, not `speed` — the route's own name for it. */
export interface AzureSpeechBody {
  readonly locale: string;
  readonly rate?: number;
  readonly text: string;
}

/** What `nemesis-speak` accepts, unchanged from what shipped before this file existed. */
export interface XaiSpeechBody {
  readonly locale?: string;
  readonly speed?: number;
  readonly text: string;
  readonly voice?: string;
}

export type SpeechPlan =
  | { body: AzureSpeechBody; endpoint: "azure" }
  | { body: XaiSpeechBody; endpoint: "xai" };

export interface SpeechPlanInput {
  /** BCP-47, or `auto`, or absent. */
  readonly locale?: string;
  /** As `speech-route.ts` decided it. Absent means the Canvas default. */
  readonly provider?: TtsProvider;
  readonly speed?: number;
  readonly text: string;
  /** The learner's chosen speaker, for the xAI lane. Azure picks from its catalogue by locale. */
  readonly voiceId?: string;
}

/**
 * A locale a synthesiser can act on: present, not `auto`, and shaped like a tag.
 *
 * 🔴 `auto` IS AN ANSWER FOR THE CANVAS LANE AND A REFUSAL FOR THIS ONE. It means "the provider may
 * identify the language itself", which is exactly what the language lane must never allow.
 */
function namedLocale(locale: string | undefined): string | null {
  const trimmed = locale?.trim();
  if (!trimmed || trimmed === LOCALE_UNSPECIFIED) return null;
  return isWellFormedLocale(trimmed) ? trimmed : null;
}

/**
 * Which synthesiser this utterance goes to, and the exact body it is sent with.
 *
 * 🔴 THE xAI BRANCH IS BYTE-IDENTICAL TO WHAT SHIPPED BEFORE. Every field is still omitted when
 * unset rather than sent as a default, for the reason `use-canvas-speech.ts` recorded: a function
 * that receives `locale: "auto"` explicitly cannot tell "the caller chose auto" from "the caller is
 * old and sends neither". Anything that is not a deliberate Azure utterance takes exactly the path
 * it always took.
 */
export function planSpeech(input: SpeechPlanInput): SpeechPlan {
  const locale = namedLocale(input.locale);

  if (input.provider === "azure" && locale) {
    return {
      body: {
        locale,
        ...(typeof input.speed === "number" ? { rate: input.speed } : {}),
        text: input.text,
      },
      endpoint: "azure",
    };
  }

  return {
    body: {
      ...(input.locale && input.locale !== LOCALE_UNSPECIFIED ? { locale: input.locale } : {}),
      ...(typeof input.speed === "number" ? { speed: input.speed } : {}),
      text: input.text,
      ...(input.voiceId ? { voice: input.voiceId } : {}),
    },
    endpoint: "xai",
  };
}

/**
 * The same utterance, sent the way it would have been sent before Azure existed.
 *
 * 🔴 THIS IS `capabilities.ts`'S ORDERING MADE REACHABLE, NOT A SECOND ROUTER. That file states the
 * rule in words — *"an Azure outage degrades the language lane to xAI's `auto` rather than to
 * silence — worse audio, still a lesson"* — and until now nothing could carry it out, because
 * nothing could call Azure to begin with. A deployment with no `AZURE_SPEECH_KEY` answers 503, a
 * locale with no voice in the catalogue answers 404, and both of those should still teach.
 *
 * 🔴 THE LOCALE SURVIVES THE FALL. `nemesis-speak` takes a locale even though it will not honour a
 * variety, so a Mexican Spanish sentence degrades to *some* Spanish rather than to whatever the
 * provider guesses from the text. Worse than a named voice, far better than English.
 */
export function withoutAzure(input: SpeechPlanInput): SpeechPlan {
  return planSpeech({ ...input, provider: "xai" });
}
