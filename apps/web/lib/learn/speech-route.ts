// WHICH voice says this, in WHICH variety of WHICH language, and at what pace (§43).
//
// 🔴 THE ROUTER EXISTS BECAUSE ONE OF NEMESIS'S TWO SPEECH LANES INVERTS ALL OF THE OTHER'S RULES,
// AND UNTIL NOW THERE WAS ONLY ONE LANE. `canvas-speech.ts` argues, correctly, that speech is a
// secondary channel: it reads the question and the correction, refuses explanations, and stays out
// of the way so the learner's eyes stay on the material. Every one of those rules assumes the sound
// is an ALTERNATIVE to reading. When the subject is a language, the sound is the subject. Stress,
// rhythm, intonation, vowel quality and the difference between two nearly identical words do not
// survive text at all, so a lesson that only writes them has not taught most of what it claimed.
//
// 🔴 THE ONE DECISION THIS FILE EXISTS TO FORCE IS THE LOCALE. Today every utterance is sent as
// `language: "auto"` — `use-canvas-speech.ts` sends no locale at all and `nemesis-speak` defaults.
// For a question read aloud in the learner's own language that is fine and even right: the
// provider identifies the language from the text and nothing depends on which variety it picks.
// For a language lesson it is the whole ballgame. `es-MX` and `es-ES` differ in exactly the
// features being taught, and `auto` on a Spanish sentence returns *some* Spanish — chosen by a
// provider that was not told which one the learner is studying. So the target-language lane
// REFUSES to speak without an explicit locale rather than guessing one.
//
// 🔴 AND THE LOCALE BELONGS TO THE MOMENT, NOT THE SESSION. A Spanish lesson speaks the Spanish
// sentence in `es-MX` and the correction that follows it in the learner's own language. A session-
// level locale would read "Almost — the stress falls on the last syllable" in a Mexican accent,
// which is not a teaching decision anybody made.
//
// PURE. No fetch, no audio element, no provider SDK. `use-canvas-speech.ts` still owns the I/O; this
// owns the decision, which is what makes each rule below a test rather than a promise.

import type { AssociationPair } from "./knowledge-types";
import {
  speechFor,
  type SpeechRefusal,
  type SpokenMoment,
  type Utterance,
} from "./canvas-speech";

/**
 * What the speech is FOR, which is what decides every rule below it.
 *
 * 🔴 NOT "WHICH LANGUAGE" AND NOT "WHICH SUBJECT". A learner studying pharmacology in Spanish is
 * `canvas` with a Spanish locale; a learner studying Spanish is `language_learning`. The difference
 * is whether the sound is being taught or merely used, and only the second one changes the rules.
 */
export type SpeechPurpose = "canvas" | "language_learning";

/**
 * A synthesiser Nemesis can actually call.
 *
 * 🔴 TWO MEMBERS, BOTH INTEGRATED, AND THAT RULE HAS NOT CHANGED. This union may only name a
 * synthesiser Nemesis can actually call today: `xai` through `nemesis-speak`, `azure` through
 * `/api/speech/tts`. A union of vendor names with no integration behind them reads as a working
 * multi-provider router to the next person, and this repo has been burned by exactly that gap once
 * already.
 *
 * 🔴 THE SECOND MEMBER ARRIVED WITH A JOB, NOT AS A REPLACEMENT. See `TARGET_LANGUAGE_PROVIDER`.
 * What must still not happen is this table filling up from vendors' own coverage claims instead of
 * from a bake-off — see `ProviderEvidence`.
 */
export type TtsProvider = "xai" | "azure";

/**
 * Who speaks when nothing about the moment argues otherwise.
 *
 * xAI, because the Canvas lane is what it has always served and it works: one voice, no locale
 * decision to make, and a key that already lives in the function that pays for it.
 */
export const DEFAULT_PROVIDER: TtsProvider = "xai";

/**
 * Who speaks the language being learned.
 *
 * 🔴 A DIFFERENT PROVIDER FOR A DIFFERENT JOB, NOT A MIGRATION (§47). Everything above about the
 * Canvas lane stays true — and none of it helps here, because the one thing this lane needs is the
 * one thing xAI does not offer: a catalogue. `es-MX` has to map to a named voice somebody can point
 * at, and it has to map to the SAME one tomorrow, or a learner comparing today's attempt with
 * yesterday's is comparing two voices. Azure publishes four hundred neural voices with a queryable
 * list; that is the whole reason it is here.
 *
 * 🔴 AND IT DEGRADES TO xAI RATHER THAN TO SILENCE. `/api/speech/tts` refuses without a locale, but
 * a deployment with no Azure credential should still speak a Spanish sentence badly rather than not
 * at all — `capabilities.ts` holds that ordering, and this constant is what it falls back FROM.
 */
export const TARGET_LANGUAGE_PROVIDER: TtsProvider = "azure";

/**
 * How the provider for a locale was chosen.
 *
 * 🔴 THE FIELD THE OWNER ASKED FOR IN EVERYTHING BUT NAME: *"I would not choose based on those
 * provider claims alone… have native speakers rate… there is no reason to assume the provider that
 * wins Japanese also wins Mexican Spanish."* Published language counts are marketing surface area,
 * not quality per locale, and a table populated from them would be indistinguishable at a glance
 * from one populated by listening. So every row says which it is, and today every row is a default.
 */
export type ProviderEvidence =
  /** A bake-off ran for this locale and this provider won it. */
  | "measured"
  /** Nobody has listened. The default is in use because it is the only integration that exists. */
  | "unmeasured-default";

/**
 * Locale → the provider that won a listening test for it.
 *
 * 🔴 EMPTY, AND THE EMPTINESS IS THE HONEST STATE. No bake-off has run. When one does, its winners
 * land here as data and nothing else in this file changes.
 */
export const MEASURED_PROVIDERS: Readonly<Record<string, TtsProvider>> = {};

/**
 * The pace for speech that accompanies reading.
 *
 * Slightly under natural, matching what `nemesis-speak` has always sent: a question the learner
 * must hold in working memory while composing an answer is not a podcast.
 */
export const CANVAS_SPEED = 0.95;

/**
 * The pace for an utterance in the language being learned.
 *
 * 🔴 NATURAL, AND SLOWING IT DOWN WOULD BE TEACHING SOMETHING FALSE. The `0.95` above is a
 * concession to working memory, which is the right trade when the sentence is a question in the
 * learner's own language. Applied to a target-language utterance it teaches a rhythm that does not
 * exist: connected speech, elision and stress timing are precisely what disappears when speech is
 * slowed, and they are precisely what the learner has to be able to hear later. A learner drilled
 * at 0.95 has been trained on a dialect nobody speaks.
 */
export const TARGET_LANGUAGE_SPEED = 1;

/**
 * The locale sent when nobody has said which one.
 *
 * Fine for the canvas lane — the provider identifies the language from the text and nothing depends
 * on the variety. Refused outright in the target-language lane; see the file header.
 */
export const LOCALE_UNSPECIFIED = "auto";

/**
 * A BCP-47 tag Nemesis will send: language, optional script, optional region.
 *
 * 🔴 A SHAPE CHECK, NOT A REGISTRY. This cannot tell you that `es-MX` exists and `es-QQ` does not,
 * and it does not claim to — validating against the real subtag registry means shipping the
 * registry. What it does catch is the failure that actually happens: a display name, a sentence, or
 * a stray provider argument arriving where a tag belongs, which a synthesiser would either reject
 * or silently ignore in favour of guessing.
 */
const LOCALE_SHAPE = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|\d{3}))?$/;

export function isWellFormedLocale(value: string): boolean {
  return LOCALE_SHAPE.test(value.trim());
}

/** Why nothing will be spoken. `SpeechRefusal`'s reasons, plus the two this lane adds. */
export type SpeechRouteRefusal =
  | SpeechRefusal
  /**
   * A target-language utterance with no locale.
   *
   * 🔴 A REFUSAL RATHER THAN A FALL BACK TO `auto`, AND THAT IS THE POINT OF THE WHOLE FILE. Falling
   * back would produce audio — plausible, fluent, and in whichever variety the provider felt like.
   * The learner would have no way to tell they were being taught the wrong accent, and neither
   * would we. Silence is diagnosable; the wrong accent, confidently delivered, is not.
   */
  | "locale-unknown"
  /** A locale was supplied and is not a tag. See `LOCALE_SHAPE`. */
  | "locale-malformed";

export type SpeechRoute =
  | {
      because: string;
      decision: "speak";
      /** BCP-47, or `auto` when the provider may identify the language itself. */
      locale: string;
      provider: TtsProvider;
      providerEvidence: ProviderEvidence;
      speed: number;
      utterance: Utterance;
    }
  | { because: string; decision: "silent"; reason: SpeechRouteRefusal };

export interface SpeechRouteInput {
  /** Identity of the moment, so the same utterance is not synthesised twice across re-renders. */
  readonly key: string;
  readonly moment: SpokenMoment;
  readonly purpose: SpeechPurpose;
  /**
   * The locale of the language being LEARNED. Required for a `target_language` moment.
   *
   * Ignored for questions and corrections even inside a language lesson: those are spoken in the
   * language of instruction, which is `instructionLocale`.
   */
  readonly targetLocale?: string;
  /**
   * The locale Nemesis teaches IN, when the caller knows it.
   *
   * Absent means `auto`, which is what every caller passes today and what shipped before §43.
   */
  readonly instructionLocale?: string;
}

/**
 * Which provider says this, and on what evidence.
 *
 * `auto` and every unmeasured locale get the default. That is not a routing failure — it is the
 * only integration that exists — but it is reported as unmeasured so a report can tell the two
 * apart.
 */
export function providerForLocale(
  locale: string,
  /**
   * What the speech is for.
   *
   * 🔴 THE ARGUMENT THAT MAKES THIS A ROUTER RATHER THAN A CONSTANT. The same locale gets a
   * different synthesiser depending on whether the sound is the material or merely the channel:
   * `es-MX` on a correction is xAI reading instruction aloud, and `es-MX` on the sentence being
   * taught is Azure speaking a named Mexican voice. One locale, two right answers.
   */
  purpose: SpeechPurpose | "target_language" = "canvas",
): { evidence: ProviderEvidence; provider: TtsProvider } {
  const measured = MEASURED_PROVIDERS[locale.trim()];
  if (measured) return { evidence: "measured", provider: measured };
  return purpose === "target_language"
    ? { evidence: "unmeasured-default", provider: TARGET_LANGUAGE_PROVIDER }
    : { evidence: "unmeasured-default", provider: DEFAULT_PROVIDER };
}

/**
 * Decide the whole utterance: what to say, in which locale, at what pace, through which provider.
 *
 * 🔴 THE TEXT DECISION IS STILL `canvas-speech.ts`'S, AND DELEGATING RATHER THAN REIMPLEMENTING IT
 * IS DELIBERATE. Cleanup, the length bound and the notation refusal are the same rules in both
 * lanes; a second copy here would drift, and the copy that drifts is always the one nobody is
 * looking at. What this file adds is everything AROUND the text.
 */
export function routeSpeech(input: SpeechRouteInput): SpeechRoute {
  const isTarget = input.moment.kind === "target_language";

  // 🔴 A TARGET-LANGUAGE MOMENT IN THE ORDINARY CANVAS LANE IS A CALLER BUG, NOT A LESSON. Nothing
  // outside a language session should be producing one, and speaking it would mean synthesising
  // foreign-language audio in a session that never established a target locale.
  if (isTarget && input.purpose !== "language_learning") {
    return {
      because: "an utterance in a language being learned arrived outside a language session, where no target locale has been established",
      decision: "silent",
      reason: "not-a-spoken-moment",
    };
  }

  const choice = speechFor(input.moment, input.key);
  if (!choice.spoken) {
    return {
      because: `there was nothing sayable here: ${choice.refused}`,
      decision: "silent",
      reason: choice.refused,
    };
  }

  if (!isTarget) {
    // Questions and corrections, in either lane. A correction inside a language lesson is
    // instruction ABOUT the target language and is spoken in the language of instruction.
    const requested = input.instructionLocale?.trim();
    if (requested && !isWellFormedLocale(requested)) {
      return {
        because: `"${requested}" is not a language tag, and sending it would leave the synthesiser guessing while looking configured`,
        decision: "silent",
        reason: "locale-malformed",
      };
    }
    const locale = requested || LOCALE_UNSPECIFIED;
    const { evidence, provider } = providerForLocale(locale);
    return {
      because:
        input.purpose === "language_learning"
          ? "this is instruction about the target language rather than an example of it, so it is spoken in the language of instruction"
          : "voice is a second channel for text the learner could also read, so it runs slightly under natural pace",
      decision: "speak",
      locale,
      provider,
      providerEvidence: evidence,
      speed: CANVAS_SPEED,
      utterance: choice.spoken,
    };
  }

  const target = input.targetLocale?.trim();
  if (!target || target === LOCALE_UNSPECIFIED) {
    return {
      because: "no target locale was established, and the difference between two varieties of a language is part of what is being taught — guessing one teaches the wrong accent invisibly",
      decision: "silent",
      reason: "locale-unknown",
    };
  }
  if (!isWellFormedLocale(target)) {
    return {
      because: `"${target}" is not a language tag, so the provider would fall back to guessing the variety`,
      decision: "silent",
      reason: "locale-malformed",
    };
  }

  const { evidence, provider } = providerForLocale(target, "target_language");
  return {
    because: "the sound is the material here, so it is spoken in the established variety at the pace real speech runs at, through the synthesiser that can name that variety",
    decision: "speak",
    locale: target,
    provider,
    providerEvidence: evidence,
    speed: TARGET_LANGUAGE_SPEED,
    utterance: choice.spoken,
  };
}


/**
 * Which phrase on screen can be heard again, and in which variety (§47).
 *
 * 🔴 REPLAY IS THE PRIMITIVE A LANGUAGE LEARNER ACTUALLY NEEDS, and it is not the same thing as
 * voice mode. Voice mode governs whether Nemesis speaks UNPROMPTED — a second channel for text the
 * learner could also read. Hearing a foreign phrase is not a second channel: the sound IS the
 * material, it has to be repeatable on demand, and someone who keeps voice mode off because they do
 * not want their questions read aloud still needs to hear how `ありがとう` is said.
 *
 * 🔴 MATCHED AGAINST THE PAIR RATHER THAN GUESSED FROM THE TEXT. There is no script detection here
 * and there must not be: a Spanish phrase is Latin script and so is its English gloss, so anything
 * inferring "this looks foreign" would be wrong on exactly the language pair most learners study.
 * The locale was recorded when the pair was read; this looks it up.
 *
 * PURE. Returns null for every subject that is not a language, which is almost all of them.
 */
export function replayableLocale(pair: AssociationPair | undefined, phrase: string): string | null {
  if (!pair) return null;
  const wanted = phrase.trim().toLocaleLowerCase();
  if (!wanted) return null;
  // Compared case-insensitively and trimmed, because the phrase reaching a surface has been through
  // a heading, a claim builder and possibly a truncation — but never re-cased in a way that changes
  // which side it is.
  if (pair.leftLocale && pair.left.trim().toLocaleLowerCase() === wanted) return pair.leftLocale;
  if (pair.rightLocale && pair.right.trim().toLocaleLowerCase() === wanted) return pair.rightLocale;
  return null;
}
