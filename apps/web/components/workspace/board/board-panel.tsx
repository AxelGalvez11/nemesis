"use client";

// The board's reading panel: documents open on the right, several at once, and annotatable.
//
// Owner, 2026-09-04: *"i still want the right sidebar panel to work too where i can view many tabs
// of the sources and also annotate any document to have an inline chat with the annotation"* — and,
// of the annotation conversation, *"preferably in the style of the canvas chats"*.
//
// 🔴🔴 NOTHING HERE IS A SECOND READER, A SECOND TAB STRIP OR A SECOND ANNOTATE LAYER, and that is
// the whole design of this file. The chat has all three and they are good; what the board was
// missing was a place to mount them. So:
//
//   which documents are open   `useDocumentDockState` (learn/document-dock.tsx) — the same state
//                              object the chat's panel uses, with the same rules about what closing
//                              the front tab falls back to.
//   the strip                  `DockTabs`, unchanged.
//   the chrome and the width   `CHROME` + `useDockWidth` (learn/reader-chrome.ts) — the measured
//                              header both of the chat's docked panels already wear.
//   the document               `DocumentReader`, which opens every format the product supports.
//                              There is no per-type rendering in this file and there must not be.
//   the annotation             `CommentLayer`, through the reader, in its `card` look.
//
// 🔴 WHAT IS GENUINELY NEW IS WHERE THE NOTES LIVE. The chat keys its comments to the durable
// `library_sources.id`; most board sources have no such id, because a file dropped on a board is
// read for its text and need never be filed. So the board hands the reader a store that writes into
// the board's own JSON document (`board-annotation-store.ts`), and reopening /canvas/<id> brings
// the pins back because the board itself came back.
//
// 🔴🔴 THE BOARD IS PUSHED, NOT COVERED. `useDeclareSidePanel` publishes the width, `BoardPage`
// narrows itself by it, and `[data-board]` narrows with it — so `measureBoardArea()` needs no
// knowledge of this panel at all: it measures the board element, and the board element is smaller.
// A floating panel would hide the cards the learner opened the document from.
//
// 🔴 NO "SEND TO NEMESIS" BUTTON ON A BOARD ANNOTATION, DELIBERATELY. The reader offers it only
// when it is given `onSendToChat`, and the board's `sendRootMessage` takes text and nothing else —
// so a marked region's cut-out could not travel. `commentAskPrompt` would then have to either claim
// a picture that is not there (the exact defect `mark-an-area.test.ts` exists to stop) or describe
// coordinates the model cannot see. Absent, not inert: the conversation happens in the card, which
// is what was asked for.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "@/components/AuthProvider";
import { Codicon } from "@/components/desktop-ui/codicon";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { DockTabs } from "@/components/workspace/learn/dock-tabs";
import {
  DocumentDockProvider,
  documentKey,
  outputKey,
  useDocumentDock,
  useDocumentDockState,
  type DockItem,
  type DocumentDock,
} from "@/components/workspace/learn/document-dock";
import { CHROME } from "@/components/workspace/learn/reader-chrome";
import { useDockWidth } from "@/components/workspace/learn/use-dock-width";
import { DocumentReader } from "@/components/workspace/reader/document-reader";
import { useDeclareSidePanel } from "@/components/workspace/shell/side-panel";
import { openAnnotationCount, type BoardAnnotation } from "@/lib/board/board-annotations";
import type { BoardSource } from "@/lib/board/board-model";
import { buildExcerpts } from "@/lib/learn/canvas-grounding";
import type { CanvasSource } from "@/lib/learn/canvas-model";
import type { ReaderSource } from "@/lib/reader/reader-source";
import { cn } from "@/lib/utils";
import { loadLibrarySource } from "@/lib/workspace/library-sources";

import { boardAnnotationStore } from "./board-annotation-store";
import { useBoard } from "./board-provider";
import { boardReaderSource, filedIdOf, filedReaderSource, isExtractedText } from "./board-reader-source";

/**
 * A board source as the dock understands it.
 *
 * 🔴🔴 `grounded` FIRST, ALWAYS. That field IS the chat-shaped view of this document — the excerpts
 * the ingestion lane built from the persisted parse, and the durable `library_sources.id` — and
 * rebuilding it here from the flattened text would be a second opinion about what this document's
 * citable pieces are, free to disagree with the one the answers already cite. `buildExcerpts` is
 * the fallback for a source dropped before grounding existed, which has only its text.
 */
export function dockSourceFor(source: BoardSource): CanvasSource {
  if (source.grounded) return source.grounded;
  return {
    excerpts: buildExcerpts(source.id, source.content),
    id: source.id,
    kind: source.type,
    title: source.name,
  };
}

/**
 * The dock's state, the panel, and the room the panel takes.
 *
 * 🔴 IT WRAPS THE BOARD RATHER THAN SITTING BESIDE IT, because the thing that opens a document is a
 * source card drawn deep inside `BoardSurface`. That is the same plumbing problem `document-dock.tsx`
 * was extracted to solve for the chat's citation chips, and the same answer: one list of open
 * documents, reachable from wherever the press happened.
 */
export function BoardDock({ children, openSourceId }: { children: ReactNode; openSourceId?: string }) {
  const { closeOutput, openedOutput, sources } = useBoard();
  // 🔴 ONLY SOURCES WITH SOMETHING TO SHOW. A file still being read has no text and no picture; a
  // tab onto it would be an empty panel the learner has to close.
  const readable = useMemo(
    () => sources.filter((source) => source.status === "ready").map(dockSourceFor),
    [sources],
  );
  const base = useDocumentDockState(readable);

  /**
   * A deliverable the learner opened becomes a TAB of this dock.
   *
   * 🔴🔴 ONE PANEL, NOT TWO ON THE SAME EDGE. The board's deliverables shipped with their own
   * `openedOutput` state and their own `OutputPreview`, which was right while a made page was the
   * only thing the board could open. With documents opening on that edge too, two panels at the
   * same width would stack — the exact failure `document-dock.tsx` was extracted to end for the
   * chat, and the owner has now reported it twice in that lane. The provider still owns which
   * deliverable was pressed; the dock owns what is on screen.
   */
  const { openOutput } = base;
  useEffect(() => {
    if (openedOutput) openOutput(openedOutput);
  }, [openOutput, openedOutput]);

  /**
   * 🔴 CLOSING THE OUTPUT'S TAB HAS TO CLEAR THE PROVIDER TOO, or the effect above re-opens it on
   * the very next render and the tab cannot be closed at all. Wrapping the two closing doors is the
   * whole of the coupling: everything else on the dock is untouched.
   */
  const { close, closeAll } = base;
  const dock = useMemo<DocumentDock>(
    () => ({
      ...base,
      close: (key: string) => {
        if (openedOutput && key === outputKey(openedOutput.id)) closeOutput();
        close(key);
      },
      closeAll: () => {
        closeOutput();
        closeAll();
      },
    }),
    [base, close, closeAll, closeOutput, openedOutput],
  );

  // 🔴 DEV-PREVIEW SEAM, AND IT FIRES ONCE. What is open is session state on purpose (a canvas
  // reopened next week should show the work, not twelve stale tabs), so nothing in the real product
  // opens a document by itself; the preview harness needs the panel on screen to be reviewable.
  const opened = useRef(false);
  const { openDocument } = base;
  useEffect(() => {
    if (opened.current || !openSourceId) return;
    const source = sources.find((item) => item.id === openSourceId && item.status === "ready");
    if (!source) return;
    opened.current = true;
    openDocument(dockSourceFor(source));
  }, [openDocument, openSourceId, sources]);

  return (
    <DocumentDockProvider value={dock}>
      {children}
      <BoardPanel dock={dock} />
    </DocumentDockProvider>
  );
}

/**
 * How many open documents render at once.
 *
 * 🔴 THREE, THE SAME TRUCE THE CHAT'S PANEL MADE AND FOR THE SAME MEASURED REASONS: rendering only
 * the front tab remounts (and re-parses) a document on every switch, and rendering all of them puts
 * a full-size slide's ~20MB into memory per background deck. Three keeps flipping between two or
 * three documents instant and bounds the worst case at about what one deck already costs.
 */
const MOUNT_LIMIT = 3;

type PanelState =
  | { readonly kind: "loading" }
  | { readonly kind: "unavailable"; readonly reason: string }
  | { readonly kind: "ready"; readonly source: ReaderSource; readonly extracted: boolean };

function BoardPanel({ dock }: { dock: DocumentDock }) {
  const { annotations, sources, updateAnnotations } = useBoard();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  // 🔴 THE HARNESS MAKES NO NETWORK CALLS — the same trap `source-preview.tsx` fell into: the dev
  // preview signs a mock session, so `uid` is set, so a library lookup went to the database, found
  // nothing under a fixture id, and the one screen this panel is reviewed on showed an error.
  const preview = useWorkspacePreview() !== null;
  const { dragging, onDragStart, width } = useDockWidth();
  const [full, setFull] = useState(false);
  const [states, setStates] = useState<Readonly<Record<string, PanelState>>>({});
  /** Most recently looked at first. Only these are mounted. */
  const [recent, setRecent] = useState<readonly string[]>([]);
  /** The page each open document was last on, so a tab comes back where it was left. */
  const [lastUnit, setLastUnit] = useState<Readonly<Record<string, number>>>({});
  /** Where the front reader draws its own controls. See the header below. */
  const toolbarSlot = useRef<HTMLDivElement | null>(null);

  const activeId = dock.activeId;
  useEffect(() => {
    if (!activeId) return;
    setRecent((current) => [activeId, ...current.filter((id) => id !== activeId)].slice(0, MOUNT_LIMIT));
  }, [activeId]);

  const mounted = useMemo(() => new Set(recent.slice(0, MOUNT_LIMIT)), [recent]);
  const openIds = dock.open
    .filter((source) => mounted.has(source.id))
    .map((source) => source.id)
    .join(",");

  // 🔴 RESOLVED ONCE PER DOCUMENT, AND ONLY FOR WHAT IS MOUNTED. Keyed on the ids so opening a new
  // tab does not re-resolve the ones already open, which is the cost keeping them mounted exists
  // to remove.
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  useEffect(() => {
    let live = true;
    for (const id of openIds ? openIds.split(",") : []) {
      if (states[id]) continue;
      const board = sourcesRef.current.find((source) => source.id === id);
      if (!board) continue;
      const put = (next: PanelState) => {
        if (live) setStates((current) => ({ ...current, [id]: next }));
      };
      put({ kind: "loading" });
      const extracted = isExtractedText(board);
      const filed = filedIdOf(board);
      void (async () => {
        // The ORIGINAL file first, whenever the board source names one: real pages, real slides,
        // and regions you can genuinely cut a picture out of.
        if (filed) {
          const row = await loadLibrarySource(uid, filed, { preview });
          if (row) {
            put({ extracted: false, kind: "ready", source: filedReaderSource(row) });
            return;
          }
        }
        const reader = boardReaderSource(board);
        if (!reader) {
          put({
            kind: "unavailable",
            reason: "Nemesis could not read any text out of this source, so there is nothing to show here yet.",
          });
          return;
        }
        put({ extracted, kind: "ready", source: reader });
      })();
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by which documents are mounted
  }, [openIds, preview, uid]);

  /**
   * Escape closes, the same as every transient surface on the board.
   *
   * 🔴🔴 UNLESS AN ANNOTATION IS OPEN, AND THAT EXCEPTION WAS FOUND ON SCREEN. The annotation card
   * and the note box both close on Escape too, and both listen on `document` — so one press ran
   * both handlers and the panel went with the card. Watched live on /dev-preview/board: pressing
   * Escape to dismiss a thread threw away every open tab. Escape has to peel one layer at a time,
   * or the innermost thing is impossible to dismiss without losing the outermost.
   *
   * 🔴 ASKED OF THE DOM, NOT TRACKED IN STATE. The draft and the open thread belong to
   * `CommentLayer`, three components down inside a reader this panel deliberately knows nothing
   * about; lifting either up here to answer one keystroke would be a copy of state that can go
   * stale. The card is a portal with a stable test id, so its presence IS the fact.
   */
  const close = dock.closeAll;
  useEffect(() => {
    if (dock.items.length === 0) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector('[data-testid="reader-comment-thread"], [data-testid="reader-comment-note"]')) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close, dock.items.length]);

  const rememberUnit = useCallback(
    (id: string, unit: number) =>
      setLastUnit((current) => (current[id] === unit ? current : { ...current, [id]: unit })),
    [],
  );

  /**
   * One store per open document, over the LIVE annotation list.
   *
   * 🔴 THE READ IS A FUNCTION, NOT A CAPTURED ARRAY. A store built from this render's `annotations`
   * would answer with them for as long as the reader held it, so the second note of a session would
   * be written on top of the first.
   */
  const annotationsRef = useRef<readonly BoardAnnotation[]>(annotations);
  annotationsRef.current = annotations;
  const storeFor = useCallback(
    (sourceId: string) => boardAnnotationStore(sourceId, () => annotationsRef.current, updateAnnotations),
    [updateAnnotations],
  );

  /**
   * Whether THIS body is the one showing.
   *
   * 🔴🔴 A DOCUMENT IN FRONT, NOT MERELY A TAB OPEN, AND THAT IS HOW ONE PANEL SHOWS AT A TIME.
   * `DocumentDock.activeId` is null while a deliverable is in front (its own comment says so), so a
   * made page taking the front stands this panel down while every open document stays mounted
   * behind it, ready to come back when its tab is pressed. Reading `items.length` here instead
   * would draw both bodies over each other, which is the stacking the one dock exists to end.
   */
  const showing = activeId !== null;
  // 🔴 THE BOARD IS PUSHED, NOT COVERED — `BoardArea` reads this back through `useSidePanelInset`.
  // Zero while closed and zero while full screen, which is what `useDeclareSidePanel` requires:
  // a zero inset is a release, never a claim on nothing (its own comment says why at length).
  useDeclareSidePanel(showing && !full ? width : 0, dragging);

  const badgeFor = useCallback(
    (item: DockItem) =>
      item.kind === "document" ? openAnnotationCount(annotationsRef.current, item.source.id) : 0,
    [],
  );

  if (!showing || typeof document === "undefined") return null;

  const activeState = activeId ? states[activeId] : undefined;
  const activeTitle = dock.active?.kind === "document" ? dock.active.source.title : "";

  return createPortal(
    // 🔴 THE `data-workspace` STAMP TRAVELS WITH THE PORTAL. `globals.css` paints every button
    // outside that scope acid green, so a subtree moved to `document.body` loses its whole palette.
    <div
      className={cn(
        "reader-dock-in fixed z-50 flex flex-col bg-(--ui-bg-elevated)",
        full ? "inset-0" : "inset-y-0 right-0 border-l border-(--ui-stroke-tertiary)",
      )}
      data-board-panel=""
      data-workspace
      role="dialog"
      style={full ? undefined : { width }}
    >
      {/* The grip is on the left edge, which is the edge that moves. Only while docked. */}
      {!full && (
        <div
          aria-label="Resize the panel"
          className="absolute inset-y-0 -left-[3px] z-10 w-[6px] cursor-col-resize bg-transparent transition-colors hover:bg-(--ui-action)/40"
          onPointerDown={onDragStart}
          role="separator"
        />
      )}

      {/* 🔴 TABS GET THEIR OWN ROW. Row one is nothing but what is open; row two carries the
          document's name and the controls. Sharing one row is the arrangement the owner reversed
          the same day it shipped — see dock-tabs.tsx for the whole story. */}
      <DockTabs
        activeKey={dock.activeKey}
        badgeFor={badgeFor}
        items={dock.items}
        onClose={dock.close}
        onSelect={dock.select}
      />

      <div className={CHROME.header}>
        <span className={cn(CHROME.crumb, "min-w-0 flex-1 px-[6px]")} title={activeTitle}>
          {activeTitle}
        </span>
        {/* The front reader draws its own controls here — the annotate toggle and its actions menu.
            Only the front one, or every mounted reader would stack a set in this row. */}
        <div className="flex shrink-0 items-center gap-[4px]" ref={toolbarSlot} />
        <button
          aria-label={full ? "Exit full screen" : "Full screen"}
          className={CHROME.button}
          onClick={() => setFull((current) => !current)}
          title={full ? "Exit full screen" : "Full screen"}
          type="button"
        >
          <Codicon name={full ? "screen-normal" : "screen-full"} size={CHROME.icon} />
        </button>
        <button
          aria-label="Close the reading panel"
          className={cn(CHROME.button, "text-(--ui-text-quaternary) hover:text-(--ui-text-primary)")}
          onClick={close}
          title="Close"
          type="button"
        >
          <Codicon name="close" size={CHROME.icon} />
        </button>
      </div>

      {/* 🔴 SAID OUT LOUD, NEVER LEFT TO BE INFERRED. When the original file was not kept, what is
          on screen is Nemesis's reading of it, and the product's standing rule is that a
          reconstruction never quietly stands in for the document. */}
      {activeState?.kind === "ready" && activeState.extracted && (
        <p className="shrink-0 border-t border-(--ui-stroke-tertiary) px-[16px] py-[6px] text-[12px] leading-[16px] text-(--ui-text-tertiary)">
          This is the text Nemesis read out of the file. The original was not kept with the canvas.
        </p>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {dock.open
          .filter((source) => mounted.has(source.id))
          .map((source) => {
            const state = states[source.id] ?? { kind: "loading" as const };
            const front = source.id === activeId;
            return (
              <div
                aria-hidden={!front}
                // 🔴 `invisible`, NOT `display: none`. pdf.js measures its container to lay pages
                // out, and a zero-size box renders nothing at all.
                className={front ? "h-full" : "pointer-events-none invisible absolute inset-0"}
                key={source.id}
              >
                {state.kind === "loading" && (
                  <p className="py-8 text-center text-[12px] text-(--ui-text-quaternary)">Opening the document…</p>
                )}
                {state.kind === "unavailable" && (
                  <p className="px-[24px] py-8 text-center text-[14px] leading-[20px] text-(--ui-text-tertiary)">
                    {state.reason}
                  </p>
                )}
                {state.kind === "ready" && (
                  <DocumentReader
                    annotationLook="card"
                    anchor={{ query: null, unit: lastUnit[source.id] ?? null }}
                    // 🔴 THE BOARD'S OWN STORE, KEYED BY THE BOARD-LOCAL ID — the opposite of the
                    // chat's rule, and correct for the opposite reason. The chat writes to a shared
                    // table where "s1" would be meaningless; this writes into THIS board's own
                    // document, where the board-local id is the only id there is.
                    commentsDoc={{
                      preview: preview || uid === null,
                      ref: { id: source.id, kind: "source" },
                      store: storeFor(source.id),
                      uid,
                    }}
                    dense
                    // The board already holds this source's text as material; sending it again
                    // would file the same document into the same canvas twice.
                    grounded
                    onUnitChange={(unit) => rememberUnit(source.id, unit)}
                    source={state.source}
                    toolbarSlot={front ? toolbarSlot : undefined}
                    variant="dialog"
                  />
                )}
              </div>
            );
          })}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Open one board source in the panel. For the source card's own control.
 *
 * 🔴 A HOOK RATHER THAN A PROP, for the reason `useOpenSource` gives: the card that opens a
 * document is drawn by React Flow, several components below the thing that owns the list.
 */
export function useOpenBoardSource(): (source: BoardSource) => void {
  const dock = useDocumentDock();
  return useCallback((source: BoardSource) => dock.openDocument(dockSourceFor(source)), [dock]);
}

/** Whether one board source is already open in the panel, so its card can say so. */
export function useIsSourceOpen(sourceId: string): boolean {
  const dock = useDocumentDock();
  return dock.items.some((item) => item.key === documentKey(sourceId));
}
