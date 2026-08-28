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
import { mayOverflow, partText, replacePart, spliceLine } from "@/lib/reader/ooxml-edit";
import type { ParsedSlide } from "@/lib/reader/pptx-slides";
import { cropFileName, fileFromDataUrl } from "@/lib/reader/region-crop";
import type { Span } from "@/lib/reader/xml-tree";
import { parseReaderAnchor, resolveAnchorUnit, type ReaderAnchor } from "@/lib/reader/reader-anchor";
import { findInDocument, stepMatch, type SearchMatch } from "@/lib/reader/reader-search";
import { describeCoverage } from "@nemesis/shared";

import { courseOf, describeSource, type ReaderSource } from "@/lib/reader/reader-source";
import { FIT_WIDTH, zoomIn, zoomOut, type ZoomMode } from "@/lib/reader/reader-zoom";

import { DocxDocumentView } from "./docx-document-view";
import { ImageDocumentView, type ImageRegion } from "./image-document-view";
import { PdfDocumentView, type PdfReadyPayload, type ReaderViewHandle } from "./pdf-document-view";
import { ReaderSidebar, type SidebarTab } from "./reader-sidebar";
import { ReaderTopBar, type LinkedNote, type ReaderMode } from "./reader-top-bar";
import { ReadingView } from "./reading-view";
import { SelectionActions, type SelectionAnchor } from "./selection-actions";
import { SheetDocumentView, type SheetsReadyPayload } from "./sheet-document-view";
import { SlidesDocumentView, type SlideTab } from "./slides-document-view";

/** The hint that says a line can be rewritten. One constant, because it is printed on the slides
 *  strip and on the Word document and a second copy is how one of them silently loses it. */
const EDIT_HINT = "ml-auto self-center text-[0.6875rem] text-(--ui-text-quaternary)";

const UNIT_LABELS: Record<string, string> = { pdf: "page", slides: "slide", sheet: "sheet", image: "image", document: "section", audio: "track", file: "part" };
const KIND_LABELS: Record<string, string> = { pdf: "PDF", slides: "Slides", document: "Document", sheet: "Spreadsheet", image: "Image", audio: "Recording", file: "File" };

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
  /**
   * Fires with the message an AI action produced and the document itself, as an attachment.
   *
   * 🔴 OPTIONAL SINCE 2026-08-27, AND ITS ABSENCE HIDES THE ACTIONS RATHER THAN NO-OPPING THEM.
   * The canvas's source sidebar mounts this reader to SHOW a file; it has no chat lane of its own
   * to send a selection into. Passing an empty function would leave a highlight toolbar that looks
   * live and does nothing, which is this codebase's most-repeated defect — so the toolbar is not
   * mounted at all when there is nowhere for it to send.
   */
  onSendToChat?: (prompt: string, files: File[]) => void;
  /** "dialog" trims the chrome for the chat popup: no back button, no rails. */
  variant?: "page" | "dialog";
  /**
   * The host ALREADY holds this file as material.
   *
   * 🔴 IT SUPPRESSES THE TEXT DUMP, AND ONLY THE TEXT DUMP. `documentAttachment` exists because the
   * Library's chat has never read the file being asked about (see its own comment). The canvas is
   * the opposite case: its source panel can only open a document this canvas is already grounded
   * on, so sending the whole text again files the same material twice into one body of knowledge.
   * A cut-out of a boxed region is NOT covered by that and still travels — it exists nowhere else.
   */
  grounded?: boolean;
  /** The page/slide the reader is on, as it changes. A host that unmounts this to show another
   *  document (see the canvas's document tabs) uses it to reopen where the learner left off. */
  onUnitChange?: (unit: number) => void;
}

export function DocumentReader({
  source, anchor, linkedNotes = [], onOpenNote, onBack, onSendToChat, variant = "page", grounded = false,
  onUnitChange,
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
  /** A boxed part of a page: the box in fractions, the cut-out, and the page it was cut from.
   *  `unit` is null on a single picture, where "image 1" would be furniture rather than a location. */
  const [region, setRegion] = useState<{ region: ImageRegion; preview: string | null; unit: number | null; anchor: SelectionAnchor } | null>(null);
  /**
   * Marking mode, for documents where a drag has to choose between text and area.
   *
   * 🔴 OFFERED ON PDFs ONLY, and the omissions are each for their own reason. A picture has no text
   * layer to compete with, so its drag is always a box and a toggle there would be a control that
   * does nothing. A SLIDE is a reconstruction rather than a render (see `pptx-slides.ts`), so a
   * crop of one would be a picture of our own layout — truthful about the words, wrong about the
   * thing, and passed to a vision model as though it were the deck.
   */
  const [marking, setMarking] = useState(false);

  /**
   * The file as it was opened, kept beside the file as it now stands.
   *
   * 🔴 AN EDIT NEVER TOUCHES THE STORED ORIGINAL, and this ref is why Discard is a real button
   * rather than a reload. Nemesis holds the changed bytes in memory and hands them to the learner
   * as a download; what is in the Library is exactly what they uploaded until they decide
   * otherwise. That is a deliberate first shape: replacing the stored file would leave the parse,
   * the citations and the flashcards made from it describing text that no longer exists.
   */
  const opened = useRef<ArrayBuffer | null>(null);
  const [edits, setEdits] = useState(0);
  const [overflowWarning, setOverflowWarning] = useState(false);

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
        opened.current = buffer;
        setEdits(0);
        setOverflowWarning(false);
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

  // 🔴 ONE PLACE RECORDS WHICH UNIT IS ON SCREEN, because there are three ways to change it: the
  // toolbar, a search step, and simply scrolling. A host remembering the page only for the first
  // two would reopen a scrolled document at the top and look broken rather than forgetful.
  const noteUnit = useCallback((next: number) => {
    setUnit(next);
    onUnitChange?.(next);
  }, [onUnitChange]);

  const goToUnit = useCallback((next: number) => {
    noteUnit(next);
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
    if (grounded) return [];
    const parts =
      unitTexts.length > 0
        ? unitTexts.map((page) => `## ${unitLabel} ${page.unit}\n\n${page.text}`)
        : docxText
          ? [docxText]
          : [];
    if (parts.length === 0) return [];
    const safeName = source.fileName.replace(/[\\/:]/g, "-");
    return [new File([parts.join("\n\n")], `${safeName}.txt`, { type: "text/plain" })];
  }, [docxText, grounded, source.fileName, unitLabel, unitTexts]);

  const runAction = useCallback(
    (action: ReaderActionId) => {
      // 🔴 THE CUT-OUT IS THE ATTACHMENT, AND IT IS BUILT BEFORE THE WORDS ARE CHOSEN. Whether the
      // picture actually exists decides how the message reads: with it, the question points at a
      // picture; without it (a tainted canvas, an unrenderable page) it falls back to describing
      // the box in coordinates, which is honest about being a worse question rather than claiming
      // an attachment that is not there.
      const cropped = region?.preview ? fileFromDataUrl(region.preview, cropFileName(source.fileName, unitLabel, region.unit)) : null;
      const prompt = readerActionPrompt(action, {
        fileName: source.fileName,
        unitLabel,
        // Only a SELECTION or a BOXED REGION has a measured location. A whole-document action must
        // not carry "(page 1)" just because that is what is on screen — it reads as "flashcards
        // from page 1" and is simply untrue.
        unit: selection?.unit ?? region?.unit ?? null,
        selection: selection?.text ?? null,
        region: region?.region ?? null,
        regionAttached: cropped !== null,
      });
      onSendToChat?.(prompt, [...documentAttachment(), ...(cropped ? [cropped] : [])]);
    },
    [documentAttachment, onSendToChat, region, selection, source.fileName, unitLabel],
  );

  /**
   * A box the learner drew, from whichever view drew it.
   *
   * 🔴 IT CLEARS THE BROWSER'S OWN SELECTION, NOT JUST OUR STATE, AND THAT WAS FOUND ON SCREEN. A
   * highlight made a moment earlier stays PAINTED by the browser until its range is dropped, so
   * marking an area left a grey highlight and a box on the page at once while the action bar
   * silently acted on only one of them. `setSelection(null)` moves our own bar; only
   * `removeAllRanges` moves the paint.
   */
  const takeRegion = useCallback((picked: ImageRegion, preview: string | null, anchor: SelectionAnchor, at: number | null) => {
    setRegion({ anchor, preview, region: picked, unit: at });
    setSelection(null);
    if (typeof window !== "undefined") window.getSelection()?.removeAllRanges();
  }, []);

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

  const onSheetsReady = useCallback((payload: SheetsReadyPayload) => {
    setUnitCount(payload.sheets.length);
    setUnitTexts(payload.unitTexts);
    // The sheet names ARE the contents list. A workbook has no headings, and inventing an outline
    // from the first row of each sheet would present a guess as the document's own structure.
    setOutline(payload.sheets.map((sheet) => ({ id: `sheet-${sheet.index}`, title: sheet.name, depth: 0, dest: null, unit: sheet.index })));
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
  // 🔴 SAID ON THE SCREEN THE STUDENT IS LOOKING AT THE DOCUMENT FROM. A page
  // that was never read still renders — a scan looks perfect and selects
  // nothing — so the reader is the one place where "we could not read all of
  // this" cannot be inferred from what is on screen. `describeCoverage` returns
  // null for a complete read, so a good document says nothing.
  const coverageNote = source.coverage ? describeCoverage(source.coverage) : null;
  // Said out loud in the menu, because from a menu you cannot see what is
  // selected behind it.
  const actionScope = selection
    ? `the passage you selected${selection.unit === null ? "" : ` on ${unitLabel} ${selection.unit}`}`
    : region
      ? `the area you marked${region.unit === null ? "" : ` on ${unitLabel} ${region.unit}`}`
      : "this whole document";
  /** Only some documents have anything to list in a contents rail. */
  const hasContents = source.kind === "pdf" || source.kind === "slides" || source.kind === "document" || source.kind === "sheet";
  const readingAvailable = source.kind === "pdf" && blocks.length > 0;
  const showZoom = source.kind === "pdf" || source.kind === "image" || source.kind === "slides";
  const trimmedQuery = query.trim() || null;

  /**
   * One line, rewritten inside the real file.
   *
   * 🔴 IT IS A SPLICE, NOT A REBUILD — see `ooxml-edit.ts` for why that distinction is the whole
   * feature. Everything here is arithmetic on the part that holds the line; every other part of the
   * archive is carried across as the bytes it already was.
   *
   * 🔴 A FAILURE LEAVES THE FILE ALONE. `replacePart` returns null rather than throwing when the
   * archive will not reopen, and a null here means the edit simply does not land — never a
   * half-written deck.
   */
  const editLine = useCallback(
    (part: string, runs: readonly Span[], text: string) => {
      const current = bytes;
      if (!current || runs.length === 0) return;
      const xml = partText(current, part);
      if (xml === null) return;
      const next = replacePart(current, part, spliceLine(xml, runs, text));
      if (!next) return;
      // 🔴 SAID OUT LOUD, BECAUSE NEMESIS CANNOT SEE WHETHER IT STILL FITS. PowerPoint owns text-box
      // layout; a longer line can look right here and spill off the slide over there.
      const before = xml.slice(runs[0]!.start, runs[runs.length - 1]!.end);
      if (mayOverflow(before, text)) setOverflowWarning(true);
      setBytes(next.buffer.slice(next.byteOffset, next.byteOffset + next.byteLength) as ArrayBuffer);
      setEdits((count) => count + 1);
    },
    [bytes],
  );

  const discardEdits = useCallback(() => {
    if (!opened.current) return;
    setBytes(opened.current);
    setEdits(0);
    setOverflowWarning(false);
  }, []);

  const download = useCallback(() => {
    // 🔴 AN EDITED FILE IS DOWNLOADED FROM MEMORY, NOT FROM THE BUCKET. The signed URL still points
    // at the original, which is the one thing the learner does NOT want at this moment.
    if (edits > 0 && bytes) {
      const dot = source.fileName.lastIndexOf(".");
      const name = dot > 0 ? `${source.fileName.slice(0, dot)} (edited)${source.fileName.slice(dot)}` : `${source.fileName} (edited)`;
      const objectUrl = URL.createObjectURL(new Blob([bytes]));
      const edited = document.createElement("a");
      edited.href = objectUrl;
      edited.download = name;
      edited.click();
      // Freed on the next frame: revoking synchronously can beat the browser to the download.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
      return;
    }
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = source.fileName;
    link.rel = "noopener noreferrer";
    link.click();
  }, [bytes, edits, source.fileName, url]);

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
        coverageNote={coverageNote}
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
        marking={marking}
        onToggleMarking={
          // 🔴 AND ONLY WHERE THE ACTION BAR HAS SOMEWHERE TO SEND. Marking an area whose only
          // outcome is a message nobody receives is a control that does nothing, which is the same
          // rule the highlight bar already follows two hundred lines below.
          source.kind === "pdf" && onSendToChat ? () => setMarking((current) => !current) : undefined
        }
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
              {/* 🔴 "Speaker notes", NOT "Study notes". What this tab shows is
                  the LECTURER'S own notes, stored inside the .pptx — it is part
                  of the file, which is why it belongs in the reader. Calling it
                  "Study notes" made it sound like the student's own notes,
                  which are a different thing entirely and live in the Library
                  (owner 2026-08-05: "shouldn't Study Notes be separate from the
                  reader?"). Naming it for what it is settles that. */}
              {tab === "notes" ? "Speaker notes" : tab}
            </button>
          ))}
          {/* 🔴 SAID OUT LOUD, BECAUSE A DOUBLE-CLICK IS NOT DISCOVERABLE. Nothing on a slide looks
              like a field until the pointer is over it, and a feature nobody finds is a feature
              nobody has. It is offered only on the slides tab, where the lines are. */}
          {slideTab === "slides" && edits === 0 && <p className={EDIT_HINT}>Double-click a line to edit it</p>}
        </div>
      )}

      {/* A Word document has no tab strip of its own, and the gesture still needs saying. */}
      {source.kind === "document" && loadState === "ready" && edits === 0 && (
        <div className="flex shrink-0 border-b border-(--ui-stroke-tertiary) bg-(--ui-bg-chrome) px-3 py-1.5">
          <p className={EDIT_HINT}>Double-click a line to edit it</p>
        </div>
      )}

      {anchorMissed && (
        <p className="shrink-0 border-b border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-4 py-1.5 text-[0.6875rem] text-(--ui-text-secondary)">
          That link points at {unitLabel} {anchor?.unit}, but this document has {unitCount}. Showing it from the start.
        </p>
      )}

      {/* 🔴🔴 THE ONE THING THIS BAR MUST NEVER LET HAPPEN IS A LEARNER BELIEVING THEY SAVED. The
          edit lives in this browser tab; the file in the Library is still the file they uploaded,
          and closing the reader ends the edit. So the bar says where the change is, and the way to
          keep it is the button on it. */}
      {edits > 0 && (
        <div
          className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-4 py-1.5 text-[0.6875rem] text-(--ui-text-secondary)"
          data-testid="reader-edit-bar"
        >
          <span>
            {edits === 1 ? "1 line changed" : `${edits} lines changed`}, here only. Download to keep it.
          </span>
          {overflowWarning && (
            <span className="text-(--ui-text-primary)">
              One line is longer than it was, and PowerPoint decides whether it still fits.
            </span>
          )}
          <span className="flex-1" />
          <button className="underline underline-offset-2 hover:text-foreground" onClick={download} type="button">
            Download edited copy
          </button>
          <button className="underline underline-offset-2 hover:text-foreground" onClick={discardEdits} type="button">
            Discard changes
          </button>
        </div>
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
              marking={marking}
              matches={matches}
              onDocumentOpen={setPdfDocument}
              onError={onViewError}
              onReady={onPdfReady}
              onRegion={(page, picked, preview, anchor) => takeRegion(picked, preview, anchor, page)}
              onScaleChange={setScale}
              onUnitChange={noteUnit}
              ref={viewRef}
              zoom={zoom}
            />
          ) : source.kind === "slides" && bytes ? (
            <SlidesDocumentView
              bytes={bytes}
              onEditLine={(slide, runs, text) => editLine(slide.part, runs, text)}
              onError={onViewError}
              onReady={onSlidesReady}
              onUnitChange={noteUnit}
              onScaleChange={setScale}
              query={trimmedQuery}
              registerElement={registerSlide}
              tab={slideTab}
              zoom={zoom}
            />
          ) : source.kind === "sheet" && bytes ? (
            <SheetDocumentView
              bytes={bytes}
              onError={onViewError}
              onReady={onSheetsReady}
              onUnitChange={noteUnit}
              query={trimmedQuery}
              registerElement={registerSlide}
            />
          ) : source.kind === "document" && bytes ? (
            <DocxDocumentView
              bytes={bytes}
              // 🔴 ONE PART, ALWAYS. A Word document's body is `word/document.xml`; headers,
              // footnotes and comments live in parts of their own and none of them is on screen
              // here, so there is nothing to choose between.
              onEditLine={(runs, text) => editLine("word/document.xml", runs, text)}
              onError={onViewError}
              onReady={onDocxReady}
              query={trimmedQuery}
            />
          ) : source.kind === "image" && url ? (
            <ImageDocumentView
              fileName={source.fileName}
              onNaturalSize={() => setUnitCount(1)}
              onRegion={(picked, preview, anchor) => takeRegion(picked, preview, anchor, null)}
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

      {/* 🔴 ONLY WHERE THERE IS SOMEWHERE TO SEND. See `onSendToChat`. */}
      {/* 🔴 A MARKED AREA GETS THE SAME BAR A HIGHLIGHT DOES. Its actions used to live only in the
          "…" menu, which meant boxing part of a diagram and then hunting through a dropdown for
          what to do with it. One selection can only be one thing, so the two anchors are exclusive
          and the text one wins — `setRegion(null)` runs on every selection change. */}
      {onSendToChat && (selection ?? region) && (
        <SelectionActions anchor={(selection ?? region)!.anchor} onAction={runAction} />
      )}
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
