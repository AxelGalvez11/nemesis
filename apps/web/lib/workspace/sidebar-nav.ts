// The workspace destinations, in one place, because two components now draw them.
//
// 🔴 EXTRACTED THE DAY A SECOND RENDERER APPEARED. `SIDEBAR_NAV` lived inside `chat-sidebar.tsx`
// and was correct there while that file was the only thing that drew it. The collapsed rail draws
// the same four destinations as icons, and a copied array is a guarantee that one day the rail and
// the expanded sidebar disagree about where the product can go — silently, because each looks
// right on its own. One array, two renderers.
//
// It lives under lib/ rather than next to the sidebar so the rail does not have to import a large
// client component (and everything that component imports) to learn four strings.
//
// The reasoning for WHICH destinations these are, and the several models that were tried and
// discarded, stays in `chat-sidebar.tsx` where the rows are laid out. In short (owner 2026-08-13,
// §L): the sidebar represents DESTINATIONS, never content, so it is almost static by design —
// "eventually the sidebar becomes a giant chronological dump. Nemesis users aren't primarily
// trying to recover a conversation from three weeks ago. They're managing BODIES OF KNOWLEDGE."

export interface NavItem {
  readonly id: string;
  readonly label: string;
  /** Name of the @vscode/codicons glyph, without the `codicon-` prefix. */
  readonly codicon: string;
  readonly route?: string;
}

export const SIDEBAR_NAV: readonly NavItem[] = [
  // The front door. `/learn` IS the minimal composer — "What do you want to learn?" with upload,
  // record and dictate — and the canvas is created automatically once the learner starts, landing
  // in `Unfiled` for them to file later. It is deliberately not a "new session" action: nothing is
  // created by pressing this, only by beginning.
  { id: "new-canvas", label: "New canvas", codicon: "add", route: "/learn" },
  { id: "library", label: "Library", codicon: "library", route: "/library" },
  // A project IS a folder holding canvases — the same `folders` row the sidebar groups under
  // "Projects" and the Library filters by. The page is a place to see them all at once; the
  // sidebar group stays the place to jump into one. Named after the reference's destination
  // because the owner asked for the reference's shape, and "folder" is what the object is
  // called everywhere else in this codebase, so the page does not rename it.
  { id: "projects", label: "Projects", codicon: "folder", route: "/projects" },
  // Where connected apps live. The Composio door already existed (`/api/composio`) with its only
  // surface a card buried in Settings; this promotes it to a destination.
  // 🔴 `extensions` (the puzzle piece), BY THE OWNER'S OWN PICK — 2026-08-30, from a fitting page
  // that drew four candidates on the real row; the plug was offered and passed over, the same day
  // it was retired from the composer's apps control (#915). Do not bring the plug back here.
  { id: "plugins", label: "Plugins", codicon: "extensions", route: "/plugins" },
  { id: "calendar", label: "Calendar", codicon: "calendar", route: "/calendar" },
];

/** Dev-preview mounts the whole workspace under a prefix; a rail row must not navigate out of it. */
export function navigationRootFor(pathname: string): string {
  return pathname.startsWith("/dev-preview/workspace/") ? "/dev-preview/workspace" : "";
}

/** Whether a destination is the surface currently on screen. */
export function navItemActive(pathname: string, destination: string | null): boolean {
  if (!destination) return false;
  return pathname === destination || pathname.startsWith(`${destination}/`);
}

/**
 * How big a navigation icon is drawn, in BOTH sidebar states.
 *
 * 🔴 ONE NUMBER BECAUSE THE TWO STATES HAD DRIFTED APART AND THE LEARNER COULD SEE IT (owner,
 * 2026-08-14: "there is a difference in size for icons when sidebar is collapsed and not
 * collapsed"). The rail drew its glyphs at 20px. The expanded sidebar drew the SAME glyphs at
 * `1em` inside a `size-4` box — and a codicon is a FONT, so `1em` resolved against the row's own
 * `--canvas-text-small`, which is 14px. Collapsing the sidebar made every icon jump by six
 * pixels, and nothing in either file said the two were meant to agree.
 *
 * 🔴 AND `em` IS BANNED FOR AN ICON, NOT JUST WRONG HERE. Tying a glyph to the label beside it
 * means any future change to the type scale silently resizes every icon in the product — a
 * typographic decision quietly becoming an iconographic one. Measured against the reference at
 * the owner's request: its sidebar icons are 20x20 in both states, sitting next to 14px labels,
 * and the icon does not shrink with the text.
 */
export const NAV_ICON_PX = 20;
