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
//   the chrome                 `CHROME` (learn/reader-chrome.ts) — the measured header both of the
//                              chat's panels already wear.
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
// 🔴🔴 THE BOARD IS COVERED, NOT PUSHED, AND THAT IS A REVERSAL. It shipped as a docked sidebar
// that narrowed the board; the owner saw it the same day: *"i dont want a sidebar to open in
// canvas, that does not make sense"*. A canvas is already spatial, so a slice off its right edge
// squeezes the very cards the document was opened from. The reader now takes the window and gives
// it straight back, and this panel claims a zero inset.
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
export function BoardDock({ children }: { children: ReactNode }) {
  const { closeOutput, openedOutput } = useBoard();
  // 🔴🔴 NO DOCUMENTS IN THIS DOCK ANY MORE, AND THAT IS THE POINT OF THE WHOLE CHANGE. A dropped
  // file is drawn inside its own card now (source-document.tsx), so there is nothing left for a
  // document tab to open: owner, 2026-09-04, *"i dont want any popups in canvas, everything should
  // be seen and done within the cards"*. What is left here is the deliverable a learner opened,
  // which still has no card of its own to live in.
  const base = useDocumentDockState([]);

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

  return (
    <DocumentDockProvider value={dock}>{children}</DocumentDockProvider>
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
