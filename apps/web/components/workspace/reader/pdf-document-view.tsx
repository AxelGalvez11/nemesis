"use client";

// The PDF lane. Owns the pdf.js document; everything else — which page you are
// on, what you searched for, how far you zoomed — belongs to the reader shell,
// so a slide deck and a scan get the same controls without re-implementing them.
//
// What this view hands back to the shell (`onReady`): how many pages there are,
// each page's plain text (for search), the document's own bookmarks, and the
// measured block structure Reading mode renders. All of it is derived from the
// file itself; nothing here asks a model anything.

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { blocksFromPages, type PdfTextItem, type ReaderBlock } from "@/lib/reader/pdf-blocks";
import { flattenOutline, outlineFromHeadings, type OutlineEntry, type RawOutlineNode } from "@/lib/reader/pdf-outline";
import { imageOpcodes, openPdf, type PdfDocument } from "@/lib/reader/pdfjs";
import { resolveScale, type ZoomMode } from "@/lib/reader/reader-zoom";
import type { SearchMatch } from "@/lib/reader/reader-search";

import { PdfPageView, type PageHighlight } from "./pdf-page-view";
import type { RegionAnchor, RegionBox } from "./use-region-drag";
import {
  classifyPage,
  maxImageCoverage,
  scanDocument,
  type DocumentScan,
  type PageScan,
} from "@/lib/reader/pdf-page-scan";

export interface PdfReadyPayload {
  unitCount: number;
  /** Plain text per page, in page order — what search runs over. */
  unitTexts: { unit: number; text: string }[];
  /** Which pages carry their own text and which are pictures of pages. */
  scan: DocumentScan;
  outline: OutlineEntry[];
  blocks: ReaderBlock[];
  /** Natural size of the first page, for fit-width arithmetic. */
  naturalWidth: number;
  naturalHeight: number;
}

export interface ReaderViewHandle {
  goToUnit: (unit: number) => void;
}

interface PdfDocumentViewProps {
  bytes: ArrayBuffer;
  zoom: ZoomMode;
  matches: readonly SearchMatch[];
  currentMatch: number;
  onReady: (payload: PdfReadyPayload) => void;
  onUnitChange: (unit: number) => void;
  onError: (message: string) => void;
  onScaleChange: (scale: number) => void;
  /** The opened document, so the sidebar can draw thumbnails from it. Called
   *  with null when it closes, because a destroyed document renders nothing. */
  onDocumentOpen: (document: PdfDocument | null) => void;
  /** Also reported upward, so the reader's comment layer can pin to the same page boxes this
   *  view scrolls and observes. Optional because the Library's plain page has no layer. */
  registerUnitElement?: (pageNumber: number, element: HTMLElement | null) => void;
}

export const PdfDocumentView = forwardRef<ReaderViewHandle, PdfDocumentViewProps>(function PdfDocumentView(
  { bytes, zoom, matches, currentMatch, onReady, onUnitChange, onError, onScaleChange, onDocumentOpen, registerUnitElement },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageElements = useRef(new Map<number, HTMLDivElement>());
  const [scan, setScan] = useState<DocumentScan | null>(null);
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [container, setContainer] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  /** A page the reader has been asked to jump to, not yet performed. */
  const [pendingUnit, setPendingUnit] = useState<number | null>(null);

  // 🔴 Jumping to a page has to WAIT for the layout to STOP MOVING. Three
  // things settle asynchronously after a document opens: each page learns its
  // natural size, fit-to-width resolves once the column has been measured, and
  // the pages re-lay-out at the resulting scale. Scroll before all three and
  // the jump lands somewhere else — measured twice while building this: asking
  // for page 3 arrived on page 4 (pages were still full size when the scroll
  // fired, then shrank underneath it), and before that a *smooth* scroll was
  // cancelled 11px in by the first page finishing its raster.
  //
  // So the request is held as STATE and performed by the effect below, which
  // only runs once the scale is real. A citation link that silently lands on
  // the wrong page is worse than one that takes a moment.
  useImperativeHandle(ref, () => ({ goToUnit: (unit: number) => setPendingUnit(unit) }));

  // Open the document, then read everything the shell needs in one pass.
  useEffect(() => {
    let cancelled = false;
    let close: (() => void) | null = null;
    void (async () => {
      try {
        const { document, close: closeDocument } = await openPdf(bytes);
        if (cancelled) {
          closeDocument();
          return;
        }
        close = closeDocument;
        setPdf(document);
        setPageCount(document.numPages);
        onDocumentOpen(document);

        const first = await document.getPage(1);
        const firstViewport = first.getViewport({ scale: 1 });
        if (cancelled) return;
        setNatural({ width: firstViewport.width, height: firstViewport.height });

        // Text for search and structure for Reading mode. Bounded: past a few
        // hundred pages this is a real amount of work, and the shell degrades
        // to "search covers the first N pages" rather than freezing the tab.
        const readable = Math.min(document.numPages, 400);
        const unitTexts: { unit: number; text: string }[] = [];
        const pageItems: { unit: number; items: PdfTextItem[] }[] = [];
        const IMAGE_OPCODES = await imageOpcodes();
        if (cancelled) return;
        const scans: PageScan[] = [];
        for (let number = 1; number <= readable; number += 1) {
          const page = await document.getPage(number);
          const content = await page.getTextContent();
          if (cancelled) return;
          // pdf.js interleaves marked-content markers with real text items;
          // only the ones carrying a string are text.
          const items = content.items.flatMap((item) => ("str" in item ? [item as unknown as PdfTextItem] : []));
          pageItems.push({ unit: number, items });
          const text = items.map((item) => item.str + (item.hasEOL ? "\n" : "")).join("");
          unitTexts.push({ unit: number, text });

          // Is this page a PICTURE of a page? A scan carries no text layer, so
          // it silently contributes nothing to search or to an AI answer, and
          // the student has no way to tell. Measured here so the page can say
          // so. Cheap: the operator list is already parsed to render the page.
          const size = page.getViewport({ scale: 1 });
          const coverage = maxImageCoverage(await page.getOperatorList(), { width: size.width, height: size.height }, IMAGE_OPCODES);
          if (cancelled) return;
          scans.push(classifyPage(number, text, coverage));
        }

        const documentScan = scanDocument(scans);
        const blocks = blocksFromPages(pageItems);
        const rawOutline = (await document.getOutline()) as RawOutlineNode[] | null;
        if (cancelled) return;

        // Bookmarks are the document's OWN contents list, so they win. A PDF
        // with none — most lecture handouts — falls back to headings measured
        // from the text, which is derived and marked as such by the sidebar.
        const bookmarks = flattenOutline(rawOutline);
        const resolved = await Promise.all(
          bookmarks.map(async (entry) => {
            if (entry.dest === null) return entry;
            try {
              const destination = typeof entry.dest === "string" ? await document.getDestination(entry.dest) : entry.dest;
              const target = Array.isArray(destination) ? destination[0] : null;
              if (!target) return entry;
              const index = await document.getPageIndex(target as never);
              return { ...entry, unit: index + 1 };
            } catch {
              // A destination that will not resolve is a broken bookmark; keep
              // the title so the contents list still reads correctly.
              return entry;
            }
          }),
        );
        if (cancelled) return;

        setScan(documentScan);
        onReady({
          unitCount: document.numPages,
          unitTexts,
          outline: resolved.some((entry) => entry.unit !== undefined) ? resolved : outlineFromHeadings(blocks),
          blocks,
          scan: documentScan,
          naturalWidth: firstViewport.width,
          naturalHeight: firstViewport.height,
        });
      } catch (error) {
        if (!cancelled) onError(error instanceof Error ? error.message : "This PDF could not be opened.");
      }
    })();
    return () => {
      cancelled = true;
      onDocumentOpen(null);
      close?.();
    };
  }, [bytes, onDocumentOpen, onError, onReady]);

  // Fit modes must recompute on every resize, so the container is measured
  // rather than assumed. `contentRect` is the box INSIDE the padding already —
  // subtracting the padding again is what makes a "fit to width" page sit in
  // the middle of the column with an inch of air on either side.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setContainer({ width: Math.max(0, box.width), height: Math.max(0, box.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scale = useMemo(
    () =>
      resolveScale(zoom, {
        pageWidth: natural?.width ?? 0,
        pageHeight: natural?.height ?? 0,
        containerWidth: container.width,
        containerHeight: container.height,
      }),
    [container.height, container.width, natural, zoom],
  );

  useEffect(() => onScaleChange(scale), [onScaleChange, scale]);

  // The held jump, performed once the scale is real (container measured) and
  // the target page knows its size. Instant, never smooth — every PDF reader
  // jumps, and a smooth scroll is cancelled by the next page render anyway.
  useEffect(() => {
    if (pendingUnit === null || container.width <= 0) return;
    const element = pageElements.current.get(pendingUnit);
    if (!element || element.dataset.measured !== "true") return;
    // One frame later: this render's scale has been applied to the DOM by the
    // browser, but the page heights it implies have not been laid out yet.
    const frame = window.requestAnimationFrame(() => {
      pageElements.current.get(pendingUnit)?.scrollIntoView({ block: "start" });
      setPendingUnit(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [container.width, pendingUnit, scale]);

  const highlightsByPage = useMemo(() => {
    const map = new Map<number, PageHighlight[]>();
    matches.forEach((match, index) => {
      const list = map.get(match.unit) ?? [];
      list.push({ start: match.start, end: match.end, current: index === currentMatch });
      map.set(match.unit, list);
    });
    return map;
  }, [currentMatch, matches]);

  const registerElement = useMemo(
    () => (pageNumber: number, element: HTMLDivElement | null) => {
      if (element) pageElements.current.set(pageNumber, element);
      else pageElements.current.delete(pageNumber);
      registerUnitElement?.(pageNumber, element);
    },
    [registerUnitElement],
  );

  const EMPTY: PageHighlight[] = useMemo(() => [], []);
  const imageOnlyPages = useMemo(() => new Set(scan?.imageOnly ?? []), [scan]);

  return (
    <div className="h-full min-h-0 overflow-auto overscroll-contain px-6 py-6" data-testid="reader-pdf-scroll" ref={scrollRef}>
      <div className="mx-auto flex w-fit flex-col items-center gap-4">
        {pdf !== null &&
          Array.from({ length: pageCount }, (_unused, index) => index + 1).map((pageNumber) => (
            <PdfPageView
              document={pdf}
              highlights={highlightsByPage.get(pageNumber) ?? EMPTY}
              key={pageNumber}
              onVisible={onUnitChange}
              isImageOnly={imageOnlyPages.has(pageNumber)}
              pageNumber={pageNumber}
              registerElement={registerElement}
              scale={scale}
            />
          ))}
      </div>
    </div>
  );
});
