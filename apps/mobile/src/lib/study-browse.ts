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

import { LEECH_LAPSE_THRESHOLD, STUDY_FLAG_COLORS } from "./study-flags.ts";
import { pathLeaf, pathParent } from "./study-tree.ts";

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

// --- Browse's first page: Decks / Tags / Flags as collapsible sections
//
// (owner 2026-07-24: "users are brought to the page with decks, tags, and flags,
// these sections should all have collapsable ability, then when users click on a
// deck, the next page shows all the cards in the selected section".)
//
// This replaces the segmented filter-group picker the sheet used to carry. There,
// Decks / Tags / Status were three ways to NARROW one flat card list, and only
// one was on screen at a time, so a filter set in a hidden group had to be
// spelled out in a summary line underneath. Here they are the content of a page
// you start on, and tapping a row is navigation rather than filtering — so the
// summary line has nothing left to explain and goes away with it.
//
// Suspended and Leeches ride in the Flags section rather than getting a fourth
// one. The owner named three sections and these are card-state markers like a
// flag is; Anki's own sidebar groups them the same way.

export type BrowseSectionKey = "decks" | "tags" | "flags";

/** Everything in a filter except the search box, which is page-level and
 *  survives navigating between pages. */
export type BrowseRowFilter = Omit<StudyBrowseFilter, "query">;

/** One tappable row on the first page. */
export interface BrowseSectionRow {
  /** Unique across every section — the React key and the "which row did you
   *  come from" id, so page 2 can name where it is. */
  id: string;
  label: string;
  /** Cards this row would show, ignoring the search box. */
  count: number;
  /** Colour swatch for a flag row; null on every other kind. */
  hex: string | null;
  /** How deep under a folder a deck sits, so the list can indent instead of
   *  printing "Pharm::Cardio::Beta blockers". 0 for every non-deck row. */
  depth: number;
  /** Its own parent folder path, shown as a subline when there is one — two
   *  decks called "Week 1" in different courses are otherwise identical. */
  parent: string;
  filter: BrowseRowFilter;
}

export interface BrowseSection {
  key: BrowseSectionKey;
  title: string;
  rows: BrowseSectionRow[];
}

const NO_FILTER: BrowseRowFilter = { scope: "all", deckId: null, tag: null, flag: null };

/** Depth of a `::`-separated deck path — "Pharm::Cardio::Week 1" is 2. */
function pathDepth(name: string): number {
  const parent = pathParent(name);
  return parent === "" ? 0 : parent.split("::").length;
}

/** The three sections of Browse's first page, with a card count on every row.
 *
 *  ONE PASS over the cards, deliberately. Counting each row by re-running
 *  applyBrowseFilter would be decks x cards work every render — the same shape
 *  as the bug that made the Study deck list slow on a 6,487-card deck (see
 *  study.tsx's cardsByDeck). Deck rows keep `decks` order (already sorted by the
 *  caller); tags and flags sort themselves.
 *
 *  Rows with no cards are kept, not hidden: a deck you just made is empty by
 *  definition, and it has to be visible for you to believe it exists. Tag and
 *  flag rows can only come from a card that has them, so they are never 0. */
export function buildBrowseSections(rows: readonly BrowseRow[], decks: readonly BrowseDeck[]): BrowseSection[] {
  const byDeck = new Map<string, number>();
  const byTag = new Map<string, number>();
  const byFlag = new Map<number, number>();
  let suspended = 0;
  let leeches = 0;

  for (const row of rows) {
    const card = row.card;
    byDeck.set(card.deckId, (byDeck.get(card.deckId) ?? 0) + 1);
    for (const tag of card.tags) byTag.set(tag, (byTag.get(tag) ?? 0) + 1);
    if (card.flag > 0) byFlag.set(card.flag, (byFlag.get(card.flag) ?? 0) + 1);
    if (card.suspended) suspended += 1;
    if (card.lapses >= LEECH_LAPSE_THRESHOLD) leeches += 1;
  }

  const deckRows: BrowseSectionRow[] = decks.map((deck) => ({
    id: `deck:${deck.id}`,
    label: pathLeaf(deck.name),
    count: byDeck.get(deck.id) ?? 0,
    hex: null,
    depth: pathDepth(deck.name),
    parent: pathParent(deck.name),
    filter: { ...NO_FILTER, deckId: deck.id },
  }));

  const tagRows: BrowseSectionRow[] = Array.from(byTag.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((tag) => ({
      id: `tag:${tag}`,
      label: `#${tag}`,
      count: byTag.get(tag) ?? 0,
      hex: null,
      depth: 0,
      parent: "",
      filter: { ...NO_FILTER, tag },
    }));

  // Flag rows in palette order (Anki's own), skipping colours nothing carries —
  // seven always-visible rows of which six read 0 is a wall, not a filter.
  const flagRows: BrowseSectionRow[] = STUDY_FLAG_COLORS.filter((flag) => (byFlag.get(flag.value) ?? 0) > 0).map((flag) => ({
    id: `flag:${flag.value}`,
    label: flag.name,
    count: byFlag.get(flag.value) ?? 0,
    hex: flag.hex,
    depth: 0,
    parent: "",
    filter: { ...NO_FILTER, scope: "flagged", flag: flag.value },
  }));

  if (suspended > 0) {
    flagRows.push({
      id: "state:suspended",
      label: "Suspended",
      count: suspended,
      hex: null,
      depth: 0,
      parent: "",
      filter: { ...NO_FILTER, scope: "suspended" },
    });
  }
  if (leeches > 0) {
    flagRows.push({
      id: "state:leeches",
      label: "Leeches",
      count: leeches,
      hex: null,
      depth: 0,
      parent: "",
      filter: { ...NO_FILTER, scope: "leeches" },
    });
  }

  return [
    { key: "decks", title: "Decks", rows: deckRows },
    { key: "tags", title: "Tags", rows: tagRows },
    { key: "flags", title: "Flags", rows: flagRows },
  ];
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
