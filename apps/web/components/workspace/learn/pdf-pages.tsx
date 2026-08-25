"use client";

// A PDF artifact, shown as the PDF it actually is.
//
// 🔴🔴 THE PREVIEW USED TO RENDER THE MARKDOWN, NOT THE FILE — owner, 2026-08-25: *"why are
// artifacts rendering in md and not their respective formats?"* A PDF artifact opened as a styled
// approximation of what the PDF would contain: the same words, in the reader's own type, at the
// reader's own measure. Close enough to look right and different enough to be wrong about every
// question you would open a PDF to answer — where the page breaks fall, whether the table fits,
// what it will look like when it is printed or handed in.
//
// So the bytes are built with the real writer and rendered with pdf.js, which is the same engine
// the browser's own viewer uses. What is on screen is the file.
//
// 🔴 THE SAME `openPdf` THE SOURCE PREVIEW AND THE READER USE. A second pdf.js door would mean a
// second worker, a second copy of the library in the bundle, and two places for the version to
// drift.

import { useEffect, useRef, useState } from "react";

import { openPdf, type PdfDocument } from "@/lib/reader/pdfjs";

export function PdfPages({ blob }: { blob: Blob }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ document: PdfDocument; pages: number } | { error: string } | null>(null);

  useEffect(() => {
    let live = true;
    let close: (() => void) | undefined;
    void (async () => {
      try {
        const opened = await openPdf(await blob.arrayBuffer());
        close = opened.close;
        if (!live) {
          opened.close();
          return;
        }
        setState({ document: opened.document, pages: opened.document.numPages });
      } catch {
        if (live) setState({ error: "Couldn't render this PDF. The download still works." });
      }
    })();
    return () => {
      live = false;
      // 🔴 THE WORKER'S COPY IS FREED WITH THE PANEL. pdf.js holds the document in a worker; a
      // reader that opens ten documents and frees none is ten documents of memory that only a
      // reload reclaims. Same rule `source-preview.tsx` follows.
      close?.();
    };
  }, [blob]);

  if (state && "error" in state) {
    return <p className="m-0 py-8 text-center text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary)">{state.error}</p>;
  }
  if (!state) {
    return <p className="m-0 py-8 text-center text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">Rendering…</p>;
  }
  return (
    <div className="grid gap-3" ref={host}>
      {Array.from({ length: state.pages }, (_, index) => (
        <PdfPage document={state.document} key={index} pageNumber={index + 1} />
      ))}
    </div>
  );
}

/** One page, drawn to fit the column it is in. */
function PdfPage({ document: pdf, pageNumber }: { document: PdfDocument; pageNumber: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const page = await pdf.getPage(pageNumber);
      const element = canvas.current;
      if (cancelled || !element) return;
      const context = element.getContext("2d");
      if (!context) return;
      // 🔴 SCALED TO THE COLUMN AND THEN BY THE DEVICE PIXEL RATIO. Rendering at CSS pixels on a
      // retina screen produces a page that is visibly soft — which reads as "the export is low
      // quality" rather than "the preview is". The canvas is drawn big and displayed small.
      // 🔴 `||`, NOT `??`, AND THAT ONE CHARACTER IS THE WHOLE PAGE. `??` only catches null, so a
      // parent that measures 0 — still laying out, inside a collapsed panel, in a hidden tab —
      // gives `scale = 0` and pdf.js renders a 0x0 canvas: a blank space where the document is,
      // with no error anywhere. Caught in the browser, not by reading the code.
      const width = element.parentElement?.clientWidth || 560;
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * ratio });
      element.width = viewport.width;
      element.height = viewport.height;
      element.style.width = "100%";
      element.style.height = "auto";
      await page.render({ canvas: element, canvasContext: context, viewport }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber]);

  return (
    <div className="overflow-hidden rounded-lg bg-white ring-1 ring-(--ui-stroke-tertiary)">
      <canvas ref={canvas} />
    </div>
  );
}
