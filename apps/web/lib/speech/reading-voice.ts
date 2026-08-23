// WHICH voice Nemesis reads in — chosen once, in Settings, and used everywhere it speaks.
//
// 🔴 THIS REPLACES A PICKER THAT LIVED INSIDE THE CANVAS, AND THE MOVE IS THE POINT. Owner,
// 2026-08-22: *"Canvas should not make the user repeatedly choose a voice."* A speaker is not a
// property of one lesson — it is what the product sounds like to one person — so it belongs beside
// theme and accent, chosen once and never asked again. The Canvas keeps exactly one voice decision:
// whether to start speaking by itself.
//
// 🔴 A VOICE CARRIES ITS OWN PROVIDER, WHICH IS WHAT MAKES "ONLY ONE PROVIDER RUNS" STRUCTURAL
// RATHER THAN A PROMISE. There is no separate provider setting to fall out of step with the voice:
// picking `eve` picks xAI, picking `en-US-AvaMultilingualNeural` picks Azure, and `ttsRequest`
// builds exactly one request from that one field. Two settings that can disagree is how a product
// ends up calling both synthesisers for one sentence.
//
// 🔴 THE xAI SIX ARE A MEASUREMENT AND THE AZURE ROWS ARE FETCHED — NEITHER IS INVENTED. The six
// below come from `lib/learn/canvas-voices.ts`, established by probing the deployed function (an
// unrecognised id is a 502, not a typo). Azure's are discovered live from its catalogue by
// `/api/speech/voices?multilingual=true`, so this file never carries a hard-coded Azure id that
// could be retired without telling us. If Azure is not configured, its section simply does not
// appear — an honest empty, not a list that 404s on press.
//
// PURE. No React, no fetch. `voice-settings.tsx` does the I/O.

import { CANVAS_VOICES, DEFAULT_VOICE } from "@/lib/learn/canvas-voices";

/** A synthesiser Nemesis can actually call. Mirrors `TtsProvider` in `lib/learn/speech-route.ts`. */
export type ReadingProvider = "xai" | "azure";

export interface ReadingVoice {
  /** What the provider is sent: an xAI `voice_id`, or an Azure `ShortName`. */
  readonly id: string;
  /** What the picker shows. */
  readonly label: string;
  readonly provider: ReadingProvider;
  /**
   * The voice's own locale, for Azure only.
   *
   * 🔴 REQUIRED FOR AZURE AND MEANINGLESS FOR xAI, WHICH IS WHY IT IS OPTIONAL RATHER THAN ALWAYS
   * PRESENT. `/api/speech/tts` refuses without a locale on purpose (§43: guessing a variety teaches
   * the wrong accent invisibly), so an Azure voice has to travel with the one it was catalogued
   * under. xAI takes `auto` and identifies the language from the text itself.
   */
  readonly locale?: string;
  /** Azure's own English name for the locale, e.g. "English (United States)". Shown as a hint. */
  readonly localeName?: string;
}

/**
 * The six xAI voices, as reading voices.
 *
 * 🔴 LANGUAGE-AGNOSTIC, AND ON A FIELD-AGNOSTIC PRODUCT THAT IS THE REASON THEY ARE THE DEFAULT.
 * xAI takes `auto` and reads whatever language the text is in, so a law student working in English
 * and an engineering student working in Portuguese both get their own language back without either
 * of them having chosen a locale.
 */
export const XAI_READING_VOICES: readonly ReadingVoice[] = CANVAS_VOICES.map((voice) => ({
  id: voice.id,
  label: voice.label,
  provider: "xai" as const,
}));

/** What everybody has heard until now, and what an unreadable preference resolves to. */
export const DEFAULT_READING_VOICE: ReadingVoice =
  XAI_READING_VOICES.find((voice) => voice.id === DEFAULT_VOICE) ?? XAI_READING_VOICES[0]!;

/** Where the choice is kept. Versioned, like every other key this app stores. */
export const READING_VOICE_KEY = "nemesis.voice.reading.v1";

/**
 * The Canvas-era key this preference grew out of.
 *
 * 🔴 READ, NEVER WRITTEN, AND ONLY WHEN THE NEW KEY IS ABSENT. Somebody who picked "Ara" in the
 * Canvas menu last week must not be silently reset to Eve because the setting moved house. One
 * migration, in the direction the product moved, and the old key is left where it is rather than
 * deleted — a rollback that finds it missing would be a second silent re-voicing.
 */
export const LEGACY_CANVAS_VOICE_KEY = "nemesis.canvas.voice.v1";

/**
 * An Azure voice id, by shape.
 *
 * 🔴 A SHAPE CHECK RATHER THAN A LIST, FOR THE REASON `nemesis-speak` GIVES ABOUT xAI's IDS: the
 * real set lives at the provider and changes without telling us, so a compiled-in allow-list starts
 * refusing voices that work the day Azure ships one. What has to be checked is that the value
 * cannot be anything BUT an identifier — it goes into a request body under our own credential.
 */
const AZURE_ID_SHAPE = /^[A-Za-z0-9-]{3,64}Neural$/;

/**
 * A stored preference, or the default.
 *
 * 🔴 AN UNRECOGNISABLE STORED VOICE RESOLVES TO THE DEFAULT RATHER THAN BEING SENT. Both providers
 * answer an unknown id with an error, and to the learner that is indistinguishable from voice being
 * broken — while the setting that caused it is in another part of the app entirely. The same guard
 * `readVoice()` has always held, kept on the near side of the network.
 */
export function readReadingVoice(storage: Pick<Storage, "getItem"> | null): ReadingVoice {
  if (!storage) return DEFAULT_READING_VOICE;
  let raw: string | null = null;
  try {
    raw = storage.getItem(READING_VOICE_KEY);
  } catch {
    return DEFAULT_READING_VOICE;
  }

  if (!raw) {
    // The Canvas-era choice, which was always an xAI id and never anything else.
    let legacy: string | null = null;
    try {
      legacy = storage.getItem(LEGACY_CANVAS_VOICE_KEY);
    } catch {
      return DEFAULT_READING_VOICE;
    }
    const id = (legacy ?? "").trim();
    return XAI_READING_VOICES.find((voice) => voice.id === id) ?? DEFAULT_READING_VOICE;
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_READING_VOICE;
  }
  if (!parsed || typeof parsed !== "object") return DEFAULT_READING_VOICE;

  const row = parsed as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const provider = row.provider === "azure" ? "azure" : row.provider === "xai" ? "xai" : null;
  if (!id || !provider) return DEFAULT_READING_VOICE;

  if (provider === "xai") {
    return XAI_READING_VOICES.find((voice) => voice.id === id) ?? DEFAULT_READING_VOICE;
  }

  // 🔴 AZURE IS VALIDATED BY SHAPE AND BY THE ONE FIELD THE ROUTE CANNOT DO WITHOUT. A stored Azure
  // voice with no locale would reach `/api/speech/tts` and be refused on every utterance, silently,
  // for as long as it stayed selected.
  const locale = typeof row.locale === "string" ? row.locale.trim() : "";
  if (!AZURE_ID_SHAPE.test(id) || !locale) return DEFAULT_READING_VOICE;
  const label = typeof row.label === "string" && row.label.trim() ? row.label.trim() : id;
  const localeName = typeof row.localeName === "string" && row.localeName.trim() ? row.localeName.trim() : undefined;
  return { id, label, locale, provider: "azure", ...(localeName ? { localeName } : {}) };
}

export function writeReadingVoice(storage: Pick<Storage, "setItem"> | null, voice: ReadingVoice): void {
  if (!storage) return;
  try {
    storage.setItem(READING_VOICE_KEY, JSON.stringify(voice));
  } catch {
    // A full or blocked store loses a UI preference. It must not break the lesson.
  }
}

/** Whether two selections are the same voice. Used to mark the current row in the picker. */
export function sameVoice(a: ReadingVoice | null, b: ReadingVoice | null): boolean {
  if (!a || !b) return false;
  return a.provider === b.provider && a.id === b.id;
}
