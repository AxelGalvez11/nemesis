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

/**
 * 🔴🔴 TWO CONTEXTS, NOT ONE, AND THAT SPLIT IS A BUG FIX RATHER THAN A TIDY-UP.
 *
 * The first version put `{ claim, open, release }` in a single memoised value. `useDeclareSidePanel`
 * depended on that value — it has to, to call `claim` — so the value's identity changing re-ran the
 * effect, and the value's identity changed every time `open` did. The result is an infinite loop:
 *
 *     claim → ids change → context identity changes → effect re-runs → CLEANUP RELEASES →
 *     ids change → context identity changes → effect re-runs → claim → …
 *
 * React reports it as "Maximum update depth exceeded" and the page stops rendering. I shipped that
 * in #849 and found it here, opening a deck in the panel.
 *
 * 🔴 THE ACTIONS MUST NEVER CHANGE IDENTITY. They are `useCallback`s with no dependencies, in their
 * own context, so the claiming effect has a stable dependency and runs exactly once per mount. The
 * boolean lives in a second context that only the shell reads — and the shell re-rendering when it
 * changes is the entire point.
 */
interface SidePanelActions {
  claim(id: string, inset: number): void;
  release(id: string): void;
}

const SidePanelActionsContext = createContext<SidePanelActions | null>(null);
const SidePanelOpenContext = createContext(false);
/**
 * How much room on the right the docked panel is taking, in pixels.
 *
 * 🔴🔴 THE SURFACE IS PUSHED, NOT COVERED, AND THAT IS THE REFERENCE'S OWN BEHAVIOUR. Measured in
 * the owner's browser: the chat column's right edge sits at 474 and the panel begins at 490, so the
 * conversation genuinely reflows into what is left rather than sliding underneath. A floating panel
 * hides the half of the thread that asked for the artifact, which is the half you look at while
 * reading it.
 *
 * 🔴 ZERO WHILE FULL SCREEN. A reader covering the whole surface has nothing to push.
 */
const SidePanelInsetContext = createContext(0);

export function SidePanelProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<ReadonlyMap<string, number>>(() => new Map());

  // 🔴 NO DEPENDENCIES, DELIBERATELY. The updater form reads the current set, so neither callback
  // needs to close over it — which is what keeps their identity stable for the effect above.
  const actions = useMemo<SidePanelActions>(
    () => ({
      claim: (id: string, inset: number) =>
        setIds((current) => {
          if (current.get(id) === inset) return current;
          const next = new Map(current);
          next.set(id, inset);
          return next;
        }),
      release: (id: string) =>
        setIds((current) => {
          if (!current.has(id)) return current;
          const next = new Map(current);
          next.delete(id);
          return next;
        }),
    }),
    [],
  );

  return (
    <SidePanelActionsContext.Provider value={actions}>
      <SidePanelOpenContext.Provider value={ids.size > 0}>
        <SidePanelInsetContext.Provider value={Math.max(0, ...ids.values())}>{children}</SidePanelInsetContext.Provider>
      </SidePanelOpenContext.Provider>
    </SidePanelActionsContext.Provider>
  );
}

/** Whether anything is docked. Read by the shell. */
export function useSidePanelOpen(): boolean {
  return useContext(SidePanelOpenContext);
}

/** How much room to leave on the right, in pixels. Read by the surface being pushed. */
export function useSidePanelInset(): number {
  return useContext(SidePanelInsetContext);
}

/**
 * Declare that this component is a docked side panel, for as long as it is mounted.
 *
 * 🔴 THE RELEASE IS THE EFFECT'S CLEANUP, so it runs even when the panel is torn down by a route
 * change or an error rather than by its own close button. A panel that could leave the claim behind
 * would leave the sidebar collapsed with nothing on screen explaining why.
 */
export function useDeclareSidePanel(inset = 0): void {
  const actions = useContext(SidePanelActionsContext);
  const id = useId();
  useEffect(() => {
    if (!actions) return;
    actions.claim(id, inset);
    return () => actions.release(id);
  }, [actions, id, inset]);
}
