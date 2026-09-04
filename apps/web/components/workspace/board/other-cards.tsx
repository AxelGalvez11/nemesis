"use client";

// The other node kinds: a NOTE (260 wide, tinted, anchored to a sentence of its card), a SOURCE (a
// dropped file, 640 wide, drawn as the document it is) and an OUTPUT (a thing Nemesis made).
// docs/wondering-canvas-reference.md §6 and §7.
//
// 🔴🔴 A SOURCE AND AN OUTPUT WEAR THE CONVERSATION CARD'S CHROME, and that is the whole of the
// owner's 2026-09-04 note *"make sure all card node designs are consistent and match, use
// wondering.app/canvas for baseline"*. Same shell, same floating title bar above the box
// (`CardTitleBar`), same icon order (make, collapse, delete), same four hover pluses
// (`BranchButtons`) on anything a thread can grow from.
//
// 🔴 A NOTE IS THE ONE DELIBERATE EXCEPTION, as it is in the reference (§6): a 260-wide tinted
// sticky with its header INSIDE it, because it is a thing the learner wrote rather than a place to
// work from. Making it match the others would make a jotting look like a document.

import type { NodeProps } from "@xyflow/react";
import { CircleAlert, FileImage, FileText, Layers, ListChecks, LoaderCircle, Maximize2, MessageSquareQuote, Minimize2, StickyNote, Trash2, X } from "lucide-react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { OUTPUT_KIND_MARKS } from "@/components/workspace/learn/artifact-card";
import { KIND_LABELS, MAKING_LABELS } from "@/lib/board/board-deliverables";
import { CanvasCheck } from "@/components/workspace/learn/canvas-check";
import { describeAttempt, scoreTestRun } from "@/lib/learn/test-run";
import { docFilename } from "@/lib/export/doc-file";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { IMAGE_SOURCE_MIN_HEIGHT, SOURCE_MIN_HEIGHT } from "@/lib/board/board-layout";
import { cn } from "@/lib/utils";

import { AutoResizingTextarea, BranchButtons, CardIcon, CardTitleBar, IconTooltip, NodeHandles, NodeResizeControls } from "./board-chrome";
import { useBoard } from "./board-provider";
import { SourceDocument } from "./source-document";

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
  const { cards, sources, selectedSourceIds, createBranchCard, deleteNode, makeDeliverable, setSourceCollapsed } = useBoard();
  const source = sources.find((item) => item.id === data.sourceId);
  if (!source) return null;
  const ready = source.status === "ready";
  const chosen = selectedSourceIds.includes(source.id);
  const Icon = source.type === "image" ? FileImage : FileText;
  /**
   * 🔴🔴 THE CARD FILLS ITS NODE, ALWAYS, AND THIS WAS THE CLIPPING. Owner, 2026-09-04: *"it's sort
   * of not contained within the box. It's sort of clipping out, and it's glitchy."* This used to
   * read `source.height !== undefined`, so a source saved before sources carried a default height
   * did not get `h-full` and grew to its content instead: measured at 1,579px of card inside a
   * 560px node, spilling over everything under it while the board's hit-testing still used the
   * node's box. `board-surface.tsx` now gives every open source a height, so the card can simply
   * fill it, and a collapsed one is its title bar exactly as a collapsed thread is.
   */
  const fixed = !source.collapsed;
  const hasImage = source.type === "image" && Boolean(source.previewUrls[0]);
  return (
    <div
      className={cn(
        "group/card relative flex w-full cursor-grab flex-col rounded-[16px] border bg-(--ui-bg-elevated) shadow-sm transition-[color,transform,box-shadow] duration-150 ease-out motion-reduce:transition-none",
        data.isPickedUp ? "-translate-y-[4px] scale-[1.02] cursor-grabbing shadow-xl" : "active:cursor-grabbing",
        fixed && "h-full",
        // The accent says the composer at the bottom of the board will read this document with the
        // next question. A drop turns it on by itself; sending clears it.
        chosen ? "border-(--ui-action)" : "border-(--ui-stroke-secondary)",
        selected && "ring-2 ring-foreground",
      )}
    >
      {/* No resize-start/end handshake any more: the card is fixed-height whenever it is open, so
          there is no moment where it has to be told to stop growing with its content. */}
      {!source.collapsed && <NodeResizeControls minHeight={hasImage ? IMAGE_SOURCE_MIN_HEIGHT : SOURCE_MIN_HEIGHT} />}
      {/* 🔴🔴 THE FOUR PLUSES, AS ON A THREAD — owner, 2026-09-04: *"documents should have the four
          'create card' like chats"*, in the same message that cut the two buttons along this card's
          bottom edge: *"remove 'create lesson'"*, *"remove 'ask about this'"*. Pressing one opens an
          empty card joined to this document, and every question typed into it is answered from the
          document alone.
          🔴 THE OWNER'S LOWERCASE IS QUOTED ON PURPOSE. `board-panel.test.ts` fails on the literal
          button labels appearing anywhere in this file, and a guard that trips on its own
          explanation teaches the next person to delete the explanation. */}
      <BranchButtons
        disabled={!ready}
        emphasiseRight={cards.length + sources.length === 1 && !selected}
        onBranch={(side) => createBranchCard(source.id, side)}
        selected={selected}
      />
      {/* 🔴 THE SAME BAR A THREAD WEARS, in the same order: make, collapse, delete. It used to be a
          header row INSIDE the box, which is what made a document card read as a different species
          from the card beside it (owner: *"make sure all card node designs are consistent"*).
          🔴🔴 A DOCUMENT CARRIES THE SAME VERBS AS A THREAD — owner, 2026-09-04: *"users should be
          allowed to collapse, delete, make note, make flashcards, and make tests from documents too
          that were dropped in"*. The makers read THIS document only, never the whole board
          (board-provider's `makeDeliverable`). */}
      <CardTitleBar icon={<Icon className="size-[16px] shrink-0 text-(--ui-action)" />} title={source.name}>
        {ready && (
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
      </CardTitleBar>
      <div className={cn("flex min-h-0 flex-1 flex-col px-[16px] py-[12px]", source.collapsed && "hidden")}>
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
        {/* 🔴🔴 THE DOCUMENT ITSELF, IN THE CARD (owner 2026-09-04: "pdfs, docx, pptx, still cannot
            be seen in the canvas, they only render text"). Pages, slides and layout, not a stripped
            preview and a button to somewhere else. Nothing sits under it any more: the two buttons
            that used to are the four pluses above. */}
        {/* 🔴🔴 NO MINIMUM HEIGHT ON THE BODY, AND THAT 280px WAS THE SECOND CLIPPING. Owner,
            2026-09-04, after #1168: the deck on his own canvas was still drawn across the card
            under it. Measured: the node was 217px (a height saved by the old design), the body
            insisted on 280, and the box's own `overflow-hidden` is on the READER, so the reader
            simply clipped 63px below the card's bottom edge. The node's minimum is the resize
            handle's (`SOURCE_MIN_HEIGHT`) and it is the only one; the body fills what it is given. */}
        {ready && (
          <div className="flex min-h-0 flex-1 flex-col">
            <SourceDocument interactive={selected === true} source={source} />
          </div>
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
      {/* The same bar the thread and the document wear, so a board of three kinds reads as one set
          of cards. A made thing has nothing to make FROM it, so the row is delete alone. */}
      <CardTitleBar
        icon={<Codicon className="shrink-0" name={mark.icon} size="16px" style={{ color: `var(${mark.tint})` }} />}
        title={score ? `${score.correct} out of ${score.total}` : mark.label}
      >
        <CardIcon label="Delete" onClick={() => deleteNode(output.id)} tone="danger">
          <Trash2 className="size-[16px]" />
        </CardIcon>
      </CardTitleBar>
      <div className="flex flex-col px-[16px] py-[12px]">
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
