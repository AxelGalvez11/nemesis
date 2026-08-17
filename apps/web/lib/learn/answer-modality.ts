// How an answer came to be — typed, spoken, or written by hand — as transitions rather than a
// flag somebody remembers to clear.
//
// 🔴 WHY THIS IS NOT A `useRef` IN THE COMPOSER, WHICH IS WHAT IT USED TO BE. The modality is set
// in three places and has to be cleared in four, and one of those clears was missing: cancelling
// dictation put the text back but left the flag reading "spoken", so a learner who spoke, changed
// their mind, pressed ✕ and then TYPED their answer had it recorded as speech.
//
// That is not a cosmetic mislabel. Two things downstream read it and both are then wrong:
//
//   1. `evaluationMessages` (canvas-prompts.ts) adds a leniency instruction for spoken answers —
//      "filler words, false starts, self-corrections and missing punctuation are normal and mean
//      nothing about their understanding". Applied to typed text, the judge is being told to
//      forgive artefacts that cannot be there, on an answer the learner composed at their leisure.
//   2. `learner_evidence.response_modality` keeps it for ever, and §23 reads elapsed time against
//      a different baseline for speech than for typing. A mislabelled answer is measured against
//      the wrong clock, permanently, in the record the whole learner model is built from.
//
// A capture that was DISCARDED must take its modality with it. That is the invariant this module
// exists to hold, and the one the composer could not state on its own.
//
// 🔴 ACCEPTING IS NOT DISCARDING, AND THE DIFFERENCE IS DELIBERATE. Pressing ✓ on dictation, or
// accepting a handwriting pad, lands that capture in the composer as editable text — the learner
// really did produce it that way, and editing a transcript before sending is ordinary. Only ✕,
// which the composer's own comment defines as "throw the capture away and put the composer back as
// it was", returns the modality to typed.

import type { LearnerInputModality } from "./canvas-model";

/** What just happened to the composer, in the learner's terms rather than the component's. */
export type AnswerModalityEvent =
  /** A different prompt is on screen. Nothing carried over from the last one. */
  | { kind: "prompt_changed" }
  /** A capture produced text: dictation heard something, or a handwriting pad was accepted. */
  | { kind: "captured"; via: LearnerInputModality }
  /** A capture was thrown away — ✕ rather than ✓. Whatever it set goes with it. */
  | { kind: "capture_discarded" }
  /** The answer went to the judge. The next one starts from the keyboard. */
  | { kind: "submitted" };

/** Where every prompt starts, and where every discard returns to. */
export const DEFAULT_ANSWER_MODALITY: LearnerInputModality = "typed";

/**
 * The modality after one event.
 *
 * Pure, and total over the event union: a new way to fill the composer has to say here what it
 * means, rather than being able to set a flag and leave the clearing to whoever notices.
 */
export function nextAnswerModality(
  current: LearnerInputModality,
  event: AnswerModalityEvent,
): LearnerInputModality {
  switch (event.kind) {
    case "captured":
      return event.via;
    case "capture_discarded":
    case "prompt_changed":
    case "submitted":
      return DEFAULT_ANSWER_MODALITY;
  }
}
