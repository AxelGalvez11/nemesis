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

// 🔴🔴 A CANVAS IS NO LONGER IMMERSIVE, AND §38.1 IS REVERSED (owner, 2026-08-31).
//
//   > "make the chat retain left sidebar like in chatgpt but when chats are initiated, the left
//   > sidebar should collapse."
//
// §38.1 had said the opposite — *"Side bar should also not be visible when inside canvas"*, not
// merely the toggle but the whole rail — and that is what `immersiveClaimed` used to buy. It now
// buys a COLLAPSE instead: the sidebar folds to the 56px rail and the rail stays, which is the
// reference's own behaviour. ChatGPT's tiny bar was measured in the owner's account on 2026-08-29:
// **52px, present on every surface, never absent, never resizing.** There is no state in that
// product where navigation is gone, which is the whole reason the old claim felt wrong once the
// canvas became the place you simply talk to Nemesis.
//
// 🔴 THE CLAIM STILL EXISTS AND STILL COMES FROM `CanvasSurface`; only its EFFECT moved, from
// `focusMode` to `sidebarVisible`. Keeping the registry means the URL seed keeps doing its job —
// it now prevents a flash of the EXPANDED sidebar before the collapse, where it used to prevent a
// flash of the rail.
//
// It cannot be a route, because `/learn` is TWO surfaces: the front door (composer + the
// learner's canvases, which keeps its navigation) and a canvas session (`?c=`, `?ask=`, `?new=1`,
// which does not). The shell reads the pathname, and the pathname is `/learn` for both.
//
// Reading the query in the shell would mean `useSearchParams()` in a client component that wraps
// every workspace route — which forces the whole group into a Suspense boundary, against a Vercel
// account with a daily build cap. So the surface DECLARES itself instead: `canvasRunning`
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
   * A canvas is on screen — i.e. a conversation has been initiated.
   *
   * 🔴 IT COLLAPSES THE SIDEBAR, IT NO LONGER SUPPRESSES THE RAIL. See the note at the top of this
   * file: §38.1 was reversed on 2026-08-31. The surface still carries its own `×`, which is now a
   * convenience rather than the learner's only way out.
   */
  readonly canvasRunning?: boolean;
  /** Something is docked on the right — see side-panel.tsx. Collapses the sidebar to the rail for
   *  as long as it is open, and never touches the stored preference. */
  sidePanelOpen?: boolean;
}

export interface ShellNavigation {
  readonly focusMode: boolean;
  readonly sidebarVisible: boolean;
  /**
   * The collapsed sidebar is an ICON RAIL, not an empty column (owner 2026-08-14: "i want the
   * sidebar to be like this, not fully hidden ... but it should not appear in canvas mode").
   *
   * 🔴 THIS IS A THIRD STATE, NOT A RENAME OF `navToggleShowing`. The file above documents two
   * ways the rail leaves the screen — collapsed with a toggle, and suppressed with nothing — and
   * calls them "identical in a screenshot". A rail is the case where it does NOT leave: the
   * destinations stay reachable in one press instead of two, and the column keeps occupying real
   * layout, so nothing floats over the surface's top-left corner.
   *
   * 🔴 NEVER TOGETHER WITH THE FLOATING TOGGLE. The rail carries its own expand control, so both
   * showing would put two "open the sidebar" affordances 40px apart.
   */
  readonly railVisible: boolean;
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
  canvasRunning = false,
  sidePanelOpen = false,
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
    IMMERSIVE_ROUTES.has(route) ||
    (libraryFullScreen && !narrowViewport && FOCUS_MODE_ROUTES.has(route));
  // 🔴🔴 A DOCKED PANEL COLLAPSES THE SIDEBAR AND LEAVES THE RAIL — owner, 2026-08-25: *"when the
  // 'sidebar' opens the left sidebar should collapse automatically, so the right sidebar and canvas
  // stay."* Folded in HERE rather than by writing `sidebarOpen`, because writing it would persist
  // to the learner's stored preference and they would never get their sidebar back; see
  // side-panel.tsx, and responsive-sidebar.ts for the same bug the narrow-viewport effect once had.
  //
  // 🔴 IT IS NOT `focusMode`. Focus mode takes the navigation away entirely, which is right for a
  // canvas carrying its own `×`. A document open beside the page must not also remove the way out
  // of the page — so this suppresses only the expanded sidebar, and `railVisible` below, computed
  // from `sidebarVisible`, brings the 56px rail back on its own.
  // 🔴 `canvasRunning` JOINS THE COLLAPSE, NOT `focusMode` — the reversal of §38.1 in one line.
  // A running conversation folds the sidebar to the rail exactly as a docked panel does, and for
  // the same reason: it must not be written to `sidebarOpen`, or the learner's stored preference
  // would be destroyed the first time they ever talked to Nemesis.
  const sidebarVisible = sidebarOpen && !focusMode && !sidePanelOpen && !canvasRunning;
  // 🔴 A PHONE GETS NO RAIL. On a narrow viewport the sidebar is an OVERLAY, so a permanent
  // 56px column would eat screen width from a surface that has none to spare and would sit under
  // the overlay it is supposed to replace. The floating toggle stays the right answer there, which
  // is why this is the only clause that keeps `navToggleShowing` alive.
  const railVisible = !sidebarVisible && !focusMode && !narrowViewport;
  return {
    focusMode,
    navToggleShowing: !sidebarVisible && !focusMode && !railVisible,
    railVisible,
    sidebarVisible,
    surfaceOwnsExit: canvasRunning,
  };
}

/**
 * 🔴 THE INVARIANT, AS A PREDICATE RATHER THAN A PROMISE.
 *
 * A learner must always have SOME way out of where they are: either the rail is on screen, or a
 * control puts it there, or the surface itself carries an exit.
 *
 * 🔴 THE THIRD CLAUSE IS NOW BELT AND BRACES, WHICH IS WHY IT STAYS. Under §38.1 a canvas had the
 * rail taken away, so `sidebarVisible` and `navToggleShowing` were both false there and the
 * two-clause predicate would have called the product's main surface a dead end; the clause existed
 * to say "immersive means the surface owns an exit". Since 2026-08-31 a canvas COLLAPSES to the
 * rail instead, so `railVisible` already satisfies this on its own and nothing depends on the
 * clause any more.
 *
 * 🔴 IT IS NOT DELETED, BECAUSE DELETING IT WOULD BE THE SECOND HALF OF A ONE-WAY DOOR. The `×` is
 * still structural in `CanvasSurface` (`learn-entry.test.ts` holds that up), and if a future
 * surface ever suppresses the rail again this is the clause that keeps the invariant honest
 * instead of silently failing.
 *
 * A route on `IMMERSIVE_ROUTES` deliberately does NOT satisfy this. `/slides` is grandfathered by
 * `routeDeclaredImmersive` below, named rather than silently folded in, because nobody has checked
 * whether it carries an exit and this function should not pretend otherwise.
 */
export function navigationReachable(nav: ShellNavigation): boolean {
  // 🔴 `railVisible` STRENGTHENS THIS CLAUSE, IT DOES NOT WIDEN IT. The rail IS navigation on
  // screen — four destinations, one press each — so it satisfies the invariant more directly than
  // `navToggleShowing`, which only promises a control that would reveal navigation. It is listed
  // separately rather than folded into `sidebarVisible` because the two differ in what a learner
  // can read: the rail shows glyphs, the sidebar shows labels.
  return nav.sidebarVisible || nav.railVisible || nav.navToggleShowing || nav.surfaceOwnsExit;
}

/** The grandfathered case: an old-style immersive ROUTE, which asserts nothing about its exit. */
export function routeDeclaredImmersive(pathname: string): boolean {
  return IMMERSIVE_ROUTES.has(normalizePathname(pathname));
}
