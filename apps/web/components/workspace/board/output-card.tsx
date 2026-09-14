"use client";

// A deliverable on the board: the thing a thread made (flashcards, a note, a document, slides),
// as a 320-wide tile beside the card it came from, joined to it by a line.
//
// Three faces. MAKING wears the same dots a thinking card wears and cannot be deleted; READY names
// the file with the real filename and opens it in the chat's own reader; FAILED says why, in the
// maker's words, with a Retry. It is drawn on the board's tokens rather than reusing the chat's
// `ArtifactCard`: that card announces an arrival inside a conversation column ("Flashcards ready:")
// and sizes itself to the chat's column, and on a board the card IS the announcement.

import type { NodeProps } from "@xyflow/react";
import { CircleAlert, RotateCcw, X } from "lucide-react";
import { memo } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { OUTPUT_KIND_LABELS, type DeliverableKind } from "@/lib/board/board-deliverables";
import { docFilename } from "@/lib/export/doc-file";
import { KIND_MARKS } from "@/lib/learn/kind-mark";
import { cn } from "@/lib/utils";

import { IconTooltip, NodeHandles, StreamingDots } from "./board-chrome";
import { useBoard } from "./board-provider";

export interface OutputNodeData extends Record<string, unknown> {
  cardId: string;
  isPickedUp?: boolean;
}

/**
 * The glyph, its tint and the extension the file is handed over as. The same picks as the chat's
 * `ArtifactCard` (which keeps them private), drawn from `KIND_MARKS` where a file kind exists so an
 * attached .docx and a made .docx wear one mark.
 */
const MARKS: Record<DeliverableKind, { extension: string; icon: string; tint: string }> = {
  document: { extension: "docx", icon: KIND_MARKS.document.icon, tint: KIND_MARKS.document.tint },
  flashcards: { extension: "", icon: "layers", tint: "--ui-kind-purple" },
  html: { extension: "html", icon: "browser", tint: "--ui-kind-cyan" },
  note: { extension: "md", icon: KIND_MARKS.text.icon, tint: KIND_MARKS.text.tint },
  pdf: { extension: "pdf", icon: KIND_MARKS.pdf.icon, tint: KIND_MARKS.pdf.tint },
  report: { extension: "", icon: "book", tint: "--ui-kind-cyan" },
  sheet: { extension: "csv", icon: KIND_MARKS.sheet.icon, tint: KIND_MARKS.sheet.tint },
  slides: { extension: "pptx", icon: KIND_MARKS.slides.icon, tint: KIND_MARKS.slides.tint },
};

const FALLBACK_MARK = { extension: "", icon: "file", tint: "--ui-kind-blue" };

function isDeliverableKind(kind: string | undefined): kind is DeliverableKind {
  return kind !== undefined && kind in MARKS;
}

function OutputCardInner({ data, selected }: NodeProps & { data: OutputNodeData }) {
  const { cards, deleteNode, openOutput, retryDeliverable } = useBoard();
  const card = cards.find((item) => item.id === data.cardId);
  if (!card || card.kind !== "output") return null;
  const kind = isDeliverableKind(card.outputKind) ? card.outputKind : undefined;
  const mark = kind ? MARKS[kind] : FALLBACK_MARK;
  const label = kind ? OUTPUT_KIND_LABELS[kind] : (card.outputKind ?? "Output");
  const making = card.outputStatus === "making";
  const failed = card.outputStatus === "failed";
  const output = card.output;
  const filename = output && mark.extension ? docFilename(output.title, mark.extension) : output?.title;
  return (
    <div
      className={cn(
        "group/output relative flex w-full cursor-grab flex-col rounded-[16px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) shadow-sm transition-[transform,box-shadow] duration-150 ease-out motion-reduce:transition-none",
        data.isPickedUp ? "-translate-y-[4px] scale-[1.02] cursor-grabbing shadow-xl" : "hover:shadow-md active:cursor-grabbing",
        selected && "ring-2 ring-foreground",
      )}
      data-output-status={card.outputStatus}
    >
      <div className="flex items-center gap-[8px] px-[14px] pb-[4px] pt-[12px]">
        <Codicon className="shrink-0" name={mark.icon} size="18px" style={{ color: `var(${mark.tint})` }} />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-(--ui-text-secondary)">{label}</span>
        {!making && (
          <IconTooltip label="Delete">
            <button
              aria-label={`Delete ${label.toLowerCase()}`}
              className="nodrag nopan rounded-[6px] p-[2px] text-(--ui-text-tertiary) opacity-60 transition-colors hover:bg-(--ui-control-hover-background) hover:text-(--board-error-text) focus-visible:opacity-100 sm:opacity-0 sm:group-hover/output:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                deleteNode(card.id);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              type="button"
            >
              <X className="size-[14px]" />
            </button>
          </IconTooltip>
        )}
      </div>
      <p className="line-clamp-2 px-[14px] text-[14px] font-semibold leading-[20px] text-foreground" dir="auto">
        {card.title}
      </p>
      {making && (
        <div className="flex items-center gap-[8px] px-[14px] pb-[14px] pt-[8px] text-[13px] text-(--ui-text-tertiary)">
          <StreamingDots />
          <span>Nemesis is working on this.</span>
        </div>
      )}
      {failed && (
        <div className="flex flex-col gap-[8px] px-[14px] pb-[14px] pt-[8px]">
          <div className="flex items-start gap-[8px] rounded-[8px] bg-(--board-error-bg) px-[10px] py-[8px] text-[13px] leading-[18px] text-(--board-error-text)">
            <CircleAlert className="mt-[1px] size-[14px] shrink-0" />
            <span>{card.outputError || "This could not be made."}</span>
          </div>
          <button
            className="nodrag nopan flex items-center justify-center gap-[6px] rounded-[8px] bg-(--ui-bg-secondary) px-[12px] py-[8px] text-[12px] font-semibold text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              retryDeliverable(card.id);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            <RotateCcw className="size-[14px]" />
            <span>Retry</span>
          </button>
        </div>
      )}
      {!making && !failed && output && (
        <div className="flex items-center gap-[8px] px-[14px] pb-[14px] pt-[6px]">
          <span className="min-w-0 flex-1 truncate text-[12px] text-(--ui-text-tertiary)" title={filename}>
            {filename}
          </span>
          <button
            className="nodrag nopan shrink-0 rounded-[8px] bg-(--ui-action) px-[14px] py-[7px] text-[12px] font-semibold text-(--ui-action-glyph) transition-opacity hover:opacity-90"
            onClick={(event) => {
              event.stopPropagation();
              openOutput(card.id);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            Open
          </button>
        </div>
      )}
      <NodeHandles target />
    </div>
  );
}

export const OutputCard = memo(OutputCardInner, (a, b) => a.data.cardId === b.data.cardId && a.data.isPickedUp === b.data.isPickedUp && a.selected === b.selected);
