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
}

const ImmersiveSurfaceContext = createContext<ImmersiveRegistry | null>(null);

/** True on the very first client render when the URL already names a canvas. Never true on the
 *  server: the workspace shell only mounts after the client-side auth gate resolves, so there is
 *  no server pass of this tree to disagree with. */
function seededFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.pathname.replace(/\/+$/, "") !== CANVAS_PATHNAME) return false;
  return canvasIsImmersive(learnEntryFromSearch(window.location.search));
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

  const value = useMemo<ImmersiveRegistry>(
    () => ({ claim, claimed: claims.size > 0, release }),
    [claim, claims, release],
  );

  return <ImmersiveSurfaceContext.Provider value={value}>{children}</ImmersiveSurfaceContext.Provider>;
}

/** Read by the shell. `false` outside a provider, so nothing can accidentally hide the rail. */
export function useImmersiveClaimed(): boolean {
  return useContext(ImmersiveSurfaceContext)?.claimed ?? false;
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
