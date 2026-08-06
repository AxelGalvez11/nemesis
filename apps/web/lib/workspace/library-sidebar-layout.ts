// Which pieces of the Library's left chrome are on screen.
//
// Two different things can render the word "Library" at the same spot: the
// panel's own <h1>, and the floating marker that shows where the panel lives
// while it is hidden in auto-hide mode. They sit 2px apart, so if both are
// visible at once the word appears doubled and smeared.
//
// The marker also has to stay MOUNTED while the panel is out, because it is one
// of the hover targets that keeps the peek open — unmounting it under the
// pointer fires mouseleave, which closes the panel, which remounts the marker,
// which reopens it. That is why this returns a separate `markerVisible` from
// `markerMounted`: the caller keeps the element and its hover handlers in the
// tree and only drops its opacity.

export interface LibraryChromeInput {
  /** The panel is pinned open and never retracts. */
  readonly sidebarLocked: boolean;
  /** Auto-hide mode: the panel is out only while hovered. */
  readonly autoHide: boolean;
  /** Pointer is over one of the hover targets. */
  readonly peek: boolean;
  /** A menu inside the panel is open, so it must not retract. */
  readonly navHeld: boolean;
  /** Too narrow to push the page aside; the panel becomes an overlay drawer. */
  readonly narrowViewport: boolean;
}

export interface LibraryChrome {
  /** Render the sidebar panel (which carries its own "Library" heading). */
  readonly panelVisible: boolean;
  /** Keep the floating marker in the tree, for its hover handlers. */
  readonly markerMounted: boolean;
  /** Let the floating marker paint. Never true while the panel is visible. */
  readonly markerVisible: boolean;
}

export function libraryChrome({
  autoHide,
  narrowViewport,
  navHeld,
  peek,
  sidebarLocked,
}: LibraryChromeInput): LibraryChrome {
  const panelVisible = sidebarLocked || ((peek || navHeld) && !narrowViewport);
  const markerMounted = autoHide && !sidebarLocked && !narrowViewport;
  return { markerMounted, markerVisible: markerMounted && !panelVisible, panelVisible };
}
