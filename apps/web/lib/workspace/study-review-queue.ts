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

/**
 * The two states a card walks its learning steps in. The learn-ahead window below applies to these
 * and to nothing else.
 *
 * 🔴 EXPORTED BECAUSE THE DUE-CARD COUNT HAS TO NAME THEM IN SQL. The sidebar's "Review due cards
 * (N)" counts in the database rather than loading every card (see lib/space/due-cards.ts), so the
 * same two names are needed on both sides. A second hand-typed list in the query is how the row's
 * number and the review page's queue would start disagreeing.
 */
export const STEP_STATES = ["learning", "relearning"] as const;

const inSteps = (card: ReviewQueueCard) => (STEP_STATES as readonly string[]).includes(card.state);

/** This card's time has come, and it has not been put aside. Anki's plain due rule. */
export function isDueNow(card: ReviewQueueCard, at: number): boolean {
  return !card.suspended && new Date(card.dueAt).getTime() <= at;
}

/** A card mid-step, close enough to pull forward when nothing is genuinely due. */
export function isWithinLearnAhead(card: ReviewQueueCard, at: number, learnAheadMinutes = LEARN_AHEAD_MINUTES): boolean {
  return !card.suspended && inSteps(card) && new Date(card.dueAt).getTime() <= at + learnAheadMinutes * 60_000;
}

/**
 * Every card one sitting works through: what is due, plus the step cards the learn-ahead window
 * reaches.
 *
 * 🔴🔴 THIS IS THE SET, AND `buildReviewQueue` IS THE ORDER. The queue below shows the genuinely due
 * cards first and only pulls a step card forward once they run out — that is a decision about what
 * to put on screen NEXT, taken at one instant. A sitting that keeps going reaches both groups, and
 * a card mid-step is work left rather than work done (the same reasoning the review screen's own
 * counts carry). So "how many cards would this review" is this predicate, not the length of the
 * queue at one moment, and the two agree on the only thing they must: either both are empty or
 * neither is.
 */
export function isDueForReview(card: ReviewQueueCard, at: number, learnAheadMinutes = LEARN_AHEAD_MINUTES): boolean {
  return isDueNow(card, at) || isWithinLearnAhead(card, at, learnAheadMinutes);
}

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
  const due = mine.filter((card) => isDueNow(card, at)).sort((a, b) => Number(inSteps(b)) - Number(inSteps(a)) || when(a) - when(b));
  if (due.length > 0) return [...head, ...due];

  // Nothing is due. Pull a learning card forward rather than declaring the sitting finished.
  const ahead = mine
    .filter((card) => isWithinLearnAhead(card, at, learnAheadMinutes))
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
