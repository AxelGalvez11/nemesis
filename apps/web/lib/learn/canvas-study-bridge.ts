// Canvas recall cards become real Nemesis flashcards.
//
// The brief says reuse the existing flashcard generation and grading rather than building a
// parallel one, and this is that seam: a canvas writes into `study_decks` / `study_cards` and
// grades through the `grade_study_card` RPC — the same Postgres function the Study tab uses,
// so the scheduling is identical and a card reviewed in a canvas is genuinely due later.
//
// 🔴 Why direct queries rather than `useCloudStudy()`. That hook loads every deck, card,
// review and artifact the account owns on mount. A canvas needs to write about twelve cards;
// pulling a student's whole study history onto a reading page to do it would be a real cost
// on every visit. The writes below are the same statements the store issues internally.
//
// Best-effort throughout: if the write fails, recall still works inside the canvas, which is
// what the learner is actually here for. It just does not survive into Study.

import { supabase } from "@/lib/supabase";
import { normalizeStudyTags } from "@/lib/workspace/study-cloud-store";
import type { StudyGrade } from "@/lib/workspace/study-scheduler";

import type { CanvasConcept, RecallCard } from "./canvas-model";
import { deckName } from "./deck-name";

/** Marks canvas-made decks so they are recognisable in Study, and so the pilot's output can be
 *  told apart from a student's own decks later. */
export const CANVAS_DECK_TAG = "learning-canvas";

export async function ensureCanvasDeck(
  userId: string,
  canvasTitle: string,
  existingDeckId: string | undefined,
): Promise<string | null> {
  if (existingDeckId) return existingDeckId;
  // 🔴 ONE NAMING RULE, SHARED WITH `canvas-deliverables.ts`. This used to fall back to
  // "Learning canvas" while that file fell back to "Nemesis canvas" — two files naming a deck
  // after the tool that built it, in two different ways. See `deck-name.ts`.
  try {
    const { data, error } = await supabase
      .from("study_decks")
      .insert({
        user_id: userId,
        name: deckName(canvasTitle),
        description: "Made while learning on a Nemesis canvas.",
      })
      .select("id")
      .single();
    if (error || !data) return null;
    return (data as { id: string }).id;
  } catch {
    return null;
  }
}

/** Write the canvas's recall cards into the real deck, tagging each with its concept so the
 *  card carries what it is ABOUT — the field `tags` is the only carrier a study card has, and
 *  without it a canvas card lands in Study as an orphan. */
export async function writeRecallCards(
  userId: string,
  deckId: string,
  cards: readonly RecallCard[],
  concepts: readonly CanvasConcept[],
): Promise<Map<string, string>> {
  const labels = new Map(concepts.map((concept) => [concept.id, concept.label]));
  const rows = cards.map((card) => ({
    user_id: userId,
    deck_id: deckId,
    front: card.front,
    back: card.back,
    card_type: "basic",
    tags: normalizeStudyTags([CANVAS_DECK_TAG, ...(card.conceptId ? [labels.get(card.conceptId) ?? ""] : [])].filter(Boolean)),
  }));

  try {
    const { data, error } = await supabase.from("study_cards").insert(rows).select("id,front");
    if (error || !data) return new Map();
    // Matched back by front text: the insert returns rows in an order Postgres does not
    // promise, and pairing by array position would attach the wrong scheduler row to a card.
    const byFront = new Map((data as { id: string; front: string }[]).map((row) => [row.front, row.id]));
    const out = new Map<string, string>();
    for (const card of cards) {
      const id = byFront.get(card.front);
      if (id) out.set(card.id, id);
    }
    return out;
  } catch {
    return new Map();
  }
}

/** Grade through the production scheduler. Returns false when the card never made it to the
 *  cloud, so the caller can keep the session going without pretending it was scheduled. */
export async function gradeStudyCard(studyCardId: string | undefined, grade: StudyGrade): Promise<boolean> {
  if (!studyCardId) return false;
  try {
    const { error } = await supabase.rpc("grade_study_card", { p_card_id: studyCardId, p_grade: grade });
    return !error;
  } catch {
    return false;
  }
}
