// How long a conversational reply owns the Canvas — the frontend half of the owner's
// vanishing-Canvas rule (2026-08-19).
//
// > **"Trivial things vanish. Meaningful things wait for the learner."**
//
// 🔴 IT EXISTS BECAUSE THE SPLIT IS "MODEL DECIDES MEANING, CANVAS DECIDES MOTION", AND A
// DURATION IS MOTION. The owner is explicit: *"Do not make animation decisions part of DeepSeek…
// DeepSeek should decide semantic intent. Frontend should decide how that state animates."* So the
// model says which of three categories a reply is (`TurnWeight`) and this file — and only this
// file — turns that into a number of milliseconds. The model is never asked for one, which is what
// makes "1500ms" a product decision we can change in one place rather than a value scattered
// through prompt text and re-litigated by the model on every turn.
//
// 🔴 AND IT RETURNS `Exposition`, THE POLICY'S OWN TYPE, RATHER THAN A SECOND TIMING VOCABULARY.
// `cognitive-mode.ts` already answers this exact question for teaching material: transient screens
// carry their own window, deliberate ones wait for Continue, and `canvas-policy-view.tsx`'s
// `useScreenExit` already knows how to end both. A conversational reply is a third thing that
// appears on the same sheet and has to end the same way, so it speaks the same union. Anything
// else would be two auto-advance implementations, and the one that gets a bug fix would not be the
// one with the bug.
//
// PURE. No React, no I/O, no copy.

import { NO_EXPOSITION, type Exposition } from "./cognitive-mode";
import type { TurnWeight } from "./turn-router";

/**
 * How fast a learner reads, in milliseconds per word.
 *
 * 🔴 DELIBERATELY SLOWER THAN "AVERAGE ADULT READING SPEED". Prose is read at roughly 240 words a
 * minute (250ms/word) by someone settled into a page. Nobody on this surface is settled: the line
 * appeared without warning, it may be a correction to something they just said, and half the beat
 * is spent noticing it changed at all. 320ms/word is that measured figure with the noticing added
 * back, and it is a floor on comprehension rather than a target.
 */
const MS_PER_WORD = 320;

/**
 * The beat before reading starts at all — noticing the surface changed, and finding the first word.
 *
 * Without it a one-word reply computes to 320ms, which is under the ~400ms it takes to register
 * that anything happened. The line would be gone before it was seen.
 */
const ONSET_MS = 420;

/**
 * The window each weight is allowed to occupy, as `[floor, ceiling]` in milliseconds.
 *
 * 🔴🔴 THE BAND COMES FROM THE MEANING; THE POSITION INSIDE IT COMES FROM THE LENGTH. That is the
 * owner's rule stated as a data structure — *"do not base this only on raw word count. Use
 * semantic importance… The frontend may calculate a reasonable display duration based partly on
 * text length, but keep sensible minimum and maximum bounds."* Length alone would hold "Doing
 * well, thanks for asking, what shall we look at next?" longer than "Blocking ACE raises
 * bradykinin", which is the ranking exactly inverted. The weight picks the band first, so a long
 * pleasantry can never outrank a short mechanism.
 *
 * 🔴 THE BANDS DO NOT OVERLAP, AND THE GAP BETWEEN THEM IS THE POINT RATHER THAN A ROUNDING
 * ARTEFACT. Adjacent bands (a micro ceiling equal to a brief floor) would let the longest possible
 * acknowledgement sit for exactly as long as the shortest possible fact, so the ordering the weight
 * exists to impose would hold only weakly. Separated, "the model called this micro" ALWAYS means
 * less time than "the model called this brief", whatever either one says. `turn-exposition.test.ts`
 * asserts that as a strict inequality on the worst case of each.
 *
 * 🔴 THE CEILINGS ARE WHAT MAKE A WRONG WEIGHT SURVIVABLE IN ONE DIRECTION. A model that calls a
 * paragraph "micro" is capped at 1.8s and the learner loses it — which is why `asWeight` defaults
 * the other way and the prompt says to round up. A model that calls "Hey." `brief` spends 2s, and
 * nobody is harmed.
 */
const WINDOW: Readonly<Record<Exclude<TurnWeight, "reading">, readonly [number, number]>> = {
  /** An acknowledgement. Long enough to be seen, short enough that a correct answer keeps its
   *  momentum — the owner's *"Correct answers should compress time"*. */
  micro: [900, 1700],
  /** One fact, read and finished with. The ceiling is where a "brief" reply stops being brief and
   *  the model should have said `reading`; capping it is how that mistake stays visible instead of
   *  turning into a six-second stare. */
  brief: [1900, 5200],
};

/** Words, counted the way a reader meets them rather than the way a tokenizer does. */
function wordsIn(text: string): number {
  const found = text.trim().match(/\S+/g);
  return found ? found.length : 0;
}

/**
 * Roughly how long this text takes to take in, before any band is applied.
 *
 * Exported for the guard, so the bounds can be tested against the same reading model the product
 * uses rather than against a second copy of these constants.
 */
export function readingTimeMs(text: string): number {
  return ONSET_MS + wordsIn(text) * MS_PER_WORD;
}

/**
 * What the Canvas does with one conversational reply.
 *
 * 🔴 `"reading"` RETURNS `deliberate`, WHICH CARRIES NO NUMBER AT ALL. That is the point of the
 * union it is borrowing: a screen that waits for the learner has no duration, so there is no field
 * for one, so no later edit can quietly put a timer on material the learner is meant to control.
 * The Continue that follows is not decided here either — `continueOwner` decides it once for the
 * whole surface, so a reply and an unread passage can never both offer one.
 *
 * 🔴 EMPTY TEXT IS `NO_EXPOSITION`, NOT A ZERO-LENGTH TRANSIENT. Nothing was said, so there is
 * nothing on screen to end; a transient with a tiny window would be a timer racing an element that
 * was never painted. `NO_EXPOSITION` is the honest answer and `readingRequirementOf` already reads
 * it as "nothing is being taken in".
 */
export function expositionOfReply(input: { readonly weight: TurnWeight; readonly say: string }): Exposition {
  if (!input.say.trim()) return NO_EXPOSITION;
  if (input.weight === "reading") return { mode: "deliberate" };
  const [floor, ceiling] = WINDOW[input.weight];
  return { exposureMs: Math.min(ceiling, Math.max(floor, readingTimeMs(input.say))), mode: "transient" };
}
