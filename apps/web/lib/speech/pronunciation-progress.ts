// Did the retry actually help? (§47)
//
// 🔴 THE LOOP IS ONLY A LOOP IF THE SECOND ATTEMPT IS COMPARED TO THE FIRST. Hear the target, try,
// get told which sound was wrong, try again — and then what? Showing two independent scores makes
// the learner do the arithmetic, and worse, invites them to read noise as progress: Azure's
// whole-utterance score moves by a few points between two identical attempts, so "78 then 81" means
// nothing at all. What means something is whether THE WORD THEY WERE TOLD TO FIX got better.
//
// 🔴 SO THE COMPARISON IS PER WORD AND THE HEADLINE IS ABOUT THE TARGETED ONE. `compareAttempts`
// takes the previous diagnosis's findings so it can answer the only question the learner asked.
//
// 🔴 A MOVEMENT SMALLER THAN `MEANINGFUL_DELTA` IS "UNCHANGED", NOT "IMPROVED". Reporting a
// two-point rise as improvement teaches a learner to trust a number that is mostly measurement
// noise, and the first time it moves the other way on an identical attempt they stop trusting any
// of it.
//
// PURE. Two pieces of evidence in, a comparison out.

import type { PronunciationEvidence, WordAssessment } from "@/lib/learn/pronunciation-evidence";

/**
 * How much a score has to move before it counts as movement.
 *
 * 🔴 MEASURED IN THE SAME 0–1 UNITS AS EVERYTHING ELSE. Five points on Azure's hundred-mark scale.
 * Repeat readings of the same recording sit inside this; a genuinely fixed sound clears it easily.
 */
export const MEANINGFUL_DELTA = 0.05;

export type WordChange = "improved" | "regressed" | "unchanged" | "new" | "dropped";

export interface WordComparison {
  readonly word: string;
  readonly before?: number;
  readonly after?: number;
  readonly delta?: number;
  readonly change: WordChange;
  /** True when this is a word the previous correction told the learner to work on. */
  readonly wasTargeted: boolean;
}

export interface AttemptComparison {
  readonly overall: {
    readonly before?: number;
    readonly after?: number;
    readonly delta?: number;
    readonly change: WordChange;
  };
  readonly words: readonly WordComparison[];
  /**
   * What happened to what the learner was actually told to fix.
   *
   * Empty when the previous attempt carried no findings, which is a different situation from "they
   * were told and nothing changed".
   */
  readonly targeted: readonly WordComparison[];
  /** One line. Obeys `learner-voice.ts` — no praise, no exclamation, nothing hedged. */
  readonly says: string;
  /** True when the retry is worth stopping on rather than repeating. */
  readonly settled: boolean;
}

function changeFor(before: number | undefined, after: number | undefined): WordChange {
  if (before === undefined && after === undefined) return "unchanged";
  if (before === undefined) return "new";
  if (after === undefined) return "dropped";
  const delta = after - before;
  if (Math.abs(delta) < MEANINGFUL_DELTA) return "unchanged";
  return delta > 0 ? "improved" : "regressed";
}

/**
 * Line words up between two attempts.
 *
 * 🔴 BY NORMALISED SPELLING AND OCCURRENCE, NOT BY INDEX, BECAUSE THE INDEXES MOVE. A learner who
 * omitted a word on the first attempt and said it on the second shifts every index after it, and an
 * index-paired comparison would then report every remaining word as changed. Pairing by the word
 * itself — with a counter for repeats, so the second "the" matches the second "the" — survives that.
 */
function keyed(words: readonly WordAssessment[]): Map<string, WordAssessment> {
  const seen = new Map<string, number>();
  const out = new Map<string, WordAssessment>();
  for (const word of words) {
    const base = word.word.toLocaleLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
    if (!base) continue;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    out.set(`${base}#${occurrence}`, word);
  }
  return out;
}

export interface CompareOptions {
  /** Words the previous correction named. Usually `diagnose(previous).findings.map(f => f.word)`. */
  readonly targetedWords?: readonly string[];
}

export function compareAttempts(
  previous: PronunciationEvidence,
  current: PronunciationEvidence,
  options?: CompareOptions,
): AttemptComparison {
  const beforeOverall = previous.overall?.overall ?? previous.overall?.accuracy;
  const afterOverall = current.overall?.overall ?? current.overall?.accuracy;
  const overallChange = changeFor(beforeOverall, afterOverall);

  const before = keyed(previous.words ?? []);
  const after = keyed(current.words ?? []);
  const targeted = new Set((options?.targetedWords ?? []).map((word) => word.toLocaleLowerCase()));

  const words: WordComparison[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const was = before.get(key);
    const is = after.get(key);
    const label = is?.word ?? was?.word ?? key.split("#")[0] ?? key;
    // 🔴 AN OMITTED WORD IS SCORED AS ABSENT, NOT AS ZERO. Azure reports omissions with no accuracy
    // at all; inventing a zero would make "said it badly" and "did not say it" the same number, and
    // then make saying it at all look like a huge improvement.
    const wasScore = was?.errorType === "omission" ? undefined : was?.accuracy;
    const isScore = is?.errorType === "omission" ? undefined : is?.accuracy;
    words.push({
      ...(isScore !== undefined ? { after: isScore } : {}),
      ...(wasScore !== undefined ? { before: wasScore } : {}),
      change: changeFor(wasScore, isScore),
      ...(wasScore !== undefined && isScore !== undefined ? { delta: Number((isScore - wasScore).toFixed(4)) } : {}),
      wasTargeted: targeted.has(label.toLocaleLowerCase()),
      word: label,
    });
  }
  words.sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0) || a.word.localeCompare(b.word, "en"));

  const targetedWords = words.filter((word) => word.wasTargeted);
  const fixed = targetedWords.filter((word) => word.change === "improved");
  const stillWrong = targetedWords.filter((word) => word.change === "unchanged" || word.change === "regressed");

  const lastFixed = fixed[fixed.length - 1];
  const firstStuck = stillWrong[0];
  const says = targetedWords.length === 0
    ? overallChange === "improved"
      ? "Better than the last attempt."
      : overallChange === "regressed"
        ? "That one went backwards."
        : "About the same as before."
    : lastFixed && !firstStuck
      ? `"${lastFixed.word}" is fixed.`
      : lastFixed && firstStuck
        ? `"${lastFixed.word}" improved; "${firstStuck.word}" did not.`
        : firstStuck
          ? `"${firstStuck.word}" is still the one.`
          : "About the same as before.";

  return {
    overall: {
      ...(afterOverall !== undefined ? { after: afterOverall } : {}),
      ...(beforeOverall !== undefined ? { before: beforeOverall } : {}),
      change: overallChange,
      ...(beforeOverall !== undefined && afterOverall !== undefined
        ? { delta: Number((afterOverall - beforeOverall).toFixed(4)) }
        : {}),
    },
    says,
    // Stop when what they were told to fix is fixed, or — with nothing targeted — when the whole
    // utterance improved. Repeating a drill the learner has already passed is how practice becomes
    // punishment.
    settled: targetedWords.length > 0 ? stillWrong.length === 0 : overallChange === "improved",
    targeted: targetedWords,
    words,
  };
}
