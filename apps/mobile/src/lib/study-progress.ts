// Pure "how well is this deck sticking" math for Study's deck cards (owner
// 2026-07-21: every deck card shows a percent-retention line under its title).
// Dependency-free — no react-native import, no supabase client — so
// study-progress.test.ts loads clean under Deno, matching lib/library-sync.ts's
// convention. Deliberately takes a plain structural card shape rather than
// importing api/cloudStudy.ts's CloudStudyCard: that file pulls in the supabase
// client (and, transitively, react-native), which Deno's module resolver can't
// load.
//
// This is REAL retention, not an estimate: the server's grade_study_card RPC
// (supabase/migrations/20260719194556_web_library_study.sql) increments a
// card's `repetitions` on EVERY grade — including "again" — and its `lapses`
// only on "again". So per card, repetitions = total reviews ever and lapses =
// failed reviews, which makes a deck's percent of reviews answered correctly
// exactly (Σreps − Σlapses) / Σreps over data the screen already fetched.
// (This replaced the old mature-ratio progress bar, 2026-07-21 — that code is
// in git history if the bar ever comes back.)

/** Percent of this deck's reviews answered correctly (0..1), or null when the
 *  deck has never been reviewed — there is no honest ratio over zero reviews,
 *  so callers should say "No reviews yet" rather than invent a number. */
export function deckRetention(cards: readonly { repetitions: number; lapses: number }[]): number | null {
  const reviews = cards.reduce((sum, card) => sum + card.repetitions, 0);
  if (reviews <= 0) return null;
  const lapses = cards.reduce((sum, card) => sum + card.lapses, 0);
  // Lapses can't exceed reviews (every "again" also increments repetitions);
  // the clamp only guards imported/hand-edited rows that break that invariant.
  return Math.max(0, reviews - lapses) / reviews;
}
