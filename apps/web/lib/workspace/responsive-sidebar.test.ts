import assert from "node:assert/strict";

import {
  INITIAL_SIDEBAR_STATE,
  isSidebarOpen,
  onNarrowViewport,
  withSidebarOpen,
} from "./responsive-sidebar";

const WIDE = false;
const NARROW = true;

// A window that starts wide shows the sidebar; one that starts narrow does not.
assert.equal(isSidebarOpen(INITIAL_SIDEBAR_STATE, WIDE), true, "wide viewports open the sidebar by default");
assert.equal(isSidebarOpen(INITIAL_SIDEBAR_STATE, NARROW), false, "narrow viewports keep the overlay closed by default");

// THE BUG: a sidebar auto-collapsed by a narrow window stayed collapsed forever
// once the window grew back, because one flag stored both meanings.
{
  const narrowed = onNarrowViewport(INITIAL_SIDEBAR_STATE);
  assert.equal(isSidebarOpen(narrowed, NARROW), false, "going narrow collapses the sidebar");
  assert.equal(isSidebarOpen(narrowed, WIDE), true, "widening again restores the sidebar");
}

// A deliberate collapse is a standing preference: it must survive a trip
// through a narrow window rather than being reset by the widen.
{
  const collapsed = withSidebarOpen(INITIAL_SIDEBAR_STATE, WIDE, false);
  const narrowed = onNarrowViewport(collapsed);
  assert.equal(isSidebarOpen(narrowed, WIDE), false, "a deliberate collapse survives a narrow excursion");
}

// Opening the overlay on a phone must not silently rewrite the desktop layout.
{
  const overlayOpen = withSidebarOpen(INITIAL_SIDEBAR_STATE, NARROW, true);
  assert.equal(isSidebarOpen(overlayOpen, NARROW), true, "the overlay opens at narrow width");

  const collapsedWide = withSidebarOpen(overlayOpen, WIDE, false);
  assert.equal(isSidebarOpen(collapsedWide, NARROW), true, "collapsing at wide width leaves the overlay alone");
  assert.equal(isSidebarOpen(collapsedWide, WIDE), false, "collapsing at wide width sets the wide preference");
}

// Re-entering a narrow viewport closes a stale overlay (e.g. rotating a phone
// back to portrait) without touching the wide preference.
{
  const overlayOpen = withSidebarOpen(INITIAL_SIDEBAR_STATE, NARROW, true);
  const reentered = onNarrowViewport(overlayOpen);
  assert.equal(isSidebarOpen(reentered, NARROW), false, "re-entering narrow closes a stale overlay");
  assert.equal(isSidebarOpen(reentered, WIDE), true, "re-entering narrow leaves the wide preference intact");
}

// State updates are copies, never mutations of the caller's object.
{
  const before = INITIAL_SIDEBAR_STATE;
  const after = withSidebarOpen(before, WIDE, false);
  assert.notEqual(after, before, "returns a new object");
  assert.equal(before.wideOpen, true, "does not mutate the input");
}

console.log("responsive-sidebar: ok");
