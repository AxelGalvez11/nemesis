// Pure "how much of this deck have you learned" math for Study's deck-row
// progress bar (owner ask: give Study a distinct PROGRESS identity from
// Library's plain document rows, 2026-07-20). Dependency-free — no
// react-native import, no supabase client — so study-progress.test.ts loads
// clean under Deno, matching lib/library-sync.ts's convention. Deliberately
// takes a plain structural card shape rather than importing
// api/cloudStudy.ts's CloudStudyCard: that file pulls in the supabase client
// (and, transitively, react-native), which Deno's module resolver can't load.
//
// "Mature" reuses the exact 21-day boundary api/cloudStudy.ts's
// countsForCards() already treats as graduating a card out of "Learn" — a
// card counts as mature once it has been reviewed at least once
// (repetitions > 0) AND its interval has grown to 21+ days. This is real,
// already-fetched card data; nothing here is invented or estimated.

export interface DeckMastery {
  /** Every card assigned to the deck, learned or not. */
  total: number;
  /** Cards that have graduated past the "still learning" interval. */
  matureCount: number;
  /** matureCount / total, or null when the deck has no cards yet — there is
   *  no meaningful ratio over zero cards, so callers should skip the
   *  progress bar entirely rather than render a fake 0%. */
  ratio: number | null;
}

const MATURE_INTERVAL_DAYS = 21;

/** Pure — one deck's worth of cards in, its mastery tally out. Called once
 *  per deck row alongside countsForCards() (same filtered card list), never
 *  mutates its input. */
export function deckMastery(cards: readonly { repetitions: number; intervalDays: number }[]): DeckMastery {
  const total = cards.length;
  const matureCount = cards.filter((card) => card.repetitions > 0 && card.intervalDays >= MATURE_INTERVAL_DAYS).length;
  return { total, matureCount, ratio: total > 0 ? matureCount / total : null };
}
