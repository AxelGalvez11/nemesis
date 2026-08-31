// What to show next, and when a card that is not due yet may be pulled forward anyway.
//
// 🔴🔴 THIS USED TO TRACK THE SITTING, AND NOW IT ONLY READS THE CLOCK. Until 2026-08-30 the queue
// took `passedIds` and `retryIds` from the review screen, because learning steps were SIMULATED in
// that component: a failed card was pushed to the back of the list and a new card was requeued
// twice before it was allowed to leave. That is the arrangement the owner found wrong — the card
// came back "a few cards later" instead of in ten minutes, and the moment it graduated it was gone
// for days.
//
// Steps are stored on the card now (`state`, `remainingSteps`, and a `dueAt` that holds minutes),
// so a card returns because its time came. The queue is "what is due", which is all a queue should
// ever have been.
//
// 🔴 THE LEARN-AHEAD WINDOW IS THE ONE EXCEPTION, AND IT IS ANKI'S. Press Good on the only card in
// a deck and it is due in ten minutes; a strict "due now" filter would print "You're caught up"
// over an unfinished card. Anki's answer is the learn-ahead limit — twenty minutes by default —
// which applies ONLY when nothing is genuinely due. So a full deck is worked through first, and
// the early pull happens exactly when the alternative is an empty screen.

import { LEARN_AHEAD_MINUTES, type StudyCardState } from "./study-scheduler";

export interface ReviewQueueCard {
  id: string;
  deckId: string;
  dueAt: string;
  suspended: boolean;
  state: StudyCardState;
}

export interface ReviewQueueInput<T extends ReviewQueueCard> {
  cards: T[];
  deckId: string | null;
  /** A card the learner just undid, which jumps the queue so they can grade it again. */
  priorityId?: string | null;
  now?: Date;
  /** Minutes a learning card may be pulled forward when nothing is due. Anki's default is 20. */
  learnAheadMinutes?: number;
}

const inSteps = (card: ReviewQueueCard) => card.state === "learning" || card.state === "relearning";

export function buildReviewQueue<T extends ReviewQueueCard>({
  cards,
  deckId,
  priorityId = null,
  now,
  learnAheadMinutes = LEARN_AHEAD_MINUTES,
}: ReviewQueueInput<T>): T[] {
  if (!deckId) return [];
  const at = (now ?? new Date()).getTime();
  const when = (card: T) => new Date(card.dueAt).getTime();
  const mine = cards.filter((card) => card.deckId === deckId && !card.suspended && card.id !== priorityId);
  const priority = priorityId ? cards.find((card) => card.id === priorityId && card.deckId === deckId && !card.suspended) : undefined;
  const head = priority ? [priority] : [];

  // 🔴 CARDS IN A STEP COME FIRST AMONG THE DUE ONES, because they are the only ones with a real
  // deadline: a review card due "today" is due any time today, while a card due four minutes ago is
  // four minutes late. Within each group, the one waiting longest goes first.
  const due = mine.filter((card) => when(card) <= at).sort((a, b) => Number(inSteps(b)) - Number(inSteps(a)) || when(a) - when(b));
  if (due.length > 0) return [...head, ...due];

  // Nothing is due. Pull a learning card forward rather than declaring the sitting finished.
  const ahead = mine
    .filter((card) => inSteps(card) && when(card) <= at + learnAheadMinutes * 60_000)
    .sort((a, b) => when(a) - when(b));
  return [...head, ...ahead];
}

/** How long until the next card arrives, in minutes, or null if there is genuinely nothing left.
 *  The review screen says this instead of an unqualified "You're caught up". */
export function minutesUntilNext<T extends ReviewQueueCard>(cards: T[], deckId: string | null, now?: Date): number | null {
  if (!deckId) return null;
  const at = (now ?? new Date()).getTime();
  const upcoming = cards
    .filter((card) => card.deckId === deckId && !card.suspended && inSteps(card))
    .map((card) => new Date(card.dueAt).getTime())
    .filter((time) => time > at);
  if (upcoming.length === 0) return null;
  return Math.max(1, Math.ceil((Math.min(...upcoming) - at) / 60_000));
}
