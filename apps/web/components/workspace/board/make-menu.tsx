"use client";

// The + menu: make a deliverable from this thread, or from the board.
//
// Owner 2026-09-03: deliverables come "in plain words in any card's follow-up box, or from the
// composer's + menu". The kinds and their order are the chat's (lib/board/board-deliverables.ts);
// what is typed becomes the topic, and an empty box means "from what is here".

import { Plus } from "lucide-react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/desktop-ui/dropdown-menu";
import { OUTPUT_KIND_MARKS } from "@/components/workspace/learn/artifact-card";
import { BOARD_DELIVERABLE_MENU, type DeliverableKind } from "@/lib/board/board-deliverables";
import { cn } from "@/lib/utils";

import { IconTooltip } from "./board-chrome";

export function MakeMenu({ onPick, size = 36, className }: { onPick: (kind: DeliverableKind) => void; size?: 36 | 48; className?: string }) {
  return (
    <DropdownMenu>
      <IconTooltip label="Make something from this">
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Make something from this"
            className={cn(
              "nodrag nopan flex shrink-0 items-center justify-center rounded-[8px] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground data-[state=open]:bg-(--ui-control-hover-background) data-[state=open]:text-foreground",
              size === 48 ? "size-[48px]" : "size-[36px]",
              className,
            )}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            <Plus className={size === 48 ? "size-[20px]" : "size-[18px]"} />
          </button>
        </DropdownMenuTrigger>
      </IconTooltip>
      <DropdownMenuContent align="start" className="board-menu-pop w-[260px] rounded-[12px] p-[6px]" data-workspace onPointerDown={(event) => event.stopPropagation()} side="top" sideOffset={8}>
        {BOARD_DELIVERABLE_MENU.map((item) => {
          const mark = OUTPUT_KIND_MARKS[item.kind];
          return (
            <DropdownMenuItem className="flex items-center gap-[10px] rounded-[8px] px-[10px] py-[8px]" key={item.kind} onSelect={() => onPick(item.kind)}>
              <Codicon className="shrink-0" name={mark?.icon ?? "file"} size="18px" style={{ color: `var(${mark?.tint ?? "--ui-kind-blue"})` }} />
              <span className="flex min-w-0 flex-col">
                <span className="text-[14px] font-medium text-foreground">{item.label}</span>
                <span className="text-[12px] text-(--ui-text-tertiary)">{item.detail}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
