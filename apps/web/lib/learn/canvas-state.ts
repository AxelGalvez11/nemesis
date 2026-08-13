// The canvas state machine.
//
// The brief calls for a visible progression (§2) that is "not rigid internally". So: forward
// moves are enumerated, and going back to reading is always allowed — a learner who asks
// "explain that again" mid-test must never be refused because of bookkeeping.
//
// Pure and dependency-free, because this is also the guard the ops validator consults before
// it lets the model move the page anywhere.

import type { CanvasState, LearningCanvas } from "./canvas-model";
import { isEvidenceStage } from "./canvas-hosting";

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
  // Re-reading stays available from anywhere it ever was, and this is checked BEFORE retirement so
  // a canvas stored mid-run keeps its way out. Retirement closes entrances, never exits.
  if (to === "learn" && ALWAYS_BACK_TO_LEARN.has(from)) return true;

  // 🔴 THE SIX-STAGE MACHINE IS RETIRED: NOTHING MAY MOVE INTO AN EVIDENCE STAGE.
  //
  // `FORWARD` above is deliberately left intact as the record of how that machine worked. This one
  // line is the retirement, and deriving it from `isEvidenceStage` rather than deleting edges by
  // hand means it can never drift from the list that decides what paints — two hand-maintained
  // lists disagreeing is how a learner gets offered a move into a surface that no longer exists.
  if (isEvidenceStage(to)) return false;

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


// 🔴 `nextAction` AND `offeredMove` ARE DELETED (owner, §38): *"The only button should be
// 'continue' below reading passages, thats it."*
//
// They existed to offer the six-stage machine's moves — "I've read this", "Test me", "Retest me",
// "Fix my weak spots", "Finish" — and #585 proved every one of them unreachable in every state a
// canvas can be observed in, because each destination was an evidence stage and the retirement
// refuses those. The reading-pace control among them came back as `Continue` (§38); the rest are
// gone, because re-testing is the system's job under §18 and weak-spot targeting is what objective
// ordering already does. A button for either is the learner managing the learning system (§26).
//
// `canTransition` and `canStart` are UNTOUCHED and still guard writes — the entrance refusal was
// never the same thing as the control that offered it.


