"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

import {
  INITIAL_SIDEBAR_STATE,
  isSidebarOpen,
  onNarrowViewport,
  withSidebarOpen,
} from "@/lib/workspace/responsive-sidebar";

/**
 * Sidebar open state that restores itself when a narrow window widens again.
 * The decision logic lives in lib/workspace/responsive-sidebar (and is unit
 * tested there); this only binds it to React.
 *
 * setOpen takes the same argument as a useState setter, updater callback
 * included, so this drops into a `useState<boolean>` call site unchanged.
 */
export function useResponsiveSidebar(narrowViewport: boolean): {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
} {
  const [state, setState] = useState(INITIAL_SIDEBAR_STATE);

  useEffect(() => {
    if (narrowViewport) setState(onNarrowViewport);
  }, [narrowViewport]);

  const setOpen = useCallback<Dispatch<SetStateAction<boolean>>>(
    (open) =>
      setState((current) => {
        const next = typeof open === "function" ? open(isSidebarOpen(current, narrowViewport)) : open;
        return withSidebarOpen(current, narrowViewport, next);
      }),
    [narrowViewport],
  );

  return { open: isSidebarOpen(state, narrowViewport), setOpen };
}
