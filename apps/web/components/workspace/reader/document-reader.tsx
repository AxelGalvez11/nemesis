"use client";

// THE NEMESIS DOCUMENT READER.
//
// One shell for every kind of source: top bar, left rail, the document, right
// panel. What changes between a PDF, a deck, a Word file and a scan is only the
// middle — the controls, the search, the citations and the AI actions are the
// same everywhere, which is the whole reason for replacing the browser's viewer
// rather than dressing it up.
//
// 🔴 THE BROWSER'S OWN VIEWER IS NEVER USED. No <iframe>, no <embed>, no
// object/application-pdf, and no storage URL is ever put on the page. The bytes
// are fetched with the short-lived signed URL and handed to PDF.js (or to the
// Office readers) in memory. What that buys, beyond looking like Nemesis:
// citations can land on a page and highlight a passage, a selection can become
// a question, and it looks identical in every browser.
//
// Two modes, and the difference between them is a promise:
//   Source  — the original, faithfully. The thing a citation cites.
//   Reading — a reconstruction, derived from measurements taken from the file
//             itself. Comfortable, and never authoritative.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import type { DocxBlock } from "@/lib/reader/docx-blocks";
import { docxBlockText } from "@/lib/reader/docx-blocks";
import type { ReaderBlock } from "@/lib/reader/pdf-blocks";
import type { OutlineEntry } from "@/lib/reader/pdf-outline";
import type { PdfDocument } from "@/lib/reader/pdfjs";
import { readerActionPrompt, type ReaderActionId } from "@/lib/reader/reader-actions";
import { parseReaderAnchor, resolveAnchorUnit, type ReaderAnchor } from "@/lib/reader/reader-anchor";
import { findInDocument, stepMatch, type SearchMatch } from "@/lib/reader/reader-search";
import { courseOf, describeSource, type ReaderSource } from "@/lib/reader/reader-source";
import { FIT_WIDTH, zoomIn, zoomOut, type ZoomMode } from "@/lib/reader/reader-zoom";

import { DocxDocumentView } from "./docx-document-view";
import { ImageDocumentView, type ImageRegion } from "./image-document-view";
import { PdfDocumentView, type PdfReadyPayload, type ReaderViewHandle } from "./pdf-document-view";
import { ReaderSidebar, type SidebarTab } from "./reader-sidebar";
import { ReaderTopBar, type LinkedNote, type ReaderMode } from "./reader-top-bar";
import { ReadingView } from "./reading-view";
import { SelectionActions, type SelectionAnchor } from "./selection-actions";
import { SlidesDocumentView, type SlideTab } from "./slides-document-view";

const UNIT_LABELS: Record<string, string> = { pdf: "page", slides: "slide", image: "image", document: "section", audio: "track", file: "part" };
const KIND_LABELS: Record<string, string> = { pdf: "PDF", slides: "Slides", document: "Document", image: "Image", audio: "Recording", file: "File" };

export interface DocumentReaderProps {
  source: ReaderSource;
  /** Where in the document to land, from the URL. */
  anchor?: ReaderAnchor;
  /** Notes whose provenance cites this file. */
  linkedNotes?: readonly LinkedNote[];
  onOpenNote?: (path: string) => void;
  onBack?: () => void;
  /** Fires with the message an AI action produced and the document itself, as
   *  an attachment. The host sends both. */
  onSendToChat: (prompt: string, files: File[]) => void;
  /** "dialog" trims the chrome for the chat popup: no back button, no rails. */
  variant?: "page" | "dialog";
}

export function DocumentReader({
  source, anchor, linkedNotes = [], onOpenNote, onBack, onSendToChat, variant = "page",
}: DocumentReaderProps) {
  const isDialog = variant === "dialog";
  const unitLabel = UNIT_LABELS[source.kind] ?? "part";

  const [url, setUrl] = useState<string | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<ReaderMode>("source");
  const [zoom, setZoom] = useState<ZoomMode>(FIT_WIDTH);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [query, setQuery] = useState(anchor?.query ?? "");
  const [matchIndex, setMatchIndex] = useState(0);
  const [unit, setUnit] = useState(1);
  const [unitCount, setUnitCount] = useState(0);
  const [outline, setOutline] = useState<readonly OutlineEntry[]>([]);
  const [outlineIsAuthored, setOutlineIsAuthored] = useState(false);
  const [unitTexts, setUnitTexts] = useState<readonly { unit: number; text: string }[]>([]);
  const [blocks, setBlocks] = useState<readonly ReaderBlock[]>([]);
  const [docxText, setDocxText] = useState<string>("");
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null);
  const [slideTab, setSlideTab] = useState<SlideTab>("slides");
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("outline");
  // ONE rail, on the RIGHT. The left edge of the screen belongs to the Library
  // sidebar (owner 2026-08-05), which the host page keeps rendering around this
  // component — so a document opens without losing the tree it was filed in.
  const [railOpen, setRailOpen] = useState(!isDialog);
  const [selection, setSelection] = useState<{ text: string; unit: number | null; anchor: SelectionAnchor } | null>(null);
  const [region, setRegion] = useState<{ region: ImageRegion; preview: string | null } | null>(null);

  const viewRef = useRef<ReaderViewHandle>(null);
  const slideElements = useRef(new Map<number, HTMLElement>());
  const anchorApplied = useRef(false);

  // ── The bytes ─────────────────────────────────────────────────────────────
  // The signed URL is minted here and handed straight to the renderer. It is
  // never put in the DOM, so the student cannot land on a bucket URL and a
  // copied link cannot leak one.
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoadState("loading");
    setError(null);
    setBytes(null);
    setUrl(null);
    anchorApplied.current = false;

    void (async () => {
      const signed = await source.resolveUrl();
      if (cancelled) return;
      if (!signed) {
        setLoadState("missing");
        return;
      }
      setUrl(signed);
      // Audio streams from the URL; everything else is read into memory so the
      // renderer never depends on a URL that could expire mid-document.
      if (source.kind === "audio") {
        setLoadState("ready");
        return;
      }
      try {
        const response = await fetch(signed);
        if (!response.ok) throw new Error(`The file could not be fetched (${response.status}).`);
        const buffer = await response.arrayBuffer();
        if (cancelled) return;
        setBytes(buffer);
        setLoadState("ready");
      } catch (fetchError) {
        if (cancelled) return;
        setError(fetchError instanceof Error ? fetchError.message : "The file could not be fetched.");
        setLoadState("failed");
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  // ── Search ────────────────────────────────────────────────────────────────
  const matches: SearchMatch[] = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    if (unitTexts.length > 0) return findInDocument(unitTexts, trimmed);
    if (docxText) return findInDocument([{ unit: 1, text: docxText }], trimmed);
    return [];
  }, [docxText, query, unitTexts]);

  useEffect(() => setMatchIndex(0), [query]);

  const goToUnit = useCallback((next: number) => {
    setUnit(next);
    viewRef.current?.goToUnit(next);
    slideElements.current.get(next)?.scrollIntoView({ block: "start" });
  }, []);

  const stepToMatch = useCallback(
    (direction: 1 | -1) => {
      if (matches.length === 0) return;
      const next = stepMatch(matchIndex, matches.length, direction);
      setMatchIndex(next);
      const match = matches[next];
      if (match) goToUnit(match.unit);
    },
    [goToUnit, matchIndex, matches],
  );

  // A link that carried ?page= lands there once the document knows how many
  // pages it has — and says so honestly when the page does not exist.
  const [anchorMissed, setAnchorMissed] = useState(false);
  useEffect(() => {
    if (anchorApplied.current || unitCount === 0 || !anchor) return;
    anchorApplied.current = true;
    const resolved = resolveAnchorUnit(anchor, unitCount);
    if (resolved !== null) goToUnit(resolved);
    else if (anchor.unit !== null) setAnchorMissed(true);
  }, [anchor, goToUnit, unitCount]);

  // ── Text selection anywhere in the document ───────────────────────────────
  useEffect(() => {
    const onSelectionChange = () => {
      const active = window.getSelection();
      const text = active?.toString().trim() ?? "";
      if (!active || active.rangeCount === 0 || text.length < 2) {
        setSelection(null);
        return;
      }
      const range = active.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const element = container.nodeType === Node.ELEMENT_NODE ? (container as Element) : container.parentElement;
      // Only selections inside the document itself get the action bar — not one
      // made in the sidebar or the panel.
      if (!element?.closest("[data-reader-document]")) {
        setSelection(null);
        return;
      }
      const box = range.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return;
      // The page a selection is physically on: measured off the DOM, never
      // guessed and never asked of a model.
      const pageElement = element.closest<HTMLElement>("[data-page]");
      const measured = pageElement ? Number.parseInt(pageElement.dataset.page ?? "", 10) : Number.NaN;
      setSelection({
        text,
        unit: Number.isInteger(measured) ? measured : unitCount > 0 && source.kind !== "document" ? unit : null,
        anchor: { left: box.left, top: box.top, width: box.width },
      });
      setRegion(null);
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [source.kind, unit, unitCount]);

  // 🔴 THE DOCUMENT RIDES ALONG WITH EVERY ACTION. Naming the file in the
  // prompt is not enough to ground an answer: stored originals are never
  // chunked or embedded (only NOTES are indexed — see
  // docs/document-intelligence.md §8), so the brain cannot look this file up by
  // name. Without the text attached, "Make flashcards from Week 4 handout.pdf"
  // produces something invented that reads as though it worked.
  //
  // The reader already holds the text it extracted, so this costs nothing extra
  // and carries the measured unit markers with it. The chat's own attachment
  // budget decides how much of a long document survives.
  const documentAttachment = useCallback((): File[] => {
    const parts =
      unitTexts.length > 0
        ? unitTexts.map((page) => `## ${unitLabel} ${page.unit}\n\n${page.text}`)
        : docxText
          ? [docxText]
          : [];
    if (parts.length === 0) return [];
    const safeName = source.fileName.replace(/[\\/:]/g, "-");
    return [new File([parts.join("\n\n")], `${safeName}.txt`, { type: "text/plain" })];
  }, [docxText, source.fileName, unitLabel, unitTexts]);

  const runAction = useCallback(
    (action: ReaderActionId) => {
      const prompt = readerActionPrompt(action, {
        fileName: source.fileName,
        unitLabel,
        // Only a SELECTION has a measured location. A whole-document action
        // must not carry "(page 1)" just because that is what is on screen —
        // it reads as "flashcards from page 1" and is simply untrue.
        unit: selection?.unit ?? null,
        selection: selection?.text ?? null,
        region: region?.region ?? null,
      });
      onSendToChat(prompt, documentAttachment());
    },
    [documentAttachment, onSendToChat, region, selection, source.fileName, unitLabel],
  );

  const onPdfReady = useCallback((payload: PdfReadyPayload) => {
    setUnitCount(payload.unitCount);
    setUnitTexts(payload.unitTexts);
    setOutline(payload.outline);
    setOutlineIsAuthored(payload.outline.some((entry) => entry.dest !== null));
    setBlocks(payload.blocks);
  }, []);

  const onDocxReady = useCallback((payload: { blocks: DocxBlock[]; text: string }) => {
    setUnitCount(1);
    setDocxText(payload.text);
    setOutline(
      payload.blocks
        .map((block, index) => ({ block, index }))
        .filter(({ block }) => block.kind === "heading")
        .map(({ block, index }) => ({
          id: `docx-${index}`,
          title: docxBlockText(block),
          depth: Math.max(0, (block.kind === "heading" ? block.level : 1) - 1),
          dest: null,
          unit: 1,
        })),
    );
    setOutlineIsAuthored(true);
  }, []);

  const onSlidesReady = useCallback((payload: { slides: { index: number; title: string | null }[]; unitTexts: { unit: number; text: string }[] }) => {
    setUnitCount(payload.slides.length);
    setUnitTexts(payload.unitTexts);
    setOutline(
      payload.slides.map((slide) => ({
        id: `slide-${slide.index}`,
        title: slide.title ?? `Slide ${slide.index}`,
        depth: 0,
        dest: null,
        unit: slide.index,
      })),
    );
    setOutlineIsAuthored(true);
  }, []);

  const onViewError = useCallback((message: string) => {
    setError(message);
    setLoadState("failed");
  }, []);

  const registerSlide = useCallback((index: number, element: HTMLElement | null) => {
    if (element) slideElements.current.set(index, element);
    else slideElements.current.delete(index);
  }, []);

  const meta = describeSource(source, KIND_LABELS[source.kind] ?? "File");
  // Said out loud in the menu, because from a menu you cannot see what is
  // selected behind it.
  const actionScope = selection
    ? `the passage you selected${selection.unit === null ? "" : ` on ${unitLabel} ${selection.unit}`}`
    : region
      ? "the part of the picture you boxed"
      : "this whole document";
  /** Only some documents have anything to list in a contents rail. */
  const hasContents = source.kind === "pdf" || source.kind === "slides" || source.kind === "document";
  const readingAvailable = source.kind === "pdf" && blocks.length > 0;
  const showZoom = source.kind === "pdf" || source.kind === "image" || source.kind === "slides";
  const trimmedQuery = query.trim() || null;

  const download = useCallback(() => {
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = source.fileName;
    link.rel = "noopener noreferrer";
    link.click();
  }, [source.fileName, url]);

  return (
    // data-load-state is a testing affordance, not decoration: "is the document
    // open yet" is otherwise only visible as prose in the middle of the page,
    // and the difference between "still loading" and "loaded but blank" is the
    // difference between two completely different bugs.
    <div
      className="nemesis-reader flex h-full min-h-0 flex-col bg-(--reader-room)"
      data-load-state={loadState}
      data-variant={variant}
      data-testid="document-reader"
    >
      <ReaderTopBar
        course={courseOf(source.folderPath)}
        currentMatch={matchIndex}
        fileName={source.fileName}
        fitActive={zoom.kind === "fit-width"}
        matchCount={matches.length}
        meta={meta}
        mode={mode}
        modeAvailable={readingAvailable}
        onBack={isDialog ? undefined : onBack}
        onDownload={download}
        onFitWidth={() => setZoom(FIT_WIDTH)}
        onModeChange={setMode}
        onOpenOriginal={() => url && window.open(url, "_blank", "noopener,noreferrer")}
        onQueryChange={setQuery}
        onRotate={source.kind === "image" ? () => setRotation((current) => (current + 90) % 360) : undefined}
        onStepMatch={stepToMatch}
        onToggleRail={hasContents ? () => setRailOpen((open) => !open) : undefined}
        onUnitChange={goToUnit}
        onZoomIn={() => setZoom({ kind: "fixed", scale: zoomIn(scale) })}
        onZoomOut={() => setZoom({ kind: "fixed", scale: zoomOut(scale) })}
        query={query}
        scale={scale}
        showZoom={showZoom && loadState === "ready"}
        actionScope={actionScope}
        actionsDisabled={loadState === "missing" || loadState === "failed"}
        folderPath={source.folderPath}
        linkedNotes={linkedNotes}
        onAction={runAction}
        onOpenNote={onOpenNote}
        railOpen={railOpen}
        unit={unit}
        unitCount={unitCount}
        unitLabel={unitLabel}
      />

      {source.kind === "slides" && loadState === "ready" && (
        <div className="flex shrink-0 gap-0.5 border-b border-(--ui-stroke-tertiary) bg-(--ui-bg-chrome) px-3 py-1.5">
          {(["slides", "outline", "notes"] as const).map((tab) => (
            <button
              aria-pressed={slideTab === tab}
              className={
                slideTab === tab
                  ? "rounded-md bg-(--ui-bg-tertiary) px-2.5 py-1 text-[0.6875rem] font-medium capitalize text-foreground"
                  : "rounded-md px-2.5 py-1 text-[0.6875rem] font-medium capitalize text-(--ui-text-tertiary) hover:text-foreground"
              }
              key={tab}
              onClick={() => setSlideTab(tab)}
              type="button"
            >
              {tab === "notes" ? "Study notes" : tab}
            </button>
          ))}
        </div>
      )}

      {anchorMissed && (
        <p className="shrink-0 border-b border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-4 py-1.5 text-[0.6875rem] text-(--ui-text-secondary)">
          That link points at {unitLabel} {anchor?.unit}, but this document has {unitCount}. Showing it from the start.
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1" data-reader-document>
          {loadState === "loading" ? (
            <div className="grid h-full place-items-center text-xs text-(--ui-text-tertiary)">Opening {source.fileName}…</div>
          ) : loadState === "missing" ? (
            <Explain
              detail="Nemesis kept what it read from this file, but not the file itself. Anything uploaded from now on keeps its original."
              icon="file"
              title="The original isn't stored"
            />
          ) : loadState === "failed" ? (
            <Explain detail={error ?? "Something went wrong opening it."} icon="warning" title="This file couldn't be opened" />
          ) : mode === "reading" && readingAvailable ? (
            <ReadingView
              blocks={blocks}
              onOpenUnit={(target) => {
                setMode("source");
                goToUnit(target);
              }}
              onShowSource={() => setMode("source")}
              query={trimmedQuery}
              unitLabel={unitLabel}
            />
          ) : source.kind === "pdf" && bytes ? (
            <PdfDocumentView
              bytes={bytes}
              currentMatch={matchIndex}
              matches={matches}
              onDocumentOpen={setPdfDocument}
              onError={onViewError}
              onReady={onPdfReady}
              onScaleChange={setScale}
              onUnitChange={setUnit}
              ref={viewRef}
              zoom={zoom}
            />
          ) : source.kind === "slides" && bytes ? (
            <SlidesDocumentView
              bytes={bytes}
              onError={onViewError}
              onReady={onSlidesReady}
              onUnitChange={setUnit}
              onScaleChange={setScale}
              query={trimmedQuery}
              registerElement={registerSlide}
              tab={slideTab}
              zoom={zoom}
            />
          ) : source.kind === "document" && bytes ? (
            <DocxDocumentView bytes={bytes} onError={onViewError} onReady={onDocxReady} query={trimmedQuery} />
          ) : source.kind === "image" && url ? (
            <ImageDocumentView
              fileName={source.fileName}
              onNaturalSize={() => setUnitCount(1)}
              onRegion={(picked, preview) => {
                setRegion({ region: picked, preview });
                setSelection(null);
              }}
              rotation={rotation}
              scale={zoom.kind === "fixed" ? zoom.scale : 1}
              url={url}
            />
          ) : source.kind === "audio" && url ? (
            <div className="grid h-full place-items-center px-8">
              <div className="w-full max-w-lg rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) p-5">
                <p className="mb-3 text-sm font-medium text-foreground">{source.fileName}</p>
                <audio className="w-full" controls src={url} />
              </div>
            </div>
          ) : (
            <Explain
              detail="Nemesis has the original and can answer questions about what it read from it, but there is nothing to lay out on screen for this format."
              icon="file"
              title="No reader for this format yet"
            />
          )}
        </main>

        {railOpen && hasContents && (
          <ReaderSidebar
            document={pdfDocument}
            onGoToUnit={goToUnit}
            onTabChange={setSidebarTab}
            outline={outline}
            outlineIsAuthored={outlineIsAuthored}
            tab={source.kind === "pdf" ? sidebarTab : "outline"}
            unit={unit}
            unitCount={unitCount}
            unitLabel={unitLabel}
          />
        )}
      </div>

      {selection && <SelectionActions anchor={selection.anchor} onAction={runAction} />}
    </div>
  );
}

/** Every dead end in the reader says what happened and what is still true —
 *  never a broken frame and never a bare storage link. */
function Explain({ title, detail, icon }: { title: string; detail: string; icon: string }) {
  return (
    <div className="grid h-full place-items-center px-8">
      <div className="max-w-md text-center">
        <Codicon className="text-(--ui-text-quaternary)" name={icon} size="1.5rem" />
        <p className="mt-2.5 text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-(--ui-text-secondary)">{detail}</p>
      </div>
    </div>
  );
}

/** Re-exported so hosts can build the panel's note list without reaching into
 *  the panel's own module. */
export type { LinkedNote };
