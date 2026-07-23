// The order and the tally of ONE review sitting (owner 2026-07-23: "the 'new
// review, due' numbers in study review do not update at all").
//
// They were right, and the cause was structural rather than a stale render.
// The footer counts whatever is LEFT in the sitting, and until now every graded
// card left the sitting for good — so on a freshly imported deck, where every
// card has repetitions 0, the split was New = everything, Learn = 0, Due = 0,
// and the only number that could ever move was New. Two of the three sat at
// zero for the entire session no matter what you pressed.
//
// The missing piece is Anki's learning step. Pressing "Again" means "I didn't
// know this — show it to me again before I stop", so the card comes back at the
// END of this sitting instead of vanishing. That single change makes Learn a
// real, moving number, and it is also what makes the new left-half "Again" tap
// zone safe: a mis-tap costs you one more look at the card, not a day.
//
// The SERVER's schedule is untouched by the replay — grade_study_card has
// already written its own next due date, and the replay is a session-local
// second look, not a rollback. Grading the card again on the second look calls
// the RPC again, which is exactly what a second look should do.
//
// Pure module (no react-native, no api/ imports) so it Deno-tests like the rest
// of src/lib.

/** Interval at which a card counts as mature rather than still being learned.
 *  Mirrors api/cloudStudy.ts's MATURE_INTERVAL_DAYS — duplicated rather than
 *  imported because that module pulls in the Supabase client, which the Deno
 *  test runner can't load. */
export const MATURE_INTERVAL_DAYS = 21;

/** The fields of a study card this module needs. The real CloudStudyCard has
 *  many more; keeping the shape minimal is what lets the tests build one. */
export interface QueueCard {
  id: string;
  repetitions: number;
  intervalDays: number;
  dueAt: string;
  suspended: boolean;
}

/** What this sitting has done so far. Both are ID lists in the order the events
 *  happened, so they double as the undo trail's backing order. */
export interface SessionProgress {
  /** Finished for this sitting — graded anything but "Again". */
  doneIds: readonly string[];
  /** Graded "Again" and waiting to come round once more, in return order. */
  relearnIds: readonly string[];
}

export const EMPTY_PROGRESS: SessionProgress = { doneIds: [], relearnIds: [] };

/** A card is due right now. Suspended cards never are. Mirrors
 *  api/cloudStudy.ts's isCardDue (same reason for the duplication as above). */
export function isDue(card: Pick<QueueCard, "dueAt" | "suspended">, now: Date): boolean {
  if (card.suspended) return false;
  const due = Date.parse(card.dueAt);
  if (Number.isNaN(due)) return true;
  return due <= now.getTime();
}

/**
 * The sitting's queue, in the order the cards will be shown.
 *
 * Cards still awaiting their first look come first, in their existing order;
 * cards sent back by an "Again" follow, in the order they were sent back. That
 * ordering is the whole point — a card you just failed should not reappear as
 * the very next card, because answering it again ten seconds later tests
 * nothing but short-term memory.
 */
export function sessionQueue<T extends QueueCard>(
  cards: readonly T[],
  progress: SessionProgress,
  now: Date,
): T[] {
  const done = new Set(progress.doneIds);
  const replayAt = new Map(progress.relearnIds.map((id, index) => [id, index]));

  const first: T[] = [];
  const replay: T[] = [];
  for (const card of cards) {
    if (done.has(card.id)) continue;
    if (replayAt.has(card.id)) {
      replay.push(card);
      continue;
    }
    if (isDue(card, now)) first.push(card);
  }
  replay.sort((a, b) => (replayAt.get(a.id) ?? 0) - (replayAt.get(b.id) ?? 0));
  return [...first, ...replay];
}

export interface SessionCounts {
  /** Never studied — Anki's blue "New". */
  fresh: number;
  /** Being learned right now: sent back by an "Again" this sitting, or young
   *  enough (short interval) that it isn't established yet. */
  learn: number;
  /** Established cards that have simply come round again. */
  due: number;
}

/**
 * The three footer numbers, over the cards LEFT in the sitting.
 *
 * "Sent back this sitting" outranks the card's own fields deliberately: the
 * server bumps `repetitions` on every grade including "Again", so a failed card
 * would otherwise be filed by its interval and could read as established
 * moments after you told the app you'd forgotten it.
 */
export function sessionCounts(queue: readonly QueueCard[], progress: SessionProgress): SessionCounts {
  const replaying = new Set(progress.relearnIds);
  let fresh = 0;
  let learn = 0;
  for (const card of queue) {
    if (replaying.has(card.id)) learn += 1;
    else if (card.repetitions === 0) fresh += 1;
    else if (card.intervalDays < MATURE_INTERVAL_DAYS) learn += 1;
  }
  return { due: queue.length - fresh - learn, fresh, learn };
}

/** Record a grade. "Again" sends the card round again (moving it to the back if
 *  it was already replaying); anything else finishes it for this sitting. */
export function applyGrade(progress: SessionProgress, cardId: string, again: boolean): SessionProgress {
  const relearn = progress.relearnIds.filter((id) => id !== cardId);
  if (again) return { doneIds: progress.doneIds, relearnIds: [...relearn, cardId] };
  return { doneIds: [...progress.doneIds, cardId], relearnIds: relearn };
}

/** Undo one grade: put the sitting back exactly as `before` had it. Kept as a
 *  named function (rather than the caller just holding the old object) so the
 *  undo trail reads as an operation and not as loose state juggling. */
export function revertTo(before: SessionProgress): SessionProgress {
  return { doneIds: [...before.doneIds], relearnIds: [...before.relearnIds] };
}
