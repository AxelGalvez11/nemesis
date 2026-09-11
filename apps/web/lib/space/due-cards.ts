// ── Cards due for review, counted once and reviewed by the same rule ────────────────────────────
//
// The sidebar carries a "Review due cards (N)" row, and pressing it opens /review, which works
// through those cards one after another across every deck the person owns. Two surfaces, one
// question: which cards are due?
//
// 🔴🔴 THE NUMBER AND THE QUEUE MUST NOT BE TWO RULES. The row needs a number without loading a
// whole collection, so it counts in the database; the page already holds every card in memory, so it
// filters in JavaScript. That is two places, and a sidebar promising twelve cards over a screen that
// shows nine is the kind of defect nobody reports as a bug because it just looks like the app being
// vague. So the rule itself lives in ONE place — `isDueForReview` in lib/workspace/study-review-queue.ts,
// which is the rule the review player's own queue is built from — and this module expresses that one
// rule on both sides: `dueCardsForReview` for the page, `dueCardsFilter` for the query.
// `due-cards.test.ts` pins that they return the same cards, and that the player walks exactly them.
//
// 🔴 THE WINDOW IS NOT RETYPED HERE EITHER. `LEARN_AHEAD_MINUTES` is Anki's twenty minutes, and it
// reaches the SQL below through the same constant the scheduler and the queue read.

import { isDueForReview, STEP_STATES, type ReviewQueueCard } from "@/lib/workspace/study-review-queue";
import { LEARN_AHEAD_MINUTES } from "@/lib/workspace/study-scheduler";

/**
 * The deck id /review hands the player.
 *
 * 🔴🔴 THE PLAYER REVIEWS ONE DECK, AND THIS PAGE REVIEWS ALL OF THEM. `buildReviewQueue` filters by
 * deck id and returns nothing at all without one, because every other door onto a review is a deck:
 * the Study tab's row, the canvas's output, the Library's shelf. "Everything that is due" is a
 * different shape, and the cheapest honest way to say it in the player's own terms is to present the
 * whole collection AS one deck rather than to teach the queue a second mode. See `dueCardsForReview`.
 *
 * 🔴 IT IS NOT A DECK ANYONE OWNS, and nothing is ever written against it. Grading goes through the
 * store by CARD id (`gradeCard`, `undoGrade`, `rateCard`), so the remapped copy below never reaches
 * the database.
 */
export const REVIEW_DECK_ID = "all-decks";

/**
 * The cards /review works through, in the shape the player expects.
 *
 * Two things at once, and both are needed for the player to accept them:
 *   • the due rule, from the one predicate the queue itself uses;
 *   • every card moved onto one deck, so `buildReviewQueue` treats the collection as a single deck.
 *
 * 🔴 FILTERING FIRST IS WHAT KEEPS BROWSING HONEST. The player's Track learning switch walks "the
 * deck" with nothing recorded, and the deck it walks is whatever it was handed. Handed the whole
 * collection it would scroll through cards that are not due for a fortnight; handed this, it walks
 * today's work. The queue is unaffected either way: every card it would ever select passes this
 * predicate, so removing the rest removes nothing it could have shown.
 */
export function dueCardsForReview<T extends ReviewQueueCard>(cards: readonly T[], now = Date.now()): T[] {
  return cards.filter((card) => isDueForReview(card, now)).map((card) => ({ ...card, deckId: REVIEW_DECK_ID }));
}

/**
 * When the next card arrives, as a timestamp, or null when there is no later card at all.
 *
 * The empty state says this. A person who is caught up wants to know whether to come back in ten
 * minutes or on Thursday, and "nothing is due" on its own answers neither.
 */
export function nextDueAfter(cards: readonly ReviewQueueCard[], now = Date.now()): number | null {
  let soonest: number | null = null;
  for (const card of cards) {
    if (card.suspended) continue;
    const at = new Date(card.dueAt).getTime();
    if (!Number.isFinite(at) || at <= now) continue;
    if (soonest === null || at < soonest) soonest = at;
  }
  return soonest;
}

/**
 * The due rule as one PostgREST filter: due now, OR mid-step and inside the learn-ahead window.
 *
 * 🔴 TIMESTAMPS GO IN UNQUOTED, which is what PostgREST's logic trees accept and what this codebase
 * already does in `learner-memory.ts`. An ISO instant carries no comma and no bracket, so there is
 * nothing in it for the expression parser to trip over.
 */
export function dueCardsFilter(now = Date.now(), learnAheadMinutes = LEARN_AHEAD_MINUTES): string {
  const dueBy = new Date(now).toISOString();
  const aheadBy = new Date(now + learnAheadMinutes * 60_000).toISOString();
  return `due_at.lte.${dueBy},and(state.in.(${STEP_STATES.join(",")}),due_at.lte.${aheadBy})`;
}

/** A count query, and the session, which is all of a Supabase client this needs. */
interface CountQuery extends PromiseLike<{ count: number | null; error: unknown }> {
  eq(column: string, value: unknown): CountQuery;
  or(filter: string): CountQuery;
}

export interface DueCardsDb {
  auth: { getSession(): PromiseLike<{ data: { session: { user?: { id?: string } } | null } }> };
  from(table: string): { select(columns: string, options: { count: "exact"; head: true }): CountQuery };
}

/**
 * How many cards are due for the signed-in person, across every deck.
 *
 * One count query, and no rows: `head: true` asks Postgres for the number and nothing else, which
 * matters because an imported Anki collection can make tens of thousands of cards due at once and
 * this runs to draw a sidebar row.
 *
 * 🔴 SCOPED BY `user_id` AS WELL AS BY THE ROW POLICY. `study_cards_owner` already holds the line in
 * the database, and every read in this app states the owner anyway: a count is the one kind of query
 * where a silently broader scope looks like a plausible number rather than like a bug.
 *
 * Zero when nobody is signed in, without asking the database anything.
 */
export async function countDueCards(db: DueCardsDb, now = Date.now()): Promise<number> {
  const { data } = await db.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return 0;
  const { count, error } = await db
    .from("study_cards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("suspended", false)
    .or(dueCardsFilter(now));
  // 🔴 A FAILED COUNT IS NOT ZERO CARDS. The row simply says nothing rather than telling somebody
  // with work waiting that they are finished.
  if (error) {
    const detail = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : String(error);
    throw new Error(`due cards could not be counted: ${detail}`);
  }
  return count ?? 0;
}
