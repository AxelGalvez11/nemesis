"use client";

// ChatHeader — session title pill in the titlebar band (shell spec §B1).
// Chevron opens a rename/pin/delete menu (store API: rename/togglePin/remove;
// no "archive" — the store has no archive verb, so it is omitted here, see
// the C1 builder report). Rename uses the product's own prompt dialog, the same
// one the sidebar session row uses (components/desktop-ui/prompt-dialog.tsx).

import { useState } from "react";

import { usePrompt } from "@/components/desktop-ui/prompt-dialog";
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
import { useConfirm } from "@/components/desktop-ui/confirm-dialog";

// Borderless band matching the notebooks chat header (owner ask 2026-07-20):
// no bottom border, no fade shadow — the bar blends into the chat surface.
const TITLEBAR_HEADER_BASE_CLASS =
  "workspace-page-header pointer-events-none relative z-3 flex h-11 w-full min-w-0 shrink-0 items-center justify-start gap-3 overflow-hidden bg-(--ui-chat-surface-background) px-[max(0.75rem,var(--titlebar-content-inset,0rem))] pr-[calc(var(--titlebar-tools-right,0.75rem)+var(--titlebar-tools-width,0px)+0.75rem)]";
const TITLEBAR_HEADER_TITLE_CLASS = "min-w-0 flex-1 overflow-hidden";

export function ChatHeader({ session, onOpenRail, railOpen, hideRail = false }: { session: WorkspaceSession | null; onOpenRail: () => void; railOpen: boolean; hideRail?: boolean }) {
  const confirm = useConfirm();
  const ask = usePrompt();
  const [menuOpen, setMenuOpen] = useState(false);
  const title = session?.title || "New chat";

  const handleRename = async () => {
    const next = await ask({ confirmLabel: "Rename", initial: title, title: "Rename chat" });
    if (session && next) sessionsStore.rename(session.id, next);
  };

  return (
    <header className={cn(TITLEBAR_HEADER_BASE_CLASS)}>
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
            <DropdownMenuItem onSelect={() => void handleRename()}>
              <Codicon name="edit" size="0.875rem" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* void(async) rather than an async handler: Radix closes the menu
                on select and does not await anything, so the promise has to be
                owned here instead of handed back to it. */}
            <DropdownMenuItem onSelect={() => {
              void (async () => {
                if (await confirm({ body: `“${title}” is deleted. This can't be undone.`, title: "Delete this chat?" })) sessionsStore.remove(session.id);
              })();
            }} variant="destructive">
              <Codicon name="trash" size="0.875rem" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>}
      {/* No rail opener while recording (owner 2026-08-04) — the record box
          owns the surface, and a sources/outputs rail has nothing to say
          about audio that is still being captured. */}
      {!railOpen && !hideRail && (
        <Button aria-label="Open chat sidebar" className="pointer-events-auto ml-auto shrink-0" onClick={onOpenRail} size="icon-xs" variant="ghost">
          <IconLayoutSidebarRightExpand />
        </Button>
      )}
    </header>
  );
}
