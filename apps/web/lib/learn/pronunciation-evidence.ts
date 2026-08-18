// The shape of evidence Nemesis does not yet collect (§43).
//
// 🔴 THIS FILE IMPLEMENTS NOTHING AND THAT IS ITS ENTIRE PURPOSE. There is no provider, no API call
// and no scoring here, because none has been chosen — the owner's instruction was to create the
// boundary and stop. What it prevents is the version of this work that starts by picking a vendor
// and discovers afterwards that the evidence does not fit anywhere: the durable record, the
// diagnosis and the teaching policy all consume `learner_evidence`, and a pronunciation score that
// arrived in a shape none of them could read would be a second evidence system.
//
// 🔴 THE DISTINCTION THIS TYPE EXISTS TO HOLD. Speech recognition answers *"what words did the
// learner probably say?"*. This answers *"how did they say them?"* — and those are different
// cognitive operations, not two fields of one result. Nemesis already does the first well (§14):
// the microphone fills the composer, the judge is told to forgive false starts, and the modality is
// stored. None of that says anything about a vowel.
//
// 🔴 EVERY SCORE IS OPTIONAL, AND THAT IS A FACT ABOUT PROVIDERS RATHER THAN A SOFTENING. Assessment
// services differ in what they return: some give phoneme-level accuracy, some only word-level, some
// add fluency and prosody, and coverage varies by locale within one vendor. A required `prosody`
// would force whichever provider is chosen to be fabricated into compliance — which is how a
// confident zero ends up in a learner's record for something nobody measured.

/** Which locale the utterance was assessed AGAINST. Never inferred from the audio. */
export type AssessedLocale = string;

/**
 * How confident the assessor is that a unit was produced correctly, 0–1.
 *
 * 🔴 A UNIT SCORE, NOT A GRADE. It says how close the production was to the target, and it is not
 * by itself a verdict on whether the learner was right — that judgement belongs to the teaching
 * policy, which knows what was being taught and what a beginner should be forgiven.
 */
export type AccuracyScore = number;

/** One sound, scored. The smallest unit a targeted correction can name. */
export interface PhonemeAssessment {
  readonly accuracy?: AccuracyScore;
  /** The phoneme as the assessor labels it. IPA where the provider offers it, its own symbols otherwise. */
  readonly phoneme: string;
}

export interface WordAssessment {
  readonly accuracy?: AccuracyScore;
  /**
   * Sounds within the word, when the provider reports them.
   *
   * 🔴 THE FIELD THAT DECIDES WHETHER THIS IS TEACHING OR SCORING. "Your pronunciation was 72%"
   * changes nothing a learner can act on; "the second vowel is the one" is a lesson. A provider
   * that cannot fill this can still be useful for fluency, and should be described as such rather
   * than as a pronunciation tutor.
   */
  readonly phonemes?: readonly PhonemeAssessment[];
  readonly word: string;
}

/** Whole-utterance measures, where the provider offers them. */
export interface ProsodyAssessment {
  /** Pace and hesitation. */
  readonly fluency?: AccuracyScore;
  /** Stress, rhythm and contour — the part text cannot carry at all. */
  readonly prosody?: AccuracyScore;
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
  readonly prosody?: ProsodyAssessment;
  /** What the learner was asked to say. */
  readonly target: string;
  readonly words?: readonly WordAssessment[];
}

/**
 * Why no pronunciation evidence exists for an attempt.
 *
 * 🔴 NAMED, LIKE EVERY OTHER REFUSAL IN THIS CODEBASE, so "we have not built this" never reads as
 * "the learner scored nothing". Today exactly one of these is ever true.
 */
export type PronunciationGap =
  /** No assessment provider is integrated. **The only value reachable today.** */
  | "no-provider"
  /** A provider exists but does not cover this locale. */
  | "locale-unsupported"
  /** The audio was too short, too quiet, or otherwise unusable. */
  | "audio-unusable"
  /** The learner said something other than the target, so pronunciation cannot be diagnosed. */
  | "off-target";

export type PronunciationResult =
  | { evidence: PronunciationEvidence; ok: true }
  | { detail: string; ok: false; reason: PronunciationGap };

/**
 * What Nemesis can say about how something was said.
 *
 * 🔴 IT RETURNS THE SAME REFUSAL EVERY TIME, ON PURPOSE, AND IT IS CALLED RATHER THAN COMMENTED OUT.
 * A surface that wants pronunciation evidence gets a named "not built" it can render honestly,
 * instead of an empty object it will mistake for a perfect score. The day a provider is chosen,
 * this function grows a body and every caller already handles both outcomes.
 */
export function assessPronunciation(): PronunciationResult {
  return {
    detail: "no pronunciation-assessment provider is integrated — Nemesis can hear what was said, not how",
    ok: false,
    reason: "no-provider",
  };
}

/**
 * May Nemesis claim to be teaching pronunciation right now?
 *
 * 🔴 A FUNCTION RATHER THAN A CONSTANT SO IT READS AS A CAPABILITY CHECK AT THE CALL SITE. §43 is
 * explicit: Nemesis can teach vocabulary and grammar in a language today and must not claim to
 * teach pronunciation. A surface that shows a "pronunciation" mode has to ask this first.
 */
export function pronunciationTeachingAvailable(): boolean {
  return assessPronunciation().ok;
}
