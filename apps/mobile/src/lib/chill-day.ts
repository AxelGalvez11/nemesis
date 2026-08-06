// Where a Chill game's progress lives on the phone: ONE JSON file holding one
// calendar day. Pure so the rules can be pinned by tests — the file I/O is in
// components/chill/use-chill-day.ts.
//
// The web keeps a localStorage entry per game per puzzle and sweeps yesterday's
// keys with a prefix match (see apps/web/components/workspace/break/
// use-break-day.ts). That sweep is delicate — the comment there records that an
// exact match instead of a prefix match deletes the daily save the moment an
// extra puzzle is opened. A phone has no localStorage and no key enumeration,
// so the same rule is expressed the other way round and the trap disappears:
// the store STAMPS the day it belongs to, and a store stamped with any other
// day is dropped whole on read. Yesterday cannot survive, and nothing that
// belongs to today can be swept by accident.
//
// Device-local by design, exactly like the web: a brain break has no account,
// no table and no sync. Two devices keep two sets of progress on the same
// puzzle, which is the behaviour the web already shipped.

/** One day of play. `entries` is keyed by {@link chillEntryKey}; `picks` maps a
 *  game to the puzzle number it is on today (0 = the daily, absent = 0). */
export interface ChillStore {
  day: string;
  entries: Record<string, unknown>;
  picks: Record<string, number>;
}

export function emptyChillStore(day: string): ChillStore {
  return { day, entries: {}, picks: {} };
}

/**
 * `puzzleKey` is the puzzle's identity, not the calendar day: the daily is the
 * plain dateKey and extras are `extraKey(dateKey, n)` from @nemesis/shared, so
 * every puzzle number saves separately — same shape the web stores under.
 */
export function chillEntryKey(game: string, puzzleKey: string): string {
  return `${game}.${puzzleKey}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read a stored file back. Anything that is not today's store — a different
 * day, a corrupted file, a shape from a future version — comes back as an
 * empty store for `today` rather than throwing, because a lost brain break is
 * not worth an error state.
 */
export function parseChillStore(raw: unknown, today: string): ChillStore {
  if (!isRecord(raw) || raw.day !== today) return emptyChillStore(today);
  const entries = isRecord(raw.entries) ? raw.entries : {};
  const picks: Record<string, number> = {};
  if (isRecord(raw.picks)) {
    for (const [game, value] of Object.entries(raw.picks)) {
      // A pick is a puzzle INDEX. Anything else (NaN from a truncated write, a
      // negative, a string) reads as "on the daily" rather than sending the
      // hub looking up a bank at an index that cannot exist.
      if (typeof value === "number" && Number.isInteger(value) && value > 0) picks[game] = value;
    }
  }
  return { day: today, entries: { ...entries }, picks };
}

export function readChillEntry<T>(store: ChillStore, game: string, puzzleKey: string): T | null {
  const value = store.entries[chillEntryKey(game, puzzleKey)];
  return value === undefined ? null : (value as T);
}

/** New store with this puzzle's state replaced — the old one is never touched. */
export function putChillEntry(store: ChillStore, game: string, puzzleKey: string, value: unknown): ChillStore {
  return { ...store, entries: { ...store.entries, [chillEntryKey(game, puzzleKey)]: value } };
}

export function readChillPick(store: ChillStore, game: string): number {
  return store.picks[game] ?? 0;
}

/** New store with this game's puzzle number set. 0 is the default, so it is
 *  removed rather than written — same "unset means daily" rule as the web. */
export function putChillPick(store: ChillStore, game: string, pick: number): ChillStore {
  const picks = { ...store.picks };
  if (Number.isInteger(pick) && pick > 0) picks[game] = pick;
  else delete picks[game];
  return { ...store, picks };
}
