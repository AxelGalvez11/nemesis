// Whether an ad hoc, learner-triggered explanation survives past this moment — product mandate
// rule 2 (owner, 2026-08-15): *"Corrections or explanations that require reading STAY UNTIL
// ACKNOWLEDGED. Normal chat responses may remain only until the next turn. These two categories
// behave differently and the difference must be explicit in the code, not incidental."*
//
// 🔴 SCOPE: THIS FILE GOVERNS TWO SURFACES ONLY — `aside` (session state, set by `askAbout` for
// "Explain this" and "where did this come from") and the selection/term popover (`answer`/`term`
// in learning-canvas.tsx, opened by Define/Example/Why/Explain on a highlight or a marked word).
// Both are exactly the mandate's "normal chat response": a short answer the learner asked for in
// passing, that never becomes part of the taught arc. `canvas-document.tsx`'s own header calls this
// out directly — `askAbout`'s doc comment: *"Answered in a popover that disappears — the whole
// point of §4 is that asking does not build a transcript down the side of the document."*
//
// 🔴 WHAT THIS FILE DOES NOT GOVERN, ON PURPOSE. The teaching policy's own corrections, contrasts
// and verdicts are the mandate's OTHER category — "stays until acknowledged" — and that half is
// already built, correctly, in `lib/learn/cognitive-mode.ts`'s `Exposition`/`advancesItself` and
// rendered by `canvas-policy-view.tsx`'s `Frame` (a `Continue` button, or a timed auto-advance for
// a `transient` exposition). This file does not reimplement that: `policy_continue` below is a
// real event this module answers, and the answer is "clears neither of the two surfaces this file
// owns" — proving the asymmetry rather than asserting it, without a second copy of the policy's own
// state machine.
//
// PURE. No React, no I/O, no copy. What survives is decided here; when to ask is
// `learning-canvas.tsx`'s, which calls this at every point one of the four events below actually
// happens rather than re-deriving the rule at each call site.

/** What is currently on screen, reduced to the facts this rule needs. */
export interface ExplanationState {
  /** An "Explain this" / "where did this come from" popover is open under some block. */
  readonly hasAside: boolean;
  /** A Define/Example/Why/Explain popover is open on a highlight or a clicked term. */
  readonly hasPopover: boolean;
  /**
   * The aside on screen is the sentence that INTRODUCED the lesson, not an answer to a question.
   *
   * 🔴🔴 THE DISTINCTION WAS MISSING AND IT COST THE OWNER A SECOND REPORT. Reported 2026-08-21
   * with a screenshot: the lesson had moved on to *"What follows from Java's increasing popularity
   * at the time, and why?"* and, underneath it, still sat *"Alright, let's get you started with
   * JavaScript. The canvas will walk you through the core concepts…"* — a sentence whose entire job
   * was to introduce a screen that was no longer there.
   *
   * 🔴 THE RULE WAS RIGHT AND ITS SUBJECT WAS WRONG. `policy_continue` clears NEITHER surface, and
   * the reason given is sound: *"acknowledging a correction says nothing about an aside opened three
   * questions ago, on an unrelated passage."* That is a statement about a LEARNER-TRIGGERED
   * explanation — the thing this file's header scopes it to. An opening is not one of those. It is
   * written by the same `setAside` call and is a different object entirely: the learner never asked
   * for it, it belongs to one screen, and the moment that screen advances it is describing the past.
   */
  readonly asideIsOpening?: boolean;
}

/** Nothing open — the ordinary resting state of a canvas nobody has asked anything of yet. */
export const NO_EXPLANATIONS: ExplanationState = { asideIsOpening: false, hasAside: false, hasPopover: false };

export type ExplanationEvent =
  /**
   * The learner asked Nemesis something new, or answered what it was currently asking — the
   * mandate's "next turn". Fired once, unconditionally, at the top of `learning-canvas.tsx`'s
   * `submit()` and inside the composer's `onAnswer` wrapper, rather than by each branch inside
   * them remembering to call it — the same shape `materialOwnsAttention` uses in
   * `lib/learn/canvas-hosting.ts` for the identical reason: a rule scattered across N call sites
   * is a rule N−1 of them forget the next time one is added.
   */
  | { readonly kind: "new_turn" }
  /** The learner pressed the aside's own Dismiss. */
  | { readonly kind: "dismiss_aside" }
  /** The learner pressed the popover's own Dismiss (or it dismissed itself after "Simpler"). */
  | { readonly kind: "dismiss_popover" }
  /**
   * The learner acknowledged a reading-required screen the teaching policy is holding open —
   * `canvas-policy-view.tsx`'s `Continue`. The mandate's OTHER category, included here only so the
   * asymmetry has a real row rather than living solely in a comment: acknowledging a correction
   * says nothing about an aside opened three questions ago, on an unrelated passage.
   */
  | { readonly kind: "policy_continue" };

/**
 * What survives this event.
 *
 * 🔴 THE TABLE, AS CODE, NOT AS TWO INDEPENDENT `setState(null)` CALLS THAT HAPPEN TO AGREE TODAY.
 * `new_turn` is the only event that clears both without being asked — every branch of `submit()`
 * gets it for free by dispatching once at the top, rather than each of "explain this", "rewrite",
 * "refused" and "ordinary" needing to remember. `policy_continue` clears NEITHER, which is the row
 * that makes this a different rule from the teaching policy's `Exposition`, not a restatement of it
 * under a new name — see the file header. What it DOES clear is an `opening`, which is not a
 * learner-triggered explanation at all — see `asideIsOpening`.
 */
export function nextExplanationState(state: ExplanationState, event: ExplanationEvent): ExplanationState {
  switch (event.kind) {
    case "new_turn":
      return NO_EXPLANATIONS;
    case "dismiss_aside":
      return state.hasAside ? { ...state, hasAside: false } : state;
    case "dismiss_popover":
      return state.hasPopover ? { ...state, hasPopover: false } : state;
    case "policy_continue":
      // 🔴 AN OPENING GOES, AN ANSWER STAYS, AND THE ASYMMETRY IS THE WHOLE POINT OF THE FIELD. The
      // learner acknowledging the screen an opening introduced is exactly the moment that sentence
      // stops being true; the same press says nothing about an explanation they asked for on an
      // unrelated passage, which is what this row has always protected.
      return state.hasAside && state.asideIsOpening ? { ...state, asideIsOpening: false, hasAside: false } : state;
  }
}
