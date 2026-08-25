// A labelled diagram becomes a question, and becomes cards.
//
// 🔴 THE OWNER ASKED FOR EXACTLY TWO THINGS, 2026-08-25: *"DeepSeek should have the image
// occlusion as part of its testing tools. So similar to the multiple choice chip for tests, it
// should be able to use this image occlusion as part of its testing. But it should also be
// allowable for it to use image occlusion for flash cards. Similar to Anki."* Both are built from
// the same two inputs — a picture and the boxes vision found in it — so both live here.
//
// 🔴🔴 THIS FILE OWNS ONLY WHAT IS GENUINELY NEW. Finding the boxes is `OCCLUSION_VISION_PROMPT`
// + `parseSuggestedBoxes`; turning fractions into pixel masks, clamping them into the image,
// dropping the too-small and the overlapping is `scaleBoxes` — all of it in `@nemesis/shared`,
// all of it already carrying the hand editor's own hard-won rules. Re-deriving any of that here
// would be a second definition of "a valid mask", and the module that owns it says exactly why
// that is the failure to avoid: *"a payload one client accepts and the other rejects is a card
// that only exists on one device."* What is new is the QUESTION.
//
// 🔴🔴 THE DISTRACTORS ARE THE DIAGRAM'S OWN OTHER LABELS, AND THAT IS THE WHOLE IDEA. Every
// other multiple-choice path has to work at being honest: `objective-task.ts` mines a pool for
// competing beliefs, and `chat-check.ts` gives up and marks model-written options as having NO
// ground at all, because an invented wrong answer has no provenance. A labelled diagram has no
// such problem. The picture itself printed these names, beside each other, as the parts of one
// thing — so "which of these is covered?" offers real competing parts of a real structure. The
// ground is `neighbouring_class`: *"A class the SOURCE ITSELF set this answer against."* Here the
// source is the figure.
//
// 🔴 AND THE NEAREST LABELS ARE THE DISTRACTORS, NOT THE FIRST ONES IN THE LIST. Spatial knowledge
// is knowing what sits WHERE relative to what else, so the parts a learner actually confuses are
// the neighbours. Picking by distance also makes the set deterministic, which this lane requires:
// no clock and no `Math.random`, so a session replays and a test can pin it.
//
// PURE. No I/O, no React, no provider, no clock.

import { scaleBoxes, type OcclusionPayload, type OcclusionShape, type SuggestedBox } from "@nemesis/shared";

import { MAX_OPTIONS, MIN_OPTIONS } from "./chat-check";
import type { ChoiceOption } from "./choice-set";
import { MIN_LABELS_FOR_SPATIAL } from "./figure-labels";
import { isAnswerableLabel } from "./occlusion-source";

/**
 * A picture and what vision found in it.
 *
 * 🔴 `width`/`height` ARE MEASURED, NEVER THE MODEL'S IDEA OF THEM. `occlusion-suggest-api.ts`
 * states the rule for the hand editor and it is the same rule here: a vision model does not
 * reliably know how many pixels wide a picture is and will confidently say 1024 for a 3024-wide
 * one, which puts every mask somewhere wrong in a way that reads as "this feature is broken".
 */
export interface LabelledFigure {
  /** A URL a browser can load, or a `study-images` storage path. */
  readonly src: string;
  /** Vision's boxes, as fractions of the picture. */
  readonly boxes: readonly SuggestedBox[];
  readonly width: number;
  readonly height: number;
  readonly caption?: string;
}

/** Every mask of a figure, in the order vision reported them.
 *
 *  🔴 IDS ARE DERIVED, NEVER `crypto.randomUUID()`. `targetId` is how a card names its own mask,
 *  so a fresh id per call would orphan every card the moment the payload was rebuilt — and this
 *  lane has to replay identically anyway. */
export function occlusionShapes(figure: LabelledFigure): OcclusionShape[] {
  return scaleBoxes(figure.boxes, figure.width, figure.height, (index) => `m${index}`).shapes;
}

/** Whether this figure can carry an occlusion question at all.
 *
 *  🔴 COUNTED AFTER SCALING, NOT BEFORE. `scaleBoxes` drops boxes that are off the image, too
 *  small to see, or duplicates of one another; a figure whose eight suggestions collapse into one
 *  surviving mask cannot ask a question, and asking the raw list would have said it could. */
export function canOcclude(figure: LabelledFigure): boolean {
  if (!(figure.width > 0) || !(figure.height > 0) || !figure.src.trim()) return false;
  return askable(figure).length >= MIN_LABELS_FOR_SPATIAL;
}

/**
 * Masks worth asking about.
 *
 * 🔴🔴 AN UNLABELLED MASK HAS NO ANSWER, AND A NUMBERED ONE HAS NO MEANING. This filtered only on
 * `.trim()` until production said otherwise: a real Commons nephron diagram came back with the
 * labels `1 2 3 … 12 F R S E Cortex Medulla`, because it is a numbered-key figure whose names live
 * in a legend. Every one of those passed a non-empty check, and the question they produced was
 * "Which part is covered? — 3 / 7 / 11 / F". `isAnswerableLabel` is the rule; see
 * `occlusion-source.ts` for what it costs.
 */
function askable(figure: LabelledFigure): OcclusionShape[] {
  return occlusionShapes(figure).filter((shape) => isAnswerableLabel(shape.label));
}

/**
 * How far apart two masks sit, as a fraction of the picture's diagonal.
 *
 * 🔴 NORMALISED BY THE PICTURE'S OWN SIZE. Measuring in raw pixels would report everything on a
 * wide, short diagram as horizontally distant purely because the diagram is wide.
 */
function distance(a: OcclusionShape, b: OcclusionShape, width: number, height: number): number {
  return Math.hypot((a.x + a.w / 2 - (b.x + b.w / 2)) / width, (a.y + a.h / 2 - (b.y + b.h / 2)) / height);
}

/**
 * The options for "what is under the cover?".
 *
 * 🔴 THE ANSWER'S SEAT MOVES WITH `seat`, AND THE CALLER PASSES THE QUESTION'S INDEX. There is no
 * clock and no random in this lane, and an answer that is always first is a test of nothing after
 * the second question. Rotating by position is the only honest determinism available — the same
 * reasoning `chat-check.ts` gives when it declines to shuffle.
 *
 * Returns null when the figure cannot support an honest set.
 */
export function occlusionChoices(figure: LabelledFigure, hidden: OcclusionShape, seat: number): ChoiceOption[] | null {
  const others = askable(figure)
    .filter((shape) => shape.id !== hidden.id && shape.label !== hidden.label)
    // 🔴 NEAREST FIRST, TIES BROKEN BY NAME so two masks equidistant from the target cannot swap
    // places between renders. `Array.prototype.sort` gives no guarantee for equal keys beyond
    // stability, and a question whose options reorder on a re-render reads as a glitch.
    .sort(
      (a, b) =>
        distance(a, hidden, figure.width, figure.height) - distance(b, hidden, figure.width, figure.height) ||
        a.label.localeCompare(b.label),
    );
  if (others.length < MIN_OPTIONS - 1) return null;

  const distractors = others.slice(0, MAX_OPTIONS - 1).map(
    (shape): ChoiceOption => ({
      correct: false,
      // 🔴 A REAL GROUND, EARNED. The picture printed these names as the parts of one structure, so
      // it is the SOURCE that declared them confusable — exactly what `neighbouring_class` means,
      // and why this path may claim it where `chat-check.ts` may not.
      ground: { kind: "neighbouring_class" },
      text: shape.label,
    }),
  );

  const seats = distractors.length + 1;
  const at = ((seat % seats) + seats) % seats;
  const options = [...distractors];
  options.splice(at, 0, { correct: true, text: hidden.label });
  return options;
}

/**
 * Which mask a question hides.
 *
 * 🔴 SPREAD ACROSS THE DIAGRAM, so a four-question check asks about four different parts rather
 * than the same one four times. `labelForRound` owns the same decision for the course lane.
 */
export function hiddenShape(figure: LabelledFigure, index: number): OcclusionShape | null {
  const shapes = askable(figure);
  if (shapes.length === 0) return null;
  const at = ((index % shapes.length) + shapes.length) % shapes.length;
  return shapes[at] ?? null;
}

/**
 * The payload for one occlusion face: the whole picture, every mask, and which mask is asked about.
 *
 * 🔴 EVERY CARD CARRIES THE FULL MASK LIST, which is `study-occlusion.ts`'s own contract rather
 * than a duplication bug: `occlusionMaskState` needs the siblings to decide what to draw.
 *
 * 🔴 `hide-one` IS THE MODE, AND IT IS THE OPPOSITE OF WHAT THE HAND EDITOR DEFAULTS TO. Covering
 * every part at once asks "name all seven", a different and much harder question than the one
 * being posed, and it removes the context the learner reasons from. `FigureOcclusion` makes the
 * same call in the teaching lane and says so at length: the OTHER labels staying visible IS the
 * interaction.
 */
export function occlusionPayload(figure: LabelledFigure, hidden: OcclusionShape): OcclusionPayload | null {
  const shapes = occlusionShapes(figure);
  if (!shapes.some((shape) => shape.id === hidden.id)) return null;
  return {
    height: figure.height,
    image: figure.src,
    kind: "occlusion",
    mode: "hide-one",
    shapes,
    targetId: hidden.id,
    width: figure.width,
  };
}

/** What one generated flashcard says, alongside the picture it asks about. */
export interface OcclusionCardDraft {
  readonly front: string;
  readonly back: string;
  readonly payload: OcclusionPayload;
}

/**
 * One card per labelled part.
 *
 * 🔴 THE FRONT IS NOT THE ANSWER. An occlusion card's question IS the picture with a box on it, so
 * the front must not name the thing under the box. `occlusionCardFront` in the store avoids the
 * same trap for hand-made cards by numbering them; here the front asks in words and the back
 * carries the name, which is what the learner sees on reveal.
 */
export function occlusionCards(figure: LabelledFigure): OcclusionCardDraft[] {
  if (!canOcclude(figure)) return [];
  return askable(figure).flatMap((shape) => {
    const payload = occlusionPayload(figure, shape);
    if (!payload) return [];
    return [{ back: shape.label, front: "What is the covered part?", payload }];
  });
}
