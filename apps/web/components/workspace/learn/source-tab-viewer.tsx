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
// 🔴 ALWAYS ABSOLUTE, NEVER A FLEX SIBLING. At `xl` the canvas shrinks to `calc(100% - 360px)` and
// the pane sits in the gap, which LOOKS like a split without either the canvas or the composer
// having to become flex children. `xl:relative` was tried and is wrong: with no flex parent the
// pane flows as a block and lands at the top-left, full width, above the conversation. Only the
// width and the scrim change across the breakpoint.
//
// 🔴 THE STATE LIVES IN A CONTEXT BECAUSE THE PILLS ARE NOT NEARBY. `CanvasSourcePills` renders
// deep inside `canvas-policy-view`, inside the message list. Threading an `onOpen` callback down
// through the policy view to every claim would touch a dozen components that have no business
// knowing a reading pane exists.

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { LibrarySourceReader } from "@/components/workspace/reader/library-source-reader";
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
    return <LibrarySourceReader className="min-h-0 flex-1" sourceId={tab.librarySourceId} />;
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
  const onScrim = useCallback(() => api?.closeAll(), [api]);
  if (!api || api.state.tabs.length === 0 || !tab) return null;

  return (
    <>
      {/* Below xl the pane floats, so the canvas underneath needs a scrim to read as inactive. */}
      <button
        aria-label="Close sources"
        className="absolute inset-0 z-30 cursor-default bg-black/10 xl:hidden"
        onClick={onScrim}
        type="button"
      />
      <aside
        aria-label="Sources"
        className="absolute inset-y-0 right-0 z-40 flex w-full max-w-[520px] flex-col border-l border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) shadow-[-14px_0_30px_rgba(0,0,0,0.13)] xl:w-[360px] xl:max-w-none xl:shadow-none"
      >
        <TabStrip api={api} />
        <div className="flex min-h-0 flex-1 flex-col">
          <TabBody tab={tab} />
        </div>
      </aside>
    </>
  );
}
