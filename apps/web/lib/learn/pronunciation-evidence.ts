// What Nemesis knows about HOW something was said (§43, §47).
//
// 🔴 THIS FILE WAS A BOUNDARY WITH NOTHING BEHIND IT AND NOW HAS A PROVIDER. What has NOT changed is
// why it exists: the durable record, the diagnosis and the teaching policy all consume
// `learner_evidence`, and a pronunciation score arriving in a shape none of them could read would be
// a second evidence system. The schema was written before the vendor was chosen precisely so the
// vendor could not dictate it — Azure's numbers are transformed INTO this, never exported through it.
//
// 🔴 THE DISTINCTION THIS TYPE EXISTS TO HOLD IS UNCHANGED. Speech recognition answers *"what words
// did the learner probably say?"*. This answers *"how did they say them?"* — different cognitive
// operations, not two fields of one result. Nemesis already does the first well (§14); none of it
// says anything about a vowel.
//
// 🔴 EVERY SCORE IS STILL OPTIONAL, AND THAT IS NOW A FACT ABOUT COVERAGE RATHER THAN ABOUT VENDORS.
// Azure returns phonemes for some locales and not others, prosody for a subset, and syllables only
// where the language has a syllabary Azure models. A required `prosody` would force a number to be
// invented for every locale that does not report one — which is how a confident zero ends up in a
// learner's record for something nobody measured.
//
// 🔴 PURE AND CLIENT-SAFE. No provider, no fetch, no key. The assessor lives in `lib/speech`, which
// is server-only; this is the shape it must produce and the vocabulary everything else reads.

import { preferredFor } from "@/lib/speech/capabilities";

/** Which locale the utterance was assessed AGAINST. Never inferred from the audio. */
export type AssessedLocale = string;

/**
 * How confident the assessor is that a unit was produced correctly, 0–1.
 *
 * 🔴 A UNIT SCORE, NOT A GRADE. It says how close the production was to the target, and it is not by
 * itself a verdict on whether the learner was right — that judgement belongs to the teaching policy,
 * which knows what was being taught and what a beginner should be forgiven.
 *
 * 🔴 0–1 RATHER THAN AZURE'S 0–100, AND THE CONVERSION HAPPENS AT THE BOUNDARY. Every other
 * confidence in this codebase is a fraction; letting one provider's scale leak inward would mean the
 * first person to average two numbers gets an answer that is wrong by a factor of a hundred.
 */
export type AccuracyScore = number;

/**
 * What went wrong with a word, as the assessor classifies it.
 *
 * 🔴 THE FIELD THAT SEPARATES "SAID IT BADLY" FROM "DID NOT SAY IT". A mispronounced word is a
 * pronunciation lesson; an omitted one is a different lesson entirely, and an inserted one usually
 * means the learner restarted mid-sentence and should not be marked at all. Collapsing these into a
 * low score would teach the wrong thing three ways.
 */
export type WordErrorType =
  | "none"
  /** In the target, absent from what was said. */
  | "omission"
  /** Said, but not in the target. Usually a false start or a filler. */
  | "insertion"
  | "mispronunciation"
  /** A pause where the language does not take one. */
  | "unexpected-break"
  /** No pause where the language requires one. */
  | "missing-break"
  /** Flat delivery across a stretch that carries meaning through pitch. */
  | "monotone"
  /** The assessor labelled it something this vocabulary does not have. Kept, never guessed at. */
  | "unclassified";

/** One sound, scored. The smallest unit a targeted correction can name. */
export interface PhonemeAssessment {
  readonly accuracy?: AccuracyScore;
  /** The phoneme as the assessor labels it. IPA where the provider offers it, its own symbols otherwise. */
  readonly phoneme: string;
  /**
   * What the recogniser thought it might have heard instead, best first.
   *
   * 🔴 THIS IS THE FIELD THAT TURNS A SCORE INTO A LESSON, AND IT IS THE REASON A PHONEME-LEVEL
   * PROVIDER WAS WORTH INTEGRATING AT ALL. "Your /r/ scored 0.3" tells a learner they were wrong.
   * "You produced something closer to /ɾ/" tells them WHAT THEY DID, which is the only half they
   * could not work out for themselves.
   */
  readonly likelyProduced?: readonly { readonly phoneme: string; readonly score: AccuracyScore }[];
  /** Milliseconds from the start of the audio, for replaying the exact sound. */
  readonly startMs?: number;
  readonly durationMs?: number;
}

/** One syllable, where the language and the provider both have them. */
export interface SyllableAssessment {
  readonly accuracy?: AccuracyScore;
  readonly syllable: string;
  /** The written form of this syllable, when the provider distinguishes sound from spelling. */
  readonly grapheme?: string;
  readonly startMs?: number;
  readonly durationMs?: number;
}

export interface WordAssessment {
  readonly accuracy?: AccuracyScore;
  readonly errorType: WordErrorType;
  /**
   * Sounds within the word, when the provider reports them.
   *
   * 🔴 THE FIELD THAT DECIDES WHETHER THIS IS TEACHING OR SCORING. "Your pronunciation was 72%"
   * changes nothing a learner can act on; "the second vowel is the one" is a lesson. A provider that
   * cannot fill this can still be useful for fluency, and should be described as such rather than as
   * a pronunciation tutor.
   */
  readonly phonemes?: readonly PhonemeAssessment[];
  readonly syllables?: readonly SyllableAssessment[];
  readonly word: string;
  readonly startMs?: number;
  readonly durationMs?: number;
}

/** Whole-utterance measures, where the provider offers them. */
export interface ProsodyAssessment {
  /** Pace and hesitation. */
  readonly fluency?: AccuracyScore;
  /** Stress, rhythm and contour — the part text cannot carry at all. */
  readonly prosody?: AccuracyScore;
}

/** The headline numbers, each one separately optional for the reason in the file header. */
export interface OverallAssessment {
  /** How close the sounds were to the target. */
  readonly accuracy?: AccuracyScore;
  /** How much of the target was actually attempted. Low means words were skipped, not mangled. */
  readonly completeness?: AccuracyScore;
  /** The provider's own weighted summary, kept because it is what its documentation describes. */
  readonly overall?: AccuracyScore;
}

/**
 * What one attempt produced.
 *
 * 🔴 IT CARRIES THE TRANSCRIPT TOO, AND NOT BECAUSE IT DUPLICATES STT. The two answers have to be
 * read together: a learner who said the wrong word entirely has a pronunciation problem nobody
 * should diagnose, and separating "said something else" from "said the right thing badly" is the
 * first branch any correction has to take.
 */
export interface PronunciationEvidence {
  /** What the recogniser heard. */
  readonly heard: string;
  readonly locale: AssessedLocale;
  /** Which assessor produced this. Absent providers are why the whole record is absent, not zeroed. */
  readonly provider: string;
  readonly overall?: OverallAssessment;
  readonly prosody?: ProsodyAssessment;
  /** What the learner was asked to say. */
  readonly target: string;
  readonly words?: readonly WordAssessment[];
  /** How long the assessment round trip took, so latency is measured rather than assumed. */
  readonly latencyMs?: number;
  /**
   * The provider's untouched response.
   *
   * 🔴 KEPT DELIBERATELY, AND NOT FOR DEBUGGING. Azure reports fields this schema does not model
   * yet and will report more; a normalisation that discarded the original would make every future
   * question ("does it give us stress? tone? which locales carry syllables?") a new round of data
   * collection instead of a query over attempts already made. It is stripped before anything is
   * shown to a learner and it never crosses into `learner_evidence`.
   */
  readonly raw?: unknown;
}

/**
 * Why no pronunciation evidence exists for an attempt.
 *
 * 🔴 NAMED, LIKE EVERY OTHER REFUSAL IN THIS CODEBASE, so "we have not built this" never reads as
 * "the learner scored nothing".
 */
export type PronunciationGap =
  /** No assessment provider is configured in this deployment. */
  | "no-provider"
  /** A provider exists but does not cover this locale. */
  | "locale-unsupported"
  /** The locale is not a language tag. */
  | "locale-malformed"
  /** The audio was too short, too quiet, or otherwise unusable. */
  | "audio-unusable"
  /** There was no target text to assess against. Assessment is always against something. */
  | "no-target"
  /** The recogniser heard nothing at all. */
  | "nothing-heard"
  /** The learner said something other than the target, so pronunciation cannot be diagnosed. */
  | "off-target"
  /** The provider rejected the credential. */
  | "provider-unauthorised"
  /** The provider is throttling — the free tier does this on ordinary drilling. */
  | "provider-rate-limited"
  | "provider-error"
  | "provider-unreachable";

export type PronunciationResult =
  | { readonly evidence: PronunciationEvidence; readonly ok: true }
  | { readonly detail: string; readonly ok: false; readonly reason: PronunciationGap };

/**
 * May Nemesis claim to be teaching pronunciation right now?
 *
 * 🔴 A FUNCTION OF THE DEPLOYMENT, NOT A CONSTANT, AND THAT IS THE POINT. §43 was explicit that
 * Nemesis must not claim to teach pronunciation while nothing could measure it. That is now true or
 * false depending on whether this deployment has an Azure credential — a preview build without one
 * must still be honest about it, and a surface that hard-coded `true` the day the provider landed
 * would lie on every environment that has not been configured.
 *
 * `configured` is a map of env-var name to presence, built server-side. See `configuredSpeechKeys`.
 */
export function pronunciationTeachingAvailable(configured: Readonly<Record<string, boolean>>): boolean {
  return preferredFor("pronunciation", configured) !== null;
}
