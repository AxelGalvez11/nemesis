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
// 🔴 ANNOTATIONS COME WITH IT, unchanged: the same `CommentLayer` through the same board store, so
// a note pinned in a document still rides the board's own JSON (board-annotation-store.ts).

import { useMemo, useRef } from "react";

import { DocumentReader } from "@/components/workspace/reader/document-reader";
import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import type { BoardSource } from "@/lib/board/board-model";

import { boardAnnotationStore } from "./board-annotation-store";
import { useBoard } from "./board-provider";
import { useBoardReader } from "./use-board-reader";

export function SourceDocument({ source }: { source: BoardSource }) {
  const { annotations, updateAnnotations } = useBoard();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const preview = useWorkspacePreview() !== null;
  const state = useBoardReader(source, source.status === "ready" && !source.collapsed);
  /**
   * 🔴 THE STORE READS THROUGH A FUNCTION OVER A REF, NEVER A CAPTURED ARRAY. Built from this
   * render's `annotations`, it would answer with them for as long as the reader held it, so the
   * second note of a session is written on top of the first. The panel learned this first.
   */
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const store = useMemo(() => boardAnnotationStore(source.id, () => annotationsRef.current, updateAnnotations), [source.id, updateAnnotations]);

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
      <div className="nodrag nopan nowheel min-h-0 flex-1 overflow-hidden rounded-[10px] border border-(--ui-stroke-tertiary)" onPointerDown={(event) => event.stopPropagation()}>
        <DocumentReader
          annotationLook="card"
          commentsDoc={{
            preview: preview || uid === null,
            ref: { id: source.id, kind: "source" },
            store,
            uid,
          }}
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
