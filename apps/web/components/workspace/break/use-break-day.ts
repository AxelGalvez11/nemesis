"use client";

// Per-game, per-day progress in localStorage. Each game stores one tiny JSON
// blob under nemesis.web.break.<game>.<dateKey>; yesterday's keys are cleaned
// up lazily so the namespace never grows past a handful of entries. No
// account/table involved — a brain break is device-local by design.

import { useCallback, useEffect, useMemo, useState } from "react";

import { localDateKey } from "@/lib/workspace/break/daily";

const PREFIX = "nemesis.web.break.";

function storageKey(game: string, dateKey: string): string {
  return `${PREFIX}${game}.${dateKey}`;
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

export function useBreakDayState<T>(game: string, dateKey: string, initial: T): [T, (updater: (previous: T) => T) => void] {
  // Server render and first client paint use `initial`; saved progress loads
  // in an effect. Reading storage during render is a hydration mismatch —
  // the server has no localStorage (the Next dev overlay flagged exactly this).
  const [state, setState] = useState<T>(initial);

  useEffect(() => {
    const stored = readBreakDayState<T>(game, dateKey);
    if (stored !== null) setState(stored);
    // Lazy cleanup: drop this game's entries from other days.
    try {
      const stale: string[] = [];
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key && key.startsWith(`${PREFIX}${game}.`) && key !== storageKey(game, dateKey)) stale.push(key);
      }
      stale.forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // Storage unavailable (private mode) — play still works, just unsaved.
    }
  }, [game, dateKey]);

  const update = useCallback(
    (updater: (previous: T) => T) => {
      setState((previous) => {
        const next = updater(previous);
        try {
          window.localStorage.setItem(storageKey(game, dateKey), JSON.stringify(next));
        } catch {
          // Best-effort persistence only.
        }
        return next;
      });
    },
    [game, dateKey],
  );

  return [state, update];
}
