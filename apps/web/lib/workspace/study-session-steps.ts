// In-session Anki behavior: a card must FINISH its sitting before it leaves
// the review queue. New cards climb learning steps (two successful passes,
// Anki's default 1m/10m ladder collapsed into one sitting) and failed cards
// relearn until they pass. Only the press that graduates a card persists
// through the scheduler — the in-between presses are session-only, otherwise
// one sitting would inflate the schedule (two Goods on a brand-new card would
// jump it straight to a multi-day interval) and fumbling a new card would
// count as a lapse, which Anki never does.

import type { StudyGrade } from "./study-scheduler";

/** Successful passes a new card needs before it graduates the sitting. */
export const NEW_CARD_PASSES = 2;

export interface SessionCardState {
  /** Stored repetitions — 0 means the card is still new (in learning). */
  repetitions: number;
  /** Successful passes earlier in this sitting (learning cards only). */
  progress: number;
  /** The card already failed or re-queued earlier in this sitting. */
  inRetry: boolean;
}

export interface SessionGradeDecision {
  /** Persist this press through the scheduler (RPC / preview scheduler). */
  write: boolean;
  /** Card stays in this sitting — re-queue it at the back. */
  requeue: boolean;
  /** Next successful-pass count to remember for the card. */
  progress: number;
}

export function decideSessionGrade(card: SessionCardState, grade: StudyGrade): SessionGradeDecision {
  const learning = card.repetitions === 0;
  if (grade === "easy") return { progress: 0, requeue: false, write: true };
  if (grade === "again") {
    // A real lapse writes once; failing a NEW card (or the same card twice in
    // one sitting) just resets the learning steps without touching storage.
    return { progress: 0, requeue: true, write: !learning && !card.inRetry };
  }
  if (grade === "hard") {
    // Hard repeats the current learning step; on a due review it schedules
    // out normally and the card is done for today.
    const stays = learning || card.inRetry;
    return { progress: card.progress, requeue: stays, write: !stays };
  }
  // Good: climb a step. The final step graduates and writes the schedule.
  if (learning) {
    const progress = card.progress + 1;
    if (progress >= NEW_CARD_PASSES) return { progress: 0, requeue: false, write: true };
    return { progress, requeue: true, write: false };
  }
  return { progress: 0, requeue: false, write: true };
}
