// The file-backed half of the Chill day store. The rules are in
// lib/chill-day.ts; this is the part that touches disk and React.
//
// ONE file, one module-level copy, one set of listeners. The hub and whichever
// game is open are on screen at the same moment — the hub's progress lines are
// read from the same object the game is writing — so two independent readers
// of the same file would show two different truths the first time a game saved.
//
// Writes are coalesced. A Wordle guess or a Sudoku digit is a keystroke, and
// rewriting a JSON file on every keystroke is disk churn for a brain break;
// the in-memory store updates immediately (so the UI is never behind) and the
// file catches up a moment later. A save lost to a crash inside that window
// costs one move, which is the same exposure the web's synchronous localStorage
// write has to the tab dying mid-render.

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import * as FileSystem from "expo-file-system/legacy";

import { localDateKey } from "@nemesis/shared";
import {
  emptyChillStore,
  parseChillStore,
  putChillEntry,
  putChillPick,
  readChillEntry,
  readChillPick,
  type ChillStore,
} from "@/lib/chill-day";

const FILE = `${FileSystem.documentDirectory ?? ""}chill-day-v1.json`;
const WRITE_DELAY_MS = 1500;

let store: ChillStore = emptyChillStore("");
let loadedFor: string | null = null;
let loading: Promise<void> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): ChillStore {
  return store;
}

function scheduleWrite(): void {
  // TRAILING, and never rescheduled while one is already pending — so a burst
  // of moves costs one write, and Sudoku's once-a-second clock tick cannot turn
  // into once-a-second disk I/O. Resetting the timer on every commit (the
  // obvious debounce) would do exactly that, because the ticks are spaced
  // further apart than the delay.
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    const payload = JSON.stringify(store);
    void FileSystem.writeAsStringAsync(FILE, payload).catch(() => {
      // Best-effort persistence: the game keeps playing unsaved.
    });
  }, WRITE_DELAY_MS);
}

function commit(next: ChillStore): void {
  store = next;
  emit();
  scheduleWrite();
}

async function load(dateKey: string): Promise<void> {
  let raw: unknown = null;
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (info.exists) raw = JSON.parse(await FileSystem.readAsStringAsync(FILE));
  } catch {
    // Unreadable or half-written — parseChillStore turns that into a fresh day.
  }
  store = parseChillStore(raw, dateKey);
  loadedFor = dateKey;
  emit();
}

/**
 * Today's store, loaded once per calendar day. `ready` is false only until the
 * first read finishes — the games render from `initial` in the meantime, so a
 * cold start never shows a half-restored board.
 */
export function useChillStore(dateKey: string): { store: ChillStore; ready: boolean } {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);

  useEffect(() => {
    if (loadedFor === dateKey) return;
    // Two screens mounting together must not race two reads onto one file.
    loading = loading ?? load(dateKey).finally(() => {
      loading = null;
    });
    void loading;
  }, [dateKey]);

  return { store: current, ready: current.day === dateKey };
}

/** Today's date key, fixed for the lifetime of the mount — a session that
 *  crosses midnight keeps the puzzle it started, same as the web. */
export function useChillDateKey(): string {
  return useMemo(() => localDateKey(), []);
}

/**
 * Per-game, per-puzzle saved state. `puzzleKey` is the puzzle's identity (the
 * plain dateKey for the daily, `extraKey(dateKey, n)` for extra n), so moving
 * to another puzzle number swaps the save rather than overwriting it.
 */
export function useChillDayState<T>(
  game: string,
  puzzleKey: string,
  initial: T,
): [T, (updater: (previous: T) => T) => void] {
  const dateKey = puzzleKey.split("#")[0] ?? puzzleKey;
  const { store: current, ready } = useChillStore(dateKey);
  const saved = ready ? readChillEntry<T>(current, game, puzzleKey) : null;
  const value = saved === null ? initial : saved;

  const update = useCallback(
    (updater: (previous: T) => T) => {
      const previous = readChillEntry<T>(store, game, puzzleKey);
      commit(putChillEntry(store, game, puzzleKey, updater(previous === null ? initial : previous)));
    },
    // `initial` is a fresh object on most renders (an empty board, an empty
    // guess list), so it is deliberately NOT a dependency: including it would
    // rebuild this callback every render and defeat the memo in every caller.
    // It is only read when nothing is saved yet, where any equal value does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, puzzleKey],
  );

  return [value, update];
}

/** Which puzzle number a game is on today (0 = the daily), persisted so
 *  leaving and coming back returns to the same puzzle. */
export function useChillPick(game: string | null, dateKey: string): [number, (next: number) => void] {
  const { store: current, ready } = useChillStore(dateKey);
  const pick = game && ready ? readChillPick(current, game) : 0;

  const set = useCallback(
    (next: number) => {
      if (!game) return;
      commit(putChillPick(store, game, next));
    },
    [game],
  );

  return [pick, set];
}
