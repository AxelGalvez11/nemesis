"use client";

import { useCallback, useEffect, useState } from "react";

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
 */
export function useResponsiveSidebar(narrowViewport: boolean): { open: boolean; setOpen: (open: boolean) => void } {
  const [state, setState] = useState(INITIAL_SIDEBAR_STATE);

  useEffect(() => {
    if (narrowViewport) setState(onNarrowViewport);
  }, [narrowViewport]);

  const setOpen = useCallback(
    (open: boolean) => setState((current) => withSidebarOpen(current, narrowViewport, open)),
    [narrowViewport],
  );

  return { open: isSidebarOpen(state, narrowViewport), setOpen };
}
