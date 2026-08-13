import assert from "node:assert/strict";
import test from "node:test";

import { initialSidebarState, isSidebarOpen } from "./responsive-sidebar";
import { navigationReachable, routeDeclaredImmersive, shellNavigation } from "./shell-navigation";

const WIDE = false;
const NARROW = true;

/** What a learner with nothing stored actually has, at the width the owner uses. */
function firstVisit(pathname: string, narrowViewport = WIDE) {
  return shellNavigation({
    libraryFullScreen: false,
    narrowViewport,
    pathname,
    sidebarOpen: isSidebarOpen(initialSidebarState(false), narrowViewport),
  });
}

test("🔴 a learner can always reach navigation — the defect this file exists for", () => {
  // The two routes that matter most, and the two that were sealed. `/learn` is the front door;
  // `/learn` with a canvas open is the same pathname, which is why a canvas is `?c=<id>` and why
  // §38.1 is a claim rather than a route — see the §38.1 test below.
  for (const route of ["/learn", "/sessions", "/calendar", "/stats", "/library"]) {
    const nav = firstVisit(route);
    assert.ok(navigationReachable(nav), `${route} offers a learner no way to reach navigation`);
  }
});

test("🔴 collapsed is not the same as suppressed, and only one of them is a dead end", () => {
  // The FRONT DOOR at /learn — the composer with the learner's canvases below it. Not "inside a
  // canvas" (§38.1), so it keeps its navigation: the rail is off screen, which is what §L asks
  // for, but the toggle is there. This is the assertion that would have failed before the fix.
  const front = firstVisit("/learn");
  assert.equal(front.sidebarVisible, false, "the rail must not eat the learning surface uninvited");
  assert.equal(front.navToggleShowing, true, "the front door must offer a way back to navigation");
  assert.equal(front.focusMode, false, "the front door is not an immersive surface");

  // Suppressed: a surface that genuinely owns its left edge gets neither, and says so by being
  // declared immersive rather than by inheriting it.
  const slides = firstVisit("/slides");
  assert.equal(slides.focusMode, true);
  assert.equal(slides.navToggleShowing, false, "an immersive surface owns its own exit");
});

test("🔴 §38.1 — inside a canvas there is no rail AND no toggle, and it is a CLAIM that says so", () => {
  const canvas = shellNavigation({
    immersiveClaimed: true,
    libraryFullScreen: false,
    narrowViewport: WIDE,
    pathname: "/learn",
    sidebarOpen: false,
  });
  assert.equal(canvas.sidebarVisible, false, "§38.1: the sidebar is not visible inside a canvas");
  assert.equal(canvas.navToggleShowing, false, "§38.1 is the whole rail, not merely the toggle");
  assert.equal(canvas.focusMode, true);

  // 🔴 SAME PATHNAME, OPPOSITE ANSWER. This is the whole reason the decision is a claim rather than
  // a route: `/learn` is the front door AND every canvas session, and putting it on the immersive
  // ROUTE list would take navigation off the composer page too.
  assert.equal(firstVisit("/learn").navToggleShowing, true);
  assert.equal(routeDeclaredImmersive("/learn"), false, "a canvas must never become an immersive ROUTE");

  // Even a learner who has deliberately opened the rail gets a full-bleed canvas. §38.1 is not a
  // default that a stored preference outranks — it is what a canvas IS.
  const opened = shellNavigation({
    immersiveClaimed: true,
    libraryFullScreen: false,
    narrowViewport: WIDE,
    pathname: "/learn",
    sidebarOpen: true,
  });
  assert.equal(opened.sidebarVisible, false);
});

test("🔴 the reachability invariant was CHANGED, not weakened — a claim must carry an exit", () => {
  // The old predicate was "rail on screen, or a control puts it there". Under §38.1 both are false
  // on the product's main surface, so leaving the predicate alone would have called the Canvas a
  // dead end — and the tempting repair is to delete the assertion. Instead the third clause says
  // what makes it safe: the surface owns its exit. `learn-entry.test.ts` holds that end up by
  // asserting the `×` in `CanvasSurface` is structural rather than conditional.
  const canvas = shellNavigation({
    immersiveClaimed: true,
    libraryFullScreen: false,
    narrowViewport: WIDE,
    pathname: "/learn",
    sidebarOpen: false,
  });
  assert.equal(canvas.surfaceOwnsExit, true);
  assert.ok(navigationReachable(canvas));

  // 🔴 AND THE CLAUSE IS NARROW. A surface with no rail, no toggle and no claim is still a dead
  // end, and an immersive ROUTE does not get the benefit: nobody has checked whether /slides
  // carries an exit, and this predicate must not pretend otherwise.
  assert.equal(
    navigationReachable({ focusMode: true, navToggleShowing: false, sidebarVisible: false, surfaceOwnsExit: false }),
    false,
    "hiding the rail without an exit is exactly the defect this file exists for",
  );
  assert.equal(firstVisit("/slides").surfaceOwnsExit, false, "/slides is grandfathered, not vouched for");
});

test("🔴 a phone inside a canvas gets the same full-bleed surface, deliberately", () => {
  // The narrow-viewport exemption below exists because /library's own sidebar is an overlay with
  // no exit of its own. A canvas has an `×` at every width, so the exemption would cost the
  // learner the full-bleed surface exactly where the screen is smallest. Decided, not inherited.
  const phone = shellNavigation({
    immersiveClaimed: true,
    libraryFullScreen: false,
    narrowViewport: NARROW,
    pathname: "/learn",
    sidebarOpen: false,
  });
  assert.equal(phone.sidebarVisible, false);
  assert.equal(phone.navToggleShowing, false);
  assert.ok(navigationReachable(phone), "and it is only allowed because the surface carries the ×");
});

test("opening the rail hides the toggle, so there is never both", () => {
  const opened = shellNavigation({
    libraryFullScreen: false,
    narrowViewport: WIDE,
    pathname: "/learn",
    sidebarOpen: true,
  });
  assert.equal(opened.sidebarVisible, true);
  assert.equal(opened.navToggleShowing, false, "a visible rail and a reopen control at once is two of one thing");
});

test("a narrow viewport is exempt from focus mode, so a phone never loses its exit", () => {
  const nav = shellNavigation({
    libraryFullScreen: true,
    narrowViewport: NARROW,
    pathname: "/library",
    sidebarOpen: false,
  });
  assert.equal(nav.focusMode, false, "focus mode must not apply where both rails are overlays");
  assert.ok(navigationReachable(nav));
});

test("trailing slashes do not change which surface this is", () => {
  assert.deepEqual(firstVisit("/learn/"), firstVisit("/learn"));
  assert.deepEqual(firstVisit("/slides///"), firstVisit("/slides"));
});
