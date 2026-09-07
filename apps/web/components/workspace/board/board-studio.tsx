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
import { ArrowLeft, Check, ChevronRight, CircleAlert, FilePlus2, Files, FolderPlus, LoaderCircle, Redo2, Sparkles, Undo2, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { OUTPUT_KIND_MARKS } from "@/components/workspace/learn/artifact-card";
import { useDocumentDock } from "@/components/workspace/learn/document-dock";
import { KIND_LABELS, MAKING_LABELS, type BoardMakeKind } from "@/lib/board/board-deliverables";
import { groundedSourceFor } from "@/lib/board/board-grounding";
import type { BoardOutputCard, BoardSource } from "@/lib/board/board-model";
import { groupHoldingExactly } from "@/lib/board/board-scope";
import { STUDIO_LENGTHS, STUDIO_LEVELS, STUDIO_TILES, boardHasMaterial, studioInstruction, type StudioLength, type StudioLevel, type StudioTile } from "@/lib/board/board-studio";
import { cn } from "@/lib/utils";

import { IconTooltip, isEditableTarget } from "./board-chrome";
import { LANDING_ACCEPT } from "./board-landing";
import { useBoard } from "./board-provider";

/** The panel's width: 320, so two of NotebookLM's tiles sit across it with the grid's 8px between. */
export const STUDIO_WIDTH = 320;

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
  const mark = OUTPUT_KIND_MARKS[kind];
  return mark ? { icon: mark.icon, tint: mark.tint } : { icon: "file", tint: "--ui-kind-blue" };
}

function sourceIcon(source: BoardSource): string {
  if (source.type === "pdf") return "file-pdf";
  if (source.type === "image") return "file-media";
  return "file";
}

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
function SourceRow({ source, ticked, onOpen, onTick }: { source: BoardSource; ticked: boolean; onOpen?: () => void; onTick?: () => void }) {
  const processing = source.status === "processing";
  const failed = source.status === "error";
  const openable = Boolean(onOpen) && !processing && !failed;
  return (
    <li>
      <label
        {...(openable ? { onClick: onOpen, role: "button", tabIndex: 0, onKeyDown: (event: ReactKeyboardEvent<HTMLLabelElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen?.(); } } } : {})}
        className={cn("flex h-[40px] items-center gap-[10px] rounded-[8px] px-[8px] transition-colors hover:bg-(--ui-control-hover-background)", (onTick && !processing) || openable ? "cursor-pointer" : "cursor-default")}
        title={failed ? source.error || "This file could not be read." : source.name}
      >
        {onTick && <Tick checked={ticked && !processing && !failed} disabled={processing || failed} label={`Use ${source.name}`} onChange={onTick} />}
        {processing ? (
          <LoaderCircle aria-hidden className="size-[16px] shrink-0 animate-spin text-(--ui-text-tertiary)" />
        ) : failed ? (
          <CircleAlert aria-hidden className="size-[16px] shrink-0 text-(--board-error)" />
        ) : (
          <Codicon aria-hidden className="shrink-0 text-(--ui-action)" name={sourceIcon(source)} size="16px" />
        )}
        <span className={cn("min-w-0 flex-1 truncate text-[14px] leading-[20px]", failed ? "text-(--ui-text-tertiary)" : "text-foreground")}>{source.name}</span>
        {processing && <span className="shrink-0 text-[12px] text-(--ui-text-tertiary)">Reading…</span>}
      </label>
    </li>
  );
}

function MadeRow({ output, onOpen }: { output: BoardOutputCard; onOpen: () => void }) {
  const mark = markOf(output.kind);
  const title = output.output?.title || output.topic || KIND_LABELS[output.kind];
  return (
    <li>
      <button
        className="flex h-[40px] w-full items-center gap-[10px] rounded-[8px] px-[8px] text-left transition-colors hover:bg-(--ui-control-hover-background)"
        onClick={onOpen}
        title={`Show ${title} on the canvas`}
        type="button"
      >
        {output.status === "making" ? (
          <LoaderCircle aria-hidden className="size-[16px] shrink-0 animate-spin text-(--ui-text-tertiary)" />
        ) : output.status === "error" ? (
          <CircleAlert aria-hidden className="size-[16px] shrink-0 text-(--board-error)" />
        ) : (
          <Codicon aria-hidden className="shrink-0" name={mark.icon} size="16px" style={{ color: `var(${mark.tint})` }} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] leading-[20px] text-foreground">{output.status === "making" ? `${MAKING_LABELS[output.kind]}…` : title}</span>
          <span className="block truncate text-[12px] leading-[16px] text-(--ui-text-tertiary)">{output.status === "error" ? output.error || "Could not be made" : KIND_LABELS[output.kind]}</span>
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
  const { cards, sources, outputs, selectedSourceIds, toggleSourceSelection, setSourceSelection, addSourceFiles, makeDeliverable, enteredCardId, scopeFor, groupTickedSources, groups, nodeRects } = useBoard();
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
   * 🔴🔴 INSIDE A CHAT THE PANEL IS THAT CHAT'S SOURCES, AND IT HAS NO TICKS. Owner, 2026-09-07:
   * *"entering a chat makes it fullscreen size, and the sources panel then shows only the sources
   * attached to the chat"*. What a chat reads is decided by the frame it stands in, so a tick here
   * would be a control that changes nothing — worse than absent. A source still being read is kept
   * on the list wherever it is, because that is the parse the owner asked to be able to watch.
   */
  const listed = entered ? sources.filter((source) => scopeFor(entered.id).sourceIds.includes(source.id) || source.status !== "ready") : sources;
  const ticked = ready.filter((source) => selectedSourceIds.includes(source.id));
  const allTicked = ready.length > 0 && ready.every((source) => selectedSourceIds.includes(source.id));
  /** Some but not all: the one case that needs a frame drawn round it. */
  const groupable = ticked.length >= 2 && ticked.length < ready.length && !groupHoldingExactly(ticked.map((source) => source.id), { groups, rects: nodeRects(), sourceIds: ready.map((source) => source.id) });
  const material = boardHasMaterial(cards, sources);
  const made = [...outputs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // 🔴🔴 THE BUTTONS FOLLOW YOU IN, AND THE SCOPE IS WHAT CHANGES. Owner, 2026-09-06, asking whether
  // artifacts live in the canvas only or in the chat's sidebar too. On the board, Create makes from
  // the TICKED SOURCES, which is what the ticks are for and NotebookLM's own model. Standing inside
  // a thread, the material in front of the learner is that conversation, so Create makes from the
  // thread (`makeDeliverable(kind, { cardId })`, which has always existed). Same six buttons, same
  // makers, one honest difference, stated in the line under the heading rather than left to guess.
  const scope = entered ? `From this chat: ${entered.title}` : ticked.length > 0 ? `From ${ticked.length} ticked source${ticked.length === 1 ? "" : "s"}` : "From everything on the canvas";

  const show = (id: string) => void fitView({ nodes: [{ id }], duration: 320, padding: 0.1, maxZoom: 1 });

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
        <UndoRedoButtons />
        <span aria-hidden className="mx-[3px] h-[20px] w-px shrink-0 bg-(--ui-stroke-secondary)" />
        <ToolButton active={shown === "sources"} dot={sources.length > 0} id="sources" onPress={() => toggle("sources")} />
        {/* 🔴🔴 CREATE IS NOT ON THE CANVAS. Owner, 2026-09-07: *"hide the 'create' button in the
            canvas, create should happen within chats"*, and *"when you go inside that chat you have
            the create button showing up"*. So making is something you do to a conversation, in the
            place where that conversation is in front of you, and the board is only for arranging.
            The board-level maker it replaces was not lost: the composer still reads "make me
            flashcards on chapter 3" (board-provider.tsx `readBoardMakeAsk`), and every card carries
            its own two maker icons. */}
        {entered && <ToolButton active={shown === "create"} dot={made.length > 0} id="create" onPress={() => toggle("create")} />}
      </div>

      {panel === "sources" && (
        <PanelFrame id="sources" leaving={leaving} onClose={close}>
          <div className="scrollbar-dt min-h-0 flex-1 overflow-y-auto px-[8px] pb-[12px]">
            {/* Stitch's panel opens with its actions as rows ("+ Create new"); ours are add and Select all. */}
            <button
              aria-label="Add sources"
              className="flex h-[40px] w-full items-center gap-[10px] rounded-[8px] px-[8px] text-left text-[14px] leading-[20px] text-foreground transition-colors hover:bg-(--ui-control-hover-background)"
              onClick={() => picker.current?.click()}
              type="button"
            >
              <FilePlus2 aria-hidden className="size-[16px] shrink-0 text-(--ui-text-secondary)" />
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
            {!entered && ready.length > 0 && (
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
                  onOpen={
                    entered
                      ? () => {
                          const grounded = groundedSourceFor(sources, source.id);
                          if (grounded) dock.openDocument(grounded);
                        }
                      : undefined
                  }
                  onTick={entered ? undefined : () => toggleSourceSelection(source.id)}
                  source={source}
                  ticked={entered ? true : selectedSourceIds.includes(source.id)}
                />
              ))}
            </ul>
            {/* 🔴🔴 THE TICKS BECOME A GROUP, WHICH IS THE ONLY WAY THEY MEAN ANYTHING NOW. Owner,
                2026-09-07: *"user can select what sources chats receive by selecting them in the
                source panel and that should becomes its own group automatically and user can name
                the group"*. A frame is what a chat reads (board-scope.ts), so ticking without
                framing would be a setting that changed no answer. Sending from the composer draws
                the frame too (board-provider.tsx `startCard`); this is the door for a learner who
                wants the group before the question. Everything ticked is the global case and needs
                no frame, so the row is not offered. */}
            {!entered && groupable && (
              <button
                className="mt-[4px] flex h-[36px] w-full items-center gap-[10px] rounded-[8px] bg-(--ui-bg-secondary) px-[8px] text-left text-[13px] font-medium leading-[18px] text-foreground transition-colors hover:bg-(--ui-control-hover-background)"
                data-studio-group-ticked=""
                onClick={() => {
                  const id = groupTickedSources();
                  if (id) window.setTimeout(() => void fitView({ nodes: [{ id }], duration: 320, padding: 0.2, maxZoom: 1 }), 0);
                }}
                type="button"
              >
                <FolderPlus aria-hidden className="size-[16px] shrink-0 text-(--ui-text-secondary)" />
                Group these {ticked.length} sources
              </button>
            )}
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
                    <button
                      aria-label={`Make ${tile.label.toLowerCase()}`}
                      className="flex h-[56px] flex-col justify-between rounded-[12px] bg-(--ui-bg-secondary) p-[10px] text-left transition-colors hover:bg-(--ui-control-hover-background) disabled:cursor-default disabled:opacity-40 disabled:hover:bg-(--ui-bg-secondary)"
                      data-studio-tile={tile.kind}
                      disabled={!material}
                      onClick={() => setAsking(tile)}
                      type="button"
                    >
                      <span className="flex w-full items-center justify-between">
                        <Codicon aria-hidden name={mark.icon} size="16px" style={{ color: `var(${mark.tint})` }} />
                        <ChevronRight aria-hidden className="size-[14px] text-(--ui-text-quaternary)" />
                      </span>
                      <span className="truncate text-[12px] font-medium leading-[16px] text-foreground">{tile.label}</span>
                    </button>
                  </IconTooltip>
                );
              })}
            </div>
            {made.length > 0 && (
              <>
                <h3 className="flex h-[32px] items-center px-[16px] text-[12px] font-medium uppercase tracking-[0.04em] text-(--ui-text-tertiary)">Made here</h3>
                <ul className="m-0 list-none px-[8px]">
                  {made.map((output) => (
                    <MadeRow key={output.id} onOpen={() => show(output.id)} output={output} />
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
