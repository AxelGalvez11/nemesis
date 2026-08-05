"use client";

// A per-browser boolean that survives reloads.
//
// Extracted from library-docs-page.tsx so the Library's own chrome preferences
// — sidebar auto-hide, note toolbar, "On this page" — all remember themselves
// the same way. SSR renders the fallback and the stored value arrives on mount,
// which is what keeps the server and first client render identical.

import { useCallback, useEffect, useState } from "react";

export function usePersistentFlag(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(fallback);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) setValue(stored === "1");
    } catch {
      // Storage can be unavailable (private mode) — the default stands.
    }
  }, [key]);

  const update = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Not persisted, but still applied for this visit.
      }
    },
    [key],
  );

  return [value, update];
}
