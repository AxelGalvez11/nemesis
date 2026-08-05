"use client";

// A page thumbnail for the sidebar. Rendered at a fixed small width and only
// once it scrolls into the rail, so opening a 300-page document does not
// rasterise 300 pages up front.

import { useEffect, useRef, useState } from "react";

import type { PdfDocument } from "@/lib/reader/pdfjs";

const THUMB_WIDTH = 132;

export function PdfThumbnail({
  document: pdf,
  pageNumber,
  active,
  onSelect,
}: {
  document: PdfDocument;
  pageNumber: number;
  active: boolean;
  onSelect: (pageNumber: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [onScreen, setOnScreen] = useState(false);
  const [height, setHeight] = useState(THUMB_WIDTH * 1.294);

  useEffect(() => {
    const element = buttonRef.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => setOnScreen(entries.some((entry) => entry.isIntersecting)), {
      rootMargin: "400px 0px",
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!onScreen) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    void (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const natural = page.getViewport({ scale: 1 });
      const scale = THUMB_WIDTH / natural.width;
      setHeight(Math.round(natural.height * scale));
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * ratio });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${THUMB_WIDTH}px`;
      canvas.style.height = `${Math.round(natural.height * scale)}px`;
      // See pdf-page-view.tsx: an alpha-less canvas renders a page as black.
      const context = canvas.getContext("2d");
      if (!context) return;
      const render = page.render({ canvas, canvasContext: context, viewport, background: "#ffffff" });
      task = render;
      try {
        await render.promise;
      } catch {
        // Cancelled — the rail scrolled away or the document closed.
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [onScreen, pageNumber, pdf]);

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        aria-current={active ? "page" : undefined}
        aria-label={`Page ${pageNumber}`}
        className="nemesis-reader-thumb block"
        data-active={active}
        onClick={() => onSelect(pageNumber)}
        ref={buttonRef}
        style={{ width: THUMB_WIDTH, height }}
        type="button"
      >
        <canvas className="block" ref={canvasRef} />
      </button>
      <span className={active ? "text-[0.6875rem] font-semibold text-foreground" : "text-[0.6875rem] text-(--ui-text-tertiary)"}>
        {pageNumber}
      </span>
    </div>
  );
}
