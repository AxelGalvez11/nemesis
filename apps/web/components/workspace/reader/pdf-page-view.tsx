"use client";

// One PDF page: a rasterised canvas with pdf.js's invisible text positioned
// exactly over it, so the words on screen can be selected, copied and cited.
//
// Three things this component is careful about, all of them learned failures
// in PDF viewers generally:
//
//  1. **Render cancellation.** pdf.js refuses to run two renders into the same
//     canvas, and zooming fires renders faster than they complete. Every render
//     keeps its task and cancels it on the next one; a cancellation is an
//     expected outcome, not an error.
//  2. **Raster scale vs CSS scale.** The canvas is drawn at device-pixel
//     resolution but laid out at CSS size, so text stays sharp on a retina
//     screen without the layout moving. `rasterScale` caps this so a deep zoom
//     cannot ask for a canvas the browser silently refuses to allocate.
//  3. **Only what is on screen renders.** An IntersectionObserver decides;
//     a 300-page PDF otherwise tries to rasterise 300 pages at once.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PdfDocument } from "@/lib/reader/pdfjs";
import { rasterScale } from "@/lib/reader/reader-zoom";

import { cropFrom, useRegionDrag, type RegionAnchor, type RegionBox } from "./use-region-drag";

export interface PageHighlight {
  /** Offsets into this page's text, as `findInUnit` reports them. */
  start: number;
  end: number;
  current: boolean;
}

interface PdfPageViewProps {
  document: PdfDocument;
  pageNumber: number;
  /** CSS scale — 1 means "the page's natural size in CSS pixels". */
  scale: number;
  highlights: readonly PageHighlight[];
  onVisible: (pageNumber: number) => void;
  registerElement: (pageNumber: number, element: HTMLDivElement | null) => void;
  /** This page is a PICTURE of a page — it carries no text layer, so nothing on
   *  it can be selected, searched or quoted. Said out loud rather than left for
   *  the student to discover by getting no results. */
  isImageOnly?: boolean;
  /**
   * Marking mode: drag a box over the page instead of selecting text.
   *
   * 🔴 IT IS A MODE, AND IT HAS TO BE. The invisible text layer sits on top of the page and IS what
   * makes selection work; an overlay that catches drags necessarily takes those events away from
   * it. One drag cannot mean both "highlight these words" and "cut out this area", so the learner
   * says which — the same bargain every PDF tool makes.
   */
  marking?: boolean;
  /** A box the learner drew on this page: fractions of the page, the cut-out, and where the box
   *  landed on screen so the action bar can be put beside it. */
  onRegion?: (pageNumber: number, region: RegionBox, cropDataUrl: string | null, anchor: RegionAnchor) => void;
}

export function PdfPageView({
  document: pdf, pageNumber, scale, highlights, onVisible, registerElement, isImageOnly = false,
  marking = false, onRegion,
}: PdfPageViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [onScreen, setOnScreen] = useState(false);
  const [rects, setRects] = useState<{ left: number; top: number; width: number; height: number; current: boolean }[]>([]);
  /** Bumped when the text layer finishes drawing. Highlights are measured off
   *  the rendered spans, so they cannot be positioned until this changes —
   *  without it, a highlight that arrives with the document (a ?q= link) is
   *  measured against an empty layer once and never retried. */
  const [textLayerVersion, setTextLayerVersion] = useState(0);
  /**
   * Whether this page's canvas holds a rendered page, as opposed to the 300×150 blank every canvas
   * element starts life as.
   *
   * 🔴🔴 FOUND ON SCREEN, AND `canvas.width > 0` DOES NOT CATCH IT. An unrendered canvas is not
   * empty, it is 300 by 150 — so a crop taken before the page paints succeeds, produces a real PNG
   * of nothing, and the message then says "attached as a picture" about a blank rectangle. Falling
   * back to the coordinate wording is worse than a picture and far better than a lie.
   *
   * A ref, not state: it is read at drag time and must not re-render the page to record itself.
   */
  const painted = useRef(false);

  // Natural size first, so the page reserves its space in the scroll column
  // before it has rendered — otherwise every render shifts the scroll position
  // of everything below it.
  useEffect(() => {
    let cancelled = false;
    void pdf.getPage(pageNumber).then((page) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 1 });
      setSize({ width: viewport.width, height: viewport.height });
    });
    return () => {
      cancelled = true;
    };
  }, [pageNumber, pdf]);

  useEffect(() => {
    const element = wrapperRef.current;
    registerElement(pageNumber, element);
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setOnScreen(entry.isIntersecting);
          // "The page you are reading" is the one covering the most of the
          // viewport, so a page only claims the counter once it is properly in
          // view — not the instant its top edge appears.
          if (entry.intersectionRatio > 0.45) onVisible(pageNumber);
        }
      },
      { rootMargin: "600px 0px", threshold: [0, 0.45, 0.9] },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      registerElement(pageNumber, null);
    };
  }, [onVisible, pageNumber, registerElement]);

  useEffect(() => {
    if (!onScreen || !size) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    // A zoom re-renders at a new raster size; until that lands the canvas holds the OLD scale's
    // pixels, which crop to the wrong part of the page.
    painted.current = false;

    void (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const canvas = canvasRef.current;
      const textLayer = textRef.current;
      if (!canvas || !textLayer) return;

      const ratio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
      const raster = rasterScale(scale, size.width, size.height, ratio);
      const viewport = page.getViewport({ scale: raster });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(size.width * scale)}px`;
      canvas.style.height = `${Math.floor(size.height * scale)}px`;
      // 🔴 The context MUST keep its alpha channel. With `{ alpha: false }` the
      // canvas starts opaque BLACK, and a PDF page paints only its ink — so a
      // perfectly good page renders as a black rectangle. `background` makes
      // the paper white explicitly rather than relying on the canvas default.
      const context = canvas.getContext("2d");
      if (!context) return;

      const render = page.render({ canvas, canvasContext: context, viewport, background: "#ffffff" });
      task = render;
      try {
        await render.promise;
      } catch {
        return; // Cancelled by the next zoom — expected, not a failure.
      }
      if (cancelled) return;
      painted.current = true;

      // The text layer is laid out in CSS pixels, so it uses the CSS scale, not
      // the raster scale. Rebuilt on every scale change because pdf.js sizes
      // its spans in absolute pixels.
      const { TextLayer } = await import("pdfjs-dist");
      if (cancelled) return;
      textLayer.replaceChildren();
      textLayer.style.width = `${Math.floor(size.width * scale)}px`;
      textLayer.style.height = `${Math.floor(size.height * scale)}px`;
      textLayer.style.setProperty("--total-scale-factor", String(scale));
      await new TextLayer({
        container: textLayer,
        textContentSource: page.streamTextContent(),
        viewport: page.getViewport({ scale }),
      }).render();
      if (!cancelled) setTextLayerVersion((version) => version + 1);
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [onScreen, pageNumber, pdf, scale, size]);

  // Highlight boxes are measured from the rendered text spans rather than
  // computed from glyph geometry: the spans are already positioned by pdf.js,
  // so a Range over them gives the true on-screen rectangle of a passage even
  // when it wraps across lines.
  const highlightKey = useMemo(
    () => highlights.map((highlight) => `${highlight.start}:${highlight.end}:${highlight.current}`).join(","),
    [highlights],
  );

  useEffect(() => {
    const textLayer = textRef.current;
    if (!textLayer || highlights.length === 0) {
      setRects([]);
      return;
    }
    // Wait a frame so the text layer above has committed its spans.
    const handle = window.requestAnimationFrame(() => {
      // 🔴 The offsets in a match are into the page text the DOCUMENT VIEW
      // built: item strings joined, with a newline after every item that ended
      // a line. pdf.js renders that same sequence as a <span> per item and a
      // <br> per line end — so counting <br> as one character is what keeps the
      // two coordinate systems aligned. Counting only the spans (the obvious
      // reading) drifts by one character per line break, and a highlight then
      // lands progressively further left down the page, or nowhere at all.
      //
      // A `.markedContent` wrapper is a <span> holding other spans, so the
      // filter keeps only elements whose own first child is text.
      const parts = [...textLayer.querySelectorAll("span, br")].filter(
        (element) => element.tagName === "BR" || element.firstChild?.nodeType === Node.TEXT_NODE,
      );
      if (parts.length === 0) {
        setRects([]);
        return;
      }
      const layerBox = textLayer.getBoundingClientRect();
      const found: { left: number; top: number; width: number; height: number; current: boolean }[] = [];
      let offset = 0;
      const spanRanges = parts.map((element) => {
        const length = element.tagName === "BR" ? 1 : (element.textContent?.length ?? 0);
        const entry = { span: element, start: offset, end: offset + length };
        offset += length;
        return entry;
      });

      for (const highlight of highlights) {
        for (const entry of spanRanges) {
          const start = Math.max(highlight.start, entry.start);
          const end = Math.min(highlight.end, entry.end);
          if (end <= start) continue;
          // A <br> occupies a character but has no box to paint.
          if (entry.span.tagName === "BR") continue;
          const range = document.createRange();
          const node = entry.span.firstChild;
          if (!node) continue;
          try {
            range.setStart(node, start - entry.start);
            range.setEnd(node, end - entry.start);
          } catch {
            continue;
          }
          for (const box of range.getClientRects()) {
            if (box.width <= 0 || box.height <= 0) continue;
            found.push({
              left: box.left - layerBox.left,
              top: box.top - layerBox.top,
              width: box.width,
              height: box.height,
              current: highlight.current,
            });
          }
        }
      }
      setRects(found);
    });
    return () => window.cancelAnimationFrame(handle);
    // highlightKey stands in for the highlights array; scale and
    // textLayerVersion both mean the spans moved and must be re-measured.
  }, [highlightKey, highlights, scale, textLayerVersion]);

  // 🔴 THE CUT-OUT COMES OFF THE CANVAS THAT IS ALREADY DRAWN, at its own resolution — which is
  // device pixels, not CSS pixels, so a retina screen yields a crop at twice the layout size. There
  // is no second render: re-rasterising the page at crop time would double the most expensive thing
  // this component does, for a picture the learner is looking at already.
  const picked = useCallback(
    (region: RegionBox, anchor: RegionAnchor) => {
      const canvas = canvasRef.current;
      const crop = canvas && painted.current ? cropFrom(canvas, region, { height: canvas.height, width: canvas.width }) : null;
      onRegion?.(pageNumber, region, crop, anchor);
    },
    [onRegion, pageNumber],
  );
  const { box: markBox, onPointerDown } = useRegionDrag({ enabled: marking, onPicked: picked, target: wrapperRef });

  const width = size ? Math.floor(size.width * scale) : 0;
  const height = size ? Math.floor(size.height * scale) : 0;

  return (
    <div
      className="nemesis-reader-canvas relative shrink-0"
      data-measured={size !== null}
      data-page={pageNumber}
      data-testid={`reader-page-${pageNumber}`}
      ref={wrapperRef}
      style={size ? { width, height } : { width: "100%", aspectRatio: "1 / 1.294" }}
    >
      <canvas className="block" ref={canvasRef} />
      {isImageOnly && (
        // A corner pill, not a banner across the page. The point is to explain
        // why selecting and searching find nothing here — covering the very
        // content being explained would be its own small betrayal.
        <p
          className="pointer-events-none absolute right-2 top-2 max-w-[75%] rounded-md bg-black/65 px-2 py-1 text-[0.625rem] leading-snug text-white"
          data-testid={`reader-page-${pageNumber}-image-only`}
          title="This page carries no text layer, so there is nothing on it to select, search or quote."
        >
          Image of a page — no text to select or search
        </p>
      )}
      {rects.map((rect, index) => (
        <div
          className="nemesis-reader-highlight"
          data-current={rect.current}
          key={`${rect.left}-${rect.top}-${index}`}
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        />
      ))}
      <div className="nemesis-text-layer" ref={textRef} />

      {/* 🔴 ABOVE THE TEXT LAYER, AND ONLY WHILE MARKING. Mounted conditionally rather than left in
          place with `pointer-events-none`: an element covering the page is exactly the thing that
          silently kills text selection, and "it is there but inert" is the state nobody can see. */}
      {marking && (
        <div
          className="absolute inset-0 z-10 cursor-crosshair"
          data-testid={`reader-page-${pageNumber}-marking`}
          onPointerDown={onPointerDown}
        >
          {markBox && <div className="nemesis-reader-region" style={markBox} />}
        </div>
      )}
    </div>
  );
}
