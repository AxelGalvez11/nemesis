// Sidebar open/closed state that survives a trip through a narrow viewport.
//
// "Open" means two different things by width. On a wide window it is a standing
// layout preference; on a narrow one it is a transient overlay that a backdrop
// tap or a navigation dismisses. Storing both in a single flag is what made an
// auto-collapse permanent: the narrow-viewport effect could only ever set the
// flag false, so a window that was briefly narrow (or a pane that mounted small
// and then grew) left the sidebar collapsed with no way back except a manual
// click. Keeping the two meanings apart lets a widen restore whatever the user
// last chose at that width — including a deliberate collapse.

export interface SidebarState {
  /** Standing preference for wide viewports. */
  readonly wideOpen: boolean;
  /** Transient overlay state for narrow viewports. */
  readonly narrowOpen: boolean;
}

export const INITIAL_SIDEBAR_STATE: SidebarState = { narrowOpen: false, wideOpen: true };

/** Whether the sidebar shows at the current width. */
export function isSidebarOpen(state: SidebarState, narrowViewport: boolean): boolean {
  return narrowViewport ? state.narrowOpen : state.wideOpen;
}

/** Records an open/close at the current width, leaving the other width alone. */
export function withSidebarOpen(state: SidebarState, narrowViewport: boolean, open: boolean): SidebarState {
  return narrowViewport ? { ...state, narrowOpen: open } : { ...state, wideOpen: open };
}

/**
 * Entering a narrow viewport dismisses the overlay so it never appears
 * unbidden (e.g. rotating a phone back to portrait). The wide preference is
 * untouched, which is the whole point — that is the bug this module fixes.
 */
export function onNarrowViewport(state: SidebarState): SidebarState {
  return { ...state, narrowOpen: false };
}

// Persistence codec for the WIDE preference only. The narrow overlay is
// transient by design and must never be restored. Explicit sentinels rather
// than "true"/"false": commit 327436e5's library-full-screen bug came from a
// `!== "false"` read where an unset key silently meant the wrong default.

/** Parses a stored wide-viewport preference; null = nothing usable stored. */
export function parseStoredSidebar(value: string | null): boolean | null {
  if (value === "open") return true;
  if (value === "closed") return false;
  return null;
}

/** Applies a stored preference to the wide side of the state, if there is one. */
export function withStoredSidebar(state: SidebarState, stored: string | null): SidebarState {
  const wideOpen = parseStoredSidebar(stored);
  return wideOpen === null ? state : { ...state, wideOpen };
}

export function encodeSidebarPreference(open: boolean): "open" | "closed" {
  return open ? "open" : "closed";
}
