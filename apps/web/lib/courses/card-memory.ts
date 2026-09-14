// What one learner remembers of one course's flashcards.
//
// 🔴 THE SCHEDULER IS NOT REIMPLEMENTED HERE. `lib/workspace/study-scheduler.ts` is FSRS-6 and it
// already agrees to the decimal with the `grade_study_card` function in Postgres. A second copy of
// those equations living in the courses lane would drift within a week and there would be no test
// that noticed. This file only loads and saves; every decision about intervals belongs there.
//
// A course card is addressed by (course, section, position in the lesson's flashcard array) rather
// than copied into a row of its own, because the card belongs to the course and the memory belongs
// to the learner. See the `course_card_reviews` migration for why that split is load-bearing.

import { supabase } from "@/lib/supabase";
import {
  elapsedDaysBetween,
  type AnswerableCard,
  type StudyAnswer,
} from "@/lib/workspace/study-scheduler";

export interface CardMemory extends AnswerableCard {
  readonly sectionOrdinal: number;
  readonly cardIndex: number;
  readonly dueAt: string | null;
  readonly lastReviewedAt: string | null;
}

/** A card nobody has graded yet. FSRS reads zeros as "no memory", which is exactly right. */
export function freshMemory(sectionOrdinal: number, cardIndex: number): CardMemory {
  return {
    cardIndex,
    difficulty: 0,
    dueAt: null,
    intervalDays: 0,
    lapses: 0,
    lastReviewedAt: null,
    remainingSteps: 0,
    repetitions: 0,
    sectionOrdinal,
    stability: 0,
    state: "new",
  };
}

const KEY = (sectionOrdinal: number, cardIndex: number) => `${sectionOrdinal}:${cardIndex}`;

export function memoryKey(sectionOrdinal: number, cardIndex: number): string {
  return KEY(sectionOrdinal, cardIndex);
}

export async function loadCardMemory(
  userId: string | null,
  courseId: string,
): Promise<Map<string, CardMemory>> {
  if (!userId) return new Map();
  const { data, error } = await supabase
    .from("course_card_reviews")
    .select("section_ordinal,card_index,state,remaining_steps,interval_days,repetitions,lapses,stability,difficulty,due_at,last_reviewed_at")
    .eq("user_id", userId)
    .eq("course_id", courseId);
  if (error || !data) return new Map();
  return new Map(
    data.map((row) => {
      const memory: CardMemory = {
        cardIndex: Number(row.card_index),
        difficulty: Number(row.difficulty ?? 0),
        dueAt: (row.due_at as string) ?? null,
        intervalDays: Number(row.interval_days ?? 0),
        lapses: Number(row.lapses ?? 0),
        lastReviewedAt: (row.last_reviewed_at as string) ?? null,
        remainingSteps: Number(row.remaining_steps ?? 0),
        repetitions: Number(row.repetitions ?? 0),
        sectionOrdinal: Number(row.section_ordinal),
        stability: Number(row.stability ?? 0),
        state: (row.state as CardMemory["state"]) ?? "new",
      };
      return [KEY(memory.sectionOrdinal, memory.cardIndex), memory];
    }),
  );
}

/** How long since this card was last seen, in the units FSRS counts. */
export function elapsedFor(memory: CardMemory, now: Date): number {
  return elapsedDaysBetween(memory.lastReviewedAt, now);
}

/** Fold an answer back into a memory, so the screen can move on before the write returns. */
export function applyAnswer(memory: CardMemory, answer: StudyAnswer, now: Date): CardMemory {
  const due = new Date(now);
  if (answer.dueInMinutes === null) due.setDate(due.getDate() + answer.intervalDays);
  else due.setTime(due.getTime() + answer.dueInMinutes * 60_000);
  return {
    ...memory,
    difficulty: answer.difficulty,
    dueAt: due.toISOString(),
    intervalDays: answer.intervalDays,
    lapses: answer.lapses,
    lastReviewedAt: now.toISOString(),
    remainingSteps: answer.remainingSteps,
    repetitions: answer.repetitions,
    stability: answer.stability,
    state: answer.state,
  };
}

/**
 * Write one graded card.
 *
 * 🔴 SIGNED OUT IS NOT AN ERROR HERE. The preview lane and a signed-out reader still get a working
 * deck; what they do not get is a schedule that survives the tab. Returning quietly means the
 * screen never has to branch on whether saving is possible.
 */
export async function saveCardMemory(
  userId: string | null,
  courseId: string,
  memory: CardMemory,
): Promise<void> {
  if (!userId) return;
  await supabase.from("course_card_reviews").upsert(
    {
      card_index: memory.cardIndex,
      course_id: courseId,
      difficulty: memory.difficulty,
      due_at: memory.dueAt,
      interval_days: memory.intervalDays,
      lapses: memory.lapses,
      last_reviewed_at: memory.lastReviewedAt,
      remaining_steps: memory.remainingSteps,
      repetitions: memory.repetitions,
      section_ordinal: memory.sectionOrdinal,
      stability: memory.stability,
      state: memory.state,
      updated_at: new Date().toISOString(),
      user_id: userId,
    },
    { onConflict: "user_id,course_id,section_ordinal,card_index" },
  );
}

export interface DeckCounts {
  readonly fresh: number;
  readonly learning: number;
  readonly due: number;
}

/**
 * Anki's three counts, which are the whole of its home screen.
 *
 * 🔴 A CARD IN A LEARNING STEP IS COUNTED WHETHER OR NOT ITS MINUTE HAS COME, AND A REVIEW CARD IS
 * NOT. This looks inconsistent and it is what Anki does, for a reason worth stating: a learning
 * card is coming back within the hour, so it is unfinished work you can see; a review card not yet
 * due is weeks away and counting it would show a hundred-card backlog on a deck where two cards are
 * actually ready, which is the number that makes people give up.
 *
 * The version before this gated BOTH on being due, and the bug was immediate: press Good on a new
 * card and it left `new` (correct, it has been seen) without arriving in `learning` (wrong, it is
 * due in ten minutes), so the card appeared to vanish from the deck.
 */
export function countDeck(
  memories: readonly CardMemory[],
  total: number,
  now: Date,
): DeckCounts {
  let learning = 0;
  let due = 0;
  const seen = new Set<number>();
  for (const memory of memories) {
    seen.add(memory.cardIndex);
    if (memory.state === "learning" || memory.state === "relearning") {
      learning += 1;
    } else if (memory.state === "review") {
      const ready = memory.dueAt === null || new Date(memory.dueAt).getTime() <= now.getTime();
      if (ready) due += 1;
    }
  }
  return { due, fresh: Math.max(0, total - seen.size), learning };
}
