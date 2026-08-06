"use client";

// Per-game, per-day progress in localStorage. Each game stores one tiny JSON
// blob under nemesis.web.break.<game>.<dateKey>; yesterday's keys are cleaned
// up lazily so the namespace never grows past a handful of entries. No
// account/table involved — a brain break is device-local by design.
//
// "More than one puzzle per day" (owner 2026-08-04) adds a second axis: a
// game can be on puzzle n=0 (the daily) or n>0 (an extra). Every puzzle
// number gets its OWN save, keyed by @nemesis/shared's break/daily.ts's
// extraKey(dateKey, n) — n=0 reproduces the plain dateKey, so daily saves
// are byte-identical to before this feature existed. The one thing that
// still needs the PLAIN dateKey (not extraKey) is knowing what counts as
// "today" for cleanup — see the comment on that effect below.

import { useCallback, useEffect, useMemo, useState } from "react";

import { localDateKey } from "@nemesis/shared";

const PREFIX = "nemesis.web.break.";

function storageKey(game: string, key: string): string {
  return `${PREFIX}${game}.${key}`;
}

function pickStorageKey(game: string, dateKey: string): string {
  return `${storageKey(game, dateKey)}.pick`;
}

export function readBreakDayState<T>(game: string, dateKey: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(game, dateKey));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Today's date key, fixed for the lifetime of the mount (a session crossing
 *  midnight keeps its puzzle until reload — same behavior as the originals). */
export function useBreakDateKey(): string {
  return useMemo(() => localDateKey(), []);
}

/**
 * `puzzleKey` is the actual read/write identity (defaults to `dateKey`,
 * i.e. the daily) — pass `extraKey(dateKey, n)` for puzzle n. `dateKey`
 * itself is kept separately because cleanup needs the true calendar day,
 * not whichever puzzle number happens to be open.
 */
export function useBreakDayState<T>(
  game: string,
  dateKey: string,
  initial: T,
  puzzleKey: string = dateKey,
): [T, (updater: (previous: T) => T) => void] {
  // Server render and first client paint use `initial`; saved progress loads
  // in an effect. Reading storage during render is a hydration mismatch —
  // the server has no localStorage (the Next dev overlay flagged exactly this).
  const [state, setState] = useState<T>(initial);

  useEffect(() => {
    const stored = readBreakDayState<T>(game, puzzleKey);
    if (stored !== null) setState(stored);
    // Lazy cleanup: drop this game's entries from days OTHER than today.
    // LOAD-BEARING: this must stay a PREFIX match against the true dateKey,
    // not an exact match against puzzleKey. Today's daily key, every one of
    // today's #n extras, and today's .pick pointer all start with
    // storageKey(game, dateKey) (dateKey itself, "dateKey#1", "dateKey.pick",
    // ...) — only a different calendar day fails that prefix. Go back to an
    // exact match here and opening puzzle #2 will delete the daily's save,
    // every sibling extra, and the .pick pointer on the spot.
    try {
      const todayPrefix = storageKey(game, dateKey);
      const stale: string[] = [];
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key && key.startsWith(`${PREFIX}${game}.`) && !key.startsWith(todayPrefix)) stale.push(key);
      }
      stale.forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // Storage unavailable (private mode) — play still works, just unsaved.
    }
  }, [game, dateKey, puzzleKey]);

  const update = useCallback(
    (updater: (previous: T) => T) => {
      setState((previous) => {
        const next = updater(previous);
        try {
          window.localStorage.setItem(storageKey(game, puzzleKey), JSON.stringify(next));
        } catch {
          // Best-effort persistence only.
        }
        return next;
      });
    },
    [game, puzzleKey],
  );

  return [state, update];
}

/** Which puzzle number a game is on today (0 = daily), persisted so a
 *  refresh comes back to the same puzzle. `game` is nullable so the hook
 *  can be called unconditionally from the hub, where no game is open yet —
 *  it simply reads/writes nothing until a game is chosen. */
export function useBreakPick(game: string | null, dateKey: string): [number, (next: number) => void] {
  const [pick, setPick] = useState(0);

  useEffect(() => {
    if (!game) {
      setPick(0);
      return;
    }
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(pickStorageKey(game, dateKey));
      const parsed = raw ? Number.parseInt(raw, 10) : 0;
      setPick(Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
    } catch {
      setPick(0);
    }
  }, [game, dateKey]);

  const update = useCallback(
    (next: number) => {
      if (!game) return;
      setPick(next);
      try {
        // 0 (back to the daily) is the default — remove rather than store
        // "0", matching how the rest of this module represents "unset".
        if (next > 0) window.localStorage.setItem(pickStorageKey(game, dateKey), String(next));
        else window.localStorage.removeItem(pickStorageKey(game, dateKey));
      } catch {
        // Best-effort persistence only.
      }
    },
    [game, dateKey],
  );

  return [pick, update];
}
