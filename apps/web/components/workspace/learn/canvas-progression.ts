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
 * Does this state require the learner to READ something and move past it?
 *
 * 🔴 RENAMED IN MEANING, NOT IN SHAPE. This used to answer "does the composer show a `✓`?" and now
 * answers the §38 question — does this region carry a reading requirement — which is the property
 * `continueOwner` reads. Same predicate, same three states, one fewer indirection: a correction,
 * a contrast and a failed verdict are exactly the things the learner is asked to read and move on
 * from.
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
 * 🔴 THE `✓` IS GONE FROM THE COMPOSER (owner, §38), AND THIS UNION NO LONGER GUARANTEES WHAT IT
 * USED TO. It said: *"there is never both a `✓` and a send button — one location, one primary
 * action"*, and that held BECAUSE both lived in this one control. The acknowledgment now renders
 * below the correction, as `Continue`, so a union here cannot prevent a send button and a Continue
 * being on screen together — a different type would still be satisfied while two controls painted.
 *
 * What prevents it now is `continueOwner`, which returns AT MOST ONE region for the whole surface
 * and is suppressed outright while a demonstration is owed. The guarantee moved with the control;
 * it did not evaporate, and this comment is here so nobody reads the old promise off the type.
 *
 * What this union still decides is real and unchanged: whether the composer offers to SEND.
 *
 * 🔴 `"none"` IS A REAL ANSWER, NOT AN OVERSIGHT. In a production state with an empty composer the
 * control is ABSENT — not present-and-disabled. A disabled control still advertises that pressing
 * on is an option; N3 requires that it not be there at all.
 */
export type ComposerControl = "send" | "none";

export function composerControl(input: {
  /** The composer holds something the learner could submit. */
  readonly hasResponse: boolean;
  /**
   * Material is attached and waiting to be sent, with nothing typed.
   *
   * 🔴 UX BRIEF §3: *"Attach + send with no text means 'learn this material with me.'"* — and §26
   * lists *"a file may be sent with no accompanying text"* as its own acceptance criterion. An
   * attachment IS a submittable response; it simply is not a typed one.
   *
   * 🔴 THIS DOES NOT WEAKEN N3, AND THE REASON IS STRUCTURAL RATHER THAN A PROMISE. N3 requires the
   * send control to be ABSENT while a retrieval prompt is unanswered. Attachments are only ever
   * pending on a canvas that has not begun — there is no prompt, no objective and no evidence to
   * bypass — so the two states are disjoint by construction, not by a convention someone has to
   * keep. `canvas-progression.test.ts` pins that: a production state with an attachment still
   * yields `"none"` if nothing is typed, because the caller cannot be in both at once.
   */
  readonly hasAttachment?: boolean;
  /**
   * A passage of the page is staged, with nothing typed.
   *
   * 🔴 STAGED MATERIAL IS SUBMITTABLE, AND OMITTING THIS MADE THE COMPOSER LIE. Selecting text
   * puts a chip above the input and changes the placeholder to *"What should Nemesis do with
   * this?"* — a question with no visible way to answer it, because send only appeared once
   * something had been typed. The owner met exactly that: a bubble whose purpose was unclear,
   * over a composer with no send button. The two complaints are one defect.
   *
   * 🔴 IT IS THE SAME ARGUMENT AS `hasAttachment`, WHICH IS WHY IT SITS BESIDE IT RATHER THAN
   * BEING A SPECIAL CASE. Sending a file with nothing typed means "learn this with me"; sending a
   * selection with nothing typed means "explain this". In both, the learner has already said what
   * they mean by choosing the thing.
   *
   * 🔴 AND IT DOES NOT WEAKEN N3, FOR THE SAME STRUCTURAL REASON. A retrieval prompt owns the
   * screen and has no page to select from — the two states cannot both be live, so the send
   * control still cannot be pressed past an unanswered question.
   */
  readonly hasSelection?: boolean;
}): ComposerControl {
  // A response outranks everything: the moment one begins, the same control becomes send. That
  // holds in BOTH exposition and production, which is why it is tested first and only once.
  if (input.hasResponse) return "send";
  if (input.hasAttachment) return "send";
  if (input.hasSelection) return "send";
  // 🔴 `"none"` IS STILL A REAL ANSWER AND N3 STILL DEPENDS ON IT. In a production state with an
  // empty composer the control is ABSENT — not present-and-disabled — so retrieval cannot be
  // pressed past. Removing the `✓` narrowed this union; it did not soften that.
  return "none";
}
