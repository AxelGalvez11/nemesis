// Which sources are open in the Canvas reading pane, and which one you are looking at.
//
// 🔴 SESSION ONLY, DELIBERATELY (owner, 2026-08-30). Tabs are not part of `CanvasState` and are
// never written to `canvas_sources`. A canvas reopened next week should show the work, not twelve
// stale tabs someone left open in a different frame of mind. That also means no migration, nothing
// to sync, and no way for this to corrupt a canvas.
//
// 🔴 THE KEY IS THE SAME ONE THE PILLS DE-DUPLICATE BY. `sourcePills` already collapses two
// citations into one pill when a learner would press the same thing; if this file invented its own
// identity the two would disagree and pressing the same pill twice would open two tabs. `tabKey`
// is that rule, exported so both sides read from one definition.
//
// PURE. No React, no I/O. What is open gets decided here; what it looks like is the component's.

import type { SourcePill } from "./source-pill";

/** How many sources may be open at once.
 *
 *  🔴 A CAP, NOT A SCROLLER. Tab strips that overflow become a horizontal scroll nobody finds, and
 *  a source you cannot see the tab for is a source you have lost. Six fits the narrowest pane the
 *  layout allows without truncating past recognition. */
export const MAX_TABS = 6;

/** The only kind of source that opens in the pane.
 *
 *  🔴 A TYPE, NOT A CONVENTION. Owner, 2026-08-30: the pane is for documents; a web citation opens
 *  the page. Narrowing here means a web pill cannot reach `openTab` at all, so the rule cannot be
 *  undone by someone wiring up a call site without reading this file. */
export type DocumentPill = Extract<SourcePill, { kind: "document" }>;

export type SourceTab = {
      key: string;
      kind: "document";
      label: string;
      title: string;
      section: string | null;
      excerpt: string;
      /**
       * The durable `library_sources.id`, when this document was filed.
       *
       * 🔴 NULL IS A REAL AND COMMON STATE, NOT A BUG. `CanvasSource.librarySourceId` is absent for
       * every ephemeral attachment and for anything uploaded before filing existed. Null means the
       * full reader cannot be opened, so the tab shows the cited passage instead — which is exactly
       * what the modal this replaces always did. Treating null as "not yet loaded" and spinning
       * forever is the failure this comment exists to prevent.
       */
      librarySourceId: string | null;
    };

export interface SourceTabState {
  /** Open order, left to right. Stable: activating a tab never reorders the strip. */
  tabs: SourceTab[];
  activeKey: string | null;
}

export const NO_TABS: SourceTabState = { tabs: [], activeKey: null };

/** The identity a learner would recognise. Must match `sourcePills`' own de-duplication. */
export function tabKey(pill: DocumentPill): string {
  return `doc:${pill.label.toLowerCase()}`;
}

function toTab(pill: DocumentPill): SourceTab {
  return {
    key: tabKey(pill),
    kind: "document",
    label: pill.label,
    title: pill.title,
    section: pill.section,
    excerpt: pill.excerpt,
    librarySourceId: pill.librarySourceId,
  };
}

/**
 * Open a source, or focus it when it is already open.
 *
 * 🔴 PRESSING A PILL TWICE MUST NOT OPEN TWO TABS. Citations repeat across an answer, so the same
 * pill is pressed again constantly. Re-opening also REFRESHES the stored tab, because a second
 * citation into the same document usually carries a different excerpt and the newer one is the one
 * the learner just pressed.
 */
export function openTab(state: SourceTabState, pill: DocumentPill): SourceTabState {
  const tab = toTab(pill);
  const at = state.tabs.findIndex((open) => open.key === tab.key);
  if (at >= 0) {
    const tabs = state.tabs.slice();
    tabs[at] = tab;
    return { tabs, activeKey: tab.key };
  }

  const tabs = [...state.tabs, tab];
  if (tabs.length <= MAX_TABS) return { tabs, activeKey: tab.key };

  // 🔴 EVICT THE OLDEST TAB THAT IS NOT THE ONE BEING LOOKED AT. Evicting `tabs[0]` blindly closes
  // the source under the learner's eyes when it happens to be the oldest, which reads as the app
  // losing their place.
  const victim = tabs.find((open) => open.key !== state.activeKey && open.key !== tab.key);
  return {
    tabs: victim ? tabs.filter((open) => open.key !== victim.key) : tabs.slice(1),
    activeKey: tab.key,
  };
}

/**
 * Close one tab.
 *
 * 🔴 CLOSING THE ACTIVE TAB LANDS ON A NEIGHBOUR, NOT ON NOTHING. Falling back to `null` empties
 * the pane and collapses the layout mid-read, so the learner loses the pane as well as the tab.
 * Prefer the tab to the right, the way every tab strip behaves; fall back to the left at the end.
 */
export function closeTab(state: SourceTabState, key: string): SourceTabState {
  const at = state.tabs.findIndex((open) => open.key === key);
  if (at < 0) return state;
  const tabs = state.tabs.filter((open) => open.key !== key);
  if (state.activeKey !== key) return { tabs, activeKey: state.activeKey };
  const next = tabs[at] ?? tabs[at - 1] ?? null;
  return { tabs, activeKey: next ? next.key : null };
}

/** Focus an already-open tab. Unknown keys are ignored rather than clearing the pane. */
export function activateTab(state: SourceTabState, key: string): SourceTabState {
  return state.tabs.some((open) => open.key === key) ? { ...state, activeKey: key } : state;
}

/** The tab being read, if any. */
export function activeTab(state: SourceTabState): SourceTab | null {
  return state.tabs.find((open) => open.key === state.activeKey) ?? null;
}
