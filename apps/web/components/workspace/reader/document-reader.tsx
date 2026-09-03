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
import { cropFileName, fileFromDataUrl } from "@/lib/reader/region-crop";
import {
  addDocumentComment,
  commentAskPrompt,
  deleteDocumentComment,
  listDocumentComments,
  setCommentResolved,
  type CommentAnchor,
  type CommentDocRef,
  type DocumentComment,
} from "@/lib/workspace/document-comments";
import { parseReaderAnchor, resolveAnchorUnit, type ReaderAnchor } from "@/lib/reader/reader-anchor";
import { findInDocument, stepMatch, type SearchMatch } from "@/lib/reader/reader-search";
import { describeCoverage } from "@nemesis/shared";

import { courseOf, describeSource, type ReaderSource } from "@/lib/reader/reader-source";
import { FIT_WIDTH, zoomIn, zoomOut, type ZoomMode } from "@/lib/reader/reader-zoom";

import { CommentLayer, type CommentDraftSpot } from "./comment-layer";
import { cropFrom } from "./use-region-drag";
import { DocxDocumentView } from "./docx-document-view";
import { ImageDocumentView, type ImageRegion } from "./image-document-view";
import { PdfDocumentView, type PdfReadyPayload, type ReaderViewHandle } from "./pdf-document-view";
import { ReaderSidebar, type SidebarTab } from "./reader-sidebar";
import { ReaderTopBar, type LinkedNote, type ReaderMode } from "./reader-top-bar";
import { ReadingView } from "./reading-view";
import { SheetDocumentView, type SheetsReadyPayload } from "./sheet-document-view";
import { SlidesDocumentView, type SlideTab } from "./slides-document-view";

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
  /**
   * Where this document's comments live, when the host wants the annotate layer at all.
   *
   * 🔴 ABSENT MEANS NO COMMENT MODE, not an inert one — the toolbar toggle is simply not there,
   * the same absent-not-inert rule the action bar follows. `uid`/`preview` ride along because the
   * store has a real lane and an in-memory one and only the host knows which this surface is on.
   */
  commentsDoc?: { ref: CommentDocRef; uid: string | null; preview: boolean };
  /** Trim the toolbar for a narrow pane beside a conversation. See `ReaderTopBar`'s `dense`. */
  dense?: boolean;
}

export function DocumentReader({
  source, anchor, linkedNotes = [], onOpenNote, onBack, onSendToChat, variant = "page", grounded = false,
  onUnitChange, commentsDoc, dense = false,
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
  // 🔴🔴 AND CLOSED IN A NARROW PANE, WHICH IS THE DIFFERENCE BETWEEN A READER AND A SLIVER.
  // Measured on production 2026-09-03: the canvas's reading pane is 360px at `xl`, this rail opens
  // by default, and it is about 270px wide — so the document the learner asked to read got roughly
  // NINETY PIXELS. The contents of a document cannot be worth three quarters of the space the
  // document itself gets.
  //
  // 🔴 `dense` ALREADY MEANS "narrow pane beside a conversation" and was already threaded here for
  // the toolbar; it just never reached the rail. The rail is not removed, only closed: the toggle
  // is in the top bar and a learner who wants the outline in the pane can still have it.
  const [railOpen, setRailOpen] = useState(!isDialog && !dense);
  /**
   * Viewport coordinates of a selection's bounding box — where a box about it should open.
   *
   * 🔴 DECLARED HERE SINCE `selection-actions.tsx` WAS DELETED. That component was the five-button
   * bar a highlight used to open (Ask about this, Explain, Add to notes, Make flashcards, Find
   * related); the owner cut it to one action on 2026-09-01, and one action does not need a menu to
   * choose it from. The whole-document versions of those four still live in the top bar's "…",
   * where they read as "do this to the file" rather than "do this to what I just highlighted".
   */
  const [selection, setSelection] = useState<{
    text: string;
    unit: number | null;
    anchor: { left: number; top: number; width: number };
  } | null>(null);
  /** A boxed part of a page: the box in fractions, the cut-out, and the page it was cut from.
   *  `unit` is null on a single picture, where "image 1" would be furniture rather than a location. */
  const [region, setRegion] = useState<{ region: ImageRegion; preview: string | null; unit: number | null; anchor: { left: number; top: number; width: number } } | null>(null);
  /**
   * Comment mode: clicks pin a note, drags draw a box, and text selection is handed back the
   * moment it is off. One drag cannot mean two things, which is why it is a mode at all — the
   * argument the old mark-an-area toggle made, absorbed into this one (owner 2026-08-28: the
   * panel annotates; it never edits).
   */
  const [commenting, setCommenting] = useState(false);
  const [comments, setComments] = useState<readonly DocumentComment[]>([]);
  /**
   * unit -> the element that IS that page/slide/sheet, as the views register them.
   *
   * 🔴 STATE, NOT A REF, unlike `slideElements` below: the comment layer renders portals INTO
   * these elements, so their arrival has to cause a render. A ref would leave every pin waiting
   * for an unrelated state change to appear.
   */
  const [unitElements, setUnitElements] = useState<ReadonlyMap<number, HTMLElement>>(new Map());

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
        anchor: { left: box.left, top: box.top, width: box.width },
        text,
        unit: Number.isInteger(measured) ? measured : unitCount > 0 && source.kind !== "document" ? unit : null,
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
  const takeRegion = useCallback((picked: ImageRegion, preview: string | null, anchor: { left: number; top: number; width: number }, at: number | null) => {
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
    setUnitElements((current) => {
      if (element ? current.get(index) === element : !current.has(index)) return current;
      const next = new Map(current);
      if (element) next.set(index, element);
      else next.delete(index);
      return next;
    });
  }, []);

  // ── Comments ──────────────────────────────────────────────────────────────
  const commentsRef = commentsDoc?.ref ?? null;
  const commentsKey = commentsRef ? `${commentsRef.kind}:${commentsRef.id}` : null;
  useEffect(() => {
    if (!commentsDoc) return;
    let live = true;
    void listDocumentComments(commentsDoc.uid, commentsDoc.ref, { preview: commentsDoc.preview }).then((list) => {
      if (live) setComments(list);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the doc, not the object identity a host may rebuild per render
  }, [commentsKey]);

  /**
   * The cut-out for a box comment, where a real picture exists to cut.
   *
   * 🔴 SCOPED BY KIND, NOT BY DISCOVERY. A slide's section contains <img>s — the deck's embedded
   * pictures — and "find an image and crop it" would cut a region of the WRONG picture with the
   * box's fractions. Only a PDF page's canvas and the image view's picture are the thing itself;
   * a slide stays uncroppable because what renders is our reconstruction (`pptx-slides.ts`).
   */
  const cropForComment = useCallback(
    (unit: number, anchorBox: NonNullable<CommentAnchor["box"]>): string | null => {
      const element = unitElements.get(unit);
      if (!element) return null;
      if (source.kind === "pdf") {
        const canvas = element.querySelector("canvas");
        // An unrendered canvas is not empty, it is 300x150 of nothing — the same invariant the
        // page view stamps on the element for exactly this reader (see `data-painted`).
        if (canvas instanceof HTMLCanvasElement && canvas.dataset.painted === "true") {
          return cropFrom(canvas, anchorBox, { height: canvas.height, width: canvas.width });
        }
        return null;
      }
      if (source.kind === "image") {
        const image = element.querySelector("img");
        if (image instanceof HTMLImageElement && image.naturalWidth > 0) {
          return cropFrom(image, anchorBox, { height: image.naturalHeight, width: image.naturalWidth });
        }
      }
      return null;
    },
    [source.kind, unitElements],
  );

  const keepComment = useCallback(
    async (draft: { unit: number; anchor: CommentAnchor; body: string }) => {
      if (!commentsDoc) return false;
      const made = await addDocumentComment(
        commentsDoc.uid,
        commentsDoc.ref,
        { anchor: draft.anchor, body: draft.body, unit: draft.unit },
        { preview: commentsDoc.preview },
      );
      if (!made) return false;
      setComments((current) => [...current, made]);
      return true;
    },
    [commentsDoc],
  );

  /** "Send to Nemesis": the note is KEPT and handed over — one gesture, both destinations, which
   *  is how the reference behaves (docs/claude-design-reference.md). */
  // 🔴 DECLARED BEFORE THE HIGHLIGHT HOOK BELOW READS IT. Left where it was, the effect that turns
  // a selection into a comment draft closed over a `const` declared later in the same body — a
  // temporal dead zone that `tsc` catches and a runtime would throw on.
  const canComment = Boolean(commentsDoc) && ["pdf", "slides", "sheet", "image", "document"].includes(source.kind);

  /**
   * The comment box a highlight opens.
   *
   * 🔴 IT IS A REQUEST, NOT STATE THE LAYER READS. `CommentLayer` owns the draft — it has to, since
   * the mode's own click and drag produce drafts too and there can only be one open at a time. So
   * this hands one over and is cleared the moment it is taken, which also means highlighting the
   * same words twice reopens the box instead of doing nothing.
   *
   * 🔴 A NEW OBJECT PER GESTURE, DELIBERATELY. The effect that consumes it keys on identity; two
   * structurally equal drafts would be one event.
   */
  const [commentRequest, setCommentRequest] = useState<CommentDraftSpot | null>(null);
  const clearCommentRequest = useCallback(() => setCommentRequest(null), []);

  /**
   * The comment box a highlight opens, measured from the LIVE selection.
   *
   * 🔴🔴 IT READS THE DOM, NOT THE `selection` STATE, AND THAT IS A RACE FIX RATHER THAN A STYLE
   * CHOICE. The first version closed over `selection`, which the `selectionchange` handler sets.
   * The browser fires `selectionchange` and then `mouseup` back to back at the end of a drag, and
   * React need not have committed the state update in between — so `mouseup` ran with the previous
   * render's closure, saw `selection === null`, and silently did nothing.
   *
   * Found on production: the highlight landed ("Clearance is the volume of plasma cleare"), the old
   * bar was gone, and no box opened. It would have been intermittent in real use, which is the
   * worst kind of nothing to debug. The live selection is the same object the state was going to be
   * built from, one render earlier.
   */
  const commentOnSelection = useCallback(() => {
    if (!canComment) return;
    const active = typeof window === "undefined" ? null : window.getSelection();
    const text = active?.toString().trim() ?? "";
    if (!active || active.rangeCount === 0 || text.length < 2) return;

    const range = active.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const element = container.nodeType === Node.ELEMENT_NODE ? (container as Element) : container.parentElement;
    if (!element?.closest("[data-reader-document]")) return;

    const box = range.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) return;

    // A flowing document has no page to pin to; its comments are block-anchored, which only the
    // mode's own click can work out. Highlighting there still selects text normally — it just does
    // not offer a comment yet.
    const pageElement = element.closest<HTMLElement>("[data-page]");
    if (!pageElement) return;
    const page = pageElement.getBoundingClientRect();
    if (page.width <= 0 || page.height <= 0) return;
    const measured = Number.parseInt(pageElement.dataset.page ?? "", 10);
    if (!Number.isInteger(measured)) return;

    setCommentRequest({
      anchor: {
        quote: text,
        x: Math.min(Math.max((box.left + box.width / 2 - page.left) / page.width, 0), 1),
        y: Math.min(Math.max((box.top - page.top) / page.height, 0), 1),
      },
      // 🔴 BELOW THE HIGHLIGHT, ALIGNED TO ITS START — never on top of it. The first version opened
      // at the selection's own top-left, so the box covered the line it was asking about; the
      // learner could not read what they had just picked. `above` lets it flip up near the foot of
      // the window instead of being clamped back down over the text.
      at: { above: box.top - 8, left: box.left, top: box.bottom + 8 },
      fromSelection: true,
      unit: measured,
    });
  }, [canComment]);

  // 🔴 ON `mouseup`, NOT ON `selectionchange`. The selection changes on every pixel of a drag, so
  // opening the box from it would flash a composer under the cursor for the whole gesture and
  // steal the focus mid-drag. The release is the moment the learner has finished choosing.
  useEffect(() => {
    if (!canComment) return;
    const onRelease = () => {
      // Deferred one tick: `mouseup` fires BEFORE the selection settles, so reading it now gives
      // the previous one.
      window.setTimeout(commentOnSelection, 0);
    };
    document.addEventListener("mouseup", onRelease);
    return () => document.removeEventListener("mouseup", onRelease);
  }, [canComment, commentOnSelection]);

  const sendComment = useCallback(
    (draft: { unit: number; anchor: CommentAnchor; body: string }) => {
      void keepComment(draft);
      const crop = draft.anchor.box ? cropForComment(draft.unit, draft.anchor.box) : null;
      const cropped = crop ? fileFromDataUrl(crop, cropFileName(source.fileName, unitLabel, draft.unit)) : null;
      const prompt = commentAskPrompt({
        anchor: draft.anchor,
        body: draft.body,
        cropAttached: cropped !== null,
        fileName: source.fileName,
        unit: draft.unit,
        unitLabel,
      });
      onSendToChat?.(prompt, [...documentAttachment(), ...(cropped ? [cropped] : [])]);
    },
    [cropForComment, documentAttachment, keepComment, onSendToChat, source.fileName, unitLabel],
  );

  const resolveComment = useCallback(
    (comment: DocumentComment) => {
      if (!commentsDoc) return;
      const resolved = comment.resolvedAt === null;
      setComments((current) =>
        current.map((row) => (row.id === comment.id ? { ...row, resolvedAt: resolved ? new Date().toISOString() : null } : row)),
      );
      void setCommentResolved(commentsDoc.uid, commentsDoc.ref, comment.id, resolved, { preview: commentsDoc.preview });
    },
    [commentsDoc],
  );

  const removeComment = useCallback(
    (comment: DocumentComment) => {
      if (!commentsDoc) return;
      setComments((current) => current.filter((row) => row.id !== comment.id));
      void deleteDocumentComment(commentsDoc.uid, commentsDoc.ref, comment.id, { preview: commentsDoc.preview });
    },
    [commentsDoc],
  );

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
  /**
   * Comment mode is offered wherever there is a surface to pin to. Audio has no page; "file" has
   * no view at all. Boxes are drawable only where geometry is fixed — a flowing document reflows
   * with the panel width, so there a click snaps to the paragraph instead.
   */
  const boxesDrawable = source.kind === "pdf" || source.kind === "slides" || source.kind === "image";
  /** Only some documents have anything to list in a contents rail. */
  const hasContents = source.kind === "pdf" || source.kind === "slides" || source.kind === "document" || source.kind === "sheet";
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
      className="nemesis-reader relative flex h-full min-h-0 flex-col bg-(--reader-room)"
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
        commenting={commenting}
        dense={dense}
        onToggleCommenting={canComment && loadState === "ready" ? () => setCommenting((current) => !current) : undefined}
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

      {/* 🔴 NOT IN THE PANE (owner, 2026-09-01: *"also remove the slides, notes, outline options"*).
          A second row of tabs directly under the document's own tab strip reads as chrome about
          chrome, and the two things it switches to are not what someone glancing at a lecture beside
          a conversation came for: the outline is the deck's headings, which the canvas already has,
          and the speaker notes are the lecturer's, which the parse already carries into what
          Nemesis knows. The slides themselves are the point, so `slideTab` stays "slides".

          🔴 THE ROW SURVIVES ON THE STANDALONE READER, where the deck is the whole screen and
          reading the lecturer's notes beside it is a real thing to want. */}
      {source.kind === "slides" && loadState === "ready" && !dense && (
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
        </div>
      )}

      {commenting && (
        // 🔴 SAID OUT LOUD, because neither gesture is discoverable — the reference floats the same
        // pill for the same reason ("Click to comment, drag to draw").
        <p className="pointer-events-none absolute left-1/2 top-14 z-40 -translate-x-1/2 rounded-full border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-3 py-1 text-[0.6875rem] font-medium text-(--ui-text-secondary) shadow-md" data-testid="reader-comment-hint">
          {boxesDrawable ? "Click to comment, drag to draw a box" : source.kind === "document" ? "Click a paragraph to comment" : "Click to comment"}
        </p>
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
              onUnitChange={noteUnit}
              ref={viewRef}
              registerUnitElement={registerSlide}
              zoom={zoom}
            />
          ) : source.kind === "slides" && bytes ? (
            <SlidesDocumentView
              bytes={bytes}
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
            <DocxDocumentView bytes={bytes} onError={onViewError} onReady={onDocxReady} query={trimmedQuery} registerElement={registerSlide} />
          ) : source.kind === "image" && url ? (
            <ImageDocumentView
              fileName={source.fileName}
              onNaturalSize={() => setUnitCount(1)}
              onRegion={(picked, preview, anchor) => takeRegion(picked, preview, anchor, null)}
              registerElement={registerSlide}
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
            comments={canComment ? comments : undefined}
            document={pdfDocument}
            onDeleteComment={removeComment}
            onGoToUnit={goToUnit}
            onResolveComment={resolveComment}
            onTabChange={setSidebarTab}
            outline={outline}
            outlineIsAuthored={outlineIsAuthored}
            // Pages-as-pictures exist only on PDFs; the comments tab exists wherever commenting
            // does. Everything else falls back to the outline.
            tab={sidebarTab === "pages" && source.kind !== "pdf" ? "outline" : sidebarTab === "comments" && !canComment ? "outline" : sidebarTab}
            unit={unit}
            unitCount={unitCount}
            unitLabel={unitLabel}
          />
        )}
      </div>

      {canComment && (
        <CommentLayer
          blockSnap={source.kind === "document"}
          boxesDrawable={boxesDrawable}
          commenting={commenting}
          comments={comments}
          onDelete={removeComment}
          onKeep={keepComment}
          onResolve={resolveComment}
          onRequestTaken={clearCommentRequest}
          onSend={onSendToChat ? sendComment : null}
          request={commentRequest}
          unitLabel={unitLabel}
          units={unitElements}
        />
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
