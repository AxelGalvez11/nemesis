"use client";

// The source a learner clicked, opened as a docked reader beside the canvas.
//
// 🔴🔴 IT SHOWS THE REAL DOCUMENT NOW, WHATEVER KIND IT IS — owner, 2026-08-27: *"it still won't
// let me view the attachment I put in, it's a docx, users should be able to view slides, docs, pdf,
// xlsx, etc."*
//
// This file used to render pages ITSELF, through pdf.js, and could therefore only ever show PDFs
// and images. Everything else fell to a sentence apologising for it — which is what he was looking
// at. The product already had renderers for the rest: `DocumentReader` dispatches to
// `DocxDocumentView`, `SlidesDocumentView`, `PdfDocumentView` and `ImageDocumentView`, and has had
// a trimmed `variant="dialog"` for embedding the whole time. It was never mounted here.
//
// So this is now the PANEL and nothing else: it resolves the library row, hands it to the reader,
// and owns where the panel sits and how wide it is.
//
// 🔴 A SIDEBAR, NOT A POPUP (owner, same day). It docks right, pushes the canvas rather than
// covering it, and its width is a drag the learner owns — see `use-dock-width.ts`.
//
// 🔴 NO OUTSIDE-PRESS CLOSE: a panel owning most of the window must not vanish because somebody
// clicked the conversation next to it. Close button, plus Escape.
//
// 🔴 IT PORTALS, AND THE `data-workspace` STAMP TRAVELS WITH IT. `globals.css` carries
// `button:where(:not([data-workspace] *)) { background: var(--acid) }`, so a subtree moved to
// `document.body` leaves the workspace scope and every button in it goes acid green.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Codicon } from "@/components/desktop-ui/codicon";
import { DocumentReader } from "@/components/workspace/reader/document-reader";
import { useDeclareSidePanel } from "@/components/workspace/shell/side-panel";
import type { CanvasSource } from "@/lib/learn/canvas-model";
import { readerSourceFromLibrary } from "@/lib/reader/reader-source";
import type { ReaderSource } from "@/lib/reader/reader-source";
import { cn } from "@/lib/utils";
import { loadLibrarySource } from "@/lib/workspace/library-sources";

import { CHROME } from "./reader-chrome";
import { useDockWidth } from "./use-dock-width";

type PreviewState =
  | { readonly kind: "loading" }
  | { readonly kind: "unavailable"; readonly reason: string }
  | { readonly kind: "ready"; readonly source: ReaderSource };

export function SourcePreview({
  onClose,
  source,
  uid,
}: {
  onClose: () => void;
  /** Null closes the panel; the component is mounted unconditionally by its owner. */
  source: CanvasSource | null;
  uid: string | null;
}) {
  const [state, setState] = useState<PreviewState>({ kind: "loading" });
  const { dragging, onDragStart, width } = useDockWidth();

  // 🔴 THE CANVAS IS PUSHED, NOT COVERED — see side-panel.tsx. It is what makes this a sidebar
  // rather than a popup wearing a sidebar's shape. Zero while closed, so nothing is inset.
  useDeclareSidePanel(source ? width : 0);

  useEffect(() => {
    if (!source) return;
    let live = true;
    setState({ kind: "loading" });
    void (async () => {
      if (!source.librarySourceId) {
        setState({
          kind: "unavailable",
          reason: "This source wasn't filed to your Library, so the original file isn't kept to view.",
        });
        return;
      }
      const row = await loadLibrarySource(uid, source.librarySourceId);
      if (!live) return;
      if (!row) {
        setState({ kind: "unavailable", reason: "The original file couldn't be reached just now." });
        return;
      }
      // 🔴 THE LIBRARY'S OWN PROJECTION, NOT A SECOND READING OF THE FILENAME. `readerSourceFromLibrary`
      // is what the Library page hands the reader; building a `ReaderSource` by hand here would be a
      // second opinion about what kind a file is, free to disagree with the page next door.
      setState({ kind: "ready", source: readerSourceFromLibrary(row) });
    })();
    return () => {
      live = false;
    };
  }, [source, uid]);

  // Escape closes, same as every transient surface on the canvas.
  useEffect(() => {
    if (!source) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, source]);

  if (!source) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex flex-col border-l border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated)",
        // 🔴🔴 THE OPENING SLIDE, AND IT IS DROPPED WHILE DRAGGING — owner, 2026-08-27: *"make sure
        // to add smooth animation to the sidebar when sources are open."* A transition on `width`
        // during a drag makes the edge lag the pointer by its own duration, which reads as the
        // panel fighting you. `.reader-dock-in` slides it from the right edge on mount only.
        !dragging && "reader-dock-in",
      )}
      data-workspace
      role="dialog"
      style={{ width }}
    >
      {/* 🔴 THE GRIP IS ON THE LEFT EDGE, WHICH IS THE EDGE THAT MOVES. 6px wide with a wider
          invisible target either side of it, `col-resize`, and no paint until hover — the same
          restraint every other control on this surface follows. */}
      <div
        aria-label="Resize the panel"
        className="absolute inset-y-0 -left-[3px] z-10 w-[6px] cursor-col-resize bg-transparent transition-colors hover:bg-(--ui-action)/40"
        onPointerDown={onDragStart}
        role="separator"
      />

      <div className={CHROME.header}>
        <Codicon className="ml-[8px] shrink-0 text-(--ui-text-tertiary)" name="file" size="16px" />
        <span className={cn(CHROME.crumb, "ml-[8px] min-w-0 flex-1")} title={source.title}>
          {source.title}
        </span>
        <button
          aria-label="Close preview"
          className={cn(CHROME.button, "text-(--ui-text-quaternary) hover:text-(--ui-text-primary)")}
          onClick={onClose}
          title="Close preview"
          type="button"
        >
          <Codicon name="close" size={CHROME.icon} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {state.kind === "loading" && (
          <p className="py-8 text-center text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
            Opening the document…
          </p>
        )}
        {state.kind === "unavailable" && (
          <p className="py-8 text-center text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary)">
            {state.reason}
          </p>
        )}
        {/* 🔴 NO `onSendToChat`. This panel exists to SHOW the file; it has no chat lane of its own
            to send a selection into, and the reader hides its highlight toolbar when there is
            nowhere for it to go rather than offering a control that does nothing. */}
        {state.kind === "ready" && <DocumentReader source={state.source} variant="dialog" />}
      </div>
    </div>,
    document.body,
  );
}
