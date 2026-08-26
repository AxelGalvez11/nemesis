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
 * 🔴 `answer` IS THE DEFAULT AND STAYS THE DEFAULT. Everything measured against ChatGPT and
 * Claude — the column, the character's place, the reply's typography — was measured on it, and a
 * learner who has never asked for anything must land on the Canvas the product is designed around.
 */
export const DEFAULT_CANVAS_VIEW: CanvasView = "answer";

/**
 * Where the choice is kept.
 *
 * 🔴🔴 THE BROWSER, NOT THE CANVAS DOCUMENT, AND THAT IS A CLAIM ABOUT WHAT KIND OF FACT THIS IS.
 * How you like to read is about YOU; it is not a property of the thing being read. Writing it to
 * `canvas.document` would make it travel on every autosave, would make two people opening one
 * shared canvas fight over it, and — worst — would make merely LOOKING at a canvas modify it. The
 * History Rail already made this exact call for `rewound` ("the canvas is not modified by being
 * read"); this is the same rule for the setting that outlives the visit.
 *
 * 🔴 ONE KEY FOR THE LEARNER, NOT ONE PER CANVAS. "I read in conversation" is a habit, and a
 * preference that had to be re-set on every new canvas would be a control, not a preference.
 */
export const CANVAS_VIEW_STORAGE_KEY = "nemesis.canvas.view";

/**
 * Read a stored value back, refusing anything that is not one of the two.
 *
 * 🔴 A BAD VALUE FALLS BACK RATHER THAN THROWING. `localStorage` is shared with every other tab,
 * every previous version of this app and anything a learner has typed into a console; a key holding
 * `"chat"` from some future rename must land on the default, not take the Canvas down. Reading is
 * the only place this can be enforced, because nothing can be assumed about what wrote it.
 */
export function readCanvasView(raw: string | null | undefined): CanvasView {
  return raw === "conversation" || raw === "answer" ? raw : DEFAULT_CANVAS_VIEW;
}

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
  return view === "conversation" ? "Show one answer at a time" : "Show the whole conversation";
}
