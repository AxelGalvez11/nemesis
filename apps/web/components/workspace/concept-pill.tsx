"use client";

// A key term as a pill: press it for a one-line meaning and a "Dive deeper".
//
// Copied from the board's card (docs/wondering-canvas-reference.md §4) and shared with the chat
// (owner 2026-09-03: "extrapolate that to the regular chat but remove the wondering icon"). The
// sparkle the reference draws in the pill and on the button is gone on both surfaces.
//
// 🔴 WHAT "DIVE DEEPER" DOES IS THE SURFACE'S, NOT THE PILL'S. The board opens a branch card
// beside the term; the chat asks a follow-up in the same thread. The pill reads the handler from
// `ConceptPillContext`, and with no provider it is a definition only: the button does not draw,
// because a control that calls nothing is this codebase's most repeated defect.

import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/desktop-ui/popover";
import { cn } from "@/lib/utils";

export interface ConceptPillActions {
  /** Ask more about this term. Given the pill's element so a board can place a branch beside it. */
  onDiveDeeper?: (term: string, element: HTMLElement) => void;
  /** Whether this term has already been dived into (the board turns such a pill purple). */
  isBranched?: (term: string, element: HTMLElement) => boolean;
}

export const ConceptPillContext = createContext<ConceptPillActions>({});

function nodeText(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(nodeText).join("");
  if (children && typeof children === "object" && "props" in children) {
    return nodeText((children as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

export function ConceptPill({ meaning, children }: { meaning: string; children: ReactNode }) {
  const { onDiveDeeper, isBranched } = useContext(ConceptPillContext);
  const anchor = useRef<HTMLSpanElement | null>(null);
  const action = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [branched, setBranched] = useState(false);
  const term = nodeText(children).trim();
  useLayoutEffect(() => {
    const element = anchor.current;
    setBranched(element && isBranched ? isBranched(term, element) : false);
  }, [isBranched, term]);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-label={`Key term: ${term}`}
          className={cn(
            // `nodrag nopan` matter only on the board, where a press must not start a drag.
            "nodrag nopan inline-flex max-w-full items-center rounded-[6px] border px-[6px] align-baseline text-[0.92em] font-medium leading-snug text-foreground transition-colors",
            branched
              ? "border-(--board-branch-highlight) bg-(--board-branch-highlight)"
              : "border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) hover:border-(--ui-stroke-primary) hover:bg-(--ui-control-hover-background)",
          )}
          data-concept-pill=""
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          <span className="truncate" ref={anchor}>
            {children}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={`About ${term}`}
        className="board-menu-pop w-[288px] rounded-[12px] border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) p-[12px] shadow-xl [--popover-surface:var(--ui-bg-elevated)]"
        collisionPadding={8}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          action.current?.focus();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        side="top"
        sideOffset={8}
      >
        <p className="text-[14px] font-semibold leading-[20px] text-foreground">{term}</p>
        {meaning && <p className="mt-[4px] text-[14px] leading-[1.625] text-(--ui-text-secondary)">{meaning}</p>}
        {onDiveDeeper && (
          <button
            className="mt-[10px] inline-flex items-center rounded-[8px] bg-(--ui-action) px-[10px] py-[6px] text-[12px] font-semibold text-(--ui-action-glyph) transition-opacity hover:opacity-90"
            onClick={() => {
              const element = anchor.current;
              setOpen(false);
              if (element) onDiveDeeper(term, element);
            }}
            ref={action}
            type="button"
          >
            Dive deeper
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
