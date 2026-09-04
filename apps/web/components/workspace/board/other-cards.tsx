"use client";

// The two other node kinds: a NOTE (260 wide, tinted, anchored to a sentence of its card) and a
// SOURCE (a dropped file, 640 wide, with "Ask about this" and "Create lesson").
// docs/wondering-canvas-reference.md §6 and §7.

import type { NodeProps } from "@xyflow/react";
import { BookOpen, Check, CircleAlert, FileImage, FileText, LoaderCircle, Plus, StickyNote, X } from "lucide-react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { OUTPUT_KIND_MARKS } from "@/components/workspace/learn/artifact-card";
import { KIND_LABELS, MAKING_LABELS } from "@/lib/board/board-deliverables";
import { docFilename } from "@/lib/export/doc-file";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { IMAGE_SOURCE_MIN_HEIGHT, SOURCE_MIN_HEIGHT } from "@/lib/board/board-layout";
import { cn } from "@/lib/utils";

import { AutoResizingTextarea, IconTooltip, NodeHandles, NodeResizeControls } from "./board-chrome";
import { useBoard } from "./board-provider";

export interface NoteNodeData extends Record<string, unknown> {
  cardId: string;
  noteId: string;
  isPickedUp?: boolean;
}

export interface OutputNodeData extends Record<string, unknown> {
  outputId: string;
  isPickedUp?: boolean;
}

export interface SourceNodeData extends Record<string, unknown> {
  sourceId: string;
  isPickedUp?: boolean;
}

function NoteCardInner({ data, selected }: NodeProps & { data: NoteNodeData }) {
  const { cards, lastAddedCardId, deleteNode, focusNoteExcerpt, updateCardNote, removeCardNote } = useBoard();
  const card = cards.find((item) => item.id === data.cardId);
  const note = card?.notes.find((item) => item.id === data.noteId);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (note?.id === lastAddedCardId) textarea.current?.focus();
  }, [lastAddedCardId, note?.id]);
  if (!card || !note) return null;
  return (
    <div
      className={cn(
        "group/note relative w-full cursor-grab rounded-[12px] border border-(--board-note-border) bg-(--board-note-bg) shadow-sm transition-[transform,box-shadow] duration-150 ease-out motion-reduce:transition-none",
        data.isPickedUp ? "-translate-y-[4px] scale-[1.02] cursor-grabbing shadow-xl" : "hover:shadow-md active:cursor-grabbing",
        selected && "ring-2 ring-foreground",
      )}
    >
      <div className="flex items-center gap-[6px] px-[12px] pb-[4px] pt-[10px] text-[10px] font-semibold uppercase tracking-wide text-(--ui-text-secondary)">
        <StickyNote className="size-[14px] shrink-0" />
        <span className="min-w-0 flex-1 truncate">Note on {card.title}</span>
        <IconTooltip label="Delete note">
          <button
            aria-label="Delete note"
            className="nodrag nopan rounded p-[2px] text-(--ui-text-tertiary) opacity-60 transition-colors hover:bg-(--ui-control-hover-background) hover:text-(--board-error-text) focus-visible:opacity-100 sm:opacity-0 sm:group-hover/note:opacity-100"
            onClick={() => deleteNode(note.id)}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            <X className="size-[14px]" />
          </button>
        </IconTooltip>
      </div>
      {note.contextExcerpt && (
        <button
          aria-label={`Show source text in ${card.title}`}
          className="nodrag nopan mx-[12px] mb-[8px] block w-[calc(100%-24px)] cursor-pointer border-l-2 border-(--ui-action) px-[8px] text-left text-[12px] italic leading-[1.625] text-(--ui-text-secondary) outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-(--ui-action)"
          dir="auto"
          onClick={() => note.contextExcerpt && focusNoteExcerpt(card.id, note.contextExcerpt, note.contextOccurrence)}
          onPointerDown={(event) => event.stopPropagation()}
          title="Show this text in its card"
          type="button"
        >
          <span className="line-clamp-4">{note.contextExcerpt}</span>
        </button>
      )}
      <AutoResizingTextarea
        aria-label={`Note on ${card.title}`}
        className="nodrag nopan block min-h-[80px] w-full resize-none overscroll-contain bg-transparent px-[12px] pb-[12px] pt-[4px] text-[14px] leading-[1.625] text-foreground placeholder:text-(--ui-text-tertiary) focus:outline-none"
        onBlur={() => {
          if (!note.text.trim()) removeCardNote(card.id, note.id);
        }}
        onChange={(event) => updateCardNote(card.id, note.id, event.target.value)}
        placeholder="Write a note…"
        ref={textarea}
        value={note.text}
      />
      <NodeHandles target />
    </div>
  );
}

export const NoteCard = memo(NoteCardInner);

function SourceCardInner({ data, selected }: NodeProps & { data: SourceNodeData }) {
  const { sources, selectedSourceIds, toggleSourceSelection, createLessonFromSource } = useBoard();
  const source = sources.find((item) => item.id === data.sourceId);
  const [resizing, setResizing] = useState(false);
  const start = useCallback(() => setResizing(true), []);
  const end = useCallback(() => setResizing(false), []);
  if (!source) return null;
  const chosen = selectedSourceIds.includes(source.id);
  const Icon = source.type === "image" ? FileImage : FileText;
  const preview = source.content
    .replace(/[#*_`>[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const fixed = source.height !== undefined || resizing;
  const hasImage = source.type === "image" && Boolean(source.previewUrls[0]);
  return (
    <div
      className={cn(
        "group/card relative flex w-full cursor-grab flex-col rounded-[16px] border bg-(--ui-bg-elevated) shadow-sm transition-[color,transform,box-shadow] duration-150 ease-out motion-reduce:transition-none",
        data.isPickedUp ? "-translate-y-[4px] scale-[1.02] cursor-grabbing shadow-xl" : "active:cursor-grabbing",
        fixed && "h-full",
        chosen ? "border-(--ui-action)" : "border-(--ui-stroke-secondary)",
        selected && "ring-2 ring-foreground",
      )}
    >
      <NodeResizeControls minHeight={hasImage ? IMAGE_SOURCE_MIN_HEIGHT : SOURCE_MIN_HEIGHT} onVerticalResizeEnd={end} onVerticalResizeStart={start} />
      <div className="flex shrink-0 items-center gap-[8px] rounded-t-[16px] px-[16px] py-[10px]">
        <Icon className="size-[16px] shrink-0 text-(--ui-action)" />
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground">{source.name}</span>
        <span className="rounded-[6px] bg-(--ui-bg-secondary) px-[8px] py-[2px] text-[11px] font-medium uppercase text-(--ui-text-tertiary)">
          {source.type === "pdf" ? "PDF source" : source.type === "image" ? "Image source" : "Document source"}
        </span>
      </div>
      {hasImage && (
        <div className="shrink-0 border-b border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) p-[12px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL of the dropped picture. */}
          <img alt={source.name} className="h-[160px] w-full rounded-[8px] object-contain" src={source.previewUrls[0]} />
          {source.previewUrls.length > 1 && <p className="mt-[8px] text-center text-[12px] text-(--ui-text-tertiary)">{source.previewUrls.length} images in this source</p>}
        </div>
      )}
      <div className={cn("flex flex-col px-[16px] py-[12px]", fixed && "min-h-0 flex-1")}>
        {source.status === "processing" && (
          <div className="flex items-center gap-[8px] py-[16px] text-[14px] text-(--ui-text-secondary)">
            <LoaderCircle className="size-[16px] animate-spin" />
            <span>Reading source…</span>
          </div>
        )}
        {source.status === "error" && (
          <div className="flex items-start gap-[8px] rounded-[8px] bg-(--board-error-bg) px-[12px] py-[10px] text-[14px] text-(--board-error-text)">
            <CircleAlert className="mt-[2px] size-[16px] shrink-0" />
            <span>{source.error || "This source could not be processed."}</span>
          </div>
        )}
        {source.status === "ready" && (
          <>
            <p className={cn("text-[14px] leading-[1.625] text-(--ui-text-secondary)", fixed ? "min-h-0 flex-1 overflow-y-auto overscroll-contain" : "line-clamp-4")}>
              {preview || "Source ready to explore."}
            </p>
            <div className="mt-[12px] flex shrink-0 gap-[8px] border-t border-(--ui-stroke-secondary) pt-[12px]">
              <button
                aria-pressed={chosen}
                className={cn(
                  "flex min-w-0 flex-1 items-center justify-center gap-[6px] rounded-[8px] px-[12px] py-[8px] text-[12px] font-semibold transition-colors",
                  chosen ? "bg-(--ui-bg-secondary) text-foreground" : "bg-(--ui-bg-secondary) text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground",
                )}
                onClick={() => toggleSourceSelection(source.id)}
                type="button"
              >
                {chosen ? <Check className="size-[14px]" /> : <Plus className="size-[14px]" />}
                <span>{chosen ? "Added to question" : "Ask about this"}</span>
              </button>
              <button
                className="flex min-w-0 flex-1 items-center justify-center gap-[6px] rounded-[8px] bg-(--ui-action) px-[12px] py-[8px] text-[12px] font-semibold text-(--ui-action-glyph) transition-opacity hover:opacity-90"
                onClick={() => createLessonFromSource(source.id)}
                type="button"
              >
                <BookOpen className="size-[14px]" />
                <span>Create lesson</span>
              </button>
            </div>
          </>
        )}
      </div>
      <NodeHandles />
    </div>
  );
}

export const SourceCard = memo(SourceCardInner, (a, b) => a.data.sourceId === b.data.sourceId && a.data.isPickedUp === b.data.isPickedUp && a.selected === b.selected);


/**
 * A deliverable on the board: the chat's artifact chip, standing beside the thread it came from.
 *
 * Owner 2026-09-03 ("add deliverables to the canvas"). Three states: being made (the maker's own
 * step line), ready (open it in the reading panel; the same panel the chat opens), failed (the
 * maker's own reason). What it shows is the chat's `ArtifactCard`, minus the sentence above it.
 */
function OutputCardInner({ data, selected }: NodeProps & { data: OutputNodeData }) {
  const { outputs, openOutput } = useBoard();
  const output = outputs.find((item) => item.id === data.outputId);
  if (!output) return null;
  const mark = OUTPUT_KIND_MARKS[output.kind] ?? { extension: "", icon: "file", label: KIND_LABELS[output.kind], tint: "--ui-kind-blue" };
  const title = output.output?.title ?? output.topic;
  const filename = output.output && mark.extension ? docFilename(output.output.title, mark.extension) : title;
  return (
    <div
      className={cn(
        "group/card relative flex w-full cursor-grab flex-col rounded-[16px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) shadow-sm transition-[color,transform,box-shadow] duration-150 ease-out motion-reduce:transition-none",
        data.isPickedUp ? "-translate-y-[4px] scale-[1.02] cursor-grabbing shadow-xl" : "active:cursor-grabbing",
        selected && "ring-2 ring-foreground",
      )}
      data-board-output={output.status}
    >
      <div className="flex shrink-0 items-center gap-[8px] rounded-t-[16px] px-[16px] py-[10px]">
        <Codicon className="shrink-0" name={mark.icon} size="16px" style={{ color: `var(${mark.tint})` }} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground">{mark.label}</span>
        <span className="rounded-[6px] bg-(--ui-bg-secondary) px-[8px] py-[2px] text-[11px] font-medium uppercase text-(--ui-text-tertiary)">Made here</span>
      </div>
      <div className="flex flex-col px-[16px] pb-[12px]">
        {output.status === "making" && (
          <div className="flex items-center gap-[8px] py-[8px] text-[14px] text-(--ui-text-secondary)">
            <LoaderCircle className="size-[16px] shrink-0 animate-spin" />
            <span className="min-w-0 truncate">{output.progress || MAKING_LABELS[output.kind]}…</span>
          </div>
        )}
        {output.status === "error" && (
          <div className="flex items-start gap-[8px] rounded-[8px] bg-(--board-error-bg) px-[12px] py-[10px] text-[14px] text-(--board-error-text)">
            <CircleAlert className="mt-[2px] size-[16px] shrink-0" />
            <span>{output.error || "This could not be made."}</span>
          </div>
        )}
        {output.status === "ready" && output.output && (
          <button
            className="nodrag nopan flex w-full items-center gap-[12px] rounded-[12px] px-[14px] py-[12px] text-left ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary)"
            onClick={() => openOutput(output.id)}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            <Codicon className="shrink-0" name={mark.icon} size="22px" style={{ color: `var(${mark.tint})` }} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[14px] text-foreground">{filename}</span>
              <span className="text-[12px] text-(--ui-text-quaternary)">{mark.label}</span>
            </span>
          </button>
        )}
      </div>
      <NodeHandles target />
    </div>
  );
}

export const OutputCard = memo(OutputCardInner);
