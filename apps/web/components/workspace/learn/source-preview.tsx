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
// 🔴 NO DARK SCRIM — the same ruling the history card carries ("No full-screen dark modal
// backdrop. A subtle shadow/border is enough."). The catcher below closes on an outside press
// without painting anything.

import { useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { PdfThumbnail } from "@/components/workspace/reader/pdf-thumbnail";
import type { CanvasSource } from "@/lib/learn/canvas-model";
import { openPdf, type OpenedPdf } from "@/lib/reader/pdfjs";
import { librarySourceUrl, loadLibrarySource } from "@/lib/workspace/library-sources";

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

  // Escape closes, same as every transient surface on the canvas.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      onMouseDown={(event) => {
        // The catcher, not a scrim: an outside press closes, and nothing is painted over the
        // canvas — the history card's own ruling.
        if (!card.current?.contains(event.target as Node)) onClose();
      }}
      role="dialog"
    >
      <div
        className="flex max-h-[min(36rem,85vh)] w-[min(32rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-2xl bg-(--ui-bg-elevated) shadow-xl ring-1 ring-(--ui-stroke-secondary)"
        ref={card}
      >
        {/* The source, and that's it — the owner's own scope for this header. */}
        <div className="flex items-center gap-2.5 px-4 py-3">
          <Codicon className="shrink-0 text-(--ui-text-tertiary)" name="file" size="16px" />
          <span className="min-w-0 flex-1 truncate text-[length:var(--canvas-text-small)] font-medium text-(--ui-text-primary)" title={source.title}>
            {source.title}
          </span>
          <button
            aria-label="Close preview"
            className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
            onClick={onClose}
            type="button"
          >
            <Codicon name="close" size="14px" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-4 pb-4">
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
            <img alt={source.title} className="mx-auto max-w-full rounded-lg" src={state.url} />
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
      </div>
    </div>
  );
}
