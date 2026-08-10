// What Nemesis is trying to accomplish with this learner, and how far each part has got.
//
// 🔴 DERIVED, ALWAYS. There is no `minimap_progress` and there must never be one (§8). Every
// state below is computed from evidence that already exists — the diagnosis, the weak list, the
// corrected list, the active task. A stored progress field would be a second copy of the truth,
// and the moment the two disagree the map is lying about the learner in a way nothing can catch.
//
// 🔴 AND IT IS QUALITATIVE ON PURPOSE (§9). No percentages. "73% mastery" is a number we cannot
// defend: it would be computed from a handful of judged answers and read as a measurement. Five
// states a learner can actually act on beat one number that looks like science.
//
// Language note: the weak state is called `needs_evidence`, not `forgotten`. Nemesis does not
// know that anyone forgot anything — it knows it has not seen a recent successful retrieval,
// which is a statement about our evidence, not about their memory (§35).

import { diagnose } from "./canvas-diagnosis";
import type { CanvasConcept, LearningCanvas } from "./canvas-model";

export type ObjectiveState =
  /** Shown, and it held up. */
  | "demonstrated"
  /** Was weak, and a later attempt fixed it. Kept distinct because recovering from a mistake is
   *  a different fact about a learner than never having made one — and it is the more
   *  encouraging one to see on a map. */
  | "corrected"
  /** Something we have seen says this is not solid yet. */
  | "needs_evidence"
  /** What the canvas is working on right now. */
  | "current"
  /** Declared as part of this canvas, not yet assessed. */
  | "untouched";

export interface ObjectiveView {
  id: string;
  label: string;
  state: ObjectiveState;
}

/** The concept the active prompt is evidence for, if there is one.
 *
 *  Resolved from the task's id rather than passed in as a concept, because the caller has the
 *  card or question in hand and the mapping between them is exactly the thing that goes stale
 *  when questions are regenerated. */
function currentConceptId(canvas: LearningCanvas, activeTaskId: string | null | undefined): string | null {
  if (!activeTaskId) return null;
  const card = canvas.recall.find((entry) => entry.id === activeTaskId);
  if (card) return card.conceptId ?? null;
  const question = canvas.questions.find((entry) => entry.id === activeTaskId);
  return question?.conceptId ?? null;
}

/** Every objective on this canvas, in the order the lesson declared them, with the state each
 *  one is actually in. */
export function objectiveMap(
  canvas: LearningCanvas,
  activeTaskId?: string | null,
): ObjectiveView[] {
  const diagnosis = diagnose(canvas);
  const understood = new Set(diagnosis.understood.map((concept) => concept.id));
  const weak = new Set([...diagnosis.weak.map((concept) => concept.id), ...canvas.weakConceptIds]);
  const corrected = new Set(canvas.correctedConceptIds);
  const current = currentConceptId(canvas, activeTaskId);

  return canvas.concepts.map((concept: CanvasConcept): ObjectiveView => {
    // The one the learner is looking at wins the display, whatever else is true of it — the map
    // is answering "where am I" first and "how did I do" second.
    if (concept.id === current) return { id: concept.id, label: concept.label, state: "current" };

    // 🔴 Corrected before weak. A concept that failed and was then fixed appears in BOTH lists
    // — `weakConceptIds` is not cleared when a retest passes — so testing weak first would
    // report every recovery as an outstanding problem, permanently.
    if (corrected.has(concept.id)) return { id: concept.id, label: concept.label, state: "corrected" };
    if (weak.has(concept.id)) return { id: concept.id, label: concept.label, state: "needs_evidence" };
    if (understood.has(concept.id)) return { id: concept.id, label: concept.label, state: "demonstrated" };
    return { id: concept.id, label: concept.label, state: "untouched" };
  });
}

/** One line of plain English for the panel: what is being worked on now.
 *
 *  Returns null rather than inventing a focus. Between rounds there genuinely is no current
 *  objective, and "Nemesis is currently working on: —" is worse than saying nothing. */
export function currentObjectiveLabel(
  canvas: LearningCanvas,
  activeTaskId?: string | null,
): string | null {
  const map = objectiveMap(canvas, activeTaskId);
  const current = map.find((objective) => objective.state === "current");
  if (current) return current.label;
  // No active prompt — but during targeted relearning the canvas is unambiguously working on
  // the weak objectives, so naming the first is accurate rather than a guess.
  if (canvas.state === "targeted_relearn") {
    return map.find((objective) => objective.state === "needs_evidence")?.label ?? null;
  }
  return null;
}
