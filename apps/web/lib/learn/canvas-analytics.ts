// The pilot's instrumentation.
//
// The question this surface exists to answer is comparative — is a self-transforming canvas
// better than chat plus separate notes plus separate flashcards? — so the events have to
// support a funnel, not just a count. Every one carries the canvas id and its state, which is
// the property nothing else in Nemesis attaches today (no event anywhere currently records a
// surface or a session, so funnels are not currently possible at all).
//
// Deliberately thin: this uses the existing phCapture and adds no infrastructure.

import { phCapture } from "@/lib/posthog";

import type { CanvasState, LearningCanvas } from "./canvas-model";

export type CanvasEvent =
  | "canvas_created"
  | "source_attached"
  // Durable knowledge minted from an attached source. Counts only — never the extracted content,
  // which is the learner's own material.
  | "knowledge_extracted"
  | "canvas_lesson_generated"
  | "canvas_text_selected"
  | "canvas_section_rewritten"
  | "canvas_source_asked"
  | "canvas_recall_started"
  | "canvas_recall_completed"
  | "canvas_test_started"
  | "canvas_test_completed"
  // Free response: the verdict distribution is how we find out whether the judge is calibrated
  // or is quietly saying "partial" to everything, and the failure rate is how we find out
  // whether the model can hold the JSON shape under real answers.
  | "canvas_response_judged"
  | "canvas_judge_failed"
  // Which teaching action the policy chose, and why. The distribution is how we find out
  // whether the loop is actually adapting or quietly advancing past everything.
  | "canvas_action_chosen"
  // 🔴 An INTERACTION signal, not a verdict. "I don't know" says the learner reported their own
  // state; what that means for the concept is decided by combining it with performance evidence,
  // never by this event on its own.
  | "canvas_unknown_admitted"
  // 🔴 THE OTHER NON-ATTEMPT, AND DELIBERATELY NOT THE SAME EVENT. The learner gave back the cue
  // they were handed — asked for the brand for X, they answered X. Identical durable evidence to an
  // admission (an opportunity passed, nothing demonstrated) and a DIFFERENT account of how we got
  // there: they never told us they did not know, so filing them under `canvas_unknown_admitted`
  // would put a statement in the record that the learner never made.
  //
  // Worth counting separately for a second reason: a rising rate here is a signal about the
  // QUESTION, not the person. It means the prompt is inviting its own answer back.
  | "canvas_cue_echoed"
  | "canvas_diagnosis_viewed"
  | "canvas_weakspots_relearned"
  | "canvas_retest_completed"
  | "canvas_completed"
  | "canvas_abandoned"
  | "canvas_generation_failed";

/** Every canvas event is namespaced and carries where it happened, so the pilot can be
 *  compared against normal Chat/Study behaviour without re-deriving context per event. */
export function canvasCapture(
  event: CanvasEvent,
  canvas: Pick<LearningCanvas, "id" | "state">,
  properties: Record<string, unknown> = {},
): void {
  phCapture(event, { canvas_id: canvas.id, canvas_state: canvas.state, surface: "learn", ...properties });
}

/** Time-to-first-lesson is the headline number for "did this feel fast": from the moment
 *  material landed to the moment there was something to read. */
export function captureLessonGenerated(
  canvas: Pick<LearningCanvas, "id" | "state">,
  detail: { ms: number; blocks: number; concepts: number; sources: number; grounded: boolean },
): void {
  canvasCapture("canvas_lesson_generated", canvas, detail);
}

export function captureStateChange(
  canvas: Pick<LearningCanvas, "id" | "state">,
  to: CanvasState,
): void {
  const event: Partial<Record<CanvasState, CanvasEvent>> = {
    recall: "canvas_recall_started",
    test: "canvas_test_started",
    diagnose: "canvas_diagnosis_viewed",
    targeted_relearn: "canvas_weakspots_relearned",
    complete: "canvas_completed",
  };
  const name = event[to];
  if (name) canvasCapture(name, canvas, { from: canvas.state });
}
