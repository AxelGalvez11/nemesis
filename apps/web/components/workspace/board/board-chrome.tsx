"use client";

// Small parts every board node shares: the tooltip, the growing textarea, the three dots, the
// invisible React Flow handles, the resize rails. Geometry from docs/wondering-canvas-reference.md
// §4; pixels written as pixels because this app's root font is 18px, not 16.

import { Handle, NodeResizeControl, Position, ResizeControlVariant } from "@xyflow/react";
import { Plus } from "lucide-react";
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, type ReactNode, type TextareaHTMLAttributes } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/desktop-ui/tooltip";
import { CARD_MAX_HEIGHT, CARD_MAX_WIDTH, CARD_MIN_HEIGHT, CARD_MIN_WIDTH, type BranchSide } from "@/lib/board/board-layout";
import { cn } from "@/lib/utils";

/**
 * One icon control on a card: the same size, the same hover, the same two React Flow opt-outs.
 *
 * 🔴 `nodrag nopan` AND A STOPPED `pointerdown` OR THE CLICK NEVER LANDS. React Flow reads a press
 * on a node as the start of a drag, so every control inside one has to say it is not part of the
 * card. Every icon on this board went through the same three lines before this existed.
 */
export function CardIcon({
  label,
  onClick,
  children,
  tone = "quiet",
  count,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  tone?: "quiet" | "danger";
  count?: number;
}) {
  return (
    <IconTooltip label={label}>
      <button
        aria-label={label}
        className={cn(
          "nodrag nopan flex shrink-0 cursor-pointer items-center gap-[4px] rounded-[6px] p-[4px] transition-colors",
          tone === "danger"
            ? "text-(--board-error) hover:bg-(--board-error-bg)"
            : "text-(--ui-text-tertiary) hover:bg-(--ui-control-hover-background) hover:text-(--ui-text-secondary)",
        )}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        type="button"
      >
        {children}
        {count !== undefined && count > 0 && <span className="text-[12px] font-medium">{count}</span>}
      </button>
    </IconTooltip>
  );
}

/** Instant, dark, small: the reference's own tooltip (bg text-primary, 12px medium, 4/8 padding). */
export function IconTooltip({ label, children, side = "top" }: { label: string; children: ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          className="rounded-[6px] bg-foreground px-[8px] py-[4px] text-[12px] font-medium leading-[16px] text-background shadow-md [font-family:inherit]"
          collisionPadding={8}
          side={side}
          sideOffset={6}
        >
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export const TEXTAREA_MAX_HEIGHT = 128;

/** A textarea that grows with its text up to `maxHeight`, then scrolls. */
export const AutoResizingTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { maxHeight?: number }
>(function AutoResizingTextarea({ maxHeight = TEXTAREA_MAX_HEIGHT, rows = 1, style, value, ...rest }, ref) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const attach = useCallback(
    (node: HTMLTextAreaElement | null) => {
      inner.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );
  const fit = useCallback(() => {
    const node = inner.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, maxHeight)}px`;
    node.style.overflowY = node.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [maxHeight]);
  useLayoutEffect(fit, [fit, value]);
  useEffect(() => {
    const node = inner.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    let width = node.clientWidth;
    const observer = new ResizeObserver(() => {
      if (node.clientWidth !== width) {
        width = node.clientWidth;
        fit();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fit]);
  return <textarea {...rest} ref={attach} rows={rows} style={{ ...style, maxHeight }} value={value} />;
});

export function StreamingDots() {
  return (
    <div className="flex items-center gap-[4px] py-[4px]">
      {[0, 1, 2].map((index) => (
        <span className="size-[6px] animate-pulse rounded-full bg-(--ui-text-tertiary)" key={index} style={{ animationDelay: `${index * 200}ms` }} />
      ))}
    </div>
  );
}

const SIDES: BranchSide[] = ["top", "right", "bottom", "left"];
const POSITIONS: Record<BranchSide, Position> = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left };
const INVISIBLE_HANDLE = "!size-0 !min-h-0 !min-w-0 !border-0 !bg-transparent";

export const sourceHandleId = (side: BranchSide) => `board-source-${side}`;
export const targetHandleId = (side: BranchSide) => `board-target-${side}`;

/** Four source handles (and four target handles) per node, all invisible: edges attach to the
 *  side `connectionSides` picks, and the learner never drags a connection by hand. */
export function NodeHandles({ target = false }: { target?: boolean }) {
  return (
    <>
      {SIDES.map((side) => (
        <Handle className={INVISIBLE_HANDLE} id={sourceHandleId(side)} isConnectable={false} key={`source-${side}`} position={POSITIONS[side]} type="source" />
      ))}
      {target &&
        SIDES.map((side) => (
          <Handle className={INVISIBLE_HANDLE} id={targetHandleId(side)} isConnectable={false} key={`target-${side}`} position={POSITIONS[side]} type="target" />
        ))}
    </>
  );
}

const EDGE_CONTROLS = [
  { position: "left", resizeDirection: "horizontal", className: "!w-[8px]" },
  { position: "right", resizeDirection: "horizontal", className: "!w-[8px]" },
  { position: "top", resizeDirection: "vertical", className: "!h-[8px]" },
  { position: "bottom", resizeDirection: "vertical", className: "!h-[8px]" },
] as const;

const CORNER_CONTROLS = [
  { position: "top-left", cursorClassName: "!cursor-nwse-resize" },
  { position: "top-right", cursorClassName: "!cursor-nesw-resize" },
  { position: "bottom-left", cursorClassName: "!cursor-nesw-resize" },
  { position: "bottom-right", cursorClassName: "!cursor-nwse-resize" },
] as const;

/** Invisible 8px rails on every edge and 24px squares on every corner; limits from the reference. */
export function NodeResizeControls({
  minHeight = CARD_MIN_HEIGHT,
  onVerticalResizeStart,
  onVerticalResizeEnd,
}: {
  minHeight?: number;
  onVerticalResizeStart?: () => void;
  onVerticalResizeEnd?: () => void;
}) {
  const limits = { minWidth: CARD_MIN_WIDTH, maxWidth: CARD_MAX_WIDTH, minHeight, maxHeight: CARD_MAX_HEIGHT };
  return (
    <>
      {EDGE_CONTROLS.map(({ position, resizeDirection, className }) => (
        <NodeResizeControl
          className={cn(className, "!border-transparent")}
          key={position}
          onResizeEnd={resizeDirection === "vertical" ? onVerticalResizeEnd : undefined}
          onResizeStart={resizeDirection === "vertical" ? onVerticalResizeStart : undefined}
          position={position}
          resizeDirection={resizeDirection}
          variant={ResizeControlVariant.Line}
          {...limits}
        />
      ))}
      {CORNER_CONTROLS.map(({ position, cursorClassName }) => (
        <NodeResizeControl
          className={cn("!size-[24px] !border-0 !bg-transparent", cursorClassName)}
          key={position}
          onResizeEnd={onVerticalResizeEnd}
          onResizeStart={onVerticalResizeStart}
          position={position}
          {...limits}
        />
      ))}
    </>
  );
}

export const BRANCH_BUTTONS: ReadonlyArray<{ side: BranchSide; positionClassName: string }> = [
  { side: "top", positionClassName: "bottom-full left-1/2 mb-[4px] -translate-x-1/2" },
  { side: "right", positionClassName: "left-full top-1/2 ml-[4px] -translate-y-1/2" },
  { side: "bottom", positionClassName: "left-1/2 top-full mt-[4px] -translate-x-1/2" },
  { side: "left", positionClassName: "right-full top-1/2 mr-[4px] -translate-y-1/2" },
];

/**
 * The bar above a card: what it is, then the verbs it answers to.
 *
 * 🔴🔴 ABOVE THE CARD, NOT INSIDE IT, AND THE SAME ON EVERY KIND — owner, 2026-09-04: *"make sure
 * all card node designs are consistent and match, use wondering.app/canvas for baseline"*. Their
 * card hangs its title outside the shell (`absolute bottom-full left-1 right-1 mb-1.5`, reference
 * §4) and ours did that for conversations ONLY. A document and a deliverable each grew a header row
 * INSIDE their box, so a board holding all three showed three headers in three places, in three
 * sizes, with the delete in a different spot each time. This is the one bar all three wear.
 *
 * 🔴 THE ICON ORDER IS FIXED BY THE CALLERS PASSING IT IN THE SAME ORDER: make (note, flashcards,
 * test), then collapse, then delete. Destructive last is why delete moved off the middle of the
 * conversation card's row, where it used to sit between collapse and the note count.
 */
export function CardTitleBar({ children, icon, title }: { children?: ReactNode; icon?: ReactNode; title: string }) {
  return (
    <div className="absolute bottom-full left-[4px] right-[4px] mb-[6px] flex items-center gap-[6px]">
      {icon}
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold leading-[20px] text-foreground" title={title}>
        {title}
      </span>
      {children}
    </div>
  );
}

/**
 * The four "start a card here" buttons, on every node a thread can grow out of.
 *
 * 🔴🔴 ALL FOUR, ON HOVER, ON EVERY CARD — owner, 2026-09-04: *"making new chats does not show up
 * in all four sides of each chat only until clicking on them, compare against wondering"*. He is
 * right and the reference agrees: theirs are `opacity-0` revealed by `group-hover/card` alone.
 * Ours also required the card to be SELECTED, and hid three of the four while the board held a
 * single card, so the first thing a learner met was one lonely plus on the right.
 *
 * 🔴🔴 AND ON DOCUMENTS TOO, WHICH IS WHY THIS LEFT THE CONVERSATION CARD — owner, same day:
 * *"documents should have the four 'create card' like chats"*. It replaces the two buttons a
 * document used to carry along its bottom edge ("Ask about this", "Create lesson"), which he cut in
 * the same message: a plus on the side of the document says the same thing without a second grammar
 * for starting a thread.
 */
export function BranchButtons({
  disabled = false,
  emphasiseRight = false,
  onBranch,
  selected = false,
}: {
  disabled?: boolean;
  /** Wondering's rule: the only node on the board keeps its right-hand plus visible, larger. */
  emphasiseRight?: boolean;
  onBranch: (side: BranchSide) => void;
  selected?: boolean;
}) {
  return (
    <>
      {BRANCH_BUTTONS.map(({ side, positionClassName }) => (
        <div
          className={cn(
            "absolute z-10 transition-opacity",
            selected
              ? ""
              : "[@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/card:pointer-events-auto [@media(hover:hover)]:group-focus-within/card:opacity-100 [@media(hover:hover)]:group-hover/card:pointer-events-auto [@media(hover:hover)]:group-hover/card:opacity-100",
            positionClassName,
          )}
          key={side}
        >
          <IconTooltip label={`Create a card from the ${side} side`} side={side}>
            <button
              aria-label={`Create a card from the ${side} side`}
              className="group/branch flex size-[40px] items-center justify-center outline-none disabled:cursor-not-allowed disabled:opacity-40"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                onBranch(side);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              type="button"
            >
              <span
                className={cn(
                  "flex items-center justify-center rounded-full border border-(--ui-action)/60 bg-(--ui-action)/40 text-(--ui-action-glyph) shadow-sm transition-all duration-200 ease-out group-hover/branch:size-[36px] group-hover/branch:border-(--ui-action) group-hover/branch:bg-(--ui-action) group-hover/branch:shadow-md group-focus-visible/branch:size-[36px] group-focus-visible/branch:bg-(--ui-action) group-focus-visible/branch:ring-2 group-focus-visible/branch:ring-(--ui-action) group-focus-visible/branch:ring-offset-2",
                  emphasiseRight && side === "right" ? "size-[32px] shadow-md" : "size-[20px]",
                )}
              >
                <Plus
                  className={cn(
                    "shrink-0 transition-all duration-200 ease-out group-hover/branch:size-[16px] group-focus-visible/branch:size-[16px]",
                    emphasiseRight && side === "right" ? "size-[16px]" : "size-[12px]",
                  )}
                />
              </span>
            </button>
          </IconTooltip>
        </div>
      ))}
    </>
  );
}


/** How much of the board a card may take: the composer's top edge, the board's top, its width. */
export function measureBoardArea(): { top: number; composerTop: number; viewportWidth: number; availableHeight: number } | null {
  const board = document.querySelector("[data-board]");
  if (!board) return null;
  const composer = document.querySelector("[data-board-composer]");
  const rect = board.getBoundingClientRect();
  const composerTop = composer?.getBoundingClientRect().top ?? rect.bottom;
  return {
    top: rect.top,
    composerTop,
    viewportWidth: rect.width,
    availableHeight: Math.max(composerTop - rect.top - (composer ? 24 : 0), 0),
  };
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}
