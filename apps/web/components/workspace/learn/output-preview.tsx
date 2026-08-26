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

import { Codicon } from "@/components/desktop-ui/codicon";
import { useDeclareSidePanel } from "@/components/workspace/shell/side-panel";
import { docBlocks } from "@/lib/export/doc-blocks";
import { downloadDeck } from "@/lib/export/deck-download";
import { downloadDocx, downloadPdf, downloadSheet, pdfBlob, type SheetData } from "@/lib/export/doc-file";
import type { CanvasOutput } from "@/lib/learn/canvas-model";
import { readLibraryNote } from "@/lib/workspace/library-note-read";

import { DeckPreview } from "./deck-preview";
import { PdfPages } from "./pdf-pages";

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
  onClose,
  output,
}: {
  /** Needed only by a deck, whose full-page view is addressed by canvas. */
  canvasId?: string;
  onClose: () => void;
  output: CanvasOutput;
}) {
  const card = useRef<HTMLDivElement>(null);
  // Collapses the left sidebar to the rail while this is docked, and restores it on close without
  // touching the learner's stored preference — see side-panel.tsx.
  useDeclareSidePanel();
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

  return (
    // 🔴🔴 A SIDE PANEL, NOT A MODAL IN THE MIDDLE — owner, 2026-08-25, with the reference in frame.
    // The difference is not decoration: a centred card covers the conversation that produced the
    // document, so checking "does this say what I asked for" means closing it, reading, and opening
    // it again. Docked to one side, the document and the thread that made it are on screen at once.
    //
    // 🔴 IT DOES NOT PUSH THE CANVAS OVER. Re-laying out the whole surface every time somebody
    // glances at a document would reflow the text they are reading mid-sentence. It floats, and the
    // canvas underneath is untouched.
    <div
      className="fixed inset-y-0 right-0 z-50 flex w-[min(38rem,100vw)] p-3"
      onMouseDown={(event) => {
        // The catcher, not a scrim: an outside press closes and nothing is painted over the canvas
        // — the history card's ruling, which source-preview.tsx already follows.
        if (!card.current?.contains(event.target as Node)) onClose();
      }}
      role="dialog"
    >
      <div
        className="flex min-h-0 w-full flex-col overflow-hidden rounded-2xl bg-(--ui-bg-elevated) shadow-xl ring-1 ring-(--ui-stroke-secondary)"
        ref={card}
      >
        <div className="flex items-center gap-2.5 px-4 py-3">
          <span className="min-w-0 flex-1 truncate text-[length:var(--canvas-text-small)] font-medium text-(--ui-text-primary)" title={output.title}>
            {output.title}
          </span>
          <button
            className="shrink-0 rounded-full bg-(--ui-action) px-3.5 py-1.5 text-[length:var(--canvas-text-meta)] font-medium text-(--ui-bg-editor) transition-opacity hover:opacity-90 disabled:opacity-40"
            disabled={!markdown && !output.sheet && !deck}
            onClick={download}
            type="button"
          >
            {DOWNLOAD_LABEL[output.kind] ?? "Download"}
          </button>
          <button
            aria-label="Close preview"
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
            onClick={onClose}
            type="button"
          >
            <Codicon name="close" size="14px" />
          </button>
        </div>

        <div className="min-h-0 overflow-auto border-t border-(--ui-stroke-tertiary) px-6 py-5">
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
            // Says so rather than showing an empty card, which reads as broken.
            <p className="m-0 py-8 text-center text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary)">
              Couldn&apos;t open this one. It may have been deleted.
            </p>
          ) : (
            <DocBody markdown={output.markdown ?? fetched ?? ""} />
          )}
        </div>
      </div>
    </div>
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
