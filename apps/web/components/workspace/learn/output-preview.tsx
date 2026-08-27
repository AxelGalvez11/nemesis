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

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { CHROME, DOCK_FRACTION } from "./reader-chrome";

import { Codicon } from "@/components/desktop-ui/codicon";
import { useDeclareSidePanel } from "@/components/workspace/shell/side-panel";
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
}) {
  const card = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"docked" | "full">(initialMode);
  /**
   * The docked width in pixels, so the surface underneath can be pushed by exactly that much.
   *
   * 🔴 MEASURED FROM THE VIEWPORT AT MOUNT AND ON RESIZE, not a fixed rem. The reference's panel is
   * a FRACTION — two thirds — so at 1470 it is 980 and at 1100 it is 733. A fixed width would be
   * right at one window size and wrong at every other, which is the opposite of a one-to-one match.
   */
  const [dock, setDock] = useState(0);
  useEffect(() => {
    const measure = () => setDock(Math.round(window.innerWidth * DOCK_FRACTION));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

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

      {/* 🔴 THE SHEET IS INSET 24px AND CARRIES THE REFERENCE'S OWN SHADOW, measured: 931 wide
          inside 980, `0 1px 3px rgba(0,0,0,.1), 0 1px 2px -1px rgba(0,0,0,.1)`. It is a page on a
          desk, not a panel with padding. */}
      <div className="min-h-0 flex-1 overflow-auto px-[24px] pb-[24px] pt-[25px]">
        <div className="mx-auto w-full bg-white px-[40px] py-[32px] shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_-1px_rgba(0,0,0,0.1)] dark:bg-(--ui-bg-primary)">
          {deck ? (
            <DeckPreview canvasId={canvasId} outputId={output.assetId ?? output.id} plan={deck} />
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
            <DocBody markdown={markdown} />
          )}
        </div>
      </div>
    </div>,
    host,
  );
}

/** The document, in the shapes the file will actually contain. */
function DocBody({ markdown }: { markdown: string }) {
  const blocks = docBlocks(markdown);
  if (!blocks.length) {
    return <p className="m-0 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">This document is empty.</p>;
  }
  return (
    <div className="grid gap-2">
      {blocks.map((block, index) => {
        // 🔴 KEYED ON POSITION, WHICH IS CORRECT HERE AND USUALLY IS NOT. The list is derived from
        // one immutable string and is never reordered, inserted into or filtered, so position IS
        // identity. Two identical bullets would otherwise collide on a text key.
        const key = `${index}`;
        if (block.kind === "heading") {
          const size = block.level === 1 ? "--canvas-text-lead" : block.level === 2 ? "--canvas-text-body" : "--canvas-text-small";
          return (
            <p className={`m-0 mt-2 font-semibold text-[length:var(${size})] text-(--ui-text-primary)`} key={key}>
              {block.text}
            </p>
          );
        }
        if (block.kind === "table") {
          // 🔴 THE SAME COMPONENT THE SPREADSHEET USES. A document's table and a spreadsheet are
          // the same object on screen, and two renderers would drift.
          return <SheetTable key={key} sheet={{ columns: block.header, rows: block.rows }} />;
        }
        if (block.kind === "bullet" || block.kind === "number") {
          return (
            <p className="m-0 flex gap-2 pl-2 text-[length:var(--canvas-text-small)] leading-relaxed text-(--ui-text-secondary)" key={key}>
              <span className="shrink-0 text-(--ui-text-quaternary)">{block.kind === "bullet" ? "•" : `${block.index}.`}</span>
              <span>{block.text}</span>
            </p>
          );
        }
        return (
          <p className="m-0 text-[length:var(--canvas-text-small)] leading-relaxed text-(--ui-text-secondary)" key={key}>
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
