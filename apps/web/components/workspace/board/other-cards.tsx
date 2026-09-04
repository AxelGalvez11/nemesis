"use client";

// The two other node kinds: a NOTE (260 wide, tinted, anchored to a sentence of its card) and a
// SOURCE (a dropped file, 640 wide, with "Ask about this" and "Create lesson").
// docs/wondering-canvas-reference.md §6 and §7.

import type { NodeProps } from "@xyflow/react";
import { BookOpen, Check, CircleAlert, FileImage, FileText, Layers, ListChecks, LoaderCircle, Maximize2, MessageSquareQuote, Minimize2, PanelRight, Plus, StickyNote, Trash2, X } from "lucide-react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { OUTPUT_KIND_MARKS } from "@/components/workspace/learn/artifact-card";
import { KIND_LABELS, MAKING_LABELS } from "@/lib/board/board-deliverables";
import { CanvasCheck } from "@/components/workspace/learn/canvas-check";
import { describeAttempt, scoreTestRun } from "@/lib/learn/test-run";
import { docFilename } from "@/lib/export/doc-file";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { IMAGE_SOURCE_MIN_HEIGHT, SOURCE_MIN_HEIGHT } from "@/lib/board/board-layout";
import { annotationCountLabel, openAnnotationCount } from "@/lib/board/board-annotations";
import { cn } from "@/lib/utils";

import { AutoResizingTextarea, CardIcon, IconTooltip, NodeHandles, NodeResizeControls } from "./board-chrome";
import { useOpenBoardSource } from "./board-panel";
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
  const { annotations, sources, selectedSourceIds, toggleSourceSelection, createLessonFromSource, deleteNode, makeDeliverable, setSourceCollapsed } = useBoard();
  const openInPanel = useOpenBoardSource();
  const source = sources.find((item) => item.id === data.sourceId);
  const [resizing, setResizing] = useState(false);
  const start = useCallback(() => setResizing(true), []);
  const end = useCallback(() => setResizing(false), []);
  if (!source) return null;
  const marks = openAnnotationCount(annotations, source.id);
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
      {!source.collapsed && <NodeResizeControls minHeight={hasImage ? IMAGE_SOURCE_MIN_HEIGHT : SOURCE_MIN_HEIGHT} onVerticalResizeEnd={end} onVerticalResizeStart={start} />}
      <div className="flex shrink-0 items-center gap-[8px] rounded-t-[16px] px-[16px] py-[10px]">
        <Icon className="size-[16px] shrink-0 text-(--ui-action)" />
        {/* 🔴 THE TITLE IS THE DOOR, which is where a person reaches for it. The panel's own
            control is beside it for the same reason a link is not the only way into a page, but the
            name of the document opening the document is the gesture nobody has to be taught.
            🔴 `nodrag nopan` AND a stopped pointerdown, or React Flow takes the press as the start
            of a card drag and the click never lands. */}
        <button
          className="nodrag nopan min-w-0 flex-1 truncate text-left text-[14px] font-semibold text-foreground transition-colors hover:text-(--ui-action) disabled:cursor-default disabled:hover:text-foreground"
          disabled={source.status !== "ready"}
          onClick={() => openInPanel(source)}
          onPointerDown={(event) => event.stopPropagation()}
          title={source.status === "ready" ? `Open ${source.name} in the reading panel` : source.name}
          type="button"
        >
          {source.name}
        </button>
        {/* 🔴 THE SAME PHRASE THE CHAT'S CHIP USES, in full. A card has room for the word, and
            "3" alone on a document card reads as a page count. The TAB gets the number. */}
        {marks > 0 && (
          <span
            className="inline-flex shrink-0 items-center gap-[4px] rounded-[6px] bg-(--ui-bg-secondary) px-[8px] py-[2px] text-[11px] font-medium text-(--ui-text-secondary)"
            data-testid="source-card-annotations"
          >
            <MessageSquareQuote className="size-[12px]" />
            {annotationCountLabel(marks)}
          </span>
        )}
        {/* 🔴🔴 A DOCUMENT IS A CARD LIKE ANY OTHER, AND CARRIES THE SAME VERBS — owner 2026-09-04:
            *"users should be allowed to collapse, delete, make note, make flashcards, and make
            tests from documents too that were dropped in"*. Every one of these already existed for
            a thread; what was missing was the row. The makers read THIS document only, never the
            whole board (board-provider's `makeDeliverable`). */}
        {source.status === "ready" && (
          <>
            <CardIcon label="Make a note from this" onClick={() => makeDeliverable("note", { sourceId: source.id })}>
              <StickyNote className="size-[16px]" />
            </CardIcon>
            <CardIcon label="Make flashcards from this" onClick={() => makeDeliverable("flashcards", { sourceId: source.id })}>
              <Layers className="size-[16px]" />
            </CardIcon>
            <CardIcon label="Make a test from this" onClick={() => makeDeliverable("check", { sourceId: source.id })}>
              <ListChecks className="size-[16px]" />
            </CardIcon>
          </>
        )}
        <CardIcon label={source.collapsed ? "Expand document" : "Collapse document"} onClick={() => setSourceCollapsed(source.id, !source.collapsed)}>
          {source.collapsed ? <Maximize2 className="size-[16px]" /> : <Minimize2 className="size-[16px]" />}
        </CardIcon>
        <CardIcon label="Delete document" onClick={() => deleteNode(source.id)} tone="danger">
          <Trash2 className="size-[16px]" />
        </CardIcon>
      </div>
      {hasImage && !source.collapsed && (
        <div className="shrink-0 border-b border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) p-[12px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL of the dropped picture. */}
          <img alt={source.name} className="h-[160px] w-full rounded-[8px] object-contain" src={source.previewUrls[0]} />
          {source.previewUrls.length > 1 && <p className="mt-[8px] text-center text-[12px] text-(--ui-text-tertiary)">{source.previewUrls.length} images in this source</p>}
        </div>
      )}
      <div className={cn("flex flex-col px-[16px] py-[12px]", fixed && "min-h-0 flex-1", source.collapsed && "hidden")}>
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
              {/* 🔴 "Open" SAYS WHAT IT DOES AND NAMES THE THING IT OPENS. The panel is where a
                  document is read and annotated; a control called "Preview" or a bare icon would
                  leave the whole annotate lane behind a gesture nobody discovers. */}
              <button
                className="flex min-w-0 flex-1 items-center justify-center gap-[6px] rounded-[8px] bg-(--ui-bg-secondary) px-[12px] py-[8px] text-[12px] font-semibold text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
                onClick={() => openInPanel(source)}
                onPointerDown={(event) => event.stopPropagation()}
                type="button"
              >
                <PanelRight className="size-[14px]" />
                <span>Open</span>
              </button>
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
  const { outputs, openOutput, finishCheck, explainCheck, deleteNode } = useBoard();
  const output = outputs.find((item) => item.id === data.outputId);
  if (!output) return null;
  // 🔴 A CHECK HAS ITS OWN MARK HERE RATHER THAN JOINING `OUTPUT_KIND_MARKS`. That map is the
  // chat's ARTIFACT marks: every entry names a file extension and a thing in the Library. A test is
  // neither, and adding it there would put "Test" on the Library's own shelves.
  const mark =
    output.kind === "check"
      ? { extension: "", icon: "checklist", label: KIND_LABELS.check, tint: "--ui-kind-green" }
      : (OUTPUT_KIND_MARKS[output.kind] ?? { extension: "", icon: "file", label: KIND_LABELS[output.kind], tint: "--ui-kind-blue" });
  const title = output.output?.title ?? output.topic;
  const filename = output.output && mark.extension ? docFilename(output.output.title, mark.extension) : title;
  const score = output.run && output.picks ? scoreTestRun(output.run, output.picks) : null;
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
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground">{score ? `${score.correct} out of ${score.total}` : mark.label}</span>
        <CardIcon label="Delete" onClick={() => deleteNode(output.id)}>
          <X className="size-[16px]" />
        </CardIcon>
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
        {/* 🔴🔴 THE TEST IS PLAYED IN THE CARD, NOT OPENED FROM IT (owner 2026-09-04: "it still
            cannot make tests"), AND THE RESULT STAYS THERE TOO ("tests should show results in their
            own card node not be sent to chat"). `bare` drops CanvasCheck's own ring so the card
            does not wear two outlines.

            🔴 `nowheel` AND `nodrag`, OR THE BOARD EATS THE TEST: without `nodrag` every tap on an
            option starts dragging the node; without `nowheel` a scroll inside a long question pans
            the board. Both are React Flow's own opt-outs. */}
        {output.status === "ready" && output.run && !output.picks && (
          <div className="nodrag nopan nowheel max-h-[420px] overflow-y-auto overscroll-contain" onPointerDown={(event) => event.stopPropagation()}>
            <CanvasCheck bare onDismiss={() => deleteNode(output.id)} onAnswers={(picks) => finishCheck(output.id, picks)} onFinished={() => undefined} run={output.run} />
          </div>
        )}
        {output.status === "ready" && output.run && output.picks && score && (
          <div className="nodrag nopan nowheel max-h-[420px] overflow-y-auto overscroll-contain" onPointerDown={(event) => event.stopPropagation()}>
            <ol className="m-0 flex list-none flex-col gap-[10px] p-0">
              {output.run.questions.map((question, at) => {
                const picked = output.picks?.[at] ?? null;
                const right = question.options.find((option) => option.correct)?.text ?? "";
                const got = picked !== null && picked === right;
                return (
                  <li className="flex gap-[8px] text-[14px] leading-[1.5]" key={question.objectiveIdentityKey}>
                    <Codicon
                      className="mt-[2px] shrink-0"
                      name={got ? "pass-filled" : "error"}
                      size="16px"
                      style={{ color: `var(${got ? "--ui-kind-green" : "--ui-kind-red"})` }}
                    />
                    <span className="min-w-0">
                      <span className="block text-foreground">{question.prompt}</span>
                      {!got && (
                        <span className="block text-(--ui-text-secondary)">
                          {picked === null ? "Skipped." : `You said ${picked}.`} The answer is {right}.
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
            {/* 🔴 EXPLAINING IS A CHOICE, NOT SOMETHING THAT HAPPENS TO YOU. The account handed over
                is the chat's own `describeAttempt`, so the thread reads a miss the same way it does
                in the chat; what changed is that the learner asks for it. */}
            {score.correct < score.total && (
              <button
                className="mt-[12px] flex w-full items-center justify-center gap-[6px] rounded-[8px] bg-(--ui-bg-secondary) px-[12px] py-[8px] text-[12px] font-semibold text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
                onClick={() => output.run && output.picks && explainCheck(output.id, describeAttempt(output.run, output.picks))}
                onPointerDown={(event) => event.stopPropagation()}
                type="button"
              >
                <MessageSquareQuote className="size-[14px]" />
                <span>Explain what I missed</span>
              </button>
            )}
          </div>
        )}
        {output.status === "ready" && output.output && (
          <button
            className="nodrag nopan flex w-full items-center gap-[12px] rounded-[12px] px-[8px] py-[10px] text-left transition-colors hover:bg-(--ui-bg-tertiary)"
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
