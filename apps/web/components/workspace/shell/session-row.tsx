"use client";

// Session row — verbatim transplant of desktop app/chat/sidebar/session-row.tsx
// (student-build web v1: no branch stems, no handoff avatars, no dnd reorder,
// no new-window gesture; kebab menu = Pin/Unpin, Rename, Delete).

import type * as React from "react";
import { useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import type { WorkspaceSession } from "@/lib/workspace/sessions-store";
import { cn } from "@/lib/utils";

import { SidebarRowBody, SidebarRowLabel, SidebarRowLead, SidebarRowShell } from "./sidebar-primitives";

interface SidebarSessionRowProps {
  session: WorkspaceSession;
  isPinned: boolean;
  isSelected: boolean;
  isWorking: boolean;
  onDelete: () => void;
  onPin: () => void;
  onRename: (title: string) => void;
  onResume: () => void;
}

/** "now" / "5m" / "3h" / "2d" — coarse age, hover-revealed. */
function formatAge(updatedAtIso: string): string {
  const elapsedMs = Math.max(0, Date.now() - Date.parse(updatedAtIso));
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function SidebarSessionRow({
  session,
  isPinned,
  isSelected,
  isWorking,
  onDelete,
  onPin,
  onRename,
  onResume,
}: SidebarSessionRowProps) {
  const title = session.title || "New session";
  const age = formatAge(session.updatedAt);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleRename = () => {
    // Simple prompt-based rename for v1 (desktop uses an inline dialog).
    const next = window.prompt("Rename session", title);
    if (next && next.trim().length > 0) onRename(next.trim());
  };

  return (
    <SidebarRowShell
      actions={
        <div className="relative z-2 grid w-[1.375rem] place-items-center">
          {!isWorking && (
            <span className="pointer-events-none absolute right-6 top-1/2 min-w-6 -translate-y-1/2 text-right text-[0.625rem] leading-none text-(--ui-text-tertiary) opacity-0 transition-opacity group-hover:opacity-100">
              {age}
            </span>
          )}
          <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={`Actions for ${title}`}
                className="size-5 rounded-[4px] bg-transparent text-transparent transition-colors duration-100 hover:bg-(--ui-control-active-background) hover:text-foreground focus-visible:bg-(--ui-control-active-background) focus-visible:text-foreground focus-visible:ring-0 data-[state=open]:bg-(--ui-control-active-background) data-[state=open]:text-foreground group-hover:text-(--ui-text-tertiary) [&_svg]:size-3.5!"
                size="icon"
                title="Session actions"
                variant="ghost"
              >
                <Codicon name="kebab-vertical" size="0.875rem" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="bottom">
              <DropdownMenuItem onSelect={onPin}>
                <Codicon name={isPinned ? "pinned" : "pin"} size="0.875rem" />
                {isPinned ? "Unpin" : "Pin"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleRename}>
                <Codicon name="edit" size="0.875rem" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onDelete} variant="destructive">
                <Codicon name="trash" size="0.875rem" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
      className={cn(
        "group row-hover relative",
        isSelected && "bg-(--ui-row-active-background)",
        isWorking && "text-foreground",
      )}
      data-working={isWorking ? "true" : undefined}
    >
      {isWorking && <span aria-hidden="true" className="arc-border" />}
      <SidebarRowBody
        className="z-0 group-hover:pr-12"
        onClick={(event: React.MouseEvent) => {
          if (event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            onPin();

            return;
          }

          onResume();
        }}
      >
        <SidebarRowLead className="overflow-hidden">
          <SidebarRowDot isWorking={isWorking} />
        </SidebarRowLead>
        <SidebarRowLabel className="flex-1 font-normal group-hover:text-foreground group-data-[working=true]:text-foreground/90">
          {title}
        </SidebarRowLabel>
      </SidebarRowBody>
    </SidebarRowShell>
  );
}

function SidebarRowDot({ isWorking, className }: { isWorking: boolean; className?: string }) {
  return (
    <span
      aria-label={isWorking ? "Session running" : undefined}
      className={cn(
        "rounded-full",
        isWorking
          ? "relative size-1.5 bg-(--ui-accent) shadow-[0_0_0.625rem_color-mix(in_srgb,var(--ui-accent)_55%,transparent)] before:absolute before:inset-0 before:animate-ping before:rounded-full before:bg-(--ui-accent) before:opacity-70 before:content-['']"
          : "size-1 bg-(--ui-text-quaternary) opacity-80",
        className,
      )}
      role={isWorking ? "status" : undefined}
    />
  );
}
