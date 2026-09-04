"use client";

// Small parts every board node shares: the tooltip, the growing textarea, the three dots, the
// invisible React Flow handles, the resize rails. Geometry from docs/wondering-canvas-reference.md
// §4; pixels written as pixels because this app's root font is 18px, not 16.

import { Handle, NodeResizeControl, Position, ResizeControlVariant } from "@xyflow/react";
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, type ReactNode, type TextareaHTMLAttributes } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/desktop-ui/tooltip";
import { CARD_MAX_HEIGHT, CARD_MAX_WIDTH, CARD_MIN_HEIGHT, CARD_MIN_WIDTH, type BranchSide } from "@/lib/board/board-layout";
import { cn } from "@/lib/utils";

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
