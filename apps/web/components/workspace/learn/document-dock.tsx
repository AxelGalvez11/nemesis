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

import type { CanvasOutput, CanvasSource } from "@/lib/learn/canvas-model";
import type { MindmapNode } from "@/lib/learn/mindmap-tree";
import type { DocumentPill } from "@/lib/learn/source-pill";

/**
 * One thing open in the sidebar.
 *
 * 🔴🔴 DOCUMENTS AND OUTPUTS ARE ONE LIST, WHICH IS THE WHOLE POINT (owner, 2026-09-03: *"i dont
 * want this, documents, lectures, and everything should open in one sidebar"*). They used to be two
 * pieces of state in two components — `docs` here and `openedOutput` in `SourcesControl` — with no
 * knowledge of each other, so opening a study guide while a lecture was open STACKED a second panel
 * over the first. Two rectangles, two tab strips, two headers, on top of each other.
 *
 * 🔴 THE `key` IS PREFIXED BY KIND, NOT BORROWED FROM THE ROW. A `CanvasSource.id` and a
 * `CanvasOutput.id` are both uuids from different tables and nothing stops them colliding; one list
 * keyed on the bare id would let a study guide close a lecture. The prefix makes the two spaces
 * disjoint by construction rather than by luck.
 */
export type DockItem =
  | { readonly key: string; readonly kind: "document"; readonly source: CanvasSource }
  | { readonly key: string; readonly kind: "output"; readonly output: CanvasOutput }
  /**
   * 🔴🔴 THE STUDY THINGS ARE TABS OF THE SAME PANE, AS OF 2026-09-03. Owner: *"I thought we're
   * supposed to have one side panel that's supposed to render anything, it's supposed to have
   * multiple tab views."* A deck, a check and a mind map each had a `StudyPanel` of their own, a
   * fourth fixed rectangle at its own width beside the reader's, so opening a deck over a lecture
   * stacked two panels. They are items in this list now: same strip, same width, one pane.
   */
  | { readonly key: string; readonly kind: "mindmap"; readonly root: MindmapNode; readonly title: string }
  | { readonly key: string; readonly kind: "deck"; readonly deckId: string; readonly title: string }
  | { readonly key: string; readonly kind: "check"; readonly title: string };

export const documentKey = (id: string) => `document:${id}`;
export const outputKey = (id: string) => `output:${id}`;
export const mindmapKey = (label: string) => `mindmap:${label.trim().toLowerCase()}`;
export const deckKey = (id: string) => `deck:${id}`;
/** One check at a time: the run in `session.testRequested` is the only one there is. */
export const CHECK_KEY = "check";

export interface DocumentDock {
  /** Everything open in the sidebar, oldest first. Empty closes it. */
  readonly items: readonly DockItem[];
  /** Which one is in front, by `DockItem.key`. Null closes the sidebar. */
  readonly activeKey: string | null;
  /** The item in front, resolved. Null when nothing is open. */
  readonly active: DockItem | null;
  /**
   * The open DOCUMENTS, and which is in front.
   *
   * 🔴 `activeId` IS NULL WHILE AN OUTPUT IS IN FRONT, AND THAT IS HOW ONE PANEL SHOWS AT A TIME.
   * `SourcePreview` renders nothing without an active document, so an output taking the front
   * silently stands the document panel down — no second rectangle, and the documents stay open
   * and mounted behind it, ready to come back when their tab is pressed.
   */
  readonly open: readonly CanvasSource[];
  readonly activeId: string | null;
  openDocument: (source: CanvasSource) => void;
  openOutput: (output: CanvasOutput) => void;
  /** Open a mind map as a tab. The same map (by its root label) replaces itself rather than doubling. */
  openMindmap: (root: MindmapNode, title: string) => void;
  /** Open a deck as a tab. */
  openDeck: (deckId: string, title: string) => void;
  /** Bring the check to the front as a tab (there is only ever one). */
  openCheck: (title: string) => void;
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
  /** Close one tab, by `DockItem.key`. */
  close: (key: string) => void;
  /** Bring one tab to the front, by `DockItem.key`. */
  select: (key: string) => void;
  closeAll: () => void;
  /**
   * Whether closing put something aside that `reopen` would bring back.
   *
   * 🔴 THIS IS WHAT MAKES THE CORNER TOGGLE A TOGGLE. Owner, 2026-09-03: *"the chat should also
   * show a sidebar icon on the top left if there is a sidebar that can be opened."* A door that
   * always reopens the FIRST document would throw away the learner's place every time they
   * glanced away from lecture nine.
   */
  readonly canReopen: boolean;
  /** Put back exactly what was open when the panel was last closed. */
  reopen: () => void;
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
interface DockState {
  open: DockItem[];
  activeId: string | null;
  /** What was open when the panel was last closed, or null when nothing is put by. */
  shut: { open: DockItem[]; activeId: string | null } | null;
}

/** What to remember when the panel closes — never an empty list, which would arm a door onto
 *  nothing and make the corner toggle appear on a canvas the learner has not opened anything in.
 *
 *  🔴 NOT NAMED `setAside`, WHICH IS THE OBVIOUS NAME AND WAS THE FIRST ONE. `source-preview.test.ts`
 *  bans a `set[A-Z]…(` call inside the `setDocs` updater — the nested-setState defect this file's
 *  header warns about — and a pure helper called `setAside` reads as exactly that to the guard.
 *  Renaming the helper keeps the guard at full strength; loosening its regex would not have. */
function keptAside(current: DockState): DockState["shut"] {
  return current.open.length > 0 ? { activeId: current.activeId, open: current.open } : current.shut;
}

export function useDocumentDockState(sources: readonly CanvasSource[]): DocumentDock {
  /**
   * 🔴 ONE PIECE OF STATE, NOT TWO, AND THAT IS DELIBERATE. Closing the front tab has to choose a
   * new front tab, which means the list and the choice change together. Held apart, that becomes a
   * `setActive` nested inside a `setOpen` updater — a defect this codebase has already paid for
   * once (see `dictation-doubled-every-sentence`), invisible in a diff and impossible to reason
   * about because the updater runs twice under StrictMode.
   */
  const [docs, setDocs] = useState<DockState>({ activeId: null, open: [], shut: null });

  const put = useCallback((item: DockItem) => {
    setDocs((current) => ({
      activeId: item.key,
      // Opening anything at all retires what was set aside: the learner has chosen a new place,
      // and a reopen that jumped somewhere else would be a door with a memory of its own.
      shut: null,
      // Opening something already open brings it forward rather than listing it twice.
      // 🔴 THE STORED ROW IS REPLACED, NOT KEPT. A revision lands in `canvas.outputs` and the object
      // captured when the tab was first opened predates it, so re-opening has to adopt the fresh
      // one — the same rule the output panel already applied when it looked its row up by id.
      open: current.open.some((entry) => entry.key === item.key)
        ? current.open.map((entry) => (entry.key === item.key ? item : entry))
        : [...current.open, item],
    }));
  }, []);

  const openDocument = useCallback(
    (source: CanvasSource) => put({ key: documentKey(source.id), kind: "document", source }),
    [put],
  );
  const openOutput = useCallback(
    (output: CanvasOutput) => put({ key: outputKey(output.id), kind: "output", output }),
    [put],
  );
  const openMindmap = useCallback(
    (root: MindmapNode, title: string) => put({ key: mindmapKey(root.label), kind: "mindmap", root, title }),
    [put],
  );
  const openDeck = useCallback((deckId: string, title: string) => put({ deckId, key: deckKey(deckId), kind: "deck", title }), [put]);
  const openCheck = useCallback((title: string) => put({ key: CHECK_KEY, kind: "check", title }), [put]);

  const close = useCallback((key: string) => {
    setDocs((current) => {
      const open = current.open.filter((entry) => entry.key !== key);
      // Closing the front tab falls back to the most recently opened one still there, not to the
      // first: the learner's attention was at the end of the strip, which is where they put it.
      return {
        activeId: current.activeId === key ? (open[open.length - 1]?.key ?? null) : current.activeId,
        open,
        // Closing the LAST tab is what shuts the panel, so that is the moment worth remembering.
        shut: open.length === 0 ? keptAside(current) : current.shut,
      };
    });
  }, []);

  const select = useCallback((key: string) => setDocs((current) => ({ ...current, activeId: key })), []);
  const closeAll = useCallback(() => setDocs((current) => ({ activeId: null, open: [], shut: keptAside(current) })), []);
  const reopen = useCallback(
    () => setDocs((current) => (current.shut ? { ...current.shut, shut: null } : current)),
    [],
  );

  const openPill = useCallback(
    (pill: DocumentPill) => {
      const found = matchSource(pill, sources);
      if (!found) return false;
      openDocument(found);
      return true;
    },
    [openDocument, sources],
  );

  const active = useMemo(
    () => docs.open.find((entry) => entry.key === docs.activeId) ?? null,
    [docs.activeId, docs.open],
  );

  /**
   * The documents, for the reader that only knows about those.
   *
   * 🔴 EVERY OPEN DOCUMENT, WHATEVER IS IN FRONT. `SourcePreview` keeps each one mounted so that
   * coming back to a PDF does not re-parse it, and that has to survive an output taking the front
   * — otherwise opening a study guide would quietly throw away every lecture's scroll position and
   * rendered pages, which is the cost the owner reported as *"it has to load each pdf
   * continually"*.
   */
  const documents = useMemo(
    () => docs.open.flatMap((entry) => (entry.kind === "document" ? [entry.source] : [])),
    [docs.open],
  );

  return useMemo(
    () => ({
      active,
      // Null while an output is in front: that is what stands the document panel down. See the
      // field's own comment on `DocumentDock`.
      activeId: active?.kind === "document" ? active.source.id : null,
      activeKey: docs.activeId,
      canReopen: (docs.shut?.open.length ?? 0) > 0,
      close,
      closeAll,
      items: docs.open,
      open: documents,
      openCheck,
      openDeck,
      openDocument,
      openMindmap,
      openOutput,
      openPill,
      reopen,
      select,
    }),
    [active, close, closeAll, docs.activeId, docs.open, docs.shut, documents, openCheck, openDeck, openDocument, openMindmap, openOutput, openPill, reopen, select],
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
