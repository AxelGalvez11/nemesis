"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

import {
  encodeSidebarPreference,
  initialSidebarState,
  isSidebarOpen,
  onNarrowViewport,
  withSidebarOpen,
  withStoredSidebar,
} from "@/lib/workspace/responsive-sidebar";

/**
 * Sidebar open state that restores itself when a narrow window widens again.
 * The decision logic lives in lib/workspace/responsive-sidebar (and is unit
 * tested there); this only binds it to React.
 *
 * setOpen takes the same argument as a useState setter, updater callback
 * included, so this drops into a `useState<boolean>` call site unchanged.
 *
 * Pass a `storageKey` and the WIDE preference outlives the component: closing
 * the Library sidebar used to last exactly until the next navigation, because
 * the page is a route leaf that remounts back to the hardcoded open default
 * (owner 2026-08-03: "the library sidebar always stays open even if user
 * closed it"). The narrow overlay is deliberately never persisted — it is
 * transient, dismissed by a tap, and restoring it would open a drawer nobody
 * asked for. The write happens inside setOpen (a user action), not in an
 * effect, so there is no mount-time write that could clobber storage — the
 * exact landmine the calendar page once had.
 *
 * `defaultWideOpen` is what a learner with NOTHING STORED gets. It defaults to open, which is what
 * every existing call site meant; the workspace nav rail passes false (§L: navigation is secondary,
 * and a new user starts collapsed). A stored preference always wins over it — the default is the
 * first impression, not a policy.
 */
export function useResponsiveSidebar(
  narrowViewport: boolean,
  storageKey?: string,
  defaultWideOpen = true,
): {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
} {
  // 🔴 A LAZY INITIALISER, so the seed is not rebuilt on every render. It is read once; changing
  // `defaultWideOpen` afterwards would not (and must not) reopen a rail the learner has closed.
  const [state, setState] = useState(() => initialSidebarState(defaultWideOpen));

  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      setState((current) => withStoredSidebar(current, stored));
    } catch {
      // Storage unavailable (private mode, blocked) — session-only state.
    }
    // Read once per mount; the key never changes for a given call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (narrowViewport) setState(onNarrowViewport);
  }, [narrowViewport]);

  const setOpen = useCallback<Dispatch<SetStateAction<boolean>>>(
    (open) =>
      setState((current) => {
        const next = typeof open === "function" ? open(isSidebarOpen(current, narrowViewport)) : open;
        if (storageKey && !narrowViewport) {
          try {
            window.localStorage.setItem(storageKey, encodeSidebarPreference(next));
          } catch {
            // best-effort
          }
        }
        return withSidebarOpen(current, narrowViewport, next);
      }),
    [narrowViewport, storageKey],
  );

  return { open: isSidebarOpen(state, narrowViewport), setOpen };
}
