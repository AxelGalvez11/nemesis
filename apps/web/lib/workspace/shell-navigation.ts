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
}

export interface ShellNavigation {
  readonly focusMode: boolean;
  readonly sidebarVisible: boolean;
  /** The floating reopen control renders. */
  readonly navToggleShowing: boolean;
}

export function normalizePathname(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

export function shellNavigation({
  pathname,
  sidebarOpen,
  narrowViewport,
  libraryFullScreen,
}: ShellNavigationInput): ShellNavigation {
  const route = normalizePathname(pathname);
  // Narrow viewports are exempt from focus mode: there both rails are overlays, so there is nothing
  // to declutter, and suppressing the nav would leave no visible exit.
  const focusMode =
    IMMERSIVE_ROUTES.has(route) || (libraryFullScreen && !narrowViewport && FOCUS_MODE_ROUTES.has(route));
  const sidebarVisible = sidebarOpen && !focusMode;
  return { focusMode, navToggleShowing: !sidebarVisible && !focusMode, sidebarVisible };
}

/**
 * 🔴 THE INVARIANT, AS A PREDICATE RATHER THAN A PROMISE.
 *
 * A learner must always have SOME route to navigation: either the rail is on screen, or a control
 * puts it there. Only a surface deliberately declared immersive may have neither, and that is a
 * claim about the surface owning its own exit — not a side effect of a default.
 */
export function navigationReachable(nav: ShellNavigation): boolean {
  return nav.sidebarVisible || nav.navToggleShowing;
}
