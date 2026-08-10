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
