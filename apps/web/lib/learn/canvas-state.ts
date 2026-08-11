// The canvas state machine.
//
// The brief calls for a visible progression (§2) that is "not rigid internally". So: forward
// moves are enumerated, and going back to reading is always allowed — a learner who asks
// "explain that again" mid-test must never be refused because of bookkeeping.
//
// Pure and dependency-free, because this is also the guard the ops validator consults before
// it lets the model move the page anywhere.

import type { CanvasState, LearningCanvas } from "./canvas-model";

/** Forward edges. Everything else is refused unless it is a return to `learn`. */
const FORWARD: Record<CanvasState, readonly CanvasState[]> = {
  empty: ["sources_attached"],
  // 🔴 STRAIGHT TO TEACHING. This used to be `["orient"]` — the level picker — and it was the only
  // way out of an attached source. That screen is gone: Nemesis opens a canvas by doing something
  // with the material rather than by asking the learner to classify themselves first.
  sources_attached: ["learn"],
  // Kept ONLY so canvases stored before the picker was removed still resolve. Nothing enters this
  // state any more; a canvas found in it is started rather than asked anything.
  orient: ["learn"],
  learn: ["recall"],
  recall: ["test"],
  test: ["diagnose"],
  diagnose: ["targeted_relearn", "complete"],
  targeted_relearn: ["retest"],
  // A retest either finishes the canvas or sends the learner back to a fresh diagnosis.
  retest: ["complete", "diagnose"],
  complete: [],
};

/** Re-reading is always available once a lesson exists — the canvas is a place to understand
 *  something, not a funnel. */
const ALWAYS_BACK_TO_LEARN: ReadonlySet<CanvasState> = new Set<CanvasState>([
  "recall",
  "test",
  "diagnose",
  "targeted_relearn",
  "retest",
  "complete",
]);

export function canTransition(from: CanvasState, to: CanvasState): boolean {
  if (from === to) return false;
  if (to === "learn" && ALWAYS_BACK_TO_LEARN.has(from)) return true;
  return FORWARD[from].includes(to);
}

/** Attaching material to a canvas that has not started yet moves it along. Attaching to one
 *  already in flight leaves it exactly where it is — a second lecture must not wipe a lesson. */
export function stateAfterSourceAttached(canvas: Pick<LearningCanvas, "state">): CanvasState {
  return canvas.state === "empty" ? "sources_attached" : canvas.state;
}

/** Whether there is enough on the canvas to generate a lesson at all. Two ways in (§6):
 *  material-first (a source is attached) or topic-first (a title was typed). */
export function canStart(
  canvas: Pick<LearningCanvas, "sources" | "title">,
): { ok: true } | { ok: false; reason: string } {
  if (canvas.sources.length > 0) return { ok: true };
  if (canvas.title.trim().length > 0) return { ok: true };
  return { ok: false, reason: "Add material, or say what you want to learn." };
}

export interface NextAction {
  to: CanvasState;
  label: string;
}

/** The single move the canvas offers next, or null when there is nothing to offer.
 *
 *  🔴 An unfinished stage offers NOTHING. This used to hand out "See where I stand" while the
 *  learner was still on question one, so a single stray click ended the test and produced a
 *  diagnosis from one answer — which would then name weak concepts for everything that had
 *  simply not been asked yet. A move forward has to mean the stage is actually done. */
export function nextAction(
  canvas: Pick<
    LearningCanvas,
    "state" | "blocks" | "weakConceptIds" | "recall" | "recallResults" | "questions" | "answers"
  >,
): NextAction | null {
  switch (canvas.state) {
    case "learn":
      // Nothing to have read yet means nothing to move on from.
      return canvas.blocks.length > 0 ? { to: "recall", label: "I've read this" } : null;
    case "recall":
      return canvas.recall.length > 0 && canvas.recallResults.length >= canvas.recall.length
        ? { to: "test", label: "Test me" }
        : null;
    case "test":
      return canvas.questions.length > 0 && canvas.answers.length >= canvas.questions.length
        ? { to: "diagnose", label: "See where I stand" }
        : null;
    case "diagnose":
      return canvas.weakConceptIds.length > 0
        ? { to: "targeted_relearn", label: "Fix my weak spots" }
        : { to: "complete", label: "Finish" };
    case "targeted_relearn":
      return { to: "retest", label: "Retest me" };
    case "retest":
      // A retest ends on the same rule as a test: every question answered, then a verdict.
      return canvas.questions.length > 0 && canvas.answers.length >= canvas.questions.length
        ? { to: "diagnose", label: "See where I stand" }
        : null;
    default:
      return null;
  }
}
