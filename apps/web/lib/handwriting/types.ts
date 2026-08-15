// What Gemini Vision SAW in a photo or drawing of a learner's handwritten or hand-drawn work —
// and nothing else.
//
// 🔴 THE OWNER'S MANDATE, MADE INTO A TYPE: "Gemini Vision should interpret learner
// handwriting/drawings and report structured observations. Nemesis decides what those
// observations mean for learner state." Nowhere below is there a field for "correct", a score,
// a grade, or a verdict — and that is not something to fill in later. A vision reply that said
// "the learner understands the Krebs cycle" would be a bug, not a partially-finished feature.
//
// 🔴 NO INTERPRETATION AT WRITE TIME — the same rule `lib/learn/learner-evidence.ts` already
// lives by. That file stores a judge's raw `confidence` and applies the threshold that decides
// whether it may update learner state LATER, at read time (`TRUSTED_ENOUGH_TO_UPDATE_STATE`,
// applied inside `projectLearnerState`) — never at the row that captured it. This module follows
// the identical shape: `HandwritingObservation` is what was measured, and `matchExpectedElements`
// (match-elements.ts) is a separate, swappable decision made afterwards, over data that stays
// exactly as vision reported it.
//
// 🔴 HOW THIS BECOMES EVIDENCE: `transcription` is built to be indistinguishable, from the judge's
// point of view, from anything a learner typed or dictated — `lib/learn/canvas-judge.ts` already
// judges free text against an objective's expected evidence, and a transcribed handwritten answer
// is exactly that shape. This file adds nothing an evaluator has to learn to read; it adds signal
// (raw items, spatial relations, per-reading confidence, abstention) that today's evaluator does
// not consume yet and a future one could, without touching what already works.

/**
 * One discrete thing Gemini could point to on the page: a written word or phrase, a label, a
 * drawn shape, an arrow, a symbol.
 *
 * 🔴 NOT MATCHED AGAINST ANYTHING. This is the raw inventory — everything legible or drawable
 * that was actually there — kept separate from whether any of it answers a particular question.
 * Asking the model to check off a supplied list of "expected" labels would lead the witness: a
 * model told to look for "mitochondrion, nucleus" tends to report finding them. Matching against
 * an expected list is `matchExpectedElements`'s job, done afterwards, in code that can be read,
 * tested, and revised without re-prompting the model.
 */
export interface HandwritingItem {
  /** Verbatim text for a word, phrase, or label. A short, plain description for a shape, arrow,
   *  or symbol with no legible text of its own — e.g. "an arrow pointing from the circle to the
   *  box". Never a description of what the mark MEANS, only what it looks like. */
  text: string;
  /** "text" for something read; "drawing" for something seen but not read. */
  kind: "text" | "drawing";
  /** 0-1, how sure the model is THIS ITEM was read or seen correctly.
   *  🔴 A FACT ABOUT THE READING, NEVER ABOUT THE LEARNER — see `transcriptionConfidence` below,
   *  and `learner-evidence.ts`'s identical warning on its own `confidence` field. `null` when the
   *  model did not report one; never defaulted, never guessed. */
  confidence: number | null;
}

/**
 * A single call's report on one photo or drawing.
 *
 * 🔴 `abstained` MUST BE CHEAP AND COMMON. An unreadable photo has to become `abstained: true`,
 * never a confident empty or partial reading — a learner must never be marked down because a
 * blurred photo was quietly read as "wrote nothing". See `parseHandwritingObservation`, which
 * forces this whenever the model's own reply cannot be trusted, not only when the model asks for
 * it.
 */
export interface HandwritingObservation {
  /** Every word of legible text on the page, in reading order. Empty string when nothing legible
   *  was found — which is the normal, expected shape of an abstained observation, and is equally
   *  possible for a genuinely blank page that WAS read successfully (`abstained: false`). The two
   *  are different facts and this field alone cannot tell them apart — read `abstained` for that. */
  transcription: string;
  /** 0-1, how sure the model is of the transcription AS A WHOLE.
   *  🔴 A FACT ABOUT THE READING, NEVER ABOUT THE LEARNER. A hesitant reading of a correct answer
   *  and a confident reading of a wrong one are both real; this field says only how much to trust
   *  that the TEXT reported is the text that was actually written. `null` when not reported. */
  transcriptionConfidence: number | null;
  /** The raw inventory — see `HandwritingItem`. Empty array when abstained, or when the page
   *  genuinely holds nothing distinguishable (rare and different from abstention: this is "we
   *  looked and there was nothing", not "we could not look properly"). */
  items: readonly HandwritingItem[];
  /** Plain-language spatial observations — "the arrow points from the left circle to the box",
   *  "the label sits above the diagram" — raw and uninterpreted. Empty array when nothing on the
   *  page is spatially meaningful, which is the common case for a page of plain prose. */
  spatialRelations: readonly string[];
  /** True when the model could not read this image with any confidence worth reporting: too
   *  blurred, too dark, cut off, or no legible writing or drawing at all.
   *  🔴 THE WHOLE POINT OF THIS FIELD. Cheap and common on purpose — see the file header. */
  abstained: boolean;
  /** A short plain-language reason, only when `abstained` is true. Null otherwise. */
  abstentionReason: string | null;
  /** Which model produced this — mirrors `VisionResult.model` in lib/vision/gemini.ts. */
  model: string;
}

/**
 * Whether one expected element showed up in the raw observation.
 *
 * 🔴 NEVER "correct" OR "wrong" — presence is not correctness, and this type cannot express
 * correctness even by accident. A learner can write the right word next to the wrong label, or
 * copy a diagram's caption without understanding it; this says only whether something addressing
 * the expected element is visibly on the page. Whether that something is RIGHT is a judgement for
 * the same evaluator that already judges typed and spoken answers, reading `transcription` (or a
 * quoted item) exactly as it reads any other response.
 */
export type ElementPresence = "present" | "absent" | "unclear";

export interface ElementMatch {
  /** The expected element as supplied by the caller — a label, a step, a term. Verbatim. */
  expected: string;
  presence: ElementPresence;
  /** The verbatim text that justified "present". 🔴 REQUIRED whenever `presence` is "present" —
   *  an assertion of presence with nothing to point at is not a match, it is a guess wearing a
   *  match's shape. `null` for "absent" and "unclear", where by definition nothing was found to
   *  quote. See match-elements.ts for the invariant this is checked against. */
  evidenceQuote: string | null;
}
