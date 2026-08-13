// Which Canvas states offer the composer's `✓`, and which must not.
//
// 🔴 A POSITIVE PREDICATE, BECAUSE THE NEGATION IS WRONG IN THREE PLACES. The tempting test is
// "not currently answering a question". That is also true on the landing page, on a plain document
// with no task, and on the empty state — putting a `✓` on screens where pressing it does nothing.
// A control wired to nothing is worse than no control: it invites a press and then ignores it.
//
// 🔴 AND IT IS THE PRODUCTION GUARD (acceptance N3). A required demonstration must have NO `✓`, so
// retrieval cannot be bypassed. That is not a styling preference — it is the difference between a
// learner producing an answer and a learner pressing past the question. Getting this predicate
// wrong in the permissive direction silently removes the demonstration requirement from the
// product while every screen still looks right.
//
// PURE, and separate from the component, so both halves can be asserted without a DOM.

/** What the policy is putting on screen right now, reduced to the only thing this decision needs. */
export interface ProgressionInput {
  /** A verdict is on screen. */
  readonly hasFeedback: boolean;
  /** That verdict was a pass — which advances by itself and needs no control at all. */
  readonly feedbackPassed: boolean;
  /** The policy's current action, or null when it has nothing to say.
   *
   *  🔴 `advance` IS IN HERE DELIBERATELY. `policy-runtime.ts` filters `advance` and `defer` out
   *  before a decision reaches the surface, so in practice neither should arrive — but the type
   *  admits them, and the renderer falls through to its "nothing owed" screen for anything it does
   *  not name. Listing them makes this exhaustive rather than reliant on that fall-through, so
   *  adding a genuinely new action becomes a compile error here instead of silently inheriting
   *  whichever answer the last `return` happens to give. */
  readonly actionType: "retrieve" | "show_correction" | "contrast" | "defer" | "advance" | null;
  /** A retrieval prompt is up and has not been answered — the production state. */
  readonly awaitingDemonstration: boolean;
}

/**
 * Does this state offer `✓`?
 *
 * Exposition — the learner is reading something and pressing on is the next move:
 *   `show_correction` · `contrast` · a verdict that did NOT pass
 *
 * Everything else does not:
 *   a retrieval awaiting an answer   the production state; N3 requires the ABSENCE of a control
 *   a verdict that PASSED            already advances on its own; a control would be redundant
 *   `defer` · `advance`              nothing is owed and nothing is being read
 *   no action at all                 the honest empty state; there is nothing to advance past
 */
export function offersAdvance(state: ProgressionInput): boolean {
  // Feedback outranks the action underneath it, exactly as the renderer does — the learner is
  // reading a verdict, whatever the policy has already decided next.
  if (state.hasFeedback) return !state.feedbackPassed;
  if (state.awaitingDemonstration) return false;
  return state.actionType === "show_correction" || state.actionType === "contrast";
}

/**
 * Which single control the composer shows.
 *
 * 🔴 A UNION, SO "BOTH AT ONCE" CANNOT BE EXPRESSED. §I's rule is *"there is never both a `✓` and a
 * send button — one location, one primary action, determined by state"*. Written as two booleans
 * that rule is a convention someone has to keep; written as one value it is arithmetic. This is the
 * same reasoning `AnswerSink` uses in canvas-hosting.ts, for the same class of defect.
 *
 * 🔴 `"none"` IS A REAL ANSWER, NOT AN OVERSIGHT. In a production state with an empty composer the
 * control is ABSENT — not present-and-disabled. A disabled control still advertises that pressing
 * on is an option; N3 requires that it not be there at all.
 */
export type ComposerControl = "send" | "advance" | "none";

export function composerControl(input: {
  /** The composer holds something the learner could submit. */
  readonly hasResponse: boolean;
  /** This state offers `✓` — the result of `offersAdvance`, passed in rather than recomputed. */
  readonly advanceAvailable: boolean;
}): ComposerControl {
  // A response outranks everything: the moment one begins, the same control becomes send. That
  // holds in BOTH exposition and production, which is why it is tested first and only once.
  if (input.hasResponse) return "send";
  return input.advanceAvailable ? "advance" : "none";
}
