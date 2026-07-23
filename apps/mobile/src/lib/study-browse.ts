// Pure search/filter logic for the Study "Browse" sheet (StudyBrowseSheet.tsx)
// — dependency-free (no react-native, no supabase client) so study-browse.test
// loads clean under Deno, matching lib/library-sync.ts's convention. Takes plain
// structural shapes rather than importing api/cloudStudy.ts's Cloud* types, so
// this file never pulls in the supabase client transitively.
//
// Mirrors the sections of web's study-browser.tsx left rail — All cards, Flagged
// (+ per color), Suspended, Leeches, a per-deck filter, and Tags — plus the free
// text search. (owner 2026-07-23: the phone Browse should have "the same pages
// as in browse in the web app".)

import { LEECH_LAPSE_THRESHOLD } from "./study-flags.ts";

export interface BrowseCard {
  id: string;
  deckId: string;
  front: string;
  back: string;
  /** Anki color flag, 0 = none. */
  flag: number;
  suspended: boolean;
  lapses: number;
  tags: string[];
}

export interface BrowseDeck {
  id: string;
  name: string;
}

export interface BrowseRow {
  card: BrowseCard;
  deckName: string;
}

/** The top-level scopes, mirroring web's "Filters" section. */
export type StudyBrowseScope = "all" | "flagged" | "suspended" | "leeches";

export interface StudyBrowseFilter {
  query: string;
  scope: StudyBrowseScope;
  /** null = every deck. */
  deckId: string | null;
  /** null = every tag. */
  tag: string | null;
  /** Within the "flagged" scope only: null = any color, else that exact flag. */
  flag: number | null;
}

export const EMPTY_BROWSE_FILTER: StudyBrowseFilter = {
  query: "",
  scope: "all",
  deckId: null,
  tag: null,
  flag: null,
};

/** Joins cards to their deck's name for display, dropping any card whose deck no
 *  longer exists (defensive — a stale in-flight state during a refetch could
 *  race a delete elsewhere). Never reorders — cards arrive due-date sorted from
 *  fetchCloudStudy and this preserves that order. */
export function buildBrowseRows(cards: readonly BrowseCard[], decks: readonly BrowseDeck[]): BrowseRow[] {
  const deckNames = new Map(decks.map((deck) => [deck.id, deck.name]));
  return cards.flatMap((card) => {
    const deckName = deckNames.get(card.deckId);
    return deckName ? [{ card, deckName }] : [];
  });
}

/** Every distinct tag across the rows, alphabetically — the Tags filter list. */
export function browseTags(rows: readonly BrowseRow[]): string[] {
  const set = new Set<string>();
  for (const row of rows) for (const tag of row.card.tags) set.add(tag);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function matchesScope(card: BrowseCard, scope: StudyBrowseScope): boolean {
  switch (scope) {
    case "flagged":
      return card.flag > 0;
    case "suspended":
      return card.suspended;
    case "leeches":
      return card.lapses >= LEECH_LAPSE_THRESHOLD;
    default:
      return true;
  }
}

/** Apply the full filter — scope, exact flag color, deck, tag, and free-text
 *  query (over front text, deck name, and tags) — preserving row order. */
export function applyBrowseFilter(rows: readonly BrowseRow[], filter: StudyBrowseFilter): BrowseRow[] {
  const needle = filter.query.trim().toLowerCase();
  return rows.filter((row) => {
    const card = row.card;
    if (!matchesScope(card, filter.scope)) return false;
    if (filter.scope === "flagged" && filter.flag != null && card.flag !== filter.flag) return false;
    if (filter.deckId && card.deckId !== filter.deckId) return false;
    if (filter.tag && !card.tags.includes(filter.tag)) return false;
    if (needle) {
      const hay = `${card.front}\n${row.deckName}\n${card.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}
