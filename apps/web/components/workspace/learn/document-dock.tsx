"use client";

// Which documents are open in the Canvas's docked reader, and which one is in front.
//
// 🔴🔴 THERE IS ONE DOCUMENT READER, AND THIS FILE EXISTS BECAUSE THERE WERE TWO.
// Owner, 2026-09-03: *"clicking on the inline source chip should open documents on the right
// sidebar, NOT this new sidebar"*, and then, of the panel he wanted: *"this is the good sidebar"*.
//
// The Sources panel (`source-preview.tsx`) has been the reader in use since 2026-08-30: tabs, a
// drag handle, every open document kept mounted so switching back does not re-parse the PDF, and
// the comment layer. Pressing a citation chip opened a SECOND reader instead — its own tab strip,
// its own 360px width, its own copy of the passage view — showing the same files with less of
// everything. Two viewers of one thing, and the chip led to the worse one.
//
// So the pane is gone and this is what is left of it: the state it used to hold, moved onto the
// panel that survives. `useOpenSource` still exists and the pills still call it, because the
// plumbing problem it solved is real — `CanvasSourcePills` renders deep inside the policy view,
// far from the header — but what it now opens is the good sidebar.
//
// 🔴 THE STATE MOVED HERE FROM `canvas-controls.tsx`, IT WAS NOT COPIED. `SourcesControl` used to
// own this `useState` privately, which is exactly why the chip could not reach it and why a second
// pane got built instead of a wire. It reads the same object through `useDocumentDock` now, so
// there is one list of open documents no matter which control put a file in it.
//
// 🔴 SESSION ONLY, DELIBERATELY (owner, 2026-08-30, and unchanged by any of this). What is open is
// never written to `canvas_sources`. A canvas reopened next week should show the work, not twelve
// stale tabs someone left open in a different frame of mind.

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import type { CanvasSource } from "@/lib/learn/canvas-model";
import type { DocumentPill } from "@/lib/learn/source-pill";

export interface DocumentDock {
  /** Every document open in the reader, oldest first. Empty closes the panel. */
  readonly open: readonly CanvasSource[];
  /** Which one is in front. Null closes the panel. */
  readonly activeId: string | null;
  openDocument: (source: CanvasSource) => void;
  /**
   * Open the document a citation chip names.
   *
   * 🔴 IT REPORTS WHETHER IT FOUND ONE, AND THE CALLER NEEDS THAT ANSWER. A pill can name a
   * document this canvas never filed — every ephemeral attachment, and anything uploaded before
   * filing existed, carries `librarySourceId: null`. The deleted pane rendered a passage view for
   * that case; the pill has always had its own passage dialog for when there is no pane at all, so
   * returning `false` sends it there rather than opening an empty reader.
   */
  openPill: (pill: DocumentPill) => boolean;
  closeDocument: (id: string) => void;
  select: (id: string) => void;
  closeAll: () => void;
}

const DocumentDockContext = createContext<DocumentDock | null>(null);

/**
 * Owns what is open. Called by the canvas itself, NOT by a wrapper component.
 *
 * 🔴 THE PROVIDER MUST NOT WRAP `LearningCanvas`. `learn-entry.test.ts` requires every branch of
 * the canvas to return a `CanvasSurface`, because `CanvasSurface` is what renders the exit — a
 * branch returning anything else is a canvas a learner can enter and not leave. So the state is
 * made here, in the canvas's own body, and carried down by providers placed INSIDE the surface.
 */
export function useDocumentDockState(sources: readonly CanvasSource[]): DocumentDock {
  /**
   * 🔴 ONE PIECE OF STATE, NOT TWO, AND THAT IS DELIBERATE. Closing the front tab has to choose a
   * new front tab, which means the list and the choice change together. Held apart, that becomes a
   * `setActive` nested inside a `setOpen` updater — a defect this codebase has already paid for
   * once (see `dictation-doubled-every-sentence`), invisible in a diff and impossible to reason
   * about because the updater runs twice under StrictMode.
   */
  const [docs, setDocs] = useState<{ open: CanvasSource[]; activeId: string | null }>({ activeId: null, open: [] });

  const openDocument = useCallback((source: CanvasSource) => {
    setDocs((current) => ({
      activeId: source.id,
      // Opening something already open brings it forward rather than listing it twice.
      open: current.open.some((entry) => entry.id === source.id) ? current.open : [...current.open, source],
    }));
  }, []);

  const closeDocument = useCallback((id: string) => {
    setDocs((current) => {
      const open = current.open.filter((entry) => entry.id !== id);
      // Closing the front tab falls back to the most recently opened one still there, not to the
      // first: the learner's attention was at the end of the strip, which is where they put it.
      return { activeId: current.activeId === id ? (open[open.length - 1]?.id ?? null) : current.activeId, open };
    });
  }, []);

  const select = useCallback((id: string) => setDocs((current) => ({ ...current, activeId: id })), []);
  const closeAll = useCallback(() => setDocs({ activeId: null, open: [] }), []);

  const openPill = useCallback(
    (pill: DocumentPill) => {
      const found = matchSource(pill, sources);
      if (!found) return false;
      openDocument(found);
      return true;
    },
    [openDocument, sources],
  );

  return useMemo(
    () => ({ activeId: docs.activeId, closeAll, closeDocument, open: docs.open, openDocument, openPill, select }),
    [closeAll, closeDocument, docs.activeId, docs.open, openDocument, openPill, select],
  );
}

/**
 * The FILED canvas source a chip names, or null.
 *
 * 🔴 THE FILED ID FIRST, THE TITLE ONLY AS A FALLBACK. `librarySourceId` is the durable
 * `library_sources.id` and is the same value on both sides, so when it is present it is an exact
 * answer. Titles are not unique — two lectures can share a name — so matching on one first would
 * open the wrong file for a learner who has both.
 *
 * 🔴🔴 AND AN UNFILED SOURCE IS NOT A MATCH, WHICH IS THE WHOLE REASON `openPill` REPORTS A MISS.
 * Caught by driving it: a pill for a document with no `librarySourceId` DID dock, and the panel
 * correctly said *"This source wasn't filed to your Library, so the original file isn't kept to
 * view."* — an honest sentence, and less than the learner had a moment earlier. The pill's own
 * passage dialog shows the QUOTED TEXT for exactly this case, which is the more useful of the two
 * true answers. So the title fallback is narrowed to sources that have a file behind them, and
 * everything else falls through to the passage.
 */
function matchSource(pill: DocumentPill, sources: readonly CanvasSource[]): CanvasSource | null {
  if (pill.librarySourceId) {
    const filed = sources.find((source) => source.librarySourceId === pill.librarySourceId);
    if (filed) return filed;
  }
  return (
    sources.find(
      (source) => Boolean(source.librarySourceId) && (source.title === pill.title || source.title === pill.label),
    ) ?? null
  );
}

export function DocumentDockProvider({ value, children }: { value: DocumentDock; children: React.ReactNode }) {
  return <DocumentDockContext.Provider value={value}>{children}</DocumentDockContext.Provider>;
}

/**
 * The dock, or a private one when there is no provider.
 *
 * 🔴 THE LOCAL FALLBACK IS FOR THE PREVIEW HARNESS AND NOTHING ELSE. `/dev-preview/sources-panel`
 * mounts `SourcesControl` on its own, with no canvas around it, and a hook cannot be called
 * conditionally — so the local state is always made and simply goes unused inside a real canvas.
 * It is NOT a second owner: whenever a provider exists, the provider's object is what is returned,
 * so a chip and the header control can never be looking at different lists.
 */
export function useDocumentDock(): DocumentDock {
  const provided = useContext(DocumentDockContext);
  const local = useDocumentDockState(NO_SOURCES);
  return provided ?? local;
}

/** Stable identity, so the fallback hook's memo does not churn every render. */
const NO_SOURCES: readonly CanvasSource[] = [];

/**
 * For the pills. Returns null outside a provider, which is how a pill knows to fall back to its own
 * passage dialog rather than render a control that does nothing.
 */
export function useOpenSource(): ((pill: DocumentPill) => boolean) | null {
  const dock = useContext(DocumentDockContext);
  return useMemo(() => (dock ? dock.openPill : null), [dock]);
}
