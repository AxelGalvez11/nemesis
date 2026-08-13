import assert from "node:assert/strict";
import test from "node:test";

import { initialSidebarState, isSidebarOpen } from "./responsive-sidebar";
import { navigationReachable, shellNavigation } from "./shell-navigation";

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
  // `/learn` with a canvas open is the same pathname, which is why a canvas is `?c=<id>`.
  for (const route of ["/learn", "/sessions", "/calendar", "/stats", "/library"]) {
    const nav = firstVisit(route);
    assert.ok(navigationReachable(nav), `${route} offers a learner no way to reach navigation`);
  }
});

test("🔴 collapsed is not the same as suppressed, and only one of them is a dead end", () => {
  const canvas = firstVisit("/learn");
  // Collapsed: the rail is off screen — the Canvas still dominates, which is what §L asks for —
  // but the toggle is there. This is the assertion that would have failed before the fix.
  assert.equal(canvas.sidebarVisible, false, "the rail must not eat the learning surface uninvited");
  assert.equal(canvas.navToggleShowing, true, "the Canvas must offer a way back to navigation");
  assert.equal(canvas.focusMode, false, "the Canvas is no longer an immersive route");

  // Suppressed: a surface that genuinely owns its left edge gets neither, and says so by being
  // declared immersive rather than by inheriting it.
  const slides = firstVisit("/slides");
  assert.equal(slides.focusMode, true);
  assert.equal(slides.navToggleShowing, false, "an immersive surface owns its own exit");
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
