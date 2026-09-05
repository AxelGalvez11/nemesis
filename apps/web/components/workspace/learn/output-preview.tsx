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

import { DockPanel } from "./dock-panel";
import { DockTabs } from "./dock-tabs";
import type { DockItem } from "./document-dock";
import { ReaderAsk, ASK_CLEARANCE } from "./reader-ask";
import { pageHeightFrom, sandboxedPage } from "@/lib/learn/html-output";

import { biggerThan, CHROME, type ReaderMode } from "./reader-chrome";
import { useDockWidth } from "./use-dock-width";

import { Codicon } from "@/components/desktop-ui/codicon";
import { CommentLayer } from "@/components/workspace/reader/comment-layer";
import { DocumentRail, railHeadings } from "./document-rail";
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
import { downloadDocx, downloadHtml, downloadMarkdown, downloadPdf, downloadSheet, pdfBlob, type SheetData } from "@/lib/export/doc-file";
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
  html: "Download .html",
  // 🔴 `.md`, NOT `.docx`, SINCE 2026-09-03. A note is Markdown from the moment it is written, and
  // this button promised a Word file for it. Owner: *"I like to make a markdown file of all the
  // points that I should be able to recall from memory myself."* `report` keeps .docx: a cited
  // research report is something a learner hands in, and Word is what it is handed in as.
  note: "Download .md",
  pdf: "Download .pdf",
  report: "Download .docx",
  sheet: "Download .csv",
};

/* 🔴 THE THREE SIZES AND THE STEP BETWEEN THEM MOVED TO `reader-chrome.ts` on 2026-09-03, when
   the flashcard panel needed them too. Written here they were this reader's private idea of how
   big an artifact gets, and the deck's own two-size version was the visible result. */

export function OutputPreview({
  activeKey = null,
  canvasId = "",
  initialMode = "docked",
  items,
  onAsk,
  onClose,
  onCloseKey,
  onSelectKey,
  output,
  comments,
  onRevise,
  onUndo,
}: {
  /**
   * The sidebar's tabs, when this panel is docked in one.
   *
   * 🔴🔴 IT DRAWS THE SAME STRIP THE DOCUMENT PANEL DRAWS (owner, 2026-09-03: *"documents,
   * lectures, and everything should open in one sidebar"*). This header used to carry a breadcrumb
   * of ONE title, so an artifact opened beside an open lecture appeared as a second panel stacked
   * over the first, each certain it owned that edge of the screen. With the strip they are one
   * sidebar with one row of tabs, whichever body is in front.
   *
   * 🔴 ABSENT IN FULL SCREEN AND FROM THE LIBRARY, WHICH IS NOT AN OVERSIGHT. Full screen has no
   * sidebar to be a tab of, and the Library opens an artifact on its own; both keep the breadcrumb,
   * which is the right title for a surface that is showing exactly one thing.
   */
  items?: readonly DockItem[];
  activeKey?: string | null;
  onCloseKey?: (key: string) => void;
  onSelectKey?: (key: string) => void;
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
  /**
   * Start a conversation about this document.
   *
   * 🔴🔴 THE LIBRARY PASSES IT AND THE CANVAS DOES NOT, WHICH IS THE WHOLE POINT. Owner,
   * 2026-09-01, of ChatGPT's library: *"it also has like this chat bar at the bottom so that you
   * can ask a question about it, and then when you send it, it'll take you to a new chat. So I
   * think that'll be a good thing to have only for the library."* Inside a canvas the conversation
   * is already on the other half of the screen; a second box for asking about the thing you are
   * reading would be two composers on one page, and the wrong one would be nearer.
   *
   * The reader hands back the MATERIAL it is showing along with the question, because it is the
   * only thing that has it: a note's body arrives here by fetch, and a deck's is a plan rather than
   * text anywhere on disk. Absent material is a real answer — a PDF being built, a note that could
   * not be reached — and the question still travels.
   */
  onAsk?: (question: string, material: { name: string; text: string } | null) => void;
}) {
  /**
   * How much of the window this panel takes.
   *
   * 🔴🔴 THREE SIZES SINCE 2026-09-01, BECAUSE "FULL SCREEN" MEANT TWO DIFFERENT THINGS. Owner:
   * *"when users open the initial artifact in the library, it should take up the whole screen
   * except for the sidebar. And then if they want a full screen, then the sidebar will
   * disappear."*
   *
   *   docked      a side sheet at the dragged width, with the surface beside it. The canvas.
   *   full        everything but the nav rail (`--nav-column`). The Library's opening size.
   *   maximized   everything, rail included. Nothing but the artifact.
   *
   * 🔴 THE BUTTON IS STILL A TWO-STATE TOGGLE, AND IT TOGGLES AGAINST WHERE THE PANEL OPENED. A
   * three-way cycle on one control makes the learner press it twice to get back, and it would
   * change the canvas's behaviour to fix the Library's — the canvas opens `docked` and its button
   * has always meant "fill the window", which is `full` and not `maximized`. So the pair is
   * (initial, bigger), and `biggerThan` names the one step up from wherever this opened.
   */
  const [mode, setMode] = useState<ReaderMode>(initialMode);
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
  const { column, dragging, onDragStart, width: dock } = useDockWidth();

  // Collapses the left sidebar to the rail while this is open, and pushes the surface by the
  // panel's COLUMN (the panel, its gap and its margin — use-dock-width.ts) — see side-panel.tsx.
  // Full screen pushes nothing: it covers everything.
  useDeclareSidePanel(mode === "docked" ? column : 0, dragging);
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
  /**
   * The document, as text a canvas can be given.
   *
   * 🔴 A DECK IS A PLAN, NOT PROSE, so it is flattened here rather than shipped as JSON: the slide
   * titles, their takeaway line and their points, which is what a learner means by "this deck".
   * Everything else on a slide (layout, structure, figures) is how it is DRAWN and would be noise
   * in a conversation about what it says.
   */
  const askMaterial = () => {
    if (deck) {
      const body = deck.slides
        .map((slide, at) => [`## ${at + 1}. ${slide.title}`, slide.takeaway, ...slide.points.map((point) => `- ${point}`)].filter(Boolean).join("\n"))
        .join("\n\n");
      return { name: `${output.title}.md`, text: `# ${deck.title}\n\n${body}` };
    }
    return markdown ? { name: `${output.title}.md`, text: markdown } : null;
  };

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
  // 🔴 STATE, NOT A REF. The rail measures against this element and subscribes to its scroll, so it
  // has to RE-RENDER when the node arrives; a ref would hand it null on the first pass and never
  // tell it otherwise, and the marks would sit dead on the first heading.
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const headings = useMemo(() => railHeadings(blocks), [blocks]);
  // Comment mode exists where there is something to pin to (a sheet and a built PDF are not blocks).
  const canComment = Boolean(comments) && (blocks.length > 0 || Boolean(deck)) && output.kind !== "pdf" && !output.sheet;
  // 🔴🔴 THE MERGED `markdown`, NOT `output.markdown`, AND THAT CHANGE IS THE WHOLE LIBRARY REVISE
  // DOOR. This read `output.markdown`, so a note that arrived as a `notePath` and was FETCHED into
  // `fetched` could never be revised however it was mounted — the old comment called that
  // deliberate ("a fetched note's home is its own editor"), which stopped being true the moment
  // the owner asked for edit-if-Nemesis-made on the Library shelf (2026-08-31), where every note
  // arrives by path. The host still decides WHETHER to offer it: `onRevise` is passed only for a
  // document Nemesis wrote. What this line now says is only "there is something here to revise",
  // which is a question about content, and content is what `markdown` holds.
  const revisable = Boolean(onRevise) && Boolean(markdown || deck);

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
  /**
   * How tall the page inside the frame says it is.
   *
   * 🔴🔴 THE FRAME HAD A FIXED 70vh AND ITS OWN SCROLLBAR, which put a second scroller inside a
   * panel that already scrolls. Seen on production 2026-09-04, the day the kind shipped. An iframe
   * has no content height of its own and this one is deliberately opaque, so the only honest way to
   * size it is to let the page say. See `html-output.ts` for why it is a message and not a read.
   */
  const [pageHeight, setPageHeight] = useState<number | null>(null);
  useEffect(() => {
    if (output.kind !== "html") return;
    const onMessage = (event: MessageEvent) => {
      const height = pageHeightFrom(event.data);
      if (height !== null) setPageHeight(height);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [output.kind]);
  // A different page is a different height; keeping the old one leaves a gap or a clip.
  useEffect(() => setPageHeight(null), [output.id]);

  const download = () => {
    // 🔴 THE DECK IS BUILT BY ITS OWN DOWNLOADER, which signs the learner's figures first — see
    // deck-download.ts. Rebuilding it here would be a second copy of that step, and the copy that
    // forgets the signatures ships a deck with captions where the pictures should be.
    if (output.kind === "slides" && output.deck) return void downloadDeck(output.deck, output.title);
    if (output.kind === "sheet" && output.sheet) return void downloadSheet(output.sheet as SheetData, output.title);
    // 🔴 THE PAGE IS ITS OWN FILE. It carries no Markdown, so it must leave before the guard below.
    if (output.kind === "html" && output.html) return void downloadHtml(output.html, output.title);
    if (!markdown) return;
    // 🔴 A NOTE LEAVES AS THE MARKDOWN IT IS. Every Markdown output used to go through the Word
    // writer, so the one artifact whose text was already the file the learner wanted was the one
    // re-encoded on the way out. `document` and `report` still hand over .docx and `pdf` a PDF:
    // those are the formats they were asked for as. See `markdownBlob` for the rest of the reason.
    if (output.kind === "note") return void downloadMarkdown(markdown, output.title);
    void (output.kind === "pdf" ? downloadPdf(markdown, output.title) : downloadDocx(markdown, output.title));
  };

  /** Anything that is not the side sheet: the header and the rail both key on this. */
  const full = mode === "full" || mode === "maximized";
  /** 🔴 THE RAIL IS COVERED ONLY HERE. `full` deliberately stops at `--nav-column` so the learner
   *  can still reach Library, Projects and the rest while reading — the whole point of the Library
   *  default being `full` rather than this. */
  const maximized = mode === "maximized";

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
  /**
   * The row's controls, close last.
   *
   * 🔴 CLOSE IS ON THE RIGHT AT EVERY SIZE NOW. Until 2026-09-04 full screen put it on the LEFT,
   * beside a "Library / name" crumb, which was ChatGPT's Library reader measured on 2026-08-25. The
   * owner then chose ChatGPT's Work pane (*"i dont want the top bar"*): one row, tabs left,
   * controls right, and the name is the tab. With no name row there is no crumb to put a close
   * beside, and a control that moves between two ends of the panel depending on its size is the
   * kind of thing a learner has to look for twice.
   */
  const controls = (
    <>
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
          aria-label={mode === initialMode ? "Full screen" : "Exit full screen"}
          className={CHROME.button}
          // 🔴 AGAINST WHERE IT OPENED, NOT AGAINST A FIXED PAIR. From the canvas (`docked`) the
          // step up is `full`; from the Library (`full`) it is `maximized`. One press out, one
          // press back, and neither surface inherits the other's idea of big.
          onClick={() => setMode(mode === initialMode ? biggerThan(initialMode) : initialMode)}
          title={mode === initialMode ? "Full screen" : "Exit full screen"}
          type="button"
        >
          <Codicon name={mode === initialMode ? "screen-full" : "screen-normal"} size={CHROME.icon} />
        </button>
        {/* 🔴 ONE CLOSE, AT EVERY SIZE. It used to move to the head of the crumb when the panel
            went big; there is no crumb now, so there is nowhere else for it to be. */}
        <button aria-label="Close" className={CHROME.button} onClick={onClose} title="Close" type="button">
          <Codicon name="close" size={CHROME.icon} />
        </button>
    </>
  );

  return (
    <DockPanel
      controls={controls}
      dragging={dragging}
      label={output.title}
      mode={mode}
      onDragStart={onDragStart}
      // 🔴 THE NAME STANDS IN FOR THE STRIP WHEN THERE IS NO STRIP. From the Library an artifact
      // opens on its own, full, with no dock behind it; a row with nothing on the left would leave
      // the thing on screen unnamed.
      tabs={
        items && items.length > 0 && onSelectKey && onCloseKey ? (
          <DockTabs activeKey={activeKey} items={items} onClose={onCloseKey} onSelect={onSelectKey} />
        ) : (
          <span className={cn(CHROME.crumb, "min-w-0 flex-1 pl-[6px]")} title={output.title}>
            {output.title}
          </span>
        )
      }
      testId="output-preview"
      width={dock}
    >
      {commenting && !revising && (
        <p className="pointer-events-none absolute left-1/2 top-[12px] z-40 -translate-x-1/2 rounded-full border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-3 py-1 text-[length:var(--canvas-text-meta)] font-medium text-(--ui-text-secondary) shadow-md" data-testid="output-comment-hint">
          {deck ? "Click a slide to comment, drag to mark part of it" : "Click a paragraph to comment"}
        </p>
      )}
      {revising && (
        // 🔴 THE WAIT IS SAID, AND THE DOCUMENT UNDERNEATH IS THE OLD ONE UNTIL THE NEW ONE LANDS —
        // never a blank, never a spinner over nothing.
        <p className="pointer-events-none absolute left-1/2 top-[12px] z-40 -translate-x-1/2 rounded-full border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-3 py-1 text-[length:var(--canvas-text-meta)] font-medium text-(--ui-text-secondary) shadow-md" data-testid="output-revising">
          Nemesis is revising this document…
        </p>
      )}
      {reviseError && (
        <p className="absolute left-1/2 top-[12px] z-40 -translate-x-1/2 rounded-full border border-(--ui-danger)/40 bg-(--ui-bg-elevated) px-3 py-1 text-[length:var(--canvas-text-meta)] font-medium text-(--ui-danger) shadow-md">
          {reviseError}
        </p>
      )}

      {/* 🔴 THE SHEET IS INSET 24px AND CARRIES THE REFERENCE'S OWN SHADOW,
          `0 1px 3px rgba(0,0,0,.1), 0 1px 2px -1px rgba(0,0,0,.1)`. It is a page on a desk, not a
          panel with padding.

          🔴🔴 816px IS A MEASURED CAP, AND ITS ABSENCE WAS A REAL DEFECT. `w-full` with nothing
          above it was fine while this only ever opened docked, and became nonsense the moment the
          same sheet opened full screen: on a 1470px window the page grew to 1422 and the prose ran
          **1332px at 14px type, about 190 characters a line**, against the 45-75 a reader can
          track. The owner put it plainly on 2026-08-31 — *"why is that research document like it's
          too wide, and it doesn't look like how [ChatGPT] outputs its own research reports."*

          Measured the same hour, ChatGPT signed in at the same 1470px viewport: a report paragraph
          is **736px wide**. 736 + the 40px padding on each side is this 816. Docked lands on the
          same number now (its container offers 932 and the cap takes it), so one document reads
          identically wherever it is opened, which is the rule the Library fix established for
          decks earlier today. */}
      {/* 🔴 THE RAIL IS A SIBLING OF THE SCROLLER, NOT A CHILD. Inside it, `absolute` would resolve
          against the scrolled content and the marks would slide away up the page with the text.
          Out here it pins to the panel, which is what a position indicator has to do. */}
      {full && !deck && !output.sheet && <DocumentRail headings={headings} scroller={scroller} />}
      <div className={cn("min-h-0 flex-1 overflow-auto px-[24px] pt-[25px]", full && onAsk ? ASK_CLEARANCE : "pb-[24px]")} ref={setScroller}>
        {/* 🔴🔴🔴 `--ui-bg-editor`, NOT `--ui-bg-primary`, AND THE DIFFERENCE IS WHETHER PAPER WEARS
            THE LEARNER'S ACCENT. Owner, 2026-09-01, with a document and a deck open side by side in
            the Library: *"the dark mode's not consistent… for the documents and reports, for some
            reason it has a colour accent depending on what the user chose in the settings. Remove
            that."*

            He is describing this exact declaration. `--ui-bg-primary` is not a surface, it is a
            FILL: `color-mix(--ui-accent <mix>, color-mix(--ui-base 10%, transparent))`. Every fill
            token in this system is built over the accent on purpose, so a hover, a chip and a row
            all agree with whatever colour the learner picked. Paper is not a fill. A document page
            tinted by a preference is a page that looks like a different document to two people,
            and beside a deck — which uses a neutral surface — it reads as one of them being broken.

            🔴 THE SAME NAME MEANS OPPOSITE THINGS IN THE TWO PRODUCTS, AND THIS FILE IS THE SECOND
            CASUALTY. `library-outputs.tsx` carries the first, in its own words: the reference's
            `--bg-primary` is its page WHITE, ours is a 24% wash over an accent, and reading it as
            "the page colour" put a grey chip on every Library row. Written here in full so the
            third person to reach for it in dark mode finds the warning rather than the wash.

            🔴 `--ui-bg-editor` IS THE NEUTRAL ONE, BY CONSTRUCTION AND NOT BY LUCK:
            `color-mix(--theme-card-seed <mix>, --theme-neutral-card)`, and both of those are plain
            hex in every theme. No accent term anywhere in it, and its contrast is already measured
            (desktop-ui.css records 6.95:1 light against the resolved value). It is also the surface
            the canvas itself uses, so an output now looks the same wherever it is opened, which is
            the rule this file's own header sets three comments above.

            🔴 LIGHT MODE IS UNTOUCHED: `bg-white` was never the problem. Paper is white on a white
            product, and the accent only ever reached this through the dark override. */}
        <div className="mx-auto w-full max-w-[816px] bg-white px-[40px] py-[32px] shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_-1px_rgba(0,0,0,0.1)] dark:bg-(--ui-bg-editor)">
          {deck ? (
            <DeckPreview canvasId={canvasId} outputId={output.assetId ?? output.id} plan={deck} registerElement={canComment ? registerUnit : undefined} />
          ) : output.kind === "html" && output.html ? (
            // 🔴🔴 A FRAME, NOT `dangerouslySetInnerHTML`, and the reasoning is in `html-output.ts`.
            // `allow-scripts` WITHOUT `allow-same-origin` gives the page an opaque origin, so it
            // runs but can reach nothing of this app's; the injected policy blocks the network
            // outright, so material a learner uploaded cannot talk the model into writing a page
            // that phones home with it.
            //
            // 🔴 A FRAME HAS NO CONTENT HEIGHT OF ITS OWN. An iframe does not grow to fit what is
            // inside it, and it cannot be measured across an opaque origin, so an unsized one
            // collapses to the 150px default every browser gives it. The page reports its own
            // height instead; see `pageHeight` above.
            <iframe
              // 🔴 THE PANEL SCROLLS, NOT THE FRAME. Sized to what the page reported, so it flows in
              // the reading column like every other output. 70vh is only the opening guess, for the
              // moment before the first message arrives.
              className="w-full border-0 bg-white"
              data-testid="output-html-frame"
              sandbox="allow-scripts"
              scrolling="no"
              srcDoc={sandboxedPage(output.html)}
              style={{ height: pageHeight === null ? "70vh" : `${pageHeight}px` }}
              title={output.title}
            />
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

      {/* 🔴🔴 MEASURED ON THE REFERENCE, 2026-09-01, in the owner's signed-in Chrome at 1470x836:
          a 604x52 pill at radius 28, centred in the pane, 25px clear of the bottom, reading "Ask
          about this file". It FLOATS over the document rather than taking a row from it — theirs
          does, and a bar that pushed the page up would reflow a document every time it appeared.
          The scroller gains matching room below so the last line is never parked underneath it.

          🔴 FULL SCREEN ONLY. Docked, this panel is beside a conversation that already has a
          composer, and the bar would be the second one on screen. */}
      {/* 🔴 THE BAR IS SHARED NOW — see `reader-ask.tsx` for the measurements and why there is one
          copy. This file and `deck-view.tsx` each carried their own, and the flashcard panel had
          none, which is the difference the owner was pointing at on 2026-09-03.

          🔴 FULL SCREEN ONLY. Docked, this panel is beside a conversation that already has a
          composer, and the bar would be the second one on screen. */}
      {full && onAsk && <ReaderAsk label={output.title} onAsk={(question) => onAsk(question, askMaterial())} />}

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
    </DockPanel>
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
          // 🔴 THE SCALE MOVED UP WITH THE BODY, AND ONLY ALONG THE DECLARED STEPS. Body used to be
          // 14px, so a level-2 heading at 16px was a step above it; body is 16px now, and leaving
          // the old mapping would have printed a heading at exactly the size of the sentence under
          // it, with weight doing all the work — and a level-3 heading SMALLER than its own body.
          // 🔴 I FIRST WROTE 24/20/16 AS px LITERALS AND §46.3 CAUGHT IT: the Canvas has five
          // declared steps and a literal is a sixth nobody chose. 20px is not one of them. These
          // are `title` (24), `lead` (18) and `body` (16) — hierarchy from the scale that exists,
          // which is the rule's whole point, and `title` is the ceiling §46.3 allows.
          const size = block.level === 1 ? "--canvas-text-title" : block.level === 2 ? "--canvas-text-lead" : "--canvas-text-body";
          return (
            <p className={`relative m-0 mt-4 font-semibold text-[length:var(${size})] text-(--ui-text-primary)`} data-comment-block={index} key={key}>
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
            <p className="relative m-0 flex gap-2 pl-2 text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary)" data-comment-block={index} key={key}>
              <span className="shrink-0 text-(--ui-text-quaternary)">{block.kind === "bullet" ? "•" : `${block.index}.`}</span>
              <span>{block.text}</span>
            </p>
          );
        }
        // 🔴🔴 BODY IS 16/26 IN THE PRIMARY COLOUR, ALL THREE MEASURED OFF THE REFERENCE
        // (ChatGPT, signed in, 1470px, 2026-08-31): paragraph and list item both **16px on 26px,
        // weight 400, rgb(13,13,13)**. This shipped at `--canvas-text-small` (14px) in
        // `--ui-text-secondary`, which is the styling of a caption: a whole document set in grey
        // half-size type reads as a preview of a document rather than the document. 16px on
        // `leading-relaxed` IS 26px exactly (1.625 x 16), so the line-height needs no literal.
        // `--canvas-text-body` is 16px, so this also puts a document on the same body size as the
        // rest of the product — the reader was the one surface disagreeing with our own token.
        return (
          <p className="relative m-0 text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary)" data-comment-block={index} key={key}>
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
