// Pure search/join logic for the Study "Browse" sheet (StudyAddSheet.tsx) —
// dependency-free (no react-native, no supabase client) so
// study-browse.test.ts loads clean under Deno, matching lib/library-sync.ts's
// convention. Takes plain structural shapes rather than importing
// api/cloudStudy.ts's CloudStudyCard/CloudStudyDeck types, so this file never
// pulls in the supabase client transitively (that import chain uses
// extensionless specifiers Deno's resolver can't load — verified empirically
// against this repo's cloudStudy.ts, which is why it has no test file of its
// own either).

export interface BrowseCard {
  id: string;
  deckId: string;
  front: string;
  back: string;
}

export interface BrowseDeck {
  id: string;
  name: string;
}

export interface BrowseRow {
  card: BrowseCard;
  deckName: string;
}

/** Joins cards to their deck's name for display, dropping any card whose
 *  deck no longer exists (defensive — shouldn't happen with RLS-scoped data,
 *  but a stale in-flight state during a refetch could race a delete
 *  elsewhere). Never reorders — cards arrive due-date sorted from
 *  fetchCloudStudy and this function preserves that order. */
export function buildBrowseRows(cards: readonly BrowseCard[], decks: readonly BrowseDeck[]): BrowseRow[] {
  const deckNames = new Map(decks.map((deck) => [deck.id, deck.name]));
  return cards.flatMap((card) => {
    const deckName = deckNames.get(card.deckId);
    return deckName ? [{ card, deckName }] : [];
  });
}

/** Case-insensitive search over a card's front text and its deck's name —
 *  the two fields the Browse list actually shows. A blank (or all-whitespace)
 *  query returns every row, order preserved. */
export function filterBrowseRows(rows: readonly BrowseRow[], query: string): BrowseRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...rows];
  return rows.filter(
    (row) => row.card.front.toLowerCase().includes(needle) || row.deckName.toLowerCase().includes(needle),
  );
}
