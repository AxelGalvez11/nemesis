"use client";

// ChatHeader — session title pill in the titlebar band (shell spec §B1).
// Chevron opens a rename/pin/delete menu (store API: rename/togglePin/remove;
// no "archive" — the store has no archive verb, so it is omitted here, see
// the C1 builder report). Rename reuses the same window.prompt v1 pattern as
// the sidebar session row (components/workspace/shell/session-row.tsx).

import { useState } from "react";
import { IconLayoutSidebarRightExpand } from "@tabler/icons-react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { sessionsStore, type WorkspaceSession } from "@/lib/workspace/sessions-store";
import { cn } from "@/lib/utils";

const TITLEBAR_HEADER_BASE_CLASS =
  "workspace-page-header pointer-events-none relative z-3 flex h-11 w-full min-w-0 shrink-0 items-center justify-start gap-3 overflow-hidden border-b border-(--ui-stroke-tertiary) bg-(--ui-chat-surface-background) px-[max(0.75rem,var(--titlebar-content-inset,0rem))] pr-[calc(var(--titlebar-tools-right,0.75rem)+var(--titlebar-tools-width,0px)+0.75rem)]";
const TITLEBAR_HEADER_TITLE_CLASS = "min-w-0 flex-1 overflow-hidden";
const TITLEBAR_HEADER_SHADOW_CLASS =
  "after:pointer-events-none after:absolute after:left-0 after:right-0 after:top-full after:h-5 after:bg-linear-to-b after:from-(--ui-chat-surface-background) after:via-[color-mix(in_srgb,var(--ui-chat-surface-background)_70%,transparent)] after:to-transparent after:backdrop-blur-[2px] after:[mask-image:linear-gradient(to_bottom,black,transparent)] after:content-['']";

export function ChatHeader({ session, onOpenRail, railOpen }: { session: WorkspaceSession | null; onOpenRail: () => void; railOpen: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const title = session?.title || "New session";

  const handleRename = () => {
    const next = window.prompt("Rename session", title);
    if (session && next && next.trim().length > 0) sessionsStore.rename(session.id, next.trim());
  };

  return (
    <header className={cn(TITLEBAR_HEADER_BASE_CLASS, TITLEBAR_HEADER_SHADOW_CLASS)}>
      {session && <div
        className={TITLEBAR_HEADER_TITLE_CLASS}
        style={{
          maxWidth:
            "calc(100vw - var(--titlebar-content-inset,0px) - var(--titlebar-tools-right) - var(--titlebar-tools-width) - 1.5rem)",
        }}
      >
        <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              className="pointer-events-auto flex h-6 min-w-0 max-w-full gap-1 overflow-hidden border border-transparent bg-transparent px-2 py-0 text-(--ui-text-secondary) hover:border-(--ui-stroke-tertiary) hover:bg-(--ui-control-hover-background) hover:text-foreground data-[state=open]:border-(--ui-stroke-tertiary) data-[state=open]:bg-(--ui-control-active-background)"
              variant="ghost"
            >
              <h2 className="min-w-0 flex-1 truncate text-[0.75rem] font-medium leading-none">{title}</h2>
              <Codicon className="shrink-0 text-(--ui-text-tertiary)" name="chevron-down" size="0.8125rem" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={8}>
            <DropdownMenuItem onSelect={() => sessionsStore.togglePin(session.id)}>
              <Codicon name={session.pinned ? "pinned" : "pin"} size="0.875rem" />
              {session.pinned ? "Unpin" : "Pin"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleRename}>
              <Codicon name="edit" size="0.875rem" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => {
              if (window.confirm(`Are you sure you want to delete “${title}”? This can't be undone.`)) sessionsStore.remove(session.id);
            }} variant="destructive">
              <Codicon name="trash" size="0.875rem" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>}
      {!railOpen && (
        <Button aria-label="Open session sidebar" className="pointer-events-auto ml-auto shrink-0" onClick={onOpenRail} size="icon-xs" variant="ghost">
          <IconLayoutSidebarRightExpand />
        </Button>
      )}
    </header>
  );
}
