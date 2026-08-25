import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  // 🔴 THIS USED TO ASSERT `navToggleShowing === true`, AND THAT WAS THE OLD SHAPE OF THE ANSWER,
  // NOT THE PROPERTY. What this test defends is "the front door offers a way back to navigation";
  // collapsed now draws an icon rail instead of a floating toggle, so the way back is the rail.
  // Asserted through `navigationReachable` so the next change of shape cannot quietly break it
  // either — a bare `navToggleShowing` was a specific implementation wearing an invariant's name.
  assert.ok(navigationReachable(front), "the front door must offer a way back to navigation");
  assert.equal(front.railVisible, true, "collapsed on the front door is an icon rail, not an empty column");
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
  // The front door keeps navigation (as an icon rail); the canvas at the same pathname has none.
  // Asserted through the invariant rather than through whichever control happens to draw it.
  assert.ok(navigationReachable(firstVisit("/learn")));
  assert.equal(firstVisit("/learn").railVisible, true);
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
    navigationReachable({
      focusMode: true,
      navToggleShowing: false,
      // 🔴 THE ICON RAIL IS OFF HERE TOO, AND THAT IS THE POINT OF THE CASE. `railVisible` was
      // added as a fourth way to satisfy this predicate; if it were ever true under focus mode the
      // clause would quietly re-admit the dead end through the new door.
      railVisible: false,
      sidebarVisible: false,
      surfaceOwnsExit: false,
    }),
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

test("🔴 collapsed is an icon rail, and a canvas still gets nothing at all", () => {
  // Owner 2026-08-14: "i want the sidebar to be like this, not fully hidden ... but it should not
  // appear in canvas mode". Two halves, and the second is the one with a history: §38.1 takes the
  // rail off a canvas entirely, so the new state must not become a back door that puts navigation
  // back onto the product's full-bleed surface.
  const frontDoor = shellNavigation({
    libraryFullScreen: false,
    narrowViewport: WIDE,
    pathname: "/learn",
    sidebarOpen: false,
  });
  assert.equal(frontDoor.railVisible, true, "collapsed on the front door must be a rail, not an empty column");
  assert.equal(frontDoor.sidebarVisible, false);
  assert.equal(
    frontDoor.navToggleShowing,
    false,
    "the rail carries its own expand control; a floating toggle as well is two of one thing 40px apart",
  );
  assert.ok(navigationReachable(frontDoor));

  const canvas = shellNavigation({
    immersiveClaimed: true,
    libraryFullScreen: false,
    narrowViewport: WIDE,
    pathname: "/learn",
    sidebarOpen: false,
  });
  assert.equal(canvas.railVisible, false, "a canvas is full-bleed (§38.1) — the rail is not exempt from that");
  assert.equal(canvas.sidebarVisible, false);
  assert.equal(canvas.navToggleShowing, false);
});

test("🔴 a phone gets the floating toggle, never a rail eating its width", () => {
  // On a narrow viewport the sidebar is an OVERLAY. A permanent 56px column would take width from
  // the surface that can least afford it and would sit underneath the overlay meant to replace it.
  const phone = shellNavigation({
    libraryFullScreen: false,
    narrowViewport: NARROW,
    pathname: "/learn",
    sidebarOpen: false,
  });
  assert.equal(phone.railVisible, false);
  assert.equal(phone.navToggleShowing, true, "the toggle is still the phone's way back to navigation");
  assert.ok(navigationReachable(phone));
});

test("🔴 opening the sidebar replaces the rail rather than sitting beside it", () => {
  const opened = shellNavigation({
    libraryFullScreen: false,
    narrowViewport: WIDE,
    pathname: "/learn",
    sidebarOpen: true,
  });
  assert.equal(opened.sidebarVisible, true);
  assert.equal(opened.railVisible, false, "the full sidebar and the icon rail are one column, in one state or the other");
});

test("🔴 the rail draws the same destinations the sidebar does", () => {
  // Two renderers, one array (lib/workspace/sidebar-nav.ts). A copy in the rail would look correct
  // on its own on the day it was written and disagree with the sidebar the first time either moved.
  const rail = readFileSync(join(import.meta.dirname, "../../components/workspace/shell/nav-rail.tsx"), "utf8");
  assert.match(rail, /SIDEBAR_NAV/, "the rail stopped drawing the shared destinations");
  assert.equal(
    /\{\s*id:\s*"/.test(rail),
    false,
    "the rail is declaring nav items of its own again; it must map SIDEBAR_NAV so the two cannot drift",
  );
});

test("🔴🔴 a docked side panel collapses the sidebar to the rail, and never past it", () => {
  // Owner, 2026-08-25: *"when the 'sidebar' opens the left sidebar should collapse automatically,
  // so the right sidebar and canvas stay."*
  const open = { libraryFullScreen: false, narrowViewport: false, pathname: "/library", sidebarOpen: true };
  const before = shellNavigation(open);
  assert.equal(before.sidebarVisible, true);

  const during = shellNavigation({ ...open, sidePanelOpen: true });
  assert.equal(during.sidebarVisible, false, "the sidebar did not collapse for the docked panel");
  // 🔴 TO THE RAIL, NOT TO NOTHING. Focus mode takes navigation away entirely, which is right for a
  // canvas carrying its own `×`; a document open beside the page must not also remove the way out
  // of the page. Calibration: fold `sidePanelOpen` into `focusMode` instead and this reddens.
  assert.equal(during.railVisible, true, "collapsing the sidebar left no way to navigate");
  assert.equal(during.focusMode, false, "a side panel should not put the shell in focus mode");

  // And it is transient: with the panel closed the learner's own preference decides again.
  assert.deepEqual(shellNavigation({ ...open, sidePanelOpen: false }), before);
});

test("🔴 a phone keeps its exit when a panel docks", () => {
  // On a narrow viewport the sidebar is an overlay and there is no rail, so the floating toggle is
  // the only way back. Suppressing the sidebar there must still leave that toggle.
  const narrow = shellNavigation({
    libraryFullScreen: false,
    narrowViewport: true,
    pathname: "/library",
    sidebarOpen: true,
    sidePanelOpen: true,
  });
  assert.equal(narrow.sidebarVisible, false);
  assert.equal(narrow.navToggleShowing, true, "a phone with a docked panel has no way back to navigation");
});
