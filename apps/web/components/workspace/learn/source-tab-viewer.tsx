"use client";

// The Canvas reading pane: several sources open at once, one on screen.
//
// 🔴 DOCUMENTS ONLY. A web citation opens the page in the browser and never comes in here (owner,
// 2026-08-30). `DocumentPill` is what `open` accepts, so that is enforced by the compiler rather
// than by everyone remembering.
//
// 🔴 WHY A PANE AND NOT THE MODAL IT REPLACES. Pressing a document pill used to open a 560px
// centred dialog showing the cited passage and nothing else — you could read the passage or the
// answer, never both, which is the one thing a citation exists to let you do. Owner picked the
// split layout on 2026-08-30 after seeing all three.
//
// 🔴🔴 IT IS THE SAME DOCKED PANEL AS THE OTHER THREE NOW, AND IT WAS THE ONLY ONE THAT WAS NOT.
// Owner, 2026-09-03: *"i noticed you created a new sidebar panel? what happened to the ones we
// already had? we need the sidebar like in chatgpt."*
//
// `output-preview`, `study-panel` and `source-preview` all dock through `useDockWidth` +
// `useDeclareSidePanel`: the learner drags the edge, the fraction persists, the canvas is PUSHED
// rather than covered, the sidebar collapses to its rail, and everything moves on the one
// `--pane-slide` clock. This pane instead sat at a hardcoded `360px` with its own scrim and its own
// inset computed by hand in `learning-canvas.tsx` — so pressing a citation opened a reader that
// behaved like nothing else in the product.
//
// The width is what gave it away. Measured in the owner's own browser: his stored reader fraction
// is 0.644, so the header's Sources panel opens at 947px on his 1470px window — near enough
// ChatGPT's own 970px document reader. The citation pane opened the SAME documents at 360px, which
// renders a US Letter page (816px at 100%) into a 330px column. Two viewers of one thing, one of
// them a third the size, is what "what happened to the ones we already had" was pointing at.
//
// 🔴 SHARING THE `reader` SLOT IS THE POINT, NOT AN ECONOMY. Both surfaces show a library document
// against the conversation, so they are one preference: drag either and the other follows, because
// the fraction is stored under one key. A second slot would have been a second thing to set.
//
// 🔴 THE STATE LIVES IN A CONTEXT BECAUSE THE PILLS ARE NOT NEARBY. `CanvasSourcePills` renders
// deep inside `canvas-policy-view`, inside the message list. Threading an `onOpen` callback down
// through the policy view to every claim would touch a dozen components that have no business
// knowing a reading pane exists.

import { createContext, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { LibrarySourceReader } from "@/components/workspace/reader/library-source-reader";
import { useDeclareSidePanel } from "@/components/workspace/shell/side-panel";
import { useDockWidth } from "./use-dock-width";
import { cn } from "@/lib/utils";
import {
  NO_TABS,
  activeTab,
  closeTab as closeTabIn,
  activateTab as focusTabIn,
  openTab as openTabIn,
  type DocumentPill,
  type SourceTab,
  type SourceTabState,
} from "@/lib/learn/source-tabs";

interface SourceTabsApi {
  state: SourceTabState;
  open: (pill: DocumentPill) => void;
  focus: (key: string) => void;
  close: (key: string) => void;
  closeAll: () => void;
}

const SourceTabsContext = createContext<SourceTabsApi | null>(null);

/**
 * Owns the open tabs. Called by the canvas itself, NOT by a wrapper component.
 *
 * 🔴 THE PROVIDER USED TO OWN THIS AND WRAP `LearningCanvas`, AND THAT BROKE A REAL GUARD.
 * `learn-entry.test.ts` requires every branch of the canvas to return a `CanvasSurface`, because
 * `CanvasSurface` is what renders the exit — a branch returning anything else is a canvas a learner
 * can enter and not leave. A provider wrapped around the outside made `LearningCanvas` return
 * `<SourceTabsProvider>`, so the state moved here and the provider became a plain value carrier
 * that lives INSIDE the surface.
 */
export function useSourceTabsState(): SourceTabsApi {
  const [state, setState] = useState<SourceTabState>(NO_TABS);
  return useMemo<SourceTabsApi>(
    () => ({
      state,
      open: (pill) => setState((s) => openTabIn(s, pill)),
      focus: (key) => setState((s) => focusTabIn(s, key)),
      close: (key) => setState((s) => closeTabIn(s, key)),
      closeAll: () => setState(NO_TABS),
    }),
    [state],
  );
}

export function SourceTabsProvider({
  value,
  children,
}: {
  value: SourceTabsApi;
  children: React.ReactNode;
}) {
  return <SourceTabsContext.Provider value={value}>{children}</SourceTabsContext.Provider>;
}

/** For the pills. Returns null outside a provider, which is how the pill knows to fall back to its
 *  own preview rather than render a control that does nothing. */
export function useOpenSource(): ((pill: DocumentPill) => void) | null {
  const api = useContext(SourceTabsContext);
  return useMemo(() => (api ? api.open : null), [api]);
}

/** For the pane itself. */
export function useSourceTabs(): SourceTabsApi | null {
  return useContext(SourceTabsContext);
}

function TabStrip({ api }: { api: SourceTabsApi }) {
  const { state } = api;
  return (
    // 🔴 `pr-[56px]`: THE CANVAS EXIT `×` FLOATS AT z-30 OVER THIS CORNER. Without the reserve the
    // last tab's close control sits underneath it and the wrong thing closes.
    <div
      className="flex shrink-0 items-stretch overflow-x-auto border-b border-(--ui-stroke-tertiary) bg-(--ui-bg-secondary) pr-[56px]"
      role="tablist"
    >
      {state.tabs.map((tab) => {
        const on = tab.key === state.activeKey;
        return (
          <div
            className={`group flex min-w-0 shrink-0 items-center gap-1 border-r border-(--ui-stroke-tertiary) ${
              on ? "bg-(--ui-bg-elevated) shadow-[inset_0_-2px_0_var(--acid)]" : ""
            }`}
            key={tab.key}
          >
            <button
              aria-selected={on}
              className={`max-w-[150px] truncate py-2 pl-3 text-[length:var(--canvas-text-meta)] transition-colors ${
                on ? "text-(--ui-text-primary)" : "text-(--ui-text-tertiary) hover:text-(--ui-text-primary)"
              }`}
              onClick={() => api.focus(tab.key)}
              role="tab"
              title={tab.title}
              type="button"
            >
              {tab.label}
            </button>
            <button
              aria-label={`Close ${tab.label}`}
              className="mr-1.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-(--ui-text-tertiary) opacity-0 transition-opacity hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) focus-visible:opacity-100 group-hover:opacity-100"
              onClick={() => api.close(tab.key)}
              type="button"
            >
              <svg fill="none" height="9" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 16 16" width="9">
                <path d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5" />
              </svg>
            </button>
          </div>
        );
      })}

    </div>
  );
}

/** The passage we actually read, for anything with no filed document behind it. */
function PassageView({ tab }: { tab: SourceTab }) {
  const excerpt = tab.excerpt.trim();
  return (
    <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4">
      <div>
        <h3 className="text-[length:var(--canvas-text-body)] font-medium text-(--ui-text-primary)">{tab.label}</h3>
        {tab.section && (
          <p className="mt-0.5 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">{tab.section}</p>
        )}
      </div>
      {excerpt ? (
        <blockquote className="border-l-2 border-(--acid) pl-3 text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-secondary)">
          {excerpt}
        </blockquote>
      ) : (
        // 🔴 SAYS SO RATHER THAN SHOWING AN EMPTY BOX. An excerpt lost to a reparse still names a
        // real document; the pill stays pressable and this explains the gap.
        <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
          The quoted passage was lost when this document was re-read. The source is still cited.
        </p>
      )}
      {tab.librarySourceId === null && (
        <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
          This document was read for this canvas but not filed, so there is no full copy to open.
        </p>
      )}
    </div>
  );
}

function TabBody({ tab }: { tab: SourceTab }) {
  // A filed source has a real document behind it, so show the real reader.
  if (tab.librarySourceId) {
    return <LibrarySourceReader className="min-h-0 flex-1" dense sourceId={tab.librarySourceId} />;
  }
  return <PassageView tab={tab} />;
}

/**
 * The pane. Renders nothing at all when no source is open, so the canvas keeps its full width
 * until a learner actually presses a citation.
 */
export function SourceTabPane() {
  const api = useSourceTabs();
  const tab = api ? activeTab(api.state) : null;
  const { dragging, onDragStart, width } = useDockWidth();
  const open = Boolean(api && api.state.tabs.length > 0 && tab);

  // 🔴 BEFORE THE EARLY RETURN, AND ZERO IS HOW IT SAYS "CLOSED". Both halves are load-bearing:
  // a hook cannot sit behind a condition, and `panes-share-one-clock.test.ts` records at length
  // what happened when a closed panel claimed a 0 inset as a real dock — `sidebarVisible` went
  // false the moment a canvas rendered and the rail's Expand button did nothing, for ever.
  useDeclareSidePanel(open ? width : 0, dragging);

  if (!api || !tab || !open) return null;

  // 🔴 PORTALLED AND `fixed`, THE SHAPE THE OTHER THREE PANES USE. It used to be `absolute` inside
  // the canvas with a scrim below `xl`, which is what a panel that COVERS needs. This one pushes,
  // so there is nothing to dim: the conversation stays live beside it, which is the entire reason
  // a citation opens a pane rather than the modal it replaced.
  return createPortal(
    <aside
      aria-label="Sources"
      // `reader-dock-in` is the shared entrance on `--pane-slide`. Unconditional: gating it on
      // `!dragging` is what made the panel replay its slide on every drag release.
      className="reader-dock-in fixed inset-y-0 right-0 z-50 flex flex-col border-l border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated)"
      data-workspace
      style={{ width }}
    >
      {/* The grip sits on the left edge, the edge that moves — 6px, `col-resize`, no paint until
          hover. Identical to the Sources panel's, because it is the same gesture. */}
      <div
        aria-label="Resize the panel"
        className="absolute inset-y-0 -left-[3px] z-10 w-[6px] cursor-col-resize bg-transparent transition-colors hover:bg-(--ui-action)/40"
        onPointerDown={onDragStart}
        role="separator"
      />
      <TabStrip api={api} />
      {/* 🔴🔴 EVERY OPEN TAB STAYS MOUNTED; ONLY THE FRONT ONE IS SHOWN. Rendering just the active
          tab meant switching back to a document UNMOUNTED the reader and mounted a fresh one, so
          the file was fetched, re-parsed by pdf.js and re-rendered from page one every single
          time — with the scroll position, the zoom and the search lost with it. The owner called
          it out on 2026-09-01: *"slow (it has to load each pdf continually)"*.

          🔴 IT IS BOUNDED BY `MAX_TABS`, WHICH IS WHY THIS IS AFFORDABLE. `openTab` already
          evicts past six, so the worst case is six mounted readers rather than an unbounded
          pile — the reason the original chose one was memory, and the cap already answers it.
          `hidden` rather than unmounting keeps pdf.js's rendered canvases alive, which is the
          whole cost being avoided. */}
      {api.state.tabs.map((openTab) => (
        <div
          aria-hidden={openTab.key !== tab.key}
          className={cn("min-h-0 flex-1 flex-col", openTab.key === tab.key ? "flex" : "hidden")}
          key={openTab.key}
        >
          <TabBody tab={openTab} />
        </div>
      ))}
    </aside>,
    document.body,
  );
}
