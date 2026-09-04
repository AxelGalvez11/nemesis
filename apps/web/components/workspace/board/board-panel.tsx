"use client";

// Where a deliverable opens, and nothing else.
//
// 🔴🔴 THIS FILE USED TO BE THE BOARD'S READING PANEL, AND EVERY LINE THAT WENT WAS AN OWNER CALL,
// all on 2026-09-04. It shipped that morning as a docked sidebar of document tabs with an annotate
// layer, which he had asked for. Then: *"i dont want a sidebar to open in canvas, that does not
// make sense"* (so it covered the window instead), then *"pdfs, docx, pptx, still cannot be seen in
// the canvas, they only render text"* and *"i dont want any popups in canvas, everything should be
// seen and done within the cards"* (so the document moved INTO its card — source-document.tsx),
// then *"remove the annotation from pdf docs"* (so the layer went with it).
//
// What is left is the one thing on a board with no card of its own: a made deliverable the learner
// opened. It still uses the chat's dock rather than a second one.

import { useEffect, useMemo, type ReactNode } from "react";

import {
  DocumentDockProvider,
  outputKey,
  useDocumentDockState,
  type DocumentDock,
} from "@/components/workspace/learn/document-dock";

import { useBoard } from "./board-provider";

/**
 * The dock's state, wrapped around the board.
 *
 * 🔴 IT WRAPS THE BOARD RATHER THAN SITTING BESIDE IT, because the thing that opens a deliverable
 * is a card drawn deep inside `BoardSurface`. That is the same plumbing problem `document-dock.tsx`
 * was extracted to solve for the chat's citation chips, and the same answer: one list of what is
 * open, reachable from wherever the press happened.
 */
export function BoardDock({ children }: { children: ReactNode }) {
  const { closeOutput, openedOutput } = useBoard();
  // 🔴🔴 NO DOCUMENTS IN THIS DOCK, AND THAT IS THE POINT. A dropped file is drawn inside its own
  // card now (source-document.tsx), so there is nothing left for a document tab to open.
  const base = useDocumentDockState([]);

  /**
   * A deliverable the learner opened becomes a TAB of this dock.
   *
   * 🔴🔴 ONE PANEL, NOT TWO ON THE SAME EDGE. The board's deliverables shipped with their own
   * `openedOutput` state and their own `OutputPreview`, which was right while a made page was the
   * only thing the board could open. With documents opening on that edge too, two panels at the
   * same width stacked — the exact failure `document-dock.tsx` was extracted to end for the chat.
   * The provider still owns which deliverable was pressed; the dock owns what is on screen.
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

  return <DocumentDockProvider value={dock}>{children}</DocumentDockProvider>;
}
