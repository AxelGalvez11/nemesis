// Choosing a voice for a locale, deterministically, with the fallback stated out loud.
//
// 🔴 THE RULE §43 REFUSES TO BREAK IS THE ONE THIS FILE IMPLEMENTS. A target-language utterance must
// be spoken in the variety being taught, and `auto` is refused precisely because a provider picking
// its own Spanish is invisible. Selecting `es-ES` when the lesson said `es-MX` would be the same
// failure wearing a catalogue — so a region fallback is allowed but it is REPORTED, and the caller
// decides whether "close enough" is close enough for what it is teaching.
//
// 🔴 DETERMINISTIC, AND THAT IS A TEACHING REQUIREMENT RATHER THAN TIDINESS. A learner drilling one
// sentence hears it four times; if the voice changes between attempts they are comparing their
// production against a moving target, and any progress they hear might be the voice. Same locale,
// same catalogue, same voice — every time, forever, including after a redeploy.
//
// 🔴 NOTHING HERE KNOWS ANY LANGUAGE. There is no list of "good" locales, no per-language
// preference, no assumption about which regions exist. It matches tags structurally and filters on
// fields Azure supplies. A rule that only made sense for Spanish would be wrong on Tagalog.
//
// PURE. Takes a catalogue, returns a choice.

import type { AzureVoice, VoiceGender } from "./azure/voice-catalog";

export type VoiceSelectionRefusal =
  /** The catalogue has no voices at all. */
  | "catalogue-empty"
  /** The requested locale is not a language tag. */
  | "locale-malformed"
  /** Azure has no voice for this language at all — not the region, the language. */
  | "locale-unsupported"
  /** The language exists but nothing matches the gender or style that was asked for. */
  | "no-voice-matches";

/** How close the chosen voice is to what was asked for. */
export type VoiceMatch =
  /** The exact locale, e.g. `es-MX` for `es-MX`. */
  | "exact"
  /** The right language, a different region — `es-ES` for `es-MX`. Audible, and reported. */
  | "region-fallback"
  /** A multilingual voice that lists this locale as a secondary. */
  | "secondary-locale";

export interface VoiceChoice {
  readonly voice: AzureVoice;
  readonly match: VoiceMatch;
  /** What was asked for, kept beside what was chosen so a surface can show the gap. */
  readonly requestedLocale: string;
  readonly because: string;
  /** Other voices for the same locale, so a picker has something to offer. Bounded. */
  readonly alternatives: readonly AzureVoice[];
}

export type VoiceSelection =
  | { readonly ok: true; readonly choice: VoiceChoice }
  | { readonly ok: false; readonly reason: VoiceSelectionRefusal; readonly detail: string };

export interface VoiceRequest {
  readonly locale: string;
  readonly gender?: VoiceGender;
  /** An Azure speaking style. Only voices advertising it are considered. */
  readonly style?: string;
  /** An exact `ShortName`, when a learner or a lesson has already chosen. Wins over everything. */
  readonly shortName?: string;
  /** Allow a different region of the same language when the exact locale has no voice. */
  readonly allowRegionFallback?: boolean;
}

/** The same shape check `speech-route.ts` holds. Duplicated rather than imported: see below. */
const LOCALE_SHAPE = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|\d{3}))?$/;

/** How many other voices a choice carries with it. Enough for a picker, not a data dump. */
const MAX_ALTERNATIVES = 8;

function languageOf(locale: string): string {
  return (locale.split("-")[0] ?? locale).toLowerCase();
}

/**
 * Order two candidates. The FIRST one wins, and this is the whole determinism argument.
 *
 * Generally available before preview, neural before anything else, then alphabetical by short name.
 * Alphabetical is not a quality judgement — it is a tie-break that cannot drift, which is the only
 * property that matters once the real criteria are exhausted.
 */
function preferable(a: AzureVoice, b: AzureVoice): number {
  if (a.neural !== b.neural) return a.neural ? -1 : 1;
  if (a.preview !== b.preview) return a.preview ? 1 : -1;
  return a.shortName.localeCompare(b.shortName, "en");
}

export function selectVoice(catalogue: readonly AzureVoice[], request: VoiceRequest): VoiceSelection {
  if (catalogue.length === 0) {
    return { detail: "the voice catalogue is empty", ok: false, reason: "catalogue-empty" };
  }

  // An explicit voice is an instruction, not a preference: honour it or say it does not exist.
  if (request.shortName) {
    const named = catalogue.find((voice) => voice.shortName === request.shortName);
    if (!named) {
      return { detail: `no voice named "${request.shortName}" is in the catalogue`, ok: false, reason: "no-voice-matches" };
    }
    return {
      choice: {
        alternatives: [],
        because: "this voice was named explicitly",
        match: named.locale === request.locale ? "exact" : "region-fallback",
        requestedLocale: request.locale,
        voice: named,
      },
      ok: true,
    };
  }

  const locale = request.locale.trim();
  if (!LOCALE_SHAPE.test(locale)) {
    return { detail: `"${locale}" is not a language tag`, ok: false, reason: "locale-malformed" };
  }

  const language = languageOf(locale);
  const sameLanguage = catalogue.filter((voice) => languageOf(voice.locale) === language);
  const secondary = catalogue.filter(
    (voice) => voice.secondaryLocales.some((tag) => tag === locale || languageOf(tag) === language),
  );
  if (sameLanguage.length === 0 && secondary.length === 0) {
    return {
      detail: `Azure has no voice for "${language}"`,
      ok: false,
      reason: "locale-unsupported",
    };
  }

  const wanted = (pool: readonly AzureVoice[]) =>
    pool
      .filter((voice) => voice.neural)
      .filter((voice) => (request.gender ? voice.gender === request.gender : true))
      .filter((voice) => (request.style ? voice.styles.includes(request.style) : true))
      .slice()
      .sort(preferable);

  const [exact, ...otherExact] = wanted(sameLanguage.filter((voice) => voice.locale === locale));
  if (exact) {
    return {
      choice: {
        alternatives: otherExact.slice(0, MAX_ALTERNATIVES),
        because: `${exact.shortName} speaks ${locale}, which is the variety being taught`,
        match: "exact",
        requestedLocale: locale,
        voice: exact,
      },
      ok: true,
    };
  }

  const [multilingual, ...otherMultilingual] = wanted(
    secondary.filter((voice) => voice.secondaryLocales.includes(locale)),
  );
  if (multilingual) {
    return {
      choice: {
        alternatives: otherMultilingual.slice(0, MAX_ALTERNATIVES),
        because: `${multilingual.shortName} is a multilingual voice that lists ${locale}`,
        match: "secondary-locale",
        requestedLocale: locale,
        voice: multilingual,
      },
      ok: true,
    };
  }

  // 🔴 OPT-IN, AND THE CALLER HAS TO SAY SO. A Mexican learner hearing Castilian is being taught a
  // distinction the lesson did not choose — sometimes acceptable, never automatic. The default is a
  // refusal the surface can explain.
  if (!request.allowRegionFallback) {
    return {
      detail: `no ${locale} voice exists; other regions of "${language}" are available but were not allowed`,
      ok: false,
      reason: "no-voice-matches",
    };
  }
  const [nearest, ...otherRegions] = wanted(sameLanguage);
  if (!nearest) {
    return {
      detail: request.style
        ? `no ${language} voice offers the style "${request.style}"`
        : `no ${language} voice matches the requested gender`,
      ok: false,
      reason: "no-voice-matches",
    };
  }
  return {
    choice: {
      alternatives: otherRegions.slice(0, MAX_ALTERNATIVES),
      because: `no ${locale} voice exists, so ${nearest.shortName} (${nearest.locale}) was used instead — a different region of the same language`,
      match: "region-fallback",
      requestedLocale: locale,
      voice: nearest,
    },
    ok: true,
  };
}

/** Every locale the catalogue can speak, sorted. What a language picker offers. */
export function supportedLocales(catalogue: readonly AzureVoice[]): readonly { locale: string; localeName: string; voices: number }[] {
  const counts = new Map<string, { localeName: string; voices: number }>();
  for (const voice of catalogue) {
    if (!voice.neural) continue;
    const held = counts.get(voice.locale);
    if (held) held.voices += 1;
    else counts.set(voice.locale, { localeName: voice.localeName, voices: 1 });
  }
  return [...counts.entries()]
    .map(([locale, value]) => ({ locale, ...value }))
    .sort((a, b) => a.locale.localeCompare(b.locale, "en"));
}
