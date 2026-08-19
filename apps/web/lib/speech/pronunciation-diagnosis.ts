// Turning an assessment into something a learner can act on (§47).
//
// 🔴 THE WHOLE POINT IS THAT "72%" IS NOT A LESSON. A score tells a learner they were wrong, which
// they already suspected; what they cannot work out for themselves is WHICH WORD, WHICH SOUND, and
// WHAT THEY ACTUALLY PRODUCED. Azure reports all three. This file is the difference between
// forwarding a vendor's metrics and teaching with them.
//
// 🔴 THE FIRST BRANCH IS NOT A SCORE AT ALL. A learner who said a different sentence has no
// pronunciation problem to diagnose, and marking their vowels would be marking the wrong utterance.
// Omission, insertion and low completeness are checked BEFORE any phoneme is looked at, because a
// correction that names a vowel in a word the learner never said is worse than no correction.
//
// 🔴 NOTHING HERE KNOWS ANY LANGUAGE, AND THAT IS THE STANDING RULE RATHER THAN A PREFERENCE. There
// is no list of "hard sounds", no Spanish rolled-R special case, no English th-fronting rule. Every
// judgement is structural: which unit scored lowest, what the assessor said was produced instead,
// where in the word it sits. A heuristic that only made sense for Spanish would be silently wrong on
// Japanese, and this product serves both.
//
// 🔴 THE PROSE OBEYS `learner-voice.ts`. No "let's", no praise, no exclamation marks, and the
// headline stays inside `MAX_HEADLINE_WORDS`. A correction that reads like a chatbot gets discounted
// exactly when it matters.
//
// PURE. Evidence in, findings out.

import type {
  PhonemeAssessment,
  PronunciationEvidence,
  WordAssessment,
  WordErrorType,
} from "@/lib/learn/pronunciation-evidence";

/**
 * Below this, a unit is worth naming.
 *
 * 🔴 A THRESHOLD, NOT A GRADE, AND IT IS DELIBERATELY GENEROUS. Native speakers do not score 1.0;
 * ordinary connected speech lands in the eighties on Azure's scale. Setting this near the top would
 * hand a learner four corrections for an utterance that was perfectly comprehensible, which teaches
 * them to ignore corrections.
 */
export const NEEDS_WORK_BELOW = 0.6;

/** Above this the attempt is not worth correcting at all — say so and move on. */
export const GOOD_ENOUGH_ABOVE = 0.8;

/** How many findings one correction may carry. More than this is a list nobody acts on. */
export const MAX_FINDINGS = 3;

export type FindingKind =
  /** The word was skipped. */
  | "omitted"
  /** Something was said that was not in the target — usually a false start. */
  | "inserted"
  /** The word was attempted and one or more sounds missed. */
  | "mispronounced"
  /** Timing rather than sounds: a pause in the wrong place, or none where one belongs. */
  | "phrasing"
  /** Delivered flat where the language carries meaning in pitch. */
  | "monotone";

export interface SoundFinding {
  /** The target sound, as the assessor labels it. IPA where the locale supports it. */
  readonly target: string;
  /**
   * What the assessor thought was produced instead, best first.
   *
   * 🔴 ABSENT IS COMMON AND MUST STAY DISTINGUISHABLE FROM "produced the target". Not every locale
   * returns alternatives; a surface that rendered an empty list as "you said it right" would
   * contradict the score sitting next to it.
   */
  readonly likelyProduced?: string;
  readonly accuracy?: number;
  /** Which sound of the word this is, counting from one — what a learner is told to listen for. */
  readonly position: number;
  readonly of: number;
  /** Where in the recording it happened, so the attempt can be replayed at that point. */
  readonly startMs?: number;
  readonly durationMs?: number;
}

export interface PronunciationFinding {
  readonly word: string;
  /** Position in the target sentence, counting from zero. */
  readonly wordIndex: number;
  readonly kind: FindingKind;
  readonly accuracy?: number;
  /** The specific sound, when the assessor reported sounds for this locale. */
  readonly sound?: SoundFinding;
  /** The syllable it sits in, when the locale reports syllables. */
  readonly syllable?: string;
  /**
   * One line naming what happened. Structural, never a language rule.
   *
   * See the header: Nemesis does not know that Spanish `rr` is a trill, and inventing that it does
   * is how a confident wrong explanation reaches a learner.
   */
  readonly says: string;
}

export interface Diagnosis {
  /** Whether this attempt is worth correcting at all. */
  readonly verdict: "good" | "close" | "needs-work" | "off-target" | "not-assessable";
  /** At most `MAX_HEADLINE_WORDS` words. Empty when there is nothing to say. */
  readonly headline: string;
  readonly findings: readonly PronunciationFinding[];
  /** What the learner should say next, unchanged from the target. */
  readonly target: string;
  readonly locale: string;
  /** The number a progress view tracks. Undefined when the provider reported none. */
  readonly overall?: number;
}

const KIND_FOR_ERROR: Readonly<Record<WordErrorType, FindingKind | null>> = {
  insertion: "inserted",
  "missing-break": "phrasing",
  monotone: "monotone",
  mispronunciation: "mispronounced",
  none: null,
  omission: "omitted",
  unclassified: null,
  "unexpected-break": "phrasing",
};

/** The worst sound in a word, with what was produced instead. */
function worstSound(word: WordAssessment): SoundFinding | undefined {
  const phonemes = word.phonemes;
  if (!phonemes || phonemes.length === 0) return undefined;
  let found: { phoneme: PhonemeAssessment; index: number } | null = null;
  for (const [index, phoneme] of phonemes.entries()) {
    const accuracy = phoneme.accuracy ?? 1;
    if (!found || accuracy < (found.phoneme.accuracy ?? 1)) found = { index, phoneme };
  }
  if (!found) return undefined;
  const worst = found;
  // 🔴 THE ALTERNATIVE IS ONLY USEFUL WHEN IT DIFFERS FROM THE TARGET. Azure's best candidate on a
  // correct sound IS the target, and "you produced /a/ instead of /a/" is noise.
  const produced = worst.phoneme.likelyProduced?.find((candidate) => candidate.phoneme !== worst.phoneme.phoneme);
  return {
    ...(worst.phoneme.accuracy !== undefined ? { accuracy: worst.phoneme.accuracy } : {}),
    ...(worst.phoneme.durationMs !== undefined ? { durationMs: worst.phoneme.durationMs } : {}),
    ...(produced ? { likelyProduced: produced.phoneme } : {}),
    of: phonemes.length,
    position: worst.index + 1,
    ...(worst.phoneme.startMs !== undefined ? { startMs: worst.phoneme.startMs } : {}),
    target: worst.phoneme.phoneme,
  };
}

/** The syllable containing a sound, by time overlap. Undefined when either is missing. */
function syllableAt(word: WordAssessment, sound: SoundFinding | undefined): string | undefined {
  if (!sound || sound.startMs === undefined || !word.syllables) return undefined;
  const at = sound.startMs;
  const found = word.syllables.find(
    (syllable) =>
      syllable.startMs !== undefined &&
      syllable.durationMs !== undefined &&
      at >= syllable.startMs &&
      at < syllable.startMs + syllable.durationMs,
  );
  return found?.syllable;
}

function sentenceFor(kind: FindingKind, word: string, sound: SoundFinding | undefined, syllable: string | undefined): string {
  switch (kind) {
    case "omitted":
      return `"${word}" was not said.`;
    case "inserted":
      return `"${word}" is not in the sentence.`;
    case "phrasing":
      return `The pause around "${word}" does not belong there.`;
    case "monotone":
      return `"${word}" came out flat.`;
    default:
      break;
  }
  if (!sound) return `"${word}" is the word to work on.`;
  const where = syllable ? `in "${syllable}"` : `sound ${sound.position} of ${sound.of}`;
  return sound.likelyProduced
    ? `In "${word}", ${where}: ${sound.target} came out closer to ${sound.likelyProduced}.`
    : `In "${word}", ${where}: ${sound.target} is the sound to fix.`;
}

/**
 * How badly a finding needs saying. Lower sorts first.
 *
 * A skipped word outranks a mangled one at the same score: the learner has to say it at all before
 * how they say it matters.
 */
function severity(kind: FindingKind, accuracy: number | undefined): number {
  const base = kind === "omitted" ? 0 : kind === "mispronounced" ? 1 : kind === "inserted" ? 2 : 3;
  return base * 10 + (accuracy ?? 1);
}

export interface DiagnoseOptions {
  /** Raise or lower what counts as needing work, when a lesson knows its learner's level. */
  readonly needsWorkBelow?: number;
  readonly maxFindings?: number;
}

export function diagnose(evidence: PronunciationEvidence, options?: DiagnoseOptions): Diagnosis {
  const threshold = options?.needsWorkBelow ?? NEEDS_WORK_BELOW;
  const limit = options?.maxFindings ?? MAX_FINDINGS;
  const overall = evidence.overall?.overall ?? evidence.overall?.accuracy;
  const base = {
    locale: evidence.locale,
    ...(overall !== undefined ? { overall } : {}),
    target: evidence.target,
  };

  const words = evidence.words ?? [];
  if (words.length === 0) {
    return {
      ...base,
      findings: [],
      headline: "",
      // 🔴 NOT A ZERO. A provider that returned no word breakdown for this locale has told us
      // nothing about the learner, and a verdict would be invented.
      verdict: "not-assessable",
    };
  }

  // 🔴 THE FIRST BRANCH, BEFORE ANY SOUND IS LOOKED AT. Completeness is the fraction of the target
  // actually attempted; below half, the learner said a different sentence and diagnosing its vowels
  // would be diagnosing the wrong utterance.
  const completeness = evidence.overall?.completeness;
  if (completeness !== undefined && completeness < 0.5) {
    return {
      ...base,
      findings: words
        .filter((word) => word.errorType === "omission")
        .slice(0, limit)
        .map((word, index) => ({
          kind: "omitted" as const,
          says: sentenceFor("omitted", word.word, undefined, undefined),
          word: word.word,
          wordIndex: words.indexOf(word) >= 0 ? words.indexOf(word) : index,
        })),
      headline: "Most of the sentence was missing.",
      verdict: "off-target",
    };
  }

  const candidates: PronunciationFinding[] = [];
  for (const [wordIndex, word] of words.entries()) {
    const kindFromError = KIND_FOR_ERROR[word.errorType];
    const poor = (word.accuracy ?? 1) < threshold;
    if (!kindFromError && !poor) continue;
    const kind = kindFromError ?? "mispronounced";
    const sound = kind === "mispronounced" ? worstSound(word) : undefined;
    const syllable = syllableAt(word, sound);
    candidates.push({
      ...(word.accuracy !== undefined ? { accuracy: word.accuracy } : {}),
      kind,
      says: sentenceFor(kind, word.word, sound, syllable),
      ...(sound ? { sound } : {}),
      ...(syllable ? { syllable } : {}),
      word: word.word,
      wordIndex,
    });
  }

  candidates.sort((a, b) => severity(a.kind, a.accuracy) - severity(b.kind, b.accuracy) || a.wordIndex - b.wordIndex);
  const findings = candidates.slice(0, limit);

  const [worst] = findings;
  if (!worst) {
    const verdict = overall === undefined || overall >= GOOD_ENOUGH_ABOVE ? "good" : "close";
    return {
      ...base,
      findings: [],
      // Eight words, no praise, no exclamation. See `learner-voice.ts`.
      headline: verdict === "good" ? "Every word landed." : "Understandable throughout.",
      verdict,
    };
  }

  return {
    ...base,
    findings,
    headline:
      worst.kind === "omitted"
        ? `"${worst.word}" was skipped.`
        : worst.sound
          ? `The ${worst.sound.target} in "${worst.word}".`
          : `"${worst.word}" needs another pass.`,
    verdict: overall !== undefined && overall >= GOOD_ENOUGH_ABOVE ? "close" : "needs-work",
  };
}
