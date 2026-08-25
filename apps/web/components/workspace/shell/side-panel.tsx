"use client";

// How a surface tells the shell "something is docked on my right, give me the width".
//
// 🔴🔴 IT COLLAPSES THE SIDEBAR WITHOUT TOUCHING THE LEARNER'S PREFERENCE, AND THAT DISTINCTION IS
// THE WHOLE REASON THIS EXISTS. Owner, 2026-08-25: *"when the 'sidebar' opens the left sidebar
// should collapse automatically, so the right sidebar and canvas stay."* The obvious
// implementation — calling `setSidebarOpen(false)` when the panel opens — writes through to
// `nemesis.web.nav-rail`, so a learner who likes their sidebar open loses it permanently the first
// time they read a document. `responsive-sidebar.ts` already records that exact bug from the
// narrow-viewport effect: *"left the sidebar collapsed with no way back except a manual reopen."*
//
// A claim is transient by construction. It exists while the panel is mounted and is gone when it
// unmounts, and the stored preference is never consulted or written.
//
// 🔴 IT COLLAPSES TO THE RAIL, IT DOES NOT SUPPRESS IT. `useDeclareImmersiveSurface` takes the
// navigation away entirely, which is right for a canvas that carries its own `×` and wrong here:
// a document open beside the page must not also remove the way out of the page. `shellNavigation`
// therefore folds this into `sidebarVisible` alone, and `railVisible` — which is computed from
// it — brings the 56px rail back on its own.
//
// 🔴 ID-KEYED, NOT A SHARED BOOLEAN, for the reason immersive-surface.tsx gives at length: two
// components toggling one flag is how a stale `true` outlives the thing that set it, and here a
// stale `true` means a sidebar that will not come back.

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from "react";

interface SidePanelRegistry {
  readonly open: boolean;
  claim(id: string): void;
  release(id: string): void;
}

const SidePanelContext = createContext<SidePanelRegistry | null>(null);

export function SidePanelProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());

  const claim = useCallback((id: string) => {
    setIds((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }, []);

  const release = useCallback((id: string) => {
    setIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  const value = useMemo<SidePanelRegistry>(() => ({ claim, open: ids.size > 0, release }), [claim, ids, release]);
  return <SidePanelContext.Provider value={value}>{children}</SidePanelContext.Provider>;
}

/** Whether anything is docked. Read by the shell. */
export function useSidePanelOpen(): boolean {
  return useContext(SidePanelContext)?.open ?? false;
}

/**
 * Declare that this component is a docked side panel, for as long as it is mounted.
 *
 * 🔴 THE RELEASE IS THE EFFECT'S CLEANUP, so it runs even when the panel is torn down by a route
 * change or an error rather than by its own close button. A panel that could leave the claim behind
 * would leave the sidebar collapsed with nothing on screen explaining why.
 */
export function useDeclareSidePanel(): void {
  const registry = useContext(SidePanelContext);
  const id = useId();
  useEffect(() => {
    if (!registry) return;
    registry.claim(id);
    return () => registry.release(id);
  }, [id, registry]);
}
