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
  // A conversational answer became a learning session because the learner explicitly asked it to.
  // Carries a count of promoted cited pages, never the question or answer text.
  | "canvas_learning_started_from_answer"
  // A topic with no attached material was grounded from the web before teaching began. Counts
  // only — never the topic, which is the learner's own words.
  | "canvas_topic_grounded"
  | "source_attached"
  // Durable knowledge minted from an attached source. Counts only — never the extracted content,
  // which is the learner's own material.
  | "knowledge_extracted"
  // 🔴 WHAT THE CAUSAL LANE REFUSED, AND WHY, BECAUSE OTHERWISE TWO OPPOSITE FACTS LOOK IDENTICAL.
  // Zero mechanisms from a document is a perfectly good answer — most material asserts none. Zero
  // mechanisms because every edge the model returned failed to name its excerpt is a BROKEN LANE.
  // Both arrive at the caller as an empty array, and without the reason tally there is no way to
  // tell a quiet document from a prompt the model is not following. Counts and reason names only —
  // never the refused text, which is the learner's own material.
  | "canvas_causal_refused"
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
  // Which controller this canvas was assigned and whether the assignment was randomised, the
  // default, or an explicit developer override. Names only; never source or learner content.
  // 🔴 A WORKED EXAMPLE WAS PUT IN FRONT OF THE LEARNER — the only durable trace this action leaves,
  // and deliberately so. Modelling writes NO row in `learner_evidence`, because that table holds
  // claims about what a learner has shown and reading a demonstration shows nothing. Which means the
  // question "did being shown the working produce later unaided recall?" has to be answered by
  // joining this event's timestamp and objective against the evidence rows that follow it, rather
  // than from the evidence table alone. Objective identity keys and counts only; never the material.
  | "canvas_worked_example_shown"
  // 🔴 THE LEARNER ASKED FOR THE OPTIONS RATHER THAN PRODUCING THE ANSWER. The rate is the whole
  // measurement behind question-before-options: if nobody ever answers before revealing, the
  // affordance is costing a tap and buying nothing; if many do, recognition was being credited as
  // the ceiling for learners who could produce.
  | "canvas_choices_revealed"
  | "canvas_strategy_assigned"
  // 🔴 A TEACHING CONTROLLER COULD NOT DECIDE, AND WHY — the reason tally that keeps the A/B
  // comparison honest. Same construction as `canvas_causal_refused`: a controller that produced
  // nothing and a controller that is BROKEN both look like an empty screen, and only a named reason
  // separates a canvas where nothing was owed from a model that will not follow its instructions.
  //
  // 🔴 IT MATTERS MOST FOR THE ARM IT USUALLY FIRES ON. The `llm_teacher` baseline has no fallback
  // to the structured policy — deliberately, because a fallback would make the two arms the same
  // arm — so a refusal is a turn the learner did not get. If this rate is material, that arm's
  // outcome numbers are measuring an arm that only half ran, and nothing in the evidence log would
  // say so on its own. Names and counts only, never the material.
  | "canvas_strategy_refused"
  /** The controller decided an objective was not worth the next minute and set it aside. 🔴 A
   *  DECISION, NOT A FAULT — and the only place it is visible, since deciding not to spend attention
   *  on something writes no evidence and must not. Without this event, "how often does it move on,
   *  and from what" is unanswerable. */
  | "canvas_objective_passed_over"
  // 🔴 THE ARM RUNNING THIS CANVAS DISAGREES WITH THE ARM ALREADY RECORDED ON ITS EVIDENCE. Should be
  // unreachable: assignment is derived from stable inputs rather than held in state. Emitted anyway,
  // because the failure it names is silent by construction — a session that switched controllers
  // halfway produces perfectly ordinary-looking rows under one label, and no metric can detect it
  // after the fact.
  | "canvas_strategy_conflict"
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
  // 🔴 ONE OPTION TAPPED ON A RECOGNITION TASK, SPLIT BY WHY THAT OPTION WAS ON SCREEN. The `ground`
  // property is the whole value of the event: "they picked a belief they already held" and "they
  // picked a neighbouring class" are different diagnoses, and a single `wrong` count would collapse
  // them back into the flat signal that made multiple choice worth objecting to in the first place.
  //
  // 🔴 THE GROUND, NEVER THE OPTION TEXT. Analytics is a shared surface and an option's text is the
  // learner's own material; the structural fact is what a funnel can be split by.
  | "canvas_option_picked"
  // 🔴 A TAP THAT NAMED NO OPTION ON RECORD — a stale render, or a pool rebuilt underneath the
  // screen. Counted because it writes NOTHING, so without an event it is indistinguishable from a
  // learner who never answered. It is our fault and never theirs, which is why it is not
  // `canvas_option_picked` with a `ground` of "unknown": that would file a defect as a diagnosis.
  | "canvas_option_unreadable"
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
