// Questions about a picture, mixed into the same check as questions about words.
//
// 🔴 OWNER 2026-08-25: *"DeepSeek should have the image occlusion as part of its testing tools. So
// similar to the multiple choice chip for tests, it should be able to use this image occlusion as
// part of its testing."* SIMILAR is the operative word, and it decided the whole shape of this
// file: an occlusion question is a `TestQuestion` with a picture on it. Same scoring, same
// progress, same "answers first, marking afterwards", same account handed to the model at the end.
// Nothing downstream can tell the difference, which is exactly what stops this becoming a second
// kind of test with a second set of rules to keep in step.
//
// 🔴🔴 ONE PICTURE PER CHECK, NOT ONE PER QUESTION. A vision read is billed per image, so asking
// four questions about four diagrams costs four reads. Four questions about ONE diagram costs one
// read and is a better check anyway: naming four parts of a nephron tests the structure, while one
// part each from four unrelated pictures tests four vocabulary items. The cost argument and the
// pedagogy point the same way, which is usually a sign the shape is right.
//
// PURE. No I/O, no React, no clock. The network call lives in `figure-occlusion-api.ts`.

import { MAX_QUESTIONS, type TestQuestion, type TestRun } from "./test-run";
import {
  canOcclude,
  hiddenShape,
  occlusionChoices,
  occlusionPayload,
  type LabelledFigure,
} from "./occlusion-from-labels";

/**
 * How many parts of one diagram a check asks about.
 *
 * 🔴 FOUR, AND IT IS A CEILING RATHER THAN A TARGET. A diagram with twelve labels would otherwise
 * fill the entire run and crowd out everything the model wanted to ask in words; a diagram with
 * two labels honestly supports two questions and gets two. The learner meets the same picture
 * several times in a row either way, which is the point — the second and third questions are much
 * easier to answer having just looked at it, and that IS the spatial learning.
 */
export const MAX_FIGURE_QUESTIONS = 4;

/** The question a covered part asks. 🔴 IT NEVER NAMES THE PART: the picture is the question. */
const PROMPT = "Which part is covered?";

/**
 * The occlusion questions one figure supports.
 *
 * 🔴 A QUESTION WHOSE OPTIONS CANNOT BE BUILT IS SKIPPED, NOT PATCHED. Same policy as
 * `buildTestRun`: *"a question whose options could not be built honestly"* is left off the test.
 * A picture that yields two good questions gives two.
 */
export function occlusionQuestions(figure: LabelledFigure, limit = MAX_FIGURE_QUESTIONS): TestQuestion[] {
  if (!canOcclude(figure)) return [];
  const questions: TestQuestion[] = [];
  const asked = new Set<string>();

  for (let index = 0; questions.length < limit && index < limit * 4; index += 1) {
    const hidden = hiddenShape(figure, index);
    // 🔴 THE SAME PART IS NEVER ASKED TWICE IN ONE CHECK. `hiddenShape` cycles, so a diagram with
    // three labels and a limit of four would otherwise come back round to the first one — and a
    // learner who has just answered "glomerulus" being asked it again reads as a broken test.
    if (!hidden || asked.has(hidden.id)) continue;
    const options = occlusionChoices(figure, hidden, questions.length);
    const payload = occlusionPayload(figure, hidden);
    if (!options || !payload) continue;
    asked.add(hidden.id);
    questions.push({
      figure: payload,
      // 🔴 NAMESPACED `figure:`, THE WAY `chat-check.ts` NAMESPACES `chat:`, so a picture question
      // can never be mistaken for an objective. The mask id keeps two questions about the same
      // diagram apart, which is what `cardsFromMisses` dedups on.
      objectiveIdentityKey: `figure:${hidden.id}:${hidden.label.toLowerCase()}`,
      options,
      prompt: PROMPT,
    });
  }
  return questions;
}

/**
 * The model's own questions with the picture's questions folded in.
 *
 * 🔴 THE PICTURE COMES FIRST, DELIBERATELY. A check that opens with a diagram tells the learner
 * what kind of test this is before they have answered anything; the same questions arriving after
 * three text questions read as a format change halfway through.
 *
 * 🔴 AND THE RESULT IS STILL CAPPED AT `MAX_QUESTIONS`. Two sources of questions is two ways to
 * overrun the ceiling, and *"a test that outlasts the learner's patience is not a test"* does not
 * stop applying because half of it has pictures.
 */
export function withFigureQuestions(run: TestRun | null, figure: LabelledFigure | null): TestRun | null {
  const pictures = figure ? occlusionQuestions(figure) : [];
  if (pictures.length === 0) return run;
  const questions = [...pictures, ...(run?.questions ?? [])].slice(0, MAX_QUESTIONS);
  return questions.length > 0 ? { questions } : null;
}
