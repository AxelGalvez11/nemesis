"use client";

// The dropped file, drawn INSIDE its card.
//
// Owner, 2026-09-04: *"pdfs, docx, pptx, still cannot be seen in the canvas, they only render
// text"*, and, in the same message, *"i dont want any popups in canvas, everything should be seen
// and done within the cards"*. Those two sentences have one answer: the document opens where it
// already is. A source card used to show four lines of stripped text and a button that opened a
// reader somewhere else; now the card IS the reader.
//
// 🔴🔴 IT IS THE PRODUCT'S ONE READER, MOUNTED SMALLER. `DocumentReader` opens every format Nemesis
// supports and dispatches to the pdf / slides / docx / sheet / picture views itself. Nothing here
// knows what a PDF is, and nothing here may learn: a per-type branch in a board component is the
// second reader this repo has deleted twice.
//
// 🔴 `nowheel` AND `nodrag`, OR THE BOARD EATS THE DOCUMENT. React Flow pans on wheel and drags on
// pointerdown unless an element opts out, so scrolling a PDF would slide the board and selecting a
// sentence would throw the card across it.
//
// 🔴🔴 NO ANNOTATION LAYER HERE, AND THAT IS A REVERSAL OF THE SAME DAY. It shipped that morning at
// the owner's own request (*"annotate any document to have an inline chat with the annotation"*),
// and he cut it that evening: *"remove the annotation from pdf docs"*. What he saw is what the
// screenshot shows — a comment icon, a count and a three-dot menu stacked above the first line of a
// document, a second grammar for talking to Nemesis on a board whose whole grammar is cards. The
// card's own four pluses are how you ask about a document now. The board's annotation FIELD is
// untouched (`board-annotations.ts`), so a board that was annotated this morning keeps its notes in
// the document and simply stops drawing them; nothing was thrown away in the reversal.

import { DocumentReader } from "@/components/workspace/reader/document-reader";
import type { BoardSource } from "@/lib/board/board-model";

import { useBoardReader } from "./use-board-reader";

export function SourceDocument({ source }: { source: BoardSource }) {
  const state = useBoardReader(source, source.status === "ready" && !source.collapsed);

  if (state.kind === "loading") {
    return <p className="py-[24px] text-center text-[12px] text-(--ui-text-quaternary)">Opening the document…</p>;
  }
  if (state.kind === "unavailable") {
    return <p className="px-[16px] py-[24px] text-center text-[14px] leading-[20px] text-(--ui-text-tertiary)">{state.reason}</p>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 🔴 SAID OUT LOUD, NEVER LEFT TO BE INFERRED. When the original was not kept, what is on
          screen is Nemesis's reading of the file, and a reconstruction never quietly stands in for
          the document. */}
      {state.extracted && (
        <p className="shrink-0 px-[4px] pb-[8px] text-[12px] leading-[16px] text-(--ui-text-tertiary)">
          This is the text Nemesis read out of the file. The original was not kept with the canvas.
        </p>
      )}
      {/* 🔴 NO SECOND OUTLINE. The card is already a bordered box and the page inside is already a
          sheet with an edge of its own; a third rounded border between them is the *"box outline"*
          the owner cut from tests and notes on 2026-09-04, in another shape. */}
      <div className="nodrag nopan nowheel min-h-0 flex-1 overflow-hidden rounded-[10px]" onPointerDown={(event) => event.stopPropagation()}>
        <DocumentReader
          // 🔴 NO READER HEADER IN A CARD. The card's own bar above it already names the file and
          // carries its verbs; what was left in the reader's was one "…" that opens a dropdown, and
          // a dropdown is a popup. See `DocumentReader`'s `bare`.
          bare
          dense
          // The board already holds this document's text as material; sending it again would file
          // the same document into the same canvas twice.
          grounded
          source={state.source}
          variant="dialog"
        />
      </div>
    </div>
  );
}
