"use client";

// The `+` beside a card's follow-up box: the seven things a thread can be turned into, as a Radix
// dropdown in the board's own menu dress (`board-menu-pop`, the elevated ground, 14px rows).
// Choosing one asks the provider for a deliverable card; typing the same thing in words does too.

import { Plus } from "lucide-react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/desktop-ui/dropdown-menu";
import { DELIVERABLE_MENU, type DeliverableKind } from "@/lib/board/board-deliverables";

import { IconTooltip } from "./board-chrome";

export const MAKE_MENU_LABEL = "Make something from this thread";

export function DeliverableMenu({ disabled = false, onPick }: { disabled?: boolean; onPick: (kind: DeliverableKind) => void }) {
  return (
    <DropdownMenu modal={false}>
      <IconTooltip label={MAKE_MENU_LABEL}>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={MAKE_MENU_LABEL}
            className="nodrag nopan flex size-[48px] shrink-0 items-center justify-center rounded-[8px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            disabled={disabled}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            <Plus className="size-[16px]" />
          </button>
        </DropdownMenuTrigger>
      </IconTooltip>
      <DropdownMenuContent
        align="start"
        aria-label={MAKE_MENU_LABEL}
        className="board-menu-pop w-[208px] rounded-[12px] border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) p-[6px] shadow-xl"
        onPointerDown={(event) => event.stopPropagation()}
        side="top"
        sideOffset={8}
      >
        {DELIVERABLE_MENU.map(({ kind, label }) => (
          <DropdownMenuItem
            className="rounded-[8px] px-[10px] py-[7px] text-[14px] leading-[20px] text-foreground"
            key={kind}
            onSelect={() => onPick(kind)}
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
