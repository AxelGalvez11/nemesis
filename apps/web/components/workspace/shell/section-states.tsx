"use client";

// Sidebar empty/loading states — verbatim from desktop
// app/chat/sidebar/section-states.tsx (student-build strings inlined).

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { Skeleton } from "@/components/desktop-ui/skeleton";

const SKELETON_WIDTHS = ["w-32", "w-40", "w-28", "w-36", "w-24"];

export function SidebarSessionSkeletons() {
  return (
    <div aria-hidden className="grid gap-px">
      {SKELETON_WIDTHS.map((width, index) => (
        <div
          className="grid min-h-[1.625rem] grid-cols-[minmax(0,1fr)_1.375rem] items-center rounded-md pl-2"
          key={index}
        >
          <Skeleton className={`h-3 rounded-sm ${width}`} />
          <Skeleton className="mx-auto size-3.5 rounded-sm opacity-60" />
        </div>
      ))}
    </div>
  );
}

export function SidebarBlankState({ onNewSession }: { onNewSession: () => void }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center px-4 text-center">
      <div className="flex flex-col items-center gap-2">
        <Codicon name="root-folder" size="1.25rem" className="text-(--ui-text-quaternary)" />
        <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">No chats yet</p>
        <Button size="sm" variant="ghost" className="mt-0.5 text-(--ui-text-secondary)" onClick={onNewSession}>
          <Codicon name="add" size="0.75rem" /> New chat
        </Button>
      </div>
    </div>
  );
}

export function SidebarPinnedEmptyState() {
  return (
    <div className="flex min-h-7 items-center gap-1.5 rounded-lg pl-2 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
      <span className="grid w-3.5 shrink-0 place-items-center text-(--ui-text-quaternary)">
        <Codicon name="pin" size="0.75rem" />
      </span>
      <span>Shift-click a chat to pin</span>
    </div>
  );
}

export function SidebarNoMatchState({ query }: { query: string }) {
  return (
    <div className="wrap-anywhere grid min-h-24 place-items-center rounded-lg px-2 text-center text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
      {`No chats match “${query}”.`}
    </div>
  );
}

export function SidebarSessionsEmptyState({ allPinned }: { allPinned: boolean }) {
  return (
    <div className="grid min-h-16 place-items-center rounded-lg px-2 text-center text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
      {allPinned ? "Everything here is pinned. Unpin a chat to show it in recents." : "No chats yet"}
    </div>
  );
}
