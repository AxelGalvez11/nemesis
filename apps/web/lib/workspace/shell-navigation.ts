// Whether a learner can reach navigation from the surface they are on.
//
// 🔴 THIS IS A MODULE BECAUSE THE ANSWER WAS ONCE "NO", SILENTLY, ON THE MOST IMPORTANT ROUTE.
//
// The shell has two ways to take the nav rail off screen and they are NOT interchangeable:
//
//   collapsed   the rail is 0px wide and a floating toggle brings it back
//   suppressed  the rail is 0px wide and there is NO toggle — the surface owns the left edge
//
// Both look identical in a screenshot. They differ in whether the learner has a way out. `/learn`
// was suppressed, on the reasoning that the Canvas "carries its own back control" — but Back leaves
// to the previous canvas, which is not navigation. Measured at 1280x800 on the canvas route, the
// page offered zero links and no toggle: Library, Calendar and Stats were unreachable from the
// front door and from every active session.
//
// Written as a condition inside the component that answer could not be asserted, because it only
// exists as JSX at render time. Here it is a value, so the invariant below is a test rather than a
// paragraph someone has to remember.

/** Surfaces that own the entire left edge and legitimately offer no nav toggle. */
const IMMERSIVE_ROUTES: ReadonlySet<string> = new Set(["/slides"]);

// 🔴 A CANVAS IS IMMERSIVE AND IS NOT ON THIS LIST, ON PURPOSE (UX brief §38.1).
//
//   > "Side bar should also not be visible when inside canvas." — not merely the toggle, the
//   > whole rail. The Canvas is a focused, full-bleed surface.
//
// It cannot be a route, because `/learn` is TWO surfaces: the front door (composer + the
// learner's canvases, which keeps its navigation) and a canvas session (`?c=`, `?ask=`, `?new=1`,
// which does not). The shell reads the pathname, and the pathname is `/learn` for both.
//
// Reading the query in the shell would mean `useSearchParams()` in a client component that wraps
// every workspace route — which forces the whole group into a Suspense boundary, against a Vercel
// account with a daily build cap. So the surface DECLARES itself instead: `immersiveClaimed`
// below, fed by the claim registry in components/workspace/shell/immersive-surface.tsx.
//
// 🔴 AND THE DECLARATION IS NOT FREE. Under §38.1 the rail is gone, so the surface's own `×` is
// the learner's only way out — see `navigationReachable`, which now REFUSES a claim that is not
// backed by one.

/** Surfaces with a sidebar of their own, which the workspace rail would sit beside awkwardly. */
const FOCUS_MODE_ROUTES: ReadonlySet<string> = new Set([
  "/library",
  "/library/classic",
  "/dev-preview/workspace/library",
  "/dev-preview/workspace/library-classic",
]);

export interface ShellNavigationInput {
  /** Pathname with trailing slashes already stripped. */
  readonly pathname: string;
  /** The learner's current preference, after storage and the collapsed default. */
  readonly sidebarOpen: boolean;
  readonly narrowViewport: boolean;
  /** Settings → General, "Keep Nemesis sidebar" turned off. */
  readonly libraryFullScreen: boolean;
  /**
   * A surface on screen has declared itself immersive (§38.1 — a canvas).
   *
   * 🔴 A CLAIM IS A PROMISE THAT THE SURFACE CARRIES ITS OWN EXIT. Only make it from a component
   * that unconditionally renders one; `CanvasSurface` is the only such caller today.
   */
  readonly immersiveClaimed?: boolean;
}

export interface ShellNavigation {
  readonly focusMode: boolean;
  readonly sidebarVisible: boolean;
  /** The floating reopen control renders. */
  readonly navToggleShowing: boolean;
  /** Why the rail is off screen: a surface claimed the whole viewport, rather than a route being
   *  listed as immersive. Carried so the invariant below can tell the two apart. */
  readonly surfaceOwnsExit: boolean;
}

export function normalizePathname(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

export function shellNavigation({
  pathname,
  sidebarOpen,
  narrowViewport,
  libraryFullScreen,
  immersiveClaimed = false,
}: ShellNavigationInput): ShellNavigation {
  const route = normalizePathname(pathname);
  // Narrow viewports are exempt from focus mode: there both rails are overlays, so there is nothing
  // to declutter, and suppressing the nav would leave no visible exit.
  //
  // 🔴 A CANVAS IS *NOT* EXEMPT, AND THAT IS DELIBERATE (see the test). The exemption exists so a
  // phone never loses its exit, and the reason it was needed is that `/library`'s own sidebar is an
  // overlay with no `×` of its own. A canvas has one, at the same place, at every width — so
  // applying focus mode there costs a phone nothing and gives it §38.1's full-bleed surface, which
  // is where a full-bleed surface matters most.
  const focusMode =
    immersiveClaimed ||
    IMMERSIVE_ROUTES.has(route) ||
    (libraryFullScreen && !narrowViewport && FOCUS_MODE_ROUTES.has(route));
  const sidebarVisible = sidebarOpen && !focusMode;
  return {
    focusMode,
    navToggleShowing: !sidebarVisible && !focusMode,
    sidebarVisible,
    surfaceOwnsExit: immersiveClaimed,
  };
}

/**
 * 🔴 THE INVARIANT, AS A PREDICATE RATHER THAN A PROMISE.
 *
 * A learner must always have SOME way out of where they are: either the rail is on screen, or a
 * control puts it there, or the surface itself carries an exit.
 *
 * 🔴 THE THIRD CLAUSE IS NEW, AND IT IS THE ONE THAT COULD ROT. §38.1 takes the rail off a canvas
 * entirely, so `sidebarVisible` and `navToggleShowing` are both false there and the old two-clause
 * predicate would call the product's main surface a dead end. Weakening the predicate to make that
 * green would have thrown away the only thing standing between this repo and the defect it already
 * shipped. So the third clause is not "immersive is allowed to have nothing" — it is "immersive
 * means the surface owns an exit", and `learn-entry.test.ts` is what holds that end up, by
 * asserting the `×` is structural in `CanvasSurface` rather than conditional.
 *
 * A route on `IMMERSIVE_ROUTES` deliberately does NOT satisfy this. `/slides` is grandfathered by
 * `routeDeclaredImmersive` below, named rather than silently folded in, because nobody has checked
 * whether it carries an exit and this function should not pretend otherwise.
 */
export function navigationReachable(nav: ShellNavigation): boolean {
  return nav.sidebarVisible || nav.navToggleShowing || nav.surfaceOwnsExit;
}

/** The grandfathered case: an old-style immersive ROUTE, which asserts nothing about its exit. */
export function routeDeclaredImmersive(pathname: string): boolean {
  return IMMERSIVE_ROUTES.has(normalizePathname(pathname));
}
