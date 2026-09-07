"use client";

// How a surface tells the shell "I own the whole viewport" (UX brief §38.1).
//
// 🔴 WHY THIS IS NOT JUST A ROUTE IN shell-navigation.ts. `/learn` is two surfaces behind one
// pathname: the front door (composer + the learner's canvases, which keeps its navigation) and a
// canvas session (`?c=`, `?ask=`, `?new=1`, which does not). The distinction lives in the QUERY,
// and the shell cannot read the query: `useSearchParams()` in a client component wrapping every
// workspace route forces the whole group into a Suspense boundary, and that is a build-time cost
// against an account with a daily build cap. So the surface declares itself instead.
//
// 🔴 CLAIMS ARE ID-KEYED AND RELEASED ON UNMOUNT, NOT A SHARED BOOLEAN. Two effects toggling one
// flag is how a stale `true` survives a navigation — and a stale `true` is the dead end arriving
// from the other direction: the rail stays hidden on a page that has no `×`. A `Set` of ids cannot
// get out of step with how many surfaces are actually mounted, and React's cleanup removes an id
// even when the component is torn down by an error or a route change.
//
// 🔴 SEEDED FROM THE URL SO THE FIRST PAINT IS ALREADY RIGHT. A deep link, a hard refresh and a
// return from sign-in all land directly inside a canvas. Without the seed the shell's first frame
// would show the floating rail toggle, and the canvas's own `×` — which pads by
// `--nav-toggle-inset` to avoid printing on top of it — would visibly jump 30px left when the
// claim landed a frame later. The seed is dropped in this provider's own mount effect, which React
// runs AFTER its children's, so a canvas has always registered its real claim by then; on the
// front door the seed is never set in the first place.

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from "react";

import { canvasIsImmersive, learnEntryFromSearch } from "@/lib/learn/learn-entry";

/** The one surface class that seeds the claim from the URL. Kept here rather than in the entry
 *  module because it is a fact about routing, not about what a `/learn` query means. */
const CANVAS_PATHNAME = "/learn";
const URL_SEED = "url-seed";

interface ImmersiveRegistry {
  readonly claimed: boolean;
  claim(id: string): void;
  release(id: string): void;
  /**
   * 🔴🔴 THE SECOND, STRONGER CLAIM, AND WHY THERE ARE TWO. The claim above used to take the rail
   * away; since the §38.1 reversal it only COLLAPSES the sidebar to the 52px rail, which is right
   * for a chat and for the board. A full-size chat opened out of a canvas is a different case:
   * owner, 2026-09-06, of the board's entered thread, *"the left rail sidebar still shows in full
   * size view"*. That surface fills the window and carries its own "Canvas" control, so the rail is
   * the only thing left on screen that does not belong to it.
   *
   * Making the first claim mean "gone" again would take the rail away from every chat as well, and
   * that is the reversal the owner made in August. So the two states are named separately, and
   * `navigationReachable` still refuses either one from a surface with no exit of its own.
   */
  readonly fullBleed: boolean;
  claimFullBleed(id: string): void;
  releaseFullBleed(id: string): void;
}

const ImmersiveSurfaceContext = createContext<ImmersiveRegistry | null>(null);

/**
 * Whether the first paint should already be immersive, given where the browser is.
 *
 * 🔴 EXPORTED AND PURE SO THE DANGEROUS CASE IS A TEST. The seed hides the rail before anything
 * has claimed it; if it were ever true for a URL that does not mount a canvas, the rail would stay
 * hidden on a page with no `×` — which is the dead end, arriving through the optimisation meant to
 * smooth it. The front door is the case that must come back false.
 */
export function immersiveSeed(pathname: string, search: string): boolean {
  if (pathname.replace(/\/+$/, "") !== CANVAS_PATHNAME) return false;
  return canvasIsImmersive(learnEntryFromSearch(search));
}

/** Never true on the server: the workspace shell only mounts after the client-side auth gate
 *  resolves, so there is no server pass of this tree to disagree with. */
function seededFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  return immersiveSeed(window.location.pathname, window.location.search);
}

export function ImmersiveSurfaceProvider({ children }: { children: React.ReactNode }) {
  const [claims, setClaims] = useState<ReadonlySet<string>>(() =>
    seededFromUrl() ? new Set([URL_SEED]) : new Set<string>(),
  );

  const claim = useCallback((id: string) => {
    setClaims((current) => (current.has(id) ? current : new Set(current).add(id)));
  }, []);

  const release = useCallback((id: string) => {
    setClaims((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  // Hand the seed over to whoever really claimed. Children's effects have already run, so a canvas
  // on screen is holding its own id by now and this changes nothing visible; if nothing claimed —
  // the URL said canvas but the surface did not mount — the seed goes and the rail comes back,
  // which is the safe direction to fail in.
  useEffect(() => {
    release(URL_SEED);
  }, [release]);

  const [full, setFull] = useState<ReadonlySet<string>>(() => new Set<string>());
  const claimFullBleed = useCallback((id: string) => {
    setFull((current) => (current.has(id) ? current : new Set(current).add(id)));
  }, []);
  const releaseFullBleed = useCallback((id: string) => {
    setFull((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  const value = useMemo<ImmersiveRegistry>(
    () => ({ claim, claimed: claims.size > 0, release, claimFullBleed, fullBleed: full.size > 0, releaseFullBleed }),
    [claim, claimFullBleed, claims, full, release, releaseFullBleed],
  );

  return <ImmersiveSurfaceContext.Provider value={value}>{children}</ImmersiveSurfaceContext.Provider>;
}

/** Read by the shell. `false` outside a provider, so nothing can accidentally hide the rail. */
export function useImmersiveClaimed(): boolean {
  return useContext(ImmersiveSurfaceContext)?.claimed ?? false;
}

/** Read by the shell: a surface that owns the whole window, rail included. */
export function useFullBleedClaimed(): boolean {
  return useContext(ImmersiveSurfaceContext)?.fullBleed ?? false;
}

/**
 * Declare this surface FULL BLEED for as long as it is mounted: no sidebar, no rail, nothing but
 * the surface.
 *
 * 🔴 ONLY CALL THIS FROM A COMPONENT THAT UNCONDITIONALLY RENDERS ITS OWN EXIT, and mean it. This
 * removes the last navigation on screen. `BoardThread` is the sole caller and its "Canvas" control
 * is not behind a condition; `board-thread.test.ts` is what holds that up.
 */
export function useDeclareFullBleedSurface(): void {
  const registry = useContext(ImmersiveSurfaceContext);
  const id = useId();
  useEffect(() => {
    if (!registry) return;
    registry.claimFullBleed(id);
    return () => registry.releaseFullBleed(id);
    // The two functions are stable; depending on `registry` itself would re-run on every claim.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, registry?.claimFullBleed, registry?.releaseFullBleed]);
}

/**
 * Declare this surface immersive for as long as it is mounted.
 *
 * 🔴 ONLY CALL THIS FROM A COMPONENT THAT UNCONDITIONALLY RENDERS ITS OWN EXIT. The claim removes
 * the rail AND its reopen toggle; the surface becomes the only thing on screen. `CanvasSurface` is
 * the sole caller, and `learn-entry.test.ts` is what checks its `×` cannot be branched away.
 */
export function useDeclareImmersiveSurface(): void {
  const registry = useContext(ImmersiveSurfaceContext);
  const id = useId();
  useEffect(() => {
    if (!registry) return;
    registry.claim(id);
    return () => registry.release(id);
    // `claim`/`release` are stable; depending on `registry` itself would re-run on every claim
    // change and churn the set. The two functions are what this effect actually uses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, registry?.claim, registry?.release]);
}
