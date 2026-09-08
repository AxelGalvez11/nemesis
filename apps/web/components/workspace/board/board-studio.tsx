"use client";

// The panels beside the board: the sources as a list you tick, and the things you can make from them.
//
// Owner, 2026-09-06: *"have a place to also see sources as list too, and panel with buttons to
// create artifacts with ability to choose which sources to make from like in notebook llm"*. Then,
// with the first build on screen the same day: *"there should be like only one side panel ... you
// wanna have your sources on the right and you wanna add sources like a notebook LM ... just move
// like the sources and the create to be separate panels. Like on the right side."*
//
// Then, with that column on screen: *"the source and create panels are too big, could make them
// like the toolbar in stitch where users can toggle the panel on or off"*, with a picture of
// Stitch's right-edge toolbar and the DESIGN.md panel its palette button opens beside it.
//
// So: A TOOLBAR, AND ONE PANEL AT A TIME. A vertical pill on the right edge, centred (Stitch's:
// 46 wide, 32px round buttons, the pressed one a filled circle), holding two buttons, Sources and
// Create. Pressing one opens its panel to the LEFT of the pill (Stitch's: a 277-wide card, radius
// 24, an icon, a title and an X in its header); pressing it again, the X, or Escape closes it;
// pressing the other swaps. Nothing is open until the learner opens it, and what they leave open
// is remembered. The first two shapes (a card down the left edge; a two-card column down the right)
// both stood open by default and the owner read both as too big. Nothing else moves for the panel:
// the composer stays centred in the full width, undo/redo stays top-right and the zoom cluster
// bottom-right, exactly as the live board had them.
//
// WHAT IS IN THEM is NotebookLM's Sources panel and Studio (2026-09-05, 1470x836): "Add sources",
// a "Select all" row and a checkbox on every source (rows 52 tall, 16px); a two-column grid of
// tiles (161x56, radius 12, icon top-left, label bottom-left, chevron right); under the tiles, the
// list of things made. Sources FIRST because a tile acts on what is ticked above it.
//
// 🔴🔴 STANDING PANELS, NOT POPUPS. Owner 2026-09-04: *"i dont want any popups in canvas,
// everything should be seen and done within the cards"*. Nothing here opens over the board: no
// dropdown, no dialog, no menu. A panel folds to its header and back, and that is remembered.
//
// 🔴🔴 THE TICKS ARE THE BOARD'S SCOPE. What is ticked is what a question is answered from and what
// a tile makes from (board-provider.tsx `setSourceSelection`); a new source arrives ticked. Nothing
// ticked means everything, never nothing, the same rule a question has always followed.
//
// 🔴 A TILE IS ONE PRESS AND NO DIALOG. NotebookLM makes on the click, with a pencil for those who
// want to steer; the chat's own study dialog is not opened here. Steering is a sentence in the
// composer ("make me flashcards on chapter 3"), which the board has always read.
//
// 🔴 A DOCUMENT CLOSES THE PANEL. The reading pane docks on this same edge (board-panel.tsx) and
// narrows the board; while anything is open in it the panel closes and only the toolbar stays, so
// a document never fights the sources list for the edge. A button still opens its panel over the
// narrowed board for as long as the document is open; when the last tab closes, the panel comes
// back as it was.

import { useReactFlow } from "@xyflow/react";
import { ArrowLeft, Check, ChevronRight, CircleAlert, Files, FolderPlus, LoaderCircle, Plus, Redo2, Sparkles, Undo2, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { OUTPUT_KIND_MARKS } from "@/components/workspace/learn/artifact-card";
import { useDocumentDock } from "@/components/workspace/learn/document-dock";
import { KIND_LABELS, MAKING_LABELS, type BoardMakeKind } from "@/lib/board/board-deliverables";
import { groundedSourceFor } from "@/lib/board/board-grounding";
import { relativeTime } from "@/lib/watch-format";
import type { BoardOutputCard, BoardSource } from "@/lib/board/board-model";
import { STUDIO_LENGTHS, STUDIO_LEVELS, STUDIO_TILES, boardHasMaterial, studioInstruction, type StudioLength, type StudioLevel, type StudioTile } from "@/lib/board/board-studio";
import { cn } from "@/lib/utils";

import { IconTooltip, isEditableTarget } from "./board-chrome";
import { LANDING_ACCEPT } from "./board-landing";
import { useBoard } from "./board-provider";

/**
 * The panel's width.
 *
 * 🔴 360, SO A TILE IS THE REFERENCE'S 160. Owner, 2026-09-07: *"copy the sources panel from
 * notebookllm into the nemesis app"* and *"notice how the right studio panel has the buttons for
 * creating and has the list under it, copy that into the app"*. Measured in his own notebook
 * (docs/canvas-workspace-reference.md §9): their panel is 359 and their tiles are 161 x 56 in two
 * columns with 8 between. At our old 320 the same grid gave 140-wide tiles, and "Video Overview"
 * wrapped. 360 − 32 of inset − 8 of gap = 160 each, which is theirs to a pixel.
 *
 * 🔴 ONE PANEL, NOT THEIR THREE. They put Sources left, Chat centre and Studio right; the owner
 * ruled that out by name (2026-09-06, *"having double side panels isn't too good … only one side
 * panel"*) and read a standing panel as too big twice. What is copied is the CONTENTS.
 */
export const STUDIO_WIDTH = 360;

type PanelId = "sources" | "create";

/** Which panel the learner left open, remembered per browser. */
const PANEL_KEY = "nemesis.board.panel";

/**
 * 🔴🔴 SOURCES STANDS OPEN THE FIRST TIME, AND ONLY THE FIRST TIME. Owner, 2026-09-07: *"the
 * sources button ... by default I think it should be open ... and so that way users are encouraged
 * to drop in things"*. This reverses the round-five default (nothing open until you open it), and
 * the reversal is narrow on purpose: a learner who CLOSES it is remembered as closed forever
 * (`""` is stored), because the earlier lesson still stands — twice he read a standing panel as too
 * big. What is new is that the very first canvas invites the drop rather than hiding the door.
 */
function readPanel(): PanelId | null {
  try {
    const raw = window.localStorage.getItem(PANEL_KEY);
    if (raw === null) return "sources";
    return raw === "sources" || raw === "create" ? raw : null;
  } catch {
    return "sources";
  }
}

const PANELS: Record<PanelId, { label: string; icon: LucideIcon }> = {
  sources: { label: "Sources", icon: Files },
  create: { label: "Create", icon: Sparkles },
};

const HEAD_BUTTON = "flex size-[32px] shrink-0 items-center justify-center rounded-full text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground";

/** The icon and tint a kind wears everywhere else: the artifact chip's marks, and the test's own. */
function markOf(kind: BoardMakeKind): { icon: string; tint: string } {
  if (kind === "check") return { icon: "checklist", tint: "--ui-kind-green" };
  if (kind === "mindmap") return { icon: "type-hierarchy-sub", tint: "--ui-kind-purple" };
  const mark = OUTPUT_KIND_MARKS[kind];
  return mark ? { icon: mark.icon, tint: mark.tint } : { icon: "file", tint: "--ui-kind-blue" };
}

/**
 * A tile's ground: its own colour, washed almost out.
 *
 * 🔴🔴 A MIX AGAINST THE PANEL, NOT A LITERAL COLOUR. NotebookLM's tiles are flat light fills
 * (`rgb(237,239,250)` under a blue label, `rgb(247,237,235)` under a red one — §9), which are those
 * hues at roughly a tenth over white. Writing their hex values here would look identical in the
 * light theme and be six pale bricks on a dark canvas in the other. Mixing the kind token we
 * already own against the panel's own ground gives the same picture in both, and follows the theme
 * if it ever moves.
 *
 * 🔴 12%, MEASURED RATHER THAN GUESSED. Their blue tile is 5% of the way from white to their blue;
 * ours has to carry a little more because our kind tokens are less saturated than theirs, and below
 * about 10% the tint stops being visible against `--ui-bg-elevated` at all.
 */
const tileTint = (tint: string) => `color-mix(in srgb, var(${tint}) 12%, var(--ui-bg-elevated))`;

function sourceIcon(source: BoardSource): string {
  if (source.type === "pdf") return "file-pdf";
  if (source.type === "image") return "file-media";
  return "file";
}

/** 🔴 THE GLYPH IS COLOURED BY FILE TYPE, as the reference's is (§9: their PDF is `rgb(219,55,45)`).
 *  Ours were all one accent, so a list of ten files was ten identical blue marks and the name was
 *  the only thing separating them. */
const sourceTint = (source: BoardSource) => (source.type === "pdf" ? "--ui-kind-red" : source.type === "image" ? "--ui-kind-purple" : "--ui-kind-blue");

/** A 16px tick box, drawn by us so it reads the same in both themes; the real checkbox is beneath it for the keyboard. */
function Tick({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: () => void }) {
  return (
    <span className="relative flex size-[16px] shrink-0 items-center justify-center">
      <input
        aria-label={label}
        checked={checked}
        className="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
        disabled={disabled}
        onChange={onChange}
        type="checkbox"
      />
      <span
        aria-hidden
        className={cn(
          "flex size-[16px] items-center justify-center rounded-[4px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-(--ui-action)",
          checked ? "border-(--ui-action) bg-(--ui-action) text-(--ui-action-glyph)" : "border-(--ui-stroke-primary) bg-transparent",
          disabled && "opacity-40",
        )}
      >
        {checked && <Check className="size-[12px]" strokeWidth={3} />}
      </span>
    </span>
  );
}

/**
 * A row in the Sources list.
 *
 * 🔴 NO `onTick` MEANS NO TICK BOX AT ALL, which is the shape inside a chat: what that chat reads is
 * decided by the frame it stands in (lib/board/board-scope.ts), so a box here would be a control
 * that changed nothing. A disabled box would say "you may not", which is also untrue; the answer is
 * that there is nothing to choose.
 */
/**
 * A row in the Sources list, in NotebookLM's own grammar (§9, measured 2026-09-07).
 *
 * 🔴🔴 THE TICK MOVED TO THE RIGHT, AND THAT IS THE COPY. Theirs: 52 tall, radius 8, padding 0 8,
 * a 24px file glyph in its type's colour on the LEFT, the name at 14px/24, and the checkbox at the
 * far right. Ours put the tick first, so the glyph and the name both started at a different x
 * depending on whether the row could be ticked at all — inside a chat there are no ticks, and the
 * whole list shifted 26px left against the same list on the board.
 *
 * 🔴 NO `onTick` MEANS NO TICK BOX AT ALL, which is the shape inside a chat: what that chat reads
 * is decided by the frame it stands in (lib/board/board-scope.ts), so a box here would be a control
 * that changed nothing. A disabled box would say "you may not", which is also untrue; the answer is
 * that there is nothing to choose.
 */
function SourceGlyph({ failed, processing, source }: { failed: boolean; processing: boolean; source: BoardSource }) {
  if (processing) return <LoaderCircle aria-hidden className="size-[24px] shrink-0 animate-spin text-(--ui-text-tertiary)" />;
  if (failed) return <CircleAlert aria-hidden className="size-[24px] shrink-0 text-(--board-error)" />;
  return <Codicon aria-hidden className="shrink-0" name={sourceIcon(source)} size="24px" style={{ color: `var(${sourceTint(source)})` }} />;
}

function SourceRow({ source, ticked, onOpen, onTick }: { source: BoardSource; ticked: boolean; onOpen?: () => void; onTick?: () => void }) {
  const processing = source.status === "processing";
  const failed = source.status === "error";
  const openable = Boolean(onOpen) && !processing && !failed;
  return (
    <li className={cn("flex h-[52px] items-center gap-[10px] rounded-[8px] px-[8px] transition-colors hover:bg-(--ui-control-hover-background)")}>
      {/* 🔴🔴 THE ROW OPENS, THE TICK TICKS, AND THEY ARE TWO SEPARATE CONTROLS. Owner, 2026-09-07:
          *"I cannot unselect a single source without it opening the sidebar"*. They were one: the
          whole row was a `<label role="button" onClick={onOpen}>` with the tick INSIDE it, so a
          press on the box did its own job and then bubbled to the row's, and untickng a document
          always opened it. Two siblings cannot do that to each other.

          🔴 A `<button>` FOR THE NAME, NOT A CLICKABLE `<li>`. Wrapping the row would put the tick
          inside a button, which is invalid and swallows its clicks in a different way; making the
          name its own button leaves the tick a sibling and gives the keyboard two real stops. */}
      {openable ? (
        <button
          className="flex min-w-0 flex-1 items-center gap-[10px] text-left"
          onClick={onOpen}
          title={source.name}
          type="button"
        >
          <SourceGlyph failed={failed} processing={processing} source={source} />
          <span className="min-w-0 flex-1 truncate text-[14px] leading-[24px] text-foreground">{source.name}</span>
        </button>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-[10px]" title={failed ? source.error || "This file could not be read." : source.name}>
          <SourceGlyph failed={failed} processing={processing} source={source} />
          <span className={cn("min-w-0 flex-1 truncate text-[14px] leading-[24px]", failed ? "text-(--ui-text-tertiary)" : "text-foreground")}>{source.name}</span>
        </span>
      )}
      {processing && <span className="shrink-0 text-[12px] text-(--ui-text-tertiary)">Reading…</span>}
      {onTick && <Tick checked={ticked && !processing && !failed} disabled={processing || failed} label={`Use ${source.name}`} onChange={onTick} />}
    </li>
  );
}

/**
 * One thing this canvas has made, as NotebookLM lists it.
 *
 * 🔴🔴 THE SECOND LINE IS THREE FACTS, NOT ONE, and that is the copy. Measured in his notebook
 * (§9): rows 331 x 64, radius 16, padding 8, a 24px glyph in the kind's colour, the title at
 * 14px/16 weight 500, and under it `Study Guide · 10 sources · 1d ago`. Ours printed the kind and
 * stopped, so the list said what each row WAS and nothing about where it came from or when — which
 * is the difference between a list and a receipt, and the reason theirs is worth scrolling.
 */
function MadeRow({ output, onOpen, sources }: { output: BoardOutputCard; onOpen: () => void; sources: number }) {
  const mark = markOf(output.kind);
  const title = output.output?.title || output.topic || KIND_LABELS[output.kind];
  const when = relativeTime(output.createdAt, Date.now());
  // 🔴 ONLY THE FACTS THAT EXIST. A deliverable made from a thread rather than from ticked
  // documents has no source count, and printing "0 sources" would be a claim that it read nothing.
  const meta = [KIND_LABELS[output.kind], sources > 0 ? (sources === 1 ? "1 source" : `${sources} sources`) : null, when].filter(Boolean).join("  ·  ");
  return (
    <li>
      <button
        className="flex h-[64px] w-full items-center gap-[12px] rounded-[16px] p-[8px] text-left transition-colors hover:bg-(--ui-control-hover-background)"
        onClick={onOpen}
        title={output.kind === "check" ? `Show ${title} on the canvas` : `Open ${title}`}
        type="button"
      >
        {output.status === "making" ? (
          <LoaderCircle aria-hidden className="size-[24px] shrink-0 animate-spin text-(--ui-text-tertiary)" />
        ) : output.status === "error" ? (
          <CircleAlert aria-hidden className="size-[24px] shrink-0 text-(--board-error)" />
        ) : (
          <Codicon aria-hidden className="shrink-0" name={mark.icon} size="24px" style={{ color: `var(${mark.tint})` }} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium leading-[16px] text-foreground">{output.status === "making" ? `${MAKING_LABELS[output.kind]}…` : title}</span>
          <span className="mt-[2px] block truncate text-[12px] leading-[16px] text-(--ui-text-tertiary)">
            {output.status === "error" ? output.error || "Could not be made" : meta}
          </span>
        </span>
      </button>
    </li>
  );
}

const isApple = () => typeof navigator !== "undefined" && /Mac|iP(?:hone|ad|od)/.test(navigator.platform || navigator.userAgent);

/**
 * Undo and redo, and they live HERE now rather than in board-surface.tsx.
 *
 * 🔴 ONE PILL, NOT TWO PILLS BESIDE EACH OTHER. Owner, 2026-09-07: *"could you move the create and
 * source buttons to the top right next to the forward and back arrows?"*. Two floating controls
 * 8px apart read as one control that has been broken in half, and keeping them in two files would
 * mean two opinions about where the top-right corner starts. This component moved rather than
 * being copied: it only ever needed `useBoard`, never React Flow.
 */
function UndoRedoButtons() {
  const { canUndo, canRedo, undo, redo } = useBoard();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target) || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const isRedo = (key === "z" && event.shiftKey) || (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey);
      const isUndo = key === "z" && !event.shiftKey;
      if (!isUndo && !isRedo) return;
      event.preventDefault();
      if (isRedo && canRedo) redo();
      else if (isUndo && canUndo) undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canRedo, canUndo, redo, undo]);
  const apple = isApple();
  const button = "flex size-[32px] shrink-0 items-center justify-center rounded-full text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-(--ui-text-secondary)";
  return (
    <>
      <IconTooltip label={`Undo (${apple ? "⌘Z" : "Ctrl+Z"})`}>
        <button aria-label={`Undo (${apple ? "⌘Z" : "Ctrl+Z"})`} className={button} disabled={!canUndo} onClick={undo} type="button">
          <Undo2 aria-hidden className="size-[16px]" />
        </button>
      </IconTooltip>
      <IconTooltip label={`Redo (${apple ? "⇧⌘Z" : "Ctrl+Y"})`}>
        <button aria-label={`Redo (${apple ? "⇧⌘Z" : "Ctrl+Y"})`} className={button} disabled={!canRedo} onClick={redo} type="button">
          <Redo2 aria-hidden className="size-[16px]" />
        </button>
      </IconTooltip>
    </>
  );
}

/** One button of the toolbar: a 32px circle, filled while its panel is open (Stitch's pressed state). */
function ToolButton({ id, active, dot, onPress }: { id: PanelId; active: boolean; dot?: boolean; onPress: () => void }) {
  const { label, icon: Icon } = PANELS[id];
  return (
    <IconTooltip label={label} side="left">
      <button
        aria-controls="board-panel"
        aria-label={label}
        aria-pressed={active}
        className={cn(
          "relative flex size-[32px] items-center justify-center rounded-full transition-colors",
          active ? "bg-foreground text-(--ui-bg-elevated)" : "text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground",
        )}
        data-board-tool={id}
        onClick={onPress}
        type="button"
      >
        <Icon aria-hidden className="size-[16px]" />
        {/* §46: a dot, not a count. There is something in the panel. */}
        {dot && !active && <span className="absolute right-[4px] top-[4px] size-[5px] rounded-full bg-(--ui-text-quaternary)" />}
      </button>
    </IconTooltip>
  );
}

/**
 * The open panel: beside the toolbar, under the undo pill, as tall as it needs up to the board.
 *
 * 🔴 ONE PANEL, ONE X. Stitch's DESIGN.md card: an icon, a title and a close at the top, the
 * contents beneath. There is no second panel to stack under it and no header that folds; the
 * toolbar button is the fold.
 */
function PanelFrame({ id, title, onBack, onClose, leaving, children }: { id: PanelId; title?: string; onBack?: () => void; onClose: () => void; leaving: boolean; children: ReactNode }) {
  const { label, icon: Icon } = PANELS[id];
  return (
    <section
      aria-label={label}
      className={cn(
        // 🔴 DIRECTLY UNDER THE BUTTON THAT OPENED IT, right edge to right edge. The owner asked for
        // the panel to open beside its button on 2026-09-06 (it was pinned to the top while the
        // toolbar was centred down the edge); a day later the toolbar itself moved to the top-right
        // corner, so "beside" is now "below". Same right edge as the pill, 8px under it, and tall
        // enough to stop short of the zoom cluster.
        "pointer-events-auto absolute right-[16px] top-[72px] z-40 flex max-h-[calc(100%-134px)] flex-col overflow-hidden rounded-[24px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated)/95 backdrop-blur-xl",
        // Stitch's DESIGN.md card sits ON the canvas rather than in it, and the shadow is what says
        // so: a wide, soft fall rather than Tailwind's tight `shadow-lg`.
        "shadow-[0_16px_40px_rgba(0,0,0,0.22),0_2px_8px_rgba(0,0,0,0.12)]",
        leaving ? "board-panel-out" : "board-panel-in",
      )}
      data-board-panel={id}
      data-board-studio="open"
      id="board-panel"
      style={{ width: STUDIO_WIDTH }}
    >
      <header className="flex h-[56px] shrink-0 items-center gap-[10px] pl-[20px] pr-[12px]">
        {onBack ? (
          <IconTooltip label="Back">
            <button aria-label="Back to create" className={cn(HEAD_BUTTON, "-ml-[8px]")} data-board-form-back="" onClick={onBack} type="button">
              <ArrowLeft aria-hidden className="size-[16px]" />
            </button>
          </IconTooltip>
        ) : (
          <Icon aria-hidden className="size-[18px] shrink-0 text-(--ui-text-secondary)" />
        )}
        <h2 className="min-w-0 flex-1 truncate text-[16px] font-medium leading-[24px] text-foreground">{title ?? label}</h2>
        <IconTooltip label="Close">
          <button aria-label={`Close ${label.toLowerCase()}`} className={HEAD_BUTTON} onClick={onClose} type="button">
            <X aria-hidden className="size-[16px]" />
          </button>
        </IconTooltip>
      </header>
      {children}
    </section>
  );
}

/** One row of the segmented choice: NotebookLM's own control, 40 tall, the chosen one wearing a tick. */
function Choice<T extends string>({ label, options, value, onChange, name }: { label: string; options: readonly T[]; value: T; onChange: (next: T) => void; name: string }) {
  return (
    <div className="px-[16px] pb-[12px]">
      <p className="pb-[6px] text-[13px] font-medium leading-[18px] text-(--ui-text-secondary)">{label}</p>
      <div className="flex overflow-hidden rounded-[8px] border border-(--ui-stroke-secondary)" data-studio-choice={name} role="radiogroup">
        {options.map((option, index) => (
          <button
            aria-checked={option === value}
            className={cn(
              "h-[32px] flex-1 text-[12px] font-medium capitalize leading-[16px] transition-colors",
              index > 0 && "border-l border-(--ui-stroke-secondary)",
              option === value ? "bg-(--ui-bg-secondary) text-foreground" : "text-(--ui-text-tertiary) hover:bg-(--ui-control-hover-background) hover:text-foreground",
            )}
            key={option}
            onClick={() => onChange(option)}
            role="radio"
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 🔴🔴 NEMESIS ASKS BEFORE IT MAKES. Owner, 2026-09-06, with his own notebook open: *"notebookllm
 * asks user questions before generating flashcards or other artifacts"*. Measured in that notebook
 * the same evening: pressing Flashcards opens a form — Number of Cards, Level of Difficulty, which
 * sources, and "What should the topic be?" over a box whose placeholder is a real sentence — with
 * one Generate at the foot.
 *
 * 🔴 THIS REVERSES "A TILE IS ONE PRESS AND NO DIALOG" AND KEEPS "NO POPUPS IN CANVAS". Both were
 * the owner's, two days apart, and only one of them is actually contradicted: the form opens INSIDE
 * the panel that is already on screen, in place of the tiles. Nothing floats over the board, no
 * dialog mounts, the back arrow returns to the tiles, and Escape still closes the panel.
 *
 * 🔴 THE ANSWERS BECOME ONE SENTENCE (`studioInstruction`), because one sentence is the only thing
 * the makers take, and it is the same sentence a learner could have typed.
 */
function MakeForm({ tile, scope, onMake }: { tile: StudioTile; scope: string; onMake: (instruction: string) => void }) {
  const [topic, setTopic] = useState("");
  const [length, setLength] = useState<StudioLength>("standard");
  const [level, setLevel] = useState<StudioLevel>("medium");
  return (
    <div className="scrollbar-dt min-h-0 flex-1 overflow-y-auto pb-[16px]" data-studio-form={tile.kind}>
      <p className="px-[16px] pb-[12px] text-[length:var(--canvas-text-meta)] leading-[16px] text-(--ui-text-quaternary)" data-create-scope="">
        {scope}
      </p>
      {tile.fewer && <Choice label="How much" name="length" onChange={setLength} options={STUDIO_LENGTHS} value={length} />}
      {tile.graded && <Choice label="How hard" name="level" onChange={setLevel} options={STUDIO_LEVELS} value={level} />}
      <div className="px-[16px]">
        <label className="block pb-[6px] text-[13px] font-medium leading-[18px] text-(--ui-text-secondary)" htmlFor="studio-topic">
          What should it cover?
        </label>
        <textarea
          className="h-[84px] w-full resize-none rounded-[8px] border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) px-[10px] py-[8px] text-[13px] leading-[18px] text-foreground outline-none placeholder:text-(--ui-text-quaternary) focus:border-(--ui-action)"
          id="studio-topic"
          onChange={(event) => setTopic(event.target.value)}
          placeholder={tile.example}
          value={topic}
        />
        <p className="pt-[6px] text-[12px] leading-[16px] text-(--ui-text-quaternary)">Leave this empty and it covers everything.</p>
      </div>
      <div className="px-[16px] pt-[16px]">
        <button
          className="h-[36px] w-full rounded-full bg-(--ui-action) text-[13px] font-medium text-(--ui-action-glyph) transition-opacity hover:opacity-90"
          data-studio-make={tile.kind}
          onClick={() => onMake(studioInstruction(tile, { topic, length, level }))}
          type="button"
        >
          {tile.make}
        </button>
      </div>
    </div>
  );
}

export function BoardStudio() {
  const { cards, sources, outputs, selectedSourceIds, toggleSourceSelection, setSourceSelection, addSourceFiles, makeDeliverable, enteredCardId, openOutput, leaveCard, madeForCardId } = useBoard();
  const { fitView } = useReactFlow();
  const dock = useDocumentDock();
  const picker = useRef<HTMLInputElement>(null);

  // What the learner left open, remembered; and what they opened while a document was in front.
  const [stored, setStored] = useState<PanelId | null>(null);
  const [peek, setPeek] = useState<PanelId | null>(null);
  useEffect(() => setStored(readPanel()), []);
  /**
   * 🔴🔴 A DROP OPENS THE SOURCES PANEL. Owner, 2026-09-07: *"dropping sources into canvas should
   * open the source panel so user sees they were dropped in there and processing"*, and again in
   * the same breath *"we'll show like a parsing animation when they drop it in and I'm expecting to
   * see that"*. The shimmer is drawn on the card itself, so without this the learner watches the
   * one place the arrival is NOT summarised. Counted rather than flagged, so it fires for a drop,
   * the file picker and a paste alike, and never on load (`known` starts at whatever loaded).
   */
  const known = useRef<number | null>(null);
  useEffect(() => {
    const was = known.current;
    known.current = sources.length;
    if (was === null || sources.length <= was) return;
    setStored("sources");
    setPeek("sources");
    try {
      window.localStorage.setItem(PANEL_KEY, "sources");
    } catch {
      /* not remembered */
    }
  }, [sources.length]);

  /**
   * 🔴 PRESSING A CHAT'S STACK OPENS THIS PANEL. The sheets under a card say "there are two things
   * in here"; with nothing fanning onto the board any more the press has to lead somewhere, and the
   * place they live is Made here. An event rather than a prop because the presser is a card drawn
   * deep inside the surface, which is the same plumbing problem the dock was extracted to solve.
   */
  useEffect(() => {
    const show = () => {
      setStored("create");
      setPeek("create");
      try {
        window.localStorage.setItem(PANEL_KEY, "create");
      } catch {
        /* not remembered */
      }
    };
    window.addEventListener("nemesis:board-show-made", show);
    return () => window.removeEventListener("nemesis:board-show-made", show);
  }, []);

  const docked = dock.items.length > 0;
  useEffect(() => {
    if (!docked) setPeek(null);
  }, [docked]);
  const shown = docked ? peek : stored;
  const toggle = useCallback(
    (id: PanelId | null) => {
      if (docked) {
        setPeek((prev) => (prev === id ? null : id));
        return;
      }
      setStored((prev) => {
        const next = prev === id ? null : id;
        try {
          window.localStorage.setItem(PANEL_KEY, next ?? "");
        } catch {
          /* not remembered */
        }
        return next;
      });
    },
    [docked],
  );
  const close = useCallback(() => {
    if (docked) setPeek(null);
    else toggle(null);
  }, [docked, toggle]);

  /**
   * 🔴 THE PANEL HAS TO STAY MOUNTED TO LEAVE. Unmounting on the press is what makes a panel
   * disappear rather than close; the id is held for the 140ms the out-animation runs (board.css)
   * and only then dropped. Opening the other panel does not queue behind it: a swap is immediate,
   * with the new panel playing its own arrival, which is how the toolbar reads as one control.
   */
  const [closing, setClosing] = useState<PanelId | null>(null);
  const wasShown = useRef<PanelId | null>(null);
  useEffect(() => {
    const before = wasShown.current;
    wasShown.current = shown;
    if (shown) {
      setClosing(null);
      return;
    }
    if (!before) return;
    setClosing(before);
    const timer = window.setTimeout(() => setClosing(null), 140);
    return () => window.clearTimeout(timer);
  }, [shown]);
  const panel = shown ?? closing;
  const leaving = !shown && closing !== null;

  /** The tile whose questions are being answered, in place of the tile grid. */
  const [asking, setAsking] = useState<StudioTile | null>(null);
  useEffect(() => {
    if (shown !== "create") setAsking(null);
  }, [shown]);
  useEffect(() => {
    if (!shown) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || isEditableTarget(event.target)) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, shown]);

  const entered = cards.find((card) => card.id === enteredCardId) ?? null;
  const empty = cards.length === 0 && sources.length === 0 && outputs.length === 0;
  if (empty) return null;

  const ready = sources.filter((source) => source.status === "ready");
  /**
   * 🔴🔴 THE SAME LIST, WITH THE SAME TICKS, ON THE BOARD AND INSIDE A CHAT. Owner, 2026-09-07:
   * *"so all chats should contain all sources"* and *"thats why we have tickers"*. For one build
   * this panel showed only "that chat's sources" and hid the ticks inside a conversation, because a
   * frame decided what a chat read and a tick would have changed nothing. Both of those are gone:
   * there is one tick list for the canvas, it is the whole answer, and it has to be reachable from
   * wherever you are asking.
   */
  const listed = sources;
  const ticked = ready.filter((source) => selectedSourceIds.includes(source.id));
  const allTicked = ready.length > 0 && ready.every((source) => selectedSourceIds.includes(source.id));

  const material = boardHasMaterial(cards, sources);
  /**
   * 🔴 PRESSING A CHAT'S STACK NARROWS THIS LIST TO THAT CHAT. Owner, 2026-09-07: the sheets under a
   * card are *"to indicate that it has deliverables in it"*, and with nothing fanning onto the board
   * any more the press has to lead somewhere. Inside a chat it is already that chat's list.
   */
  const forCard = entered?.id ?? madeForCardId;
  const made = [...outputs].filter((output) => !forCard || output.cardId === forCard).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // 🔴🔴 THE BUTTONS FOLLOW YOU IN, AND THE SCOPE IS WHAT CHANGES. Owner, 2026-09-06, asking whether
  // artifacts live in the canvas only or in the chat's sidebar too. On the board, Create makes from
  // the TICKED SOURCES, which is what the ticks are for and NotebookLM's own model. Standing inside
  // a thread, the material in front of the learner is that conversation, so Create makes from the
  // thread (`makeDeliverable(kind, { cardId })`, which has always existed). Same six buttons, same
  // makers, one honest difference, stated in the line under the heading rather than left to guess.
  /**
   * 🔴 THE ONE LINE THAT SAYS WHAT A PRESS WILL READ FROM. Inside a chat a maker works on that
   * conversation; on the board it works on what is ticked, and nothing ticked means everything
   * (lib/board/board-scope.ts). Ticks apply to every chat since 2026-09-07, so this no longer has
   * a third case for a frame.
   */
  const scope = entered
    ? `From this chat: ${entered.title}`
    : ticked.length > 0 && !allTicked
      ? `From ${ticked.length} ticked source${ticked.length === 1 ? "" : "s"}`
      : "From everything on the canvas";

  /**
   * Open a made thing from the panel.
   *
   * 🔴🔴 IT USED TO FLY THE CAMERA TO ITS CARD, AND THAT STOPPED WORKING TWICE OVER. Owner,
   * 2026-09-07: *"it seems like I can't open the actual document for the flashcards within the
   * panel by clicking on it"*. `fitView` needs a node on screen to fly to, and that day a chat's
   * made things were first HIDDEN behind its card and then taken off the board altogether, so there
   * was nothing to aim at. From inside a full-size chat there is not even a board to aim at.
   *
   * 🔴 EVERY KIND OPENS IN THE PANEL NOW, WITH NO EXCEPTION LEFT. A check was the last one out: it
   * carries a `run` answered in its own card rather than a `CanvasOutput` the reading panel draws,
   * so it stayed on the canvas under the owner's 2026-09-04 ruling (*"tests should show results in
   * their own card node"*) until he reversed it below.
   */
  const show = (output: BoardOutputCard) => {
    // 🔴 A MIND MAP OPENS IN THE PANEL, WHICH IS THE OWNER'S OWN PLACE FOR IT (2026-09-07: *"I would
    // reserve the mind maps for the sidebar"*) AND NOTEBOOKLM'S (§12: theirs opens in the Studio
    // panel, root left, children unfolding right).
    if (output.kind === "mindmap") {
      if (output.mindmap) dock.openMindmap(output.mindmap, output.output?.title || output.topic || "Mind map");
      return;
    }
    /**
     * 🔴🔴 A TEST OPENS HERE TOO NOW, AND THAT REVERSES 2026-09-04. It used to be answered in its own
     * card on the board (*"tests should show results in their own card node"*); owner, 2026-09-07:
     * *"why are tests supposed to be on Canvas? They're supposed to be in the sidebar, like anything
     * any deliverable is supposed to show up in the sidebar."* board-page.tsx mounts one panel per
     * test so the answers survive it being closed.
     */
    if (output.kind === "check") {
      dock.openCheck(output.output?.title || output.topic || "Test", output.id);
      return;
    }
    /**
     * 🔴🔴 FLASHCARDS OPEN THEIR REAL DECK, NOT A DOCUMENT OF THEM. Owner, 2026-09-07: *"the
     * flashcards came back empty ... it seems like I can't open the actual document for the
     * flashcards, like within the panel by clicking on it"*. The second half of that report
     * outlived my first fix, and this is it: a flashcards output carries a `deckId` and NOTHING
     * ELSE — no markdown, no blocks — because the cards live in `study_cards`. Sending it to the
     * reading panel therefore opened a reader over an output with nothing to read, which is a panel
     * that is literally empty. The learn lane has always routed this to the deck
     * (`learning-canvas.tsx`, `canvas-controls.tsx`); the board never learned to.
     *
     * 🔴 AND THE DECK IS THE PLAIN ANKI CARD, which is his standing ruling (2026-09-07: *"it's
     * supposed to retain the Anki like style where it's just like plain flashcard like with just
     * the X and the check"*). `DeckReview` in a panel already passes `simple` and `REVIEW_DEFAULTS`
     * (`flipAnimation: false`), so the style follows from opening the right thing.
     */
    const deckId = output.output?.kind === "flashcards" ? output.output.deckId : undefined;
    if (deckId) {
      dock.openDeck(deckId, output.output?.title || output.topic || "Flashcards");
      return;
    }
    openOutput(output.id);
  };

  return (
    <>
      {/* 🔴 THE TOOLBAR IS STITCH'S: a pill on the right edge, centred, between the undo pill above
          and the zoom cluster below, both exactly where the live board has them (board-surface.tsx). */}
      {/* 🔴 THE TOP-RIGHT CLUSTER: back, forward, then the two panels. Owner, 2026-09-07: *"could you
          move the create and source buttons to the top right next to the forward and back arrows?"*.
          It was a vertical pill centred down the right edge (Stitch's) until then. The zoom cluster
          stays bottom-right, where the live board has always had it. */}
      <div
        aria-label="Canvas controls"
        aria-orientation="horizontal"
        className="absolute right-[16px] top-[16px] z-40 flex items-center gap-[4px] rounded-full border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated)/95 p-[7px] shadow-sm backdrop-blur-xl"
        data-board-toolbar=""
        role="toolbar"
      >
        {/* 🔴🔴 NO UNDO OR REDO INSIDE A CHAT. Owner, 2026-09-07: *"chats shouldnt have the forward
            and back buttons, should only have sources and create buttons"*. They belong to the
            BOARD: undo puts back a deleted card, a moved frame, a document that was removed. Inside
            a conversation there is nothing on screen either of them acts on, so pressing one
            appeared to do nothing while silently rearranging the canvas behind the layer. */}
        {!entered && (
          <>
            <UndoRedoButtons />
            <span aria-hidden className="mx-[3px] h-[20px] w-px shrink-0 bg-(--ui-stroke-secondary)" />
          </>
        )}
        <ToolButton active={shown === "sources"} dot={sources.length > 0} id="sources" onPress={() => toggle("sources")} />
        {/* 🔴🔴 CREATE IS NOT ON THE CANVAS. Owner, 2026-09-07: *"hide the 'create' button in the
            canvas, create should happen within chats"*, and *"when you go inside that chat you have
            the create button showing up"*. So making is something you do to a conversation, in the
            place where that conversation is in front of you, and the board is only for arranging.
            The board-level maker it replaces was not lost: the composer still reads "make me
            flashcards on chapter 3" (board-provider.tsx `readBoardMakeAsk`), and every card carries
            its own two maker icons. */}
        {/* 🔴 CREATE IS A CHAT'S CONTROL, AND A CHAT'S STACK IS THE OTHER WAY IN. Owner, 2026-09-07:
            *"hide the 'create' button in the canvas, create should happen within chats"*. Pressing
            the sheets under a card asks for that chat's made things, so the button has to be there
            to close what the press opened; without this it opened a panel with no control. */}
        {(entered || madeForCardId) && <ToolButton active={shown === "create"} dot={made.length > 0} id="create" onPress={() => toggle("create")} />}
      </div>

      {panel === "sources" && (
        <PanelFrame id="sources" leaving={leaving} onClose={close}>
          <div className="scrollbar-dt min-h-0 flex-1 overflow-y-auto px-[8px] pb-[12px]">
            {/* Stitch's panel opens with its actions as rows ("+ Create new"); ours are add and Select all. */}
            {/* 🔴 THEIR PILL, NOT A ROW. Measured (§9): 327 x 32, radius 96, a 1px hairline, no
                fill, `+` then the label at 14px/20 weight 500, centred. Ours was a left-aligned
                40px row that read as the first item of the list rather than as the way to add to
                it. The distinction matters most on an empty canvas, where it is the only thing
                in the panel. */}
            <button
              aria-label="Add sources"
              className="mx-[8px] mb-[8px] flex h-[32px] items-center justify-center gap-[8px] rounded-full border border-(--ui-stroke-primary) px-[12px] text-[14px] font-medium leading-[20px] text-foreground transition-colors hover:bg-(--ui-control-hover-background)"
              onClick={() => picker.current?.click()}
              style={{ width: "calc(100% - 16px)" }}
              type="button"
            >
              <Plus aria-hidden className="size-[16px] shrink-0" />
              Add sources
            </button>
            <input
              accept={LANDING_ACCEPT}
              className="hidden"
              multiple
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (files.length) void addSourceFiles(files);
              }}
              ref={picker}
              type="file"
            />
            {ready.length > 0 && (
              <label className="flex h-[40px] cursor-pointer items-center gap-[10px] rounded-[8px] px-[8px] text-[14px] leading-[20px] text-foreground transition-colors hover:bg-(--ui-control-hover-background)">
                <Tick checked={allTicked} label="Select all sources" onChange={() => setSourceSelection(allTicked ? [] : ready.map((source) => source.id))} />
                Select all
              </label>
            )}
            {listed.length > 0 && <div aria-hidden className="mx-[8px] my-[6px] h-px bg-(--ui-stroke-secondary)" />}
            <ul className="m-0 list-none">
              {listed.length === 0 && (
                <li className="px-[8px] py-[6px] text-[12px] leading-[16px] text-(--ui-text-quaternary)">
                  {entered ? "This chat has no sources yet. Drop a file to add one." : "Drop a file on the canvas, or add one above."}
                </li>
              )}
              {listed.map((source) => (
                <SourceRow
                  key={source.id}
                  /* 🔴🔴 INSIDE A CHAT THE ROW OPENS THE DOCUMENT BESIDE THE CONVERSATION. Owner,
                     2026-09-07: *"chats in fullscreen view can open a right sidepanel to view
                     sources"*. On the BOARD a document is drawn inside its own card and there is
                     nothing for a panel to add (board-panel.tsx records that ruling at length) —
                     but a full-size chat covers the board, so from in here the card is exactly what
                     the learner cannot reach. Same dock, same tabs as the things this chat made. */
                  /* 🔴🔴 THE PANEL IS THE ONLY WAY INTO A DOCUMENT NOW, ON THE BOARD AS WELL AS
                     INSIDE A CHAT. Owner, 2026-09-07: *"adding documents still loads them on canvas,
                     please remove that"*. A source used to draw its own card with the real document
                     rendered inside it, and this row flew the camera to it; with no card there is
                     nothing to fly to, so the row opens the reader. */
                  onOpen={() => {
                    const grounded = groundedSourceFor(sources, source.id);
                    if (grounded) dock.openDocument(grounded);
                  }}
                  onTick={() => toggleSourceSelection(source.id)}
                  source={source}
                  ticked={selectedSourceIds.includes(source.id)}
                />
              ))}
            </ul>
          </div>
        </PanelFrame>
      )}

      {panel === "create" && asking && (
        <PanelFrame id="create" leaving={leaving} onBack={() => setAsking(null)} onClose={close} title={asking.label}>
          <MakeForm
            onMake={(instruction) => {
              makeDeliverable(asking.kind, entered ? { cardId: entered.id, topic: instruction } : { cardId: null, sourceIds: selectedSourceIds, topic: instruction });
              setAsking(null);
            }}
            scope={scope}
            tile={asking}
          />
        </PanelFrame>
      )}

      {panel === "create" && !asking && (
        <PanelFrame id="create" leaving={leaving} onClose={close}>
          <div className="scrollbar-dt min-h-0 flex-1 overflow-y-auto pb-[12px]">
            {/* One line, so nobody has to guess what a press will read from. */}
            <p className="px-[16px] pb-[8px] text-[length:var(--canvas-text-meta)] leading-[16px] text-(--ui-text-quaternary)" data-create-scope="">
              {scope}
            </p>
            <div className="grid grid-cols-2 gap-[8px] px-[16px] pb-[8px]">
              {STUDIO_TILES.map((tile) => {
                const mark = markOf(tile.kind);
                return (
                  <IconTooltip key={tile.kind} label={material ? tile.hint : "Add a source or ask something first"}>
                    {/* 🔴🔴 EACH TILE WEARS ITS OWN KIND'S COLOUR, which is the whole of what the
                        reference's grid does that ours did not. Measured in his notebook (§9):
                        161 x 56, radius 12, padding `8px 8px 8px 12px`, icon top-left, label
                        bottom-left at 12px/16 weight 500, chevron right — every one of which ours
                        already matched. What was different is that ours were six identical grey
                        bricks. Theirs are six colours, and at a glance you find Flashcards by its
                        red rather than by reading four labels.

                        🔴 THE LABEL TAKES THE KIND'S COLOUR TOO, as theirs does — a dark blue word
                        on a pale blue ground, not black on a tint. */}
                    <button
                      aria-label={`Make ${tile.label.toLowerCase()}`}
                      className="flex h-[56px] flex-col justify-between rounded-[12px] py-[8px] pl-[12px] pr-[8px] text-left transition-opacity hover:opacity-80 disabled:cursor-default disabled:opacity-40 disabled:hover:opacity-40"
                      data-studio-tile={tile.kind}
                      disabled={!material}
                      onClick={() => setAsking(tile)}
                      style={{ backgroundColor: tileTint(mark.tint) }}
                      type="button"
                    >
                      <span className="flex w-full items-center justify-between">
                        <Codicon aria-hidden name={mark.icon} size="16px" style={{ color: `var(${mark.tint})` }} />
                        <ChevronRight aria-hidden className="size-[14px]" style={{ color: `var(${mark.tint})`, opacity: 0.7 }} />
                      </span>
                      <span className="truncate text-[12px] font-medium leading-[16px]" style={{ color: `var(${mark.tint})` }}>
                        {tile.label}
                      </span>
                    </button>
                  </IconTooltip>
                );
              })}
            </div>
            {made.length > 0 && (
              <>
                <h3 className="flex h-[32px] items-center px-[16px] text-[12px] font-medium uppercase tracking-[0.04em] text-(--ui-text-tertiary)">Made here</h3>
                <ul className="m-0 list-none px-[8px]">
                  {/* 🔴 THE COUNT IS ASKED OF THE BOARD, NOT STORED ON THE ROW. A deliverable
                      carries the chat or the document it came from, never a list of sources, and
                      what a chat reads is whatever is ticked right now — so a number written down
                      when it was made could already be wrong. One document is one source; anything
                      else is however many are in play. */}
                  {made.map((output) => (
                    <MadeRow
                      key={output.id}
                      onOpen={() => show(output)}
                      output={output}
                      sources={output.sourceId ? 1 : ticked.length || ready.length}
                    />
                  ))}
                </ul>
              </>
            )}
          </div>
        </PanelFrame>
      )}
    </>
  );
}
