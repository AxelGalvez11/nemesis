// Per-deck and per-folder Study rollups for the chat agent.
//
// Until 2026-08-05 the agent's only scheduling signal was the ambient brain
// packet's six weakest cards — no due counts, no per-course view, nothing it
// could plan a study session from. These rollups are computed from full card
// rows (the caller pages them ALL — see fetchAllRows) so the counts are real,
// and folders come from the same `::` name convention the Study page uses.
//
// Pure functions — testable without Supabase.

import { normalizeGroupPath, pathParent } from "./study-tree";

export interface OverviewDeckRow {
  id: string;
  name: string;
}

export interface OverviewCardRow {
  deck_id: string;
  due_at: string | null;
  suspended: boolean;
  lapses: number;
}

export interface DeckOverview {
  name: string;
  cards: number;
  /** Active cards whose due_at has passed — ready to review right now. */
  due: number;
  /** Cards missed at least twice — the closest thing to a weak-spot count. */
  struggling: number;
}

export interface FolderOverview {
  folder: string;
  decks: number;
  cards: number;
  due: number;
  struggling: number;
}

export interface StudyOverview {
  totals: { decks: number; cards: number; due: number; struggling: number };
  decks: DeckOverview[];
  /** Every `::` folder (nested ones included), rolled up over descendants. */
  folders: FolderOverview[];
  complete: true;
}

export function studyOverview(
  decks: readonly OverviewDeckRow[],
  cards: readonly OverviewCardRow[],
  now: Date,
): StudyOverview {
  const nowIso = now.toISOString();
  const perDeck = new Map<string, { cards: number; due: number; struggling: number }>();
  for (const deck of decks) perDeck.set(deck.id, { cards: 0, due: 0, struggling: 0 });
  for (const card of cards) {
    const stat = perDeck.get(card.deck_id);
    if (!stat) continue;
    stat.cards += 1;
    if (!card.suspended && typeof card.due_at === "string" && card.due_at <= nowIso) stat.due += 1;
    if (!card.suspended && card.lapses >= 2) stat.struggling += 1;
  }

  const deckRows: DeckOverview[] = decks
    .map((deck) => {
      const stat = perDeck.get(deck.id) ?? { cards: 0, due: 0, struggling: 0 };
      return { cards: stat.cards, due: stat.due, name: deck.name, struggling: stat.struggling };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const folders = new Map<string, FolderOverview>();
  for (const deck of deckRows) {
    for (let folder = pathParent(normalizeGroupPath(deck.name)); folder; folder = pathParent(folder)) {
      const row = folders.get(folder) ?? { cards: 0, decks: 0, due: 0, folder, struggling: 0 };
      row.decks += 1;
      row.cards += deck.cards;
      row.due += deck.due;
      row.struggling += deck.struggling;
      folders.set(folder, row);
    }
  }

  const totals = deckRows.reduce(
    (sum, deck) => ({
      cards: sum.cards + deck.cards,
      decks: sum.decks + 1,
      due: sum.due + deck.due,
      struggling: sum.struggling + deck.struggling,
    }),
    { cards: 0, decks: 0, due: 0, struggling: 0 },
  );

  return {
    complete: true,
    decks: deckRows,
    folders: [...folders.values()].sort((a, b) => a.folder.localeCompare(b.folder)),
    totals,
  };
}
