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
// THAT FIX WAS HALF THE PROBLEM, and the owner reported the same symptom again
// on 2026-07-24 — "review should keep showing cards until they have been
// mastered like in anki (the numbers in the bottom don't update)". The half
// that was missing: only a FAILED card came back. Passing a brand-new card
// still retired it on the first press, so on a freshly imported deck (every
// card new) the only number that moved was still New, and a card you had seen
// exactly once was treated as learned. The ladder now applies to passes too —
// see applyGrade. Two "Good"s graduate a new card, and it comes back in
// between.
//
// The SERVER's schedule is untouched by the replay — grade_study_card has
// already written its own next due date, and the replay is a session-local
// second look, not a rollback. Only a card's FIRST press of the sitting is ever
// sent (SessionProgress.gradedIds): the RPC applies each call as an independent
// review, so emitting every rung of the ladder would advance one card's real
// interval two or three times for a single sitting.
//
// Pure module (no react-native, no api/ imports) so it Deno-tests like the rest
// of src/lib.

/** The fields of a study card this module needs. The real CloudStudyCard has
 *  many more; keeping the shape minimal is what lets the tests build one. */
export interface QueueCard {
  id: string;
  repetitions: number;
  intervalDays: number;
  dueAt: string;
  suspended: boolean;
}

/** The grades a student can press. Same four Anki uses. */
export type ReviewGrade = "again" | "easy" | "good" | "hard";

/** "Good"s a NEW card must clear before it graduates — Anki's default two-step
 *  1m/10m learning. A lapsed review card relearns in a single step. */
export const NEW_STEPS = 2;
export const RELEARN_STEPS = 1;

/** A card partway through its learning steps this sitting. */
export interface LearningCard {
  id: string;
  /** "Good"s still needed before it graduates. */
  stepsLeft: number;
  /** The FULL ladder length for this card, remembered from the moment it first
   *  entered learning — what an "Again" resets it to.
   *
   *  Stored rather than recomputed because the card's own `repetitions` is not
   *  trustworthy after the first press: the server bumps it, so a brand-new
   *  card that the student failed would come back reading as an established one
   *  and be handed the shorter relearn ladder. Anki restarts a failed new card
   *  on the full new-card ladder, and this is what remembers which it was. */
  steps: number;
}

/** What this sitting has done so far. Every field is an ordered list, so a
 *  snapshot of this object IS the undo point. */
export interface SessionProgress {
  /** Graduated — finished for this sitting. */
  doneIds: readonly string[];
  /** Being learned right now, in the order they come back round. */
  learning: readonly LearningCard[];
  /** Cards whose grade has already been sent to the server this sitting.
   *
   *  THE RPC GATE, and the reason this list exists at all. A new card now takes
   *  two "Good"s to graduate, but grade_study_card applies every call as an
   *  independent review — so sending all of them would advance the card's real
   *  interval two or three times for one sitting and push it weeks out. Only a
   *  card's FIRST grade is sent (which is also the honest signal: "did I recall
   *  it when it fell due"); the later learning-step presses stay on the phone.
   *  A first "Again" still goes, or a lapse would be lost entirely. */
  gradedIds: readonly string[];
}

export const EMPTY_PROGRESS: SessionProgress = { doneIds: [], gradedIds: [], learning: [] };

/** Whether grading this card should actually call the server — see gradedIds. */
export function shouldEmitGrade(progress: SessionProgress, cardId: string): boolean {
  return !progress.gradedIds.includes(cardId);
}

/** Steps a card enters learning with when it is failed or first passed. A card
 *  the student has never seen gets the full new-card ladder; an established one
 *  that lapsed relearns in one. */
function stepsForCard(card: Pick<QueueCard, "repetitions">): number {
  return card.repetitions === 0 ? NEW_STEPS : RELEARN_STEPS;
}

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
  const replayAt = new Map(progress.learning.map((entry, index) => [entry.id, index]));

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
 * The three footer numbers, over the cards LEFT in the sitting — Anki's own
 * three columns.
 *
 * "In learning right now" outranks the card's own fields deliberately: the
 * server bumps `repetitions` on every grade including "Again", so a failed card
 * would otherwise be filed by its interval and could read as established
 * moments after you told the app you'd forgotten it.
 *
 * An untouched card that is merely YOUNG counts as Due, not Learn — that is
 * what Anki does, and the old code's "interval under 21 days means Learn" was
 * the other half of why these numbers looked frozen (owner, twice). A young
 * card sat in Learn from the first frame and stayed there, so Learn never
 * moved either.
 */
export function sessionCounts(queue: readonly QueueCard[], progress: SessionProgress): SessionCounts {
  const learning = new Set(progress.learning.map((entry) => entry.id));
  let fresh = 0;
  let learn = 0;
  for (const card of queue) {
    if (learning.has(card.id)) learn += 1;
    else if (card.repetitions === 0) fresh += 1;
  }
  return { due: queue.length - fresh - learn, fresh, learn };
}

/**
 * Record a grade and return the sitting that follows it.
 *
 * THIS IS ANKI'S LEARNING LADDER (owner 2026-07-24, reporting for the second
 * time that "the numbers in the bottom don't update" and asking that review
 * "keep showing cards until they have been mastered").
 *
 * The previous model had exactly two outcomes — "Again" came back, anything
 * else was finished — and that is why the counters still looked dead. On a
 * freshly imported deck every card is New, so passing one moved New down and
 * touched nothing else; Learn and Due could only ever change by failing a card.
 * Worse, a card you had never seen before was declared learned the first time
 * you pressed Good, which is not what "mastered" means to anyone.
 *
 * Now a NEW card takes two "Good"s to graduate (Anki's 1m/10m steps) and comes
 * back later in the same sitting in between, so:
 *   - New goes down and Learn goes up the moment you pass a new card,
 *   - Learn goes down when it finally graduates,
 *   - a card you keep failing keeps coming back until you get it.
 * All three numbers move, because all three now describe something that moves.
 *
 * Hard repeats the current step rather than advancing it; Easy graduates
 * outright from anywhere, which is Anki's behaviour and the escape hatch for a
 * card you obviously know. An established card that lapses relearns in one step.
 *
 * The SERVER's schedule is not replayed — see gradedIds for why only the first
 * press of each card is ever sent.
 */
export function applyGrade(
  progress: SessionProgress,
  card: Pick<QueueCard, "id" | "repetitions">,
  grade: ReviewGrade,
): SessionProgress {
  const gradedIds = progress.gradedIds.includes(card.id)
    ? progress.gradedIds
    : [...progress.gradedIds, card.id];
  const others = progress.learning.filter((entry) => entry.id !== card.id);
  const current = progress.learning.find((entry) => entry.id === card.id) ?? null;

  const graduate = (): SessionProgress => ({
    doneIds: [...progress.doneIds, card.id],
    gradedIds,
    learning: others,
  });
  // Back of the learning queue: a card answered ten seconds after you last saw
  // it tests nothing but short-term memory.
  const requeue = (stepsLeft: number, steps: number): SessionProgress => ({
    doneIds: progress.doneIds,
    gradedIds,
    learning: [...others, { id: card.id, steps, stepsLeft }],
  });

  if (grade === "easy") return graduate();

  if (current === null) {
    // First look this sitting. The ladder length is decided here, once, and
    // carried on the entry from now on — see LearningCard.steps.
    const steps = stepsForCard(card);
    if (grade === "again") return requeue(steps, steps);
    // A new card starts its ladder even on a pass; an established review card
    // that you simply recalled is done.
    if (card.repetitions === 0) return requeue(Math.max(1, steps - 1), steps);
    return graduate();
  }

  // Already in the ladder — reset to the ladder it entered with, never to one
  // recomputed from the server-bumped repetitions.
  if (grade === "again") return requeue(current.steps, current.steps);
  if (grade === "hard") return requeue(Math.max(1, current.stepsLeft), current.steps);
  const stepsLeft = current.stepsLeft - 1;
  return stepsLeft <= 0 ? graduate() : requeue(stepsLeft, current.steps);
}

/** Undo one grade: put the sitting back exactly as `before` had it. Kept as a
 *  named function (rather than the caller just holding the old object) so the
 *  undo trail reads as an operation and not as loose state juggling. */
export function revertTo(before: SessionProgress): SessionProgress {
  return {
    doneIds: [...before.doneIds],
    gradedIds: [...before.gradedIds],
    learning: before.learning.map((entry) => ({ ...entry })),
  };
}
