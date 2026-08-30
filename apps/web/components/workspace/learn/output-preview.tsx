"use client";

// What a made artifact looks like when you open it, rather than when you download it.
//
// 🔴🔴 THE ROW USED TO DOWNLOAD ON CLICK, AND THAT WAS THE WHOLE COMPLAINT. Owner, 2026-08-25:
// *"it should create an artifact as 'output' not just straight download."* A row whose only action
// is to put a file in the Downloads folder is not an artifact — it is a link that happens to be
// listed. You cannot check what Nemesis wrote before deciding whether you want it, and on a second
// visit the only way to see your own document again is to download it a second time.
//
// So the row opens this, and the download is a button INSIDE it. Making the file is still the last
// step and still deliberate; it is just no longer the only one.
//
// 🔴 IT RENDERS THROUGH `docBlocks` — THE SAME PARSER THE WRITERS USE. A preview built from a
// second interpretation of the markdown would be a preview of a different document: the reader
// would see a table this shows and the .docx drops, and only find out after opening Word. One
// parser means what is on screen is what is in the file, including its limitations.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { CHROME } from "./reader-chrome";
import { useDockWidth } from "./use-dock-width";

import { Codicon } from "@/components/desktop-ui/codicon";
import { CommentLayer } from "@/components/workspace/reader/comment-layer";
import {
  addDocumentComment,
  deleteDocumentComment,
  listDocumentComments,
  setCommentResolved,
  type CommentAnchor,
  type DocumentComment,
} from "@/lib/workspace/document-comments";
import type { ReviseAsk } from "@/lib/learn/revise-output";
import { useDeclareSidePanel } from "@/components/workspace/shell/side-panel";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { docBlocks } from "@/lib/export/doc-blocks";
import { downloadDeck } from "@/lib/export/deck-download";
import { downloadDocx, downloadPdf, downloadSheet, pdfBlob, type SheetData } from "@/lib/export/doc-file";
import type { CanvasOutput } from "@/lib/learn/canvas-model";
import { readLibraryNote } from "@/lib/workspace/library-note-read";
import { cn } from "@/lib/utils";

import { DeckPreview } from "./deck-preview";
import { PdfPages } from "./pdf-pages";

/**
 * The artifact chrome, measured in the owner's own browser against the reference (2026-08-25,
 * viewport 1470x779). Owner: *"One to one spacing, coloring, font, sizing exactly."*
 *
 * 🔴 THESE ARE MEASUREMENTS, NOT PREFERENCES. Every number here was read off the running reference
 * with `getBoundingClientRect` and `getComputedStyle`; none was eyeballed from a screenshot. If one
 * looks wrong, re-measure before changing it — a screenshot at a different zoom is how a
 * "one-to-one" match drifts.
 */
// 🔴 THE CHROME AND THE DOCK WIDTH MOVED TO `reader-chrome.ts` on 2026-08-27, when the source
// preview became a second docked reader. The reasoning for every number is there; nothing changed.


/** What each artifact kind is called, and what its download button says. */
const DOWNLOAD_LABEL: Record<string, string> = {
  slides: "Download .pptx",
  document: "Download .docx",
  note: "Download .docx",
  pdf: "Download .pdf",
  report: "Download .docx",
  sheet: "Download .csv",
};

export function OutputPreview({
  canvasId = "",
  initialMode = "docked",
  onClose,
  output,
  comments,
  onRevise,
  onUndo,
}: {
  /** Needed only by a deck, whose full-page view is addressed by canvas. */
  canvasId?: string;
  /**
   * Which surface this is.
   *
   * 🔴 TWO SHAPES, BOTH THE REFERENCE'S, AND THEY DIFFER BY WHERE THEY ARE OPENED FROM. In a
   * conversation the reader docks right and pushes the thread, because the thread is what you
   * check the artifact against. Opened from the Library there is no thread, so it takes the whole
   * surface with the close on the LEFT beside a breadcrumb — measured in the reference at x=193,
   * against the docked panel's close at the far right.
   */
  initialMode?: "docked" | "full";
  onClose: () => void;
  output: CanvasOutput;
  /**
   * The annotate layer's environment, when the host wants comments on this output at all.
   * Absent = no comment mode, not an inert one — the same rule the source reader follows.
   */
  comments?: { uid: string | null; preview: boolean };
  /**
   * Nemesis revising its own work: the note is applied to the document and the panel re-renders
   * with the result. Returns an error sentence, or null on success. Absent = the note box offers
   * "Add comment" only — a send with nowhere to land is a control that does nothing.
   */
  onRevise?: (output: CanvasOutput, ask: ReviseAsk) => Promise<string | null>;
  /** Restore the state before Nemesis's last change. Offered only while `revisions` holds one. */
  onUndo?: (output: CanvasOutput) => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"docked" | "full">(initialMode);
  /**
   * The docked width, and the drag that changes it.
   *
   * 🔴 THE SAME HOOK THE SOURCE READER USES — owner, 2026-08-27: *"allow user to slide the sidebar
   * width like in chatgpt."* Two docked readers on one surface that resized differently would be
   * two objects; one hook means a width dragged on either is the width both open at.
   *
   * 🔴 THE FRACTION, NOT THE PIXELS, IS WHAT PERSISTS — see `use-dock-width.ts`. A panel dragged
   * wide on a large monitor would otherwise cover the whole canvas on a laptop.
   */
  const { dragging, onDragStart, width: dock } = useDockWidth();

  // Collapses the left sidebar to the rail while this is open, and pushes the surface by exactly
  // the docked width — see side-panel.tsx. Full screen pushes nothing: it covers everything.
  useDeclareSidePanel(mode === "docked" ? dock : 0);
  /**
   * A note's body, fetched on open.
   *
   * 🔴 NOTES AND REPORTS OPEN HERE NOW, WHICH IS AN OWNER ORDER: *"i dont want anything to route to
   * this old library."* Those rows were `<a href="/library/classic?note=…">` — a surface that is
   * being retired, and which the owner found showing "Couldn't reach your notes". They carry a path
   * rather than their text (the lists select titles, not bodies), so this is the one query that
   * turns a path into something readable.
   *
   * `undefined` = not asked yet, `null` = asked and could not be reached, string = the note.
   */
  const [fetched, setFetched] = useState<string | null | undefined>(undefined);
  const notePath = output.notePath;
  const needsFetch = !output.markdown && !output.sheet && Boolean(notePath);

  useEffect(() => {
    if (!needsFetch || !notePath) return;
    let live = true;
    void readLibraryNote(notePath).then((content) => {
      if (live) setFetched(content);
    });
    return () => {
      live = false;
    };
  }, [needsFetch, notePath]);

  // Escape closes, same as every transient surface on the canvas.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const markdown = output.markdown ?? fetched ?? "";
  const deck = output.kind === "slides" ? output.deck : undefined;

  // ── The annotate layer ────────────────────────────────────────────────────
  // Same store, same layer, same rules as the source reader — what differs on an output is only
  // what "Send to Nemesis" DOES: here it is an instruction, and Nemesis revises its own work.
  const [commenting, setCommenting] = useState(false);
  // 🔴 THE HARNESS MAKES NO NETWORK CALLS, and it signs a mock session, so a host's uid alone
  // cannot decide the lane — the same trap `source-preview.tsx` documents. Signed-out is the
  // in-memory lane too.
  const inPreviewHarness = useWorkspacePreview() !== null;
  const commentEnv = comments ? { preview: comments.preview || inPreviewHarness || comments.uid === null, uid: comments.uid } : undefined;
  const [commentRows, setCommentRows] = useState<readonly DocumentComment[]>([]);
  const [units, setUnits] = useState<ReadonlyMap<number, HTMLElement>>(new Map());
  const [revising, setRevising] = useState(false);
  const [reviseError, setReviseError] = useState<string | null>(null);
  // 🔴 THE LEDGER ID WHEN THERE IS ONE. The canvas-local output id and the Library's asset row
  // would otherwise key the SAME document's comments two different ways, and a note left in the
  // canvas would be invisible from the Library. `assetId` is the durable name (§12); the fallback
  // covers outputs whose ledger write failed, which are canvas-local anyway.
  const commentRef = useMemo(() => ({ id: output.assetId ?? output.id, kind: "output" as const }), [output.assetId, output.id]);

  const blocks = useMemo(() => (markdown ? docBlocks(markdown) : []), [markdown]);
  // Comment mode exists where there is something to pin to, and revising needs the content to be
  // HELD (a fetched note's home is its own editor; a sheet and a built PDF are not blocks).
  const canComment = Boolean(comments) && (blocks.length > 0 || Boolean(deck)) && output.kind !== "pdf" && !output.sheet;
  const revisable = Boolean(onRevise) && Boolean(output.markdown || deck);

  useEffect(() => {
    if (!commentEnv || !canComment) return;
    let live = true;
    void listDocumentComments(commentEnv.uid, commentRef, { preview: commentEnv.preview }).then((rows) => {
      if (live) setCommentRows(rows);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the doc, not object identity
  }, [commentRef.id, canComment]);

  const registerUnit = useCallback((unit: number, element: HTMLElement | null) => {
    setUnits((current) => {
      if (element ? current.get(unit) === element : !current.has(unit)) return current;
      const next = new Map(current);
      if (element) next.set(unit, element);
      else next.delete(unit);
      return next;
    });
  }, []);

  const keepComment = useCallback(
    async (draft: { unit: number; anchor: CommentAnchor; body: string }) => {
      if (!commentEnv) return false;
      const made = await addDocumentComment(commentEnv.uid, commentRef, { anchor: draft.anchor, body: draft.body, unit: draft.unit }, { preview: commentEnv.preview });
      if (!made) return false;
      setCommentRows((current) => [...current, made]);
      return true;
    },
    [commentRef, commentEnv],
  );

  /** Where the note points, in prose, plus the pointed-at words themselves. */
  const askFromDraft = useCallback(
    (draft: { unit: number; anchor: CommentAnchor; body: string }): ReviseAsk => {
      if (deck) {
        const slide = deck.slides[draft.unit - 1];
        return { body: draft.body, spot: `slide ${draft.unit}`, spotText: slide?.title ?? "" };
      }
      const block = draft.anchor.block !== undefined ? blocks[draft.anchor.block] : undefined;
      const spotText = block ? ("text" in block ? block.text : "") : "";
      return { body: draft.body, spot: draft.anchor.block !== undefined ? `paragraph ${draft.anchor.block + 1}` : "", spotText };
    },
    [blocks, deck],
  );

  /**
   * Send = keep + apply. The comment resolves ITSELF on success — it was an instruction and it was
   * executed; the changed document is the reply. On failure it stays open with the error said out
   * loud, and the document is exactly what it was.
   */
  const sendToNemesis = useCallback(
    (draft: { unit: number; anchor: CommentAnchor; body: string }) => {
      if (!onRevise || !commentEnv) return;
      setReviseError(null);
      setRevising(true);
      void (async () => {
        const made = await addDocumentComment(commentEnv.uid, commentRef, { anchor: draft.anchor, body: draft.body, unit: draft.unit }, { preview: commentEnv.preview });
        if (made) setCommentRows((current) => [...current, made]);
        const failure = await onRevise(output, askFromDraft(draft));
        setRevising(false);
        if (failure) {
          setReviseError(failure);
          return;
        }
        if (made) {
          setCommentRows((current) => current.map((row) => (row.id === made.id ? { ...row, resolvedAt: new Date().toISOString() } : row)));
          void setCommentResolved(commentEnv.uid, commentRef, made.id, true, { preview: commentEnv.preview });
        }
      })();
    },
    [askFromDraft, commentRef, commentEnv, onRevise, output],
  );

  const resolveComment = useCallback(
    (comment: DocumentComment) => {
      if (!commentEnv) return;
      const resolved = comment.resolvedAt === null;
      setCommentRows((current) => current.map((row) => (row.id === comment.id ? { ...row, resolvedAt: resolved ? new Date().toISOString() : null } : row)));
      void setCommentResolved(commentEnv.uid, commentRef, comment.id, resolved, { preview: commentEnv.preview });
    },
    [commentRef, commentEnv],
  );

  const removeComment = useCallback(
    (comment: DocumentComment) => {
      if (!commentEnv) return;
      setCommentRows((current) => current.filter((row) => row.id !== comment.id));
      void deleteDocumentComment(commentEnv.uid, commentRef, comment.id, { preview: commentEnv.preview });
    },
    [commentRef, commentEnv],
  );

  /**
   * A PDF artifact is rendered AS A PDF, from the same bytes the download hands over.
   *
   * 🔴 OWNER, 2026-08-25: *"why are artifacts rendering in md and not their respective formats?"*
   * It was showing a styled approximation of what the PDF would contain — close enough to look
   * right, and wrong about every question a person opens a PDF to answer: where the pages break,
   * whether the table fits, what it looks like printed.
   *
   * 🔴 BUILT ONCE, WHEN THERE IS SOMETHING TO BUILD FROM. Rebuilding on every render would re-run
   * pdf-lib and re-open a pdf.js worker on each keystroke elsewhere in the tree.
   */
  const [pdf, setPdf] = useState<Blob | null>(null);
  useEffect(() => {
    if (output.kind !== "pdf" || !markdown) return;
    let live = true;
    void pdfBlob(markdown, output.title).then((blob) => {
      if (live) setPdf(blob);
    });
    return () => {
      live = false;
    };
  }, [markdown, output.kind, output.title]);
  const download = () => {
    // 🔴 THE DECK IS BUILT BY ITS OWN DOWNLOADER, which signs the learner's figures first — see
    // deck-download.ts. Rebuilding it here would be a second copy of that step, and the copy that
    // forgets the signatures ships a deck with captions where the pictures should be.
    if (output.kind === "slides" && output.deck) return void downloadDeck(output.deck, output.title);
    if (output.kind === "sheet" && output.sheet) return void downloadSheet(output.sheet as SheetData, output.title);
    if (!markdown) return;
    void (output.kind === "pdf" ? downloadPdf(markdown, output.title) : downloadDocx(markdown, output.title));
  };

  const full = mode === "full";

  /**
   * 🔴🔴 PORTALLED TO THE BODY, AND WITHOUT IT THE PANEL COLLAPSES INTO A CORNER. `position: fixed`
   * resolves against the viewport ONLY while no ancestor carries a transform, filter or perspective
   * — any of those becomes the containing block instead. The canvas animates, so once its surface
   * was narrowed to make room for this panel, `right-0` started meaning "the right edge of the
   * narrowed canvas" and the reader rendered 980px wide inside a 490px box.
   *
   * 🔴 IT ONLY APPEARED AFTER THE PUSH LANDED. Before the surface was narrowed, the transformed
   * ancestor happened to be the full width, so the bug was invisible and the layout was correct by
   * coincidence. Seen on screen; it is not the kind of thing a diff shows.
   */
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  if (!host) return null;

  return createPortal(
    // 🔴🔴 FLUSH, NOT FLOATING, AND SIZED BY MEASUREMENT. The first version was a rounded card with
    // a shadow, inset by 12px, 38rem wide. The reference is none of those things: 980 of 1470 with
    // no radius, no shadow and no inset, its right edge on the viewport's. A rounded card reads as
    // something laid ON the page; this reads as part of it, which is what a document you are
    // working against should be.
    //
    // 🔴 NO CATCHER, EITHER. The old outside-press-to-close came with the floating card. A panel
    // that owns two thirds of the window and pushes the rest must not vanish because somebody
    // clicked the conversation next to it — the close button is the way out, plus Escape.
    <div
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex flex-col bg-(--ui-bg-elevated)",
        full ? "left-0" : "border-l border-(--ui-stroke-tertiary)",
        // 🔴 THE SLIDE IS DROPPED WHILE DRAGGING: an animation running during a resize makes the
        // edge lag the pointer by its own duration, which reads as the panel fighting you.
        !dragging && "reader-dock-in",
      )}
      // 🔴🔴 THE STAMP TRAVELS WITH THE PORTAL, AND WITHOUT IT EVERY BUTTON IN HERE GOES ACID GREEN.
      // `globals.css` carries `button:where(:not([data-workspace] *)) { background: var(--acid) }`,
      // so the moment this subtree moved to `document.body` it left the workspace scope and the
      // global rule took the header controls: measured `rgb(64,64,64)` filled pills where the
      // reference has transparent 36x36 squares. The dev-preview harnesses have hit this before;
      // portalling is how it reaches real code.
      data-workspace
      role="dialog"
      style={full ? undefined : { width: dock }}
    >
      {/* 🔴 THE GRIP IS ON THE LEFT EDGE, WHICH IS THE EDGE THAT MOVES, and only while docked —
          full screen has no edge to drag. Same handle and same hook as the source reader. */}
      {!full && (
        <div
          aria-label="Resize the panel"
          className="absolute inset-y-0 -left-[3px] z-10 w-[6px] cursor-col-resize bg-transparent transition-colors hover:bg-(--ui-action)/40"
          onPointerDown={onDragStart}
          role="separator"
        />
      )}
      <div className={CHROME.header} ref={card}>
        {/* 🔴 FULL SCREEN PUTS THE CLOSE ON THE LEFT, DOCKED PUTS IT ON THE RIGHT, and that is the
            reference's own arrangement rather than a preference: measured at x=193 beside the
            breadcrumb in the Library reader, and at the far right in the conversation panel. The
            control nearest the content is the one that dismisses it. */}
        {full && (
          <button aria-label="Close" className={CHROME.button} onClick={onClose} title="Close" type="button">
            <Codicon name="close" size={CHROME.icon} />
          </button>
        )}
        <span className={cn(CHROME.crumb, "min-w-0 flex-1")} title={output.title}>
          {/* "Library / name" — the same two-part crumb, with the prefix muted. */}
          <span className="text-(--ui-text-quaternary)">Library&nbsp;/&nbsp;</span>
          {output.title}
        </span>
        {canComment && (
          <button
            aria-label={commenting ? "Stop commenting" : "Comment on this document"}
            aria-pressed={commenting}
            className={cn(CHROME.button, commenting && "bg-(--ui-action) text-(--ui-action-glyph)")}
            data-testid="output-comment-mode"
            onClick={() => setCommenting((current) => !current)}
            title={commenting ? "Commenting: click a spot to pin a note." : "Comment on this document"}
            type="button"
          >
            <Codicon name="comment" size={CHROME.icon} />
          </button>
        )}
        {onUndo && (output.revisions?.length ?? 0) > 0 && (
          <button
            aria-label="Undo Nemesis's last change"
            className={CHROME.button}
            data-testid="output-undo-revision"
            onClick={() => onUndo(output)}
            title="Undo Nemesis's last change"
            type="button"
          >
            <Codicon name="discard" size={CHROME.icon} />
          </button>
        )}
        <button
          aria-label={DOWNLOAD_LABEL[output.kind] ?? "Download"}
          className={cn(CHROME.button, "disabled:opacity-40")}
          disabled={!markdown && !output.sheet && !deck}
          onClick={download}
          title={DOWNLOAD_LABEL[output.kind] ?? "Download"}
          type="button"
        >
          {/* 🔴 `download`, NOT `desktop-download`. The latter is a MONITOR with an arrow — measured
              against the reference's plain tray-and-arrow it reads as a different action entirely,
              and it is the kind of thing only a side-by-side look catches. */}
          <Codicon name="download" size={CHROME.icon} />
        </button>
        <button
          aria-label={full ? "Exit full screen" : "Full screen"}
          className={CHROME.button}
          onClick={() => setMode(full ? "docked" : "full")}
          title={full ? "Exit full screen" : "Full screen"}
          type="button"
        >
          <Codicon name={full ? "screen-normal" : "screen-full"} size={CHROME.icon} />
        </button>
        {!full && (
          <button aria-label="Close" className={CHROME.button} onClick={onClose} title="Close" type="button">
            <Codicon name="close" size={CHROME.icon} />
          </button>
        )}
      </div>

      {commenting && !revising && (
        <p className="pointer-events-none absolute left-1/2 top-14 z-40 -translate-x-1/2 rounded-full border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-3 py-1 text-[length:var(--canvas-text-meta)] font-medium text-(--ui-text-secondary) shadow-md" data-testid="output-comment-hint">
          {deck ? "Click a slide to comment, drag to mark part of it" : "Click a paragraph to comment"}
        </p>
      )}
      {revising && (
        // 🔴 THE WAIT IS SAID, AND THE DOCUMENT UNDERNEATH IS THE OLD ONE UNTIL THE NEW ONE LANDS —
        // never a blank, never a spinner over nothing.
        <p className="pointer-events-none absolute left-1/2 top-14 z-40 -translate-x-1/2 rounded-full border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-3 py-1 text-[length:var(--canvas-text-meta)] font-medium text-(--ui-text-secondary) shadow-md" data-testid="output-revising">
          Nemesis is revising this document…
        </p>
      )}
      {reviseError && (
        <p className="absolute left-1/2 top-14 z-40 -translate-x-1/2 rounded-full border border-(--ui-danger)/40 bg-(--ui-bg-elevated) px-3 py-1 text-[length:var(--canvas-text-meta)] font-medium text-(--ui-danger) shadow-md">
          {reviseError}
        </p>
      )}

      {/* 🔴 THE SHEET IS INSET 24px AND CARRIES THE REFERENCE'S OWN SHADOW, measured: 931 wide
          inside 980, `0 1px 3px rgba(0,0,0,.1), 0 1px 2px -1px rgba(0,0,0,.1)`. It is a page on a
          desk, not a panel with padding. */}
      <div className="min-h-0 flex-1 overflow-auto px-[24px] pb-[24px] pt-[25px]">
        <div className="mx-auto w-full bg-white px-[40px] py-[32px] shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_-1px_rgba(0,0,0,0.1)] dark:bg-(--ui-bg-primary)">
          {deck ? (
            <DeckPreview canvasId={canvasId} outputId={output.assetId ?? output.id} plan={deck} registerElement={canComment ? registerUnit : undefined} />
          ) : output.sheet ? (
            <SheetTable sheet={output.sheet as SheetData} />
          ) : output.kind === "pdf" ? (
            pdf ? (
              <PdfPages blob={pdf} />
            ) : (
              <p className="m-0 py-8 text-center text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">Building the PDF…</p>
            )
          ) : needsFetch && fetched === undefined ? (
            <p className="m-0 py-8 text-center text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">Opening…</p>
          ) : needsFetch && fetched === null ? (
            <p className="m-0 py-8 text-center text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary)">
              Couldn&apos;t open this one. It may have been deleted.
            </p>
          ) : (
            <DocBody markdown={markdown} registerElement={canComment ? registerUnit : undefined} />
          )}
        </div>
      </div>

      {canComment && (
        <CommentLayer
          blockSnap={!deck}
          boxesDrawable={Boolean(deck)}
          commenting={commenting && !revising}
          comments={commentRows}
          onDelete={removeComment}
          onKeep={keepComment}
          onResolve={resolveComment}
          onSend={revisable ? sendToNemesis : null}
          unitLabel={deck ? "slide" : "section"}
          units={units}
        />
      )}
    </div>,
    host,
  );
}

/** The document, in the shapes the file will actually contain. */
function DocBody({ markdown, registerElement }: { markdown: string; registerElement?: (unit: number, element: HTMLElement | null) => void }) {
  const blocks = docBlocks(markdown);
  // Stable, for the crash-shaped reason the docx article's ref is — see comment-layer's guards.
  const registerPage = useCallback((element: HTMLElement | null) => registerElement?.(1, element), [registerElement]);
  if (!blocks.length) {
    return <p className="m-0 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">This document is empty.</p>;
  }
  return (
    // 🔴 EVERY BLOCK BELOW CARRIES data-comment-block AND `relative`, the flowing-document anchor
    // contract the Word reader set: the page reflows with the panel width, so the stable address
    // is WHICH BLOCK and the pin lives inside that block's own box.
    <div className="relative grid gap-2" ref={registerPage}>
      {blocks.map((block, index) => {
        // 🔴 KEYED ON POSITION, WHICH IS CORRECT HERE AND USUALLY IS NOT. The list is derived from
        // one immutable string and is never reordered, inserted into or filtered, so position IS
        // identity. Two identical bullets would otherwise collide on a text key.
        const key = `${index}`;
        if (block.kind === "heading") {
          const size = block.level === 1 ? "--canvas-text-lead" : block.level === 2 ? "--canvas-text-body" : "--canvas-text-small";
          return (
            <p className={`relative m-0 mt-2 font-semibold text-[length:var(${size})] text-(--ui-text-primary)`} data-comment-block={index} key={key}>
              {block.text}
            </p>
          );
        }
        if (block.kind === "table") {
          // 🔴 THE SAME COMPONENT THE SPREADSHEET USES. A document's table and a spreadsheet are
          // the same object on screen, and two renderers would drift. Wrapped rather than edited:
          // the stamp is this surface's concern, not the table's.
          return (
            <div className="relative" data-comment-block={index} key={key}>
              <SheetTable sheet={{ columns: block.header, rows: block.rows }} />
            </div>
          );
        }
        if (block.kind === "bullet" || block.kind === "number") {
          return (
            <p className="relative m-0 flex gap-2 pl-2 text-[length:var(--canvas-text-small)] leading-relaxed text-(--ui-text-secondary)" data-comment-block={index} key={key}>
              <span className="shrink-0 text-(--ui-text-quaternary)">{block.kind === "bullet" ? "•" : `${block.index}.`}</span>
              <span>{block.text}</span>
            </p>
          );
        }
        return (
          <p className="relative m-0 text-[length:var(--canvas-text-small)] leading-relaxed text-(--ui-text-secondary)" data-comment-block={index} key={key}>
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

/** The spreadsheet, as the grid it will open as. */
function SheetTable({ sheet }: { sheet: SheetData }) {
  return (
    // 🔴 THE SCROLLER IS THE WRAPPER, NOT THE TABLE. A wide table inside a card with no horizontal
    // scroller of its own pushes the whole dialog wider than the viewport.
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[length:var(--canvas-text-small)]">
        <thead>
          <tr>
            {sheet.columns.map((column) => (
              <th
                className="border-b border-(--ui-stroke-secondary) px-2 py-1.5 text-left font-medium text-(--ui-text-primary)"
                key={column}
                scope="col"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row, index) => (
            <tr key={index}>
              {sheet.columns.map((column, cell) => (
                <td className="border-b border-(--ui-stroke-tertiary) px-2 py-1.5 align-top text-(--ui-text-secondary)" key={column}>
                  {row[cell] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
