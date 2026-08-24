"use client";

// Which look a deck wears, remembered for the learner.
//
// 🔴 KEPT ON THE DEVICE, NOT IN THE DATABASE. A theme is a preference about how a file looks
// when it is built, not a fact about the canvas — and the deck is rebuilt from its plan on
// every download, so a stored id is all that is needed. Keeping it in localStorage means
// changing a theme writes nothing, touches no row's updated_at, and cannot reorder the
// sidebar's recents. The cost is honest and small: the choice does not follow the learner to
// another device, where decks come out in the house look until they pick again.
//
// The key is the deck's ledger asset id where there is one, so the canvas's Outputs tab and
// the Library agree about a given deck.

import { DEFAULT_DECK_THEME } from "./deck-themes";

const KEY = "nemesis.deck.theme.v1";
/** Enough history to cover any real library; beyond it the oldest choices fall away. */
const MAX_REMEMBERED = 300;

interface Stored {
  /** The theme new decks and unseen decks use — the last one the learner picked. */
  fallback?: string;
  byDeck?: Record<string, string>;
}

function read(): Stored {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Stored) : {};
  } catch {
    return {};
  }
}

/** The theme this deck should be built in. */
export function readDeckThemeChoice(deckKey?: string | null): string {
  const stored = read();
  const mine = deckKey ? stored.byDeck?.[deckKey] : undefined;
  return mine ?? stored.fallback ?? DEFAULT_DECK_THEME;
}

/** Remember a pick: for this deck, and as the default for the next one. */
export function writeDeckThemeChoice(themeId: string, deckKey?: string | null): void {
  if (typeof window === "undefined") return;
  const stored = read();
  const byDeck = { ...(stored.byDeck ?? {}) };
  if (deckKey) byDeck[deckKey] = themeId;
  const keys = Object.keys(byDeck);
  for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_REMEMBERED))) delete byDeck[stale];
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ byDeck, fallback: themeId } satisfies Stored));
  } catch {
    // A full or blocked store is not worth an error to the learner; the deck still builds.
  }
}
