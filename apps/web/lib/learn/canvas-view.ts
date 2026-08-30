// Which of the two ways of looking at one Canvas the learner has chosen.
//
// 🔴🔴 A VIEW, NOT A MODE, AND THE DISTINCTION IS THE WHOLE POINT — owner, 2026-08-26: *"it
// shouldn't be a different mode. It should just be, like, a different view, a different way to view
// outputs."* `canvas-has-no-modes` states the line this obeys: *"A mode is a claim about what you
// may do; the intent is a fact about what you are doing, and only one of those belongs on screen."*
//
// So this value may change WHAT IS DRAWN and nothing else. It may not reach the composer, the
// intent, the answer sink, `composeSurface`, the policy runtime or anything the learner is allowed
// to DO — every one of those behaves identically in both views, which is what makes switching safe
// enough to be a preference rather than a decision. `canvas-conversation-view.test.ts` asserts that
// by name, because the failure mode here is not a bug, it is a mode growing back one prop at a time.
//
// PURE. No React, no I/O — the storage side lives in `use-canvas-view.ts`.

/**
 * The two views.
 *
 * `answer`       — the Canvas as it has always been: whatever Nemesis last put on the page, alone.
 *                  Contract rule 2, one exchange owning the surface, the learner's own sentence not
 *                  drawn at all.
 * `conversation` — the same session read end to end: every recorded moment in the order it
 *                  happened, the learner's words in their own bubble, scrollable.
 *
 * 🔴 THEY READ THE SAME SESSION. There is no second store, no second source of truth and nothing
 * that exists in one and not the other — the conversation view is a projection of `canvas.moments`,
 * the same append-only spine the History Rail already draws. A view that could show something the
 * other cannot would be a mode wearing a view's name.
 */
export type CanvasView = "answer" | "conversation";

/**
 * 🔴🔴 `conversation` IS THE DEFAULT — OWNER REVERSAL, 2026-08-26, HOURS AFTER THE VIEW SHIPPED
 * WITH `answer` AS THE DEFAULT: *"it should be a chatbot first. That's what makes sense. And the
 * Canvas should just be a different way to view the chatbot history, or not even the history, just
 * to focus it… the user could switch back to the classic chat mode."*
 *
 * So Nemesis is a chatbot you can focus, not a focused surface you can unfold. The note this
 * replaces argued that everything had been MEASURED on the one-answer view — the column, the
 * character's place, the typography. All of that is still true and none of it changed: the thread
 * is the same column with the turns above it left on the page, which is why the flip is a default
 * and not a rebuild.
 */
export const DEFAULT_CANVAS_VIEW: CanvasView = "conversation";

/**
 * The key the browser USED to keep the choice under. Nothing reads it and nothing writes it any
 * more; it exists so `use-canvas-view.ts` can delete what old builds left behind.
 *
 * 🔴🔴🔴 THE STORED PREFERENCE IS DEAD, AND THIS IS THE THIRD REPORT'S FIX — owner, 2026-08-28 and
 * again 2026-08-30: *"chat mode should pretty much just work the exact same way, but, you know,
 * actually show the conversations history"*, then *"Now can we fix the chat mode not showing
 * conversation history?"* Each time, the thread itself was already built and working. What kept
 * failing was this: one click of "Focus on the latest output" wrote `answer` here, and from then on
 * EVERY canvas opened with the history hidden, on every visit, silently — the learner sees a chat
 * product with no history and has no way to know a preference is doing it. Reproduced on screen
 * 2026-08-30: a canvas holding four recorded turns opened with none of them drawn.
 *
 * The note this replaces argued a per-visit choice "would be a control, not a preference". That was
 * the wrong trade, three reports' worth of wrong: an invisible setting that contradicts the
 * product's own default shape ("it should be a chatbot first") reads as the product being broken.
 * Focusing is a way of LOOKING, like zooming in — it lasts while you look, and letting go returns
 * you to the product. The toggle still works; it simply no longer outlives the visit.
 *
 * 🔴 SO: no `readCanvasView`, no `setItem`, ever. The ONE permitted storage access is
 * `removeItem(CANVAS_VIEW_STORAGE_KEY)`, which heals every browser that still carries the pin —
 * including the one this was reported from three times. `canvas-chat-is-the-product.test.ts`
 * enforces all of it.
 */
export const CANVAS_VIEW_STORAGE_KEY = "nemesis.canvas.view";


/** The other one. Named rather than inlined so the toggle has no opinion about which is which. */
export function otherCanvasView(view: CanvasView): CanvasView {
  return view === "conversation" ? "answer" : "conversation";
}

/**
 * What the control says it will do — the DESTINATION, never the current state.
 *
 * 🔴 A TOGGLE'S LABEL IS A PROMISE ABOUT THE NEXT CLICK. "Conversation" on a button that is already
 * showing the conversation reads as a label for where you are, and the two are indistinguishable
 * to anybody who did not write it. `aria-pressed` carries the state; the words carry the action.
 */
export function canvasViewAction(view: CanvasView): string {
  return view === "conversation" ? "Focus on the latest output" : "Show the whole conversation";
}
