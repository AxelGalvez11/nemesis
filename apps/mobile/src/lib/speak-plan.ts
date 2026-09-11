// Read Aloud's non-I/O decisions — PURE, no React, no fetch, no expo-audio.
//
// `api/speak.ts` builds a `ReplyUtterance[]` with the web's own `replySpeechPlan` (see
// `learn/speech.ts`) and hands it here for two decisions: whether there is anything worth
// speaking at all, and the ordered, cancellable steps to play it in. Both are decided from the
// ALREADY-BUILT plan array — this file takes no text and calls neither `replySpeechPlan` nor
// `sayableProse` itself — so it never has to load `reading-voice.ts`'s live `@/` import and can
// be Deno-tested with a plain array literal instead of the real web pipeline.
//
// 🔴 THE `ReplyUtterance` IMPORT BELOW IS `import type`, WHICH DENO ERASES ENTIRELY. A type-only
// import never causes Deno (or a bundler) to load the module it names, so this file can name a
// type from `learn/speech.ts` without inheriting that file's resolution requirements. Swap it for
// a value import and this file's Deno test breaks the same way `reading-voice.ts` would.

import type { ReplyUtterance } from "../learn/speech";

/** One utterance in an in-progress read-aloud, with the bookkeeping `api/speak.ts` needs to
 *  drive playback and know when to resolve `done`. */
export interface SpeakStep {
  readonly utterance: ReplyUtterance;
  /** Position in the plan, 0-based — for logging/debugging a stuck chunk. */
  readonly index: number;
  /** True on the plan's final step, so the player knows there is nothing queued after this one. */
  readonly isLast: boolean;
}

/**
 * Whether a built plan has anything worth speaking.
 *
 * `replySpeechPlan` already applies every refusal rule (empty after cleanup, mostly notation,
 * a `[say: …]` line with no locale) by simply omitting the segment — an empty array IS the
 * "nothing sayable" outcome, not a separate check this file has to reimplement.
 */
export function hasSpeakableContent(plan: readonly ReplyUtterance[]): boolean {
  return plan.length > 0;
}

/**
 * The plan as an ordered, indexed sequence of steps.
 *
 * `replySpeechPlan` already orders its array correctly (opener first, then the rest, each
 * segment in the order it appeared in the reply) — this only adds the `isLast` flag a sequential
 * player needs to know when to resolve rather than fetch another chunk.
 */
export function speakSteps(plan: readonly ReplyUtterance[]): SpeakStep[] {
  return plan.map((utterance, index) => ({ index, isLast: index === plan.length - 1, utterance }));
}
