"use client";

// The small preview a source click opens — the REAL document, never its extraction.
//
// 🔴🔴 BOTH HALVES ARE OWNER ORDERS, 2026-08-23, ON PRODUCTION. The click: *"when I clicked on the
// source attachment… it took me to the old library. It's not supposed to take me to the old
// library. It's supposed to take me to a small preview of it, a pop up."* The content: *"it showed
// me markdown, and it wasn't even rendering well… just show me the preview of the actual document.
// It can just be a simple preview with the page thumbnails and just the source, and that's it. It
// doesn't need to be complicated."* So: one card, the source's name, and the document's own pages.
// No extracted text, no markdown, no navigation away from the canvas.
//
// 🔴 THE PAGES COME FROM THE ORIGINAL BYTES, WHICH THE PRODUCT ALREADY KEEPS. Upload stores the
// file itself in the `library-sources` bucket and the canvas source carries `librarySourceId`;
// this resolves that row, signs a short-lived URL, and renders pages with the SAME pdf.js door
// and the SAME lazy thumbnail the Reader already uses — no second pipeline, no server work.
//
// 🔴 AN EPHEMERAL SOURCE HAS NO BYTES AND THE CARD SAYS SO. `durability: "ephemeral"` means
// nothing was filed to the Library (grounding pages, some pastes); a preview that silently showed
// nothing would read as broken, so the card explains in one sentence instead.
//
// 🔴🔴 IT DOCKS TO THE RIGHT; IT IS NOT A POPUP — owner, 2026-08-27: *"file preview should open
// with sidebar not as popup."* He sent a screenshot of the old centred card floating over an answer
// with nothing in it but the sentence explaining why there was nothing in it: a modal whose entire
// content was an apology, sitting on top of the thing he was reading.
//
// A docked panel is the shape the artifact reader beside it already uses, and it fixes more than
// the aesthetics: it pushes the canvas rather than covering it (`useDeclareSidePanel`), so the
// answer stays readable while the source is open, and the two readers on this surface stop being
// two different objects. The chrome and the width come from `reader-chrome.ts` so they cannot
// drift apart.
//
// 🔴 NO OUTSIDE-PRESS CLOSE ANY MORE, AND THAT IS THE ARTIFACT READER'S OWN RULING: a panel that
// owns two thirds of the window and pushes the rest must not vanish because somebody clicked the
// conversation next to it. The close button is the way out, plus Escape.
//
// 🔴 IT PORTALS, AND THE `data-workspace` STAMP TRAVELS WITH IT. `globals.css` carries
// `button:where(:not([data-workspace] *)) { background: var(--acid) }`, so a subtree moved to
// `document.body` leaves the workspace scope and every button in it goes acid green. The artifact
// reader hit exactly this.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Codicon } from "@/components/desktop-ui/codicon";
import { PdfThumbnail } from "@/components/workspace/reader/pdf-thumbnail";
import type { CanvasSource } from "@/lib/learn/canvas-model";
import { openPdf, type OpenedPdf } from "@/lib/reader/pdfjs";
import { cn } from "@/lib/utils";
import { librarySourceUrl, loadLibrarySource } from "@/lib/workspace/library-sources";
import { useDeclareSidePanel } from "@/components/workspace/shell/side-panel";

import { CHROME, DOCK_FRACTION } from "./reader-chrome";

type PreviewState =
  | { readonly kind: "loading" }
  /** A PDF, opened; the card renders its pages. */
  | { readonly kind: "pages"; readonly pdf: OpenedPdf; readonly count: number; readonly url: string }
  /** An image original; the card renders it whole. */
  | { readonly kind: "image"; readonly url: string }
  /** No bytes to show — ephemeral source, unresolvable row, or a kind pdf.js cannot open. */
  | { readonly kind: "unavailable"; readonly reason: string };

export function SourcePreview({
  onClose,
  source,
  uid,
}: {
  onClose: () => void;
  source: CanvasSource;
  uid: string | null;
}) {
  const [state, setState] = useState<PreviewState>({ kind: "loading" });
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    let opened: OpenedPdf | null = null;
    void (async () => {
      if (!source.librarySourceId) {
        setState({
          kind: "unavailable",
          reason: "This source wasn't filed to your Library, so the original file isn't kept to preview.",
        });
        return;
      }
      const row = await loadLibrarySource(uid, source.librarySourceId);
      const url = row ? await librarySourceUrl(row) : null;
      if (!live) return;
      if (!row || !url) {
        setState({ kind: "unavailable", reason: "The original file couldn't be reached just now." });
        return;
      }
      if (row.kind === "image") {
        setState({ kind: "image", url });
        return;
      }
      if (row.kind !== "pdf") {
        setState({
          kind: "unavailable",
          reason: "Page previews work for PDFs and images; Nemesis still reads this file's content in full.",
        });
        return;
      }
      try {
        const response = await fetch(url);
        const bytes = await response.arrayBuffer();
        if (!live) return;
        opened = await openPdf(bytes);
        if (!live) {
          opened.close();
          return;
        }
        setState({ kind: "pages", count: opened.document.numPages, pdf: opened, url });
      } catch {
        if (live) setState({ kind: "unavailable", reason: "The original file couldn't be opened just now." });
      }
    })();
    return () => {
      live = false;
      // The worker's copy of the document is freed with the card — see OpenedPdf.close.
      opened?.close();
    };
    // The source identity is the load; uid only changes across sign-in boundaries.
  }, [source.librarySourceId, uid]);

  /**
   * The docked width in pixels, so the surface underneath is pushed by exactly that much.
   *
   * 🔴 MEASURED FROM THE VIEWPORT AT MOUNT AND ON RESIZE, not a fixed rem — the reference's panel
   * is a FRACTION, so at 1470 it is 980 and at 1100 it is 733. A fixed width is right at one window
   * size and wrong at every other.
   */
  const [dock, setDock] = useState(0);
  useEffect(() => {
    const measure = () => setDock(Math.round(window.innerWidth * DOCK_FRACTION));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  // 🔴 THE CANVAS IS PUSHED, NOT COVERED — see side-panel.tsx. It is what makes this a sidebar
  // rather than a popup wearing a sidebar's shape.
  useDeclareSidePanel(dock);

  // Escape closes, same as every transient surface on the canvas.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-y-0 right-0 z-50 flex flex-col border-l border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated)"
      data-workspace
      ref={card}
      role="dialog"
      style={{ width: dock }}
    >
      {/* The source, and that's it — the owner's own scope for this header. Geometry is the
          artifact reader's, shared rather than restated: 36x36 buttons at radius 8 on a 40px
          pitch, a 47px band, 14px on a 20px line. */}
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
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
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
          {state.kind === "image" && (
            // The original itself; the card's max-height bounds it and the browser scales it.
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={source.title} className="mx-auto max-w-full rounded-[8px]" src={state.url} />
          )}
          {state.kind === "pages" && (
            <div className="grid grid-cols-3 justify-items-center gap-3">
              {Array.from({ length: state.count }, (_, at) => (
                <PdfThumbnail
                  active={false}
                  document={state.pdf.document}
                  key={at + 1}
                  // 🔴 A REAL ACTION, NOT A DEAD BUTTON. The thumbnail component is a button, and
                  // a button that does nothing is this codebase's most-repeated defect — so a
                  // page press opens the ORIGINAL at that page in the browser's own viewer,
                  // through the same short-lived URL the thumbnails were drawn from.
                  onSelect={(page) => window.open(`${state.url}#page=${page}`, "_blank", "noopener")}
                  pageNumber={at + 1}
                />
              ))}
            </div>
          )}
      </div>
    </div>,
    document.body,
  );
}
