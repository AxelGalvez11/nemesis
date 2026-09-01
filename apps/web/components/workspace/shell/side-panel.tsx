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
  claim(id: string, inset: number, live: boolean): void;
  release(id: string): void;
}

/** What one docked panel is asking of the surface: how much room, and whether it is moving now. */
interface Claim {
  readonly inset: number;
  /** True while the learner is dragging this panel's edge. */
  readonly live: boolean;
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
/**
 * Whether the inset is being DRAGGED right now.
 *
 * 🔴🔴 THE SURFACE HAS TO KNOW, OR ITS EDGE TRAILS THE POINTER BY A WHOLE TRANSITION. Owner,
 * 2026-09-01: *"no lagg in sizing adjustment for chat and sidebar."* The canvas carries
 * `transition: width var(--pane-slide)` so the push reads as the panel arriving — and that same
 * transition applied to every intermediate width a drag produces. The panel's own edge followed the
 * pointer exactly; the conversation's right edge eased toward it 220ms behind, all the way through
 * the drag, and then caught up after the button came up. Two edges that are the same edge, visibly
 * apart the entire time you are holding it.
 *
 * The panels already knew — `useDockWidth` returns `dragging` and each of them drops its own
 * animation with it. This is the same fact, published to the one element that needed it and did not
 * have it.
 */
const SidePanelLiveContext = createContext(false);

export function SidePanelProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<ReadonlyMap<string, Claim>>(() => new Map());

  // 🔴 NO DEPENDENCIES, DELIBERATELY. The updater form reads the current set, so neither callback
  // needs to close over it — which is what keeps their identity stable for the effect above.
  const actions = useMemo<SidePanelActions>(
    () => ({
      claim: (id: string, inset: number, live: boolean) =>
        setIds((current) => {
          const held = current.get(id);
          if (held && held.inset === inset && held.live === live) return current;
          const next = new Map(current);
          next.set(id, { inset, live });
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
        <SidePanelInsetContext.Provider value={Math.max(0, ...[...ids.values()].map((claim) => claim.inset))}>
          <SidePanelLiveContext.Provider value={[...ids.values()].some((claim) => claim.live)}>
            {children}
          </SidePanelLiveContext.Provider>
        </SidePanelInsetContext.Provider>
      </SidePanelOpenContext.Provider>
    </SidePanelActionsContext.Provider>
  );
}

/**
 * Whether anything is docked BESIDE the surface. Read by the shell.
 *
 * 🔴 "Docked" means taking width. A panel that is closed, or full screen, takes none and is not
 * counted — see `useDeclareSidePanel`, which releases on a zero inset rather than registering one.
 */
export function useSidePanelOpen(): boolean {
  return useContext(SidePanelOpenContext);
}

/** How much room to leave on the right, in pixels. Read by the surface being pushed. */
export function useSidePanelInset(): number {
  return useContext(SidePanelInsetContext);
}

/** Whether that room is being dragged right now, so the surface should follow instead of easing. */
export function useSidePanelLive(): boolean {
  return useContext(SidePanelLiveContext);
}

/**
 * Declare that this component is a docked side panel, for as long as it is mounted.
 *
 * 🔴 THE RELEASE IS THE EFFECT'S CLEANUP, so it runs even when the panel is torn down by a route
 * change or an error rather than by its own close button. A panel that could leave the claim behind
 * would leave the sidebar collapsed with nothing on screen explaining why.
 */
export function useDeclareSidePanel(inset = 0, live = false): void {
  const actions = useContext(SidePanelActionsContext);
  const id = useId();
  useEffect(() => {
    if (!actions) return;
    // 🔴🔴 A ZERO INSET IS NOT A CLAIM, AND BELIEVING OTHERWISE LOCKED THE SIDEBAR SHUT FOR EVERY
    // CONVERSATION. Owner, 2026-09-01: *"the left sidebar does not open in chat sessions."*
    // `canvas-controls.tsx` mounts `<SourcePreview>` unconditionally and it calls this hook BEFORE
    // its own `if (!active) return null` — the standard shape, since a hook cannot sit behind a
    // return. Closed, it passed 0. `ids.size > 0` counted that as a docked panel, so
    // `sidebarVisible` was false from the moment a canvas rendered and the rail's "Expand sidebar"
    // button did nothing at all, for ever.
    //
    // 🔴 EVERY CALL SITE ALREADY MEANT THIS. All three are written `<condition> ? width : 0` and
    // all three say so in their own comment: *"zero while closed"*, *"claim nothing while full
    // screen … or while closed"*. The hook was the one place that read 0 as "docked, pushing
    // nothing", and nothing on screen could tell you which reading was in force.
    //
    // 🔴 FULL SCREEN IS THE ONE HONEST ZERO, and releasing there is right too: a reader covering
    // the entire viewport has nothing beside it, so whether the sidebar behind it is open or
    // collapsed is invisible either way.
    if (inset <= 0) {
      actions.release(id);
      return;
    }
    actions.claim(id, inset, live);
    return () => actions.release(id);
  }, [actions, id, inset, live]);
}
