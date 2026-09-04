"use client";

// The Canvas page: a board (new at /canvas, saved at /canvas/<id>), its composer at the bottom, the
// hint on an empty board, and the notice strip. Assembled the way Wondering assembles theirs
// (docs/wondering-canvas-reference.md §3, §7).
//
// 🔴 A NEW BOARD GETS ITS ADDRESS THE MOMENT IT IS FIRST SAVED. The first send creates the row and
// the URL is REPLACED with /canvas/<id>, so a reload lands on the same board rather than on a
// fresh one. The chat learned this lesson the hard way (see memory "chat had no address").

import { X } from "lucide-react";
import { useCallback, type ReactNode } from "react";

import type { BoardState } from "@/lib/board/board-model";

import { BoardComposer } from "./board-composer";
import { BoardProvider, useBoard } from "./board-provider";
import { BoardSurface } from "./board-surface";
import { FrontDoorToggle } from "./front-door-toggle";
import { useAuth } from "@/components/AuthProvider";
import { OutputPreview } from "@/components/workspace/learn/output-preview";
import { useSidePanelInset, useSidePanelLive } from "@/components/workspace/shell/side-panel";

/** The Chat | Canvas switch belongs to the front door only: an empty, unsaved board. Once a card
 *  exists the board is a place of its own (the same way a chat in progress shows no switch), and
 *  the switch would otherwise sit on top of the first card's title. */
function FrontDoorSwitch() {
  const { cards, sources } = useBoard();
  if (cards.length > 0 || sources.length > 0) return null;
  return <FrontDoorToggle value="canvas" />;
}

function EmptyStateHint() {
  const { cards, sources } = useBoard();
  if (cards.length > 0 || sources.length > 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-[8px] px-[24px] text-center">
      <h1 className="text-[24px] font-semibold leading-[32px] text-foreground">Canvas</h1>
      <p className="max-w-[448px] text-[16px] leading-[24px] text-(--ui-text-secondary)">A visual way to understand things in parallel</p>
    </div>
  );
}

function LimitNotice() {
  const { limitNotice, dismissLimitNotice } = useBoard();
  if (!limitNotice) return null;
  return (
    <div className="absolute inset-x-0 top-[24px] z-50 flex justify-center px-[16px]">
      <div className="flex items-center gap-[12px] rounded-[8px] border border-(--board-error-bg) bg-(--board-error-bg) px-[16px] py-[10px] text-[14px] text-(--board-error-text) shadow-md">
        <span>{limitNotice}</span>
        <button aria-label="Dismiss" className="shrink-0" onClick={dismissLimitNotice} type="button">
          <X className="size-[16px]" />
        </button>
      </div>
    </div>
  );
}

export function BoardPage({ boardId, seed, toggle = true }: { boardId: string | null; seed?: BoardState; toggle?: boolean }) {
  const onCreated = useCallback((id: string) => {
    // 🔴 `history.replaceState`, NOT `router.replace`. A router navigation from /canvas to
    // /canvas/<id> mounts a different page module, which remounts this provider and drops the
    // answer that is streaming into the first card. Rewriting the address in place keeps the tree;
    // Next syncs `usePathname` to it (so the sidebar row lights up) and a reload lands on the
    // saved-board route.
    // 🔴 `null` STATE, NOT `window.history.state`. Verified on production 2026-09-03: Next's patched
    // replaceState treats a call carrying its OWN state object (`__NA`) as an internal navigation
    // and does not re-sync `usePathname`, so the sidebar kept showing the "Untitled canvas"
    // placeholder as the current row after the first save. A null state is a plain address change
    // and Next picks it up.
    window.history.replaceState(null, "", `/canvas/${id}`);
  }, []);
  return (
    <main className="relative h-full min-h-0 overflow-hidden bg-(--ui-bg-editor)">
      {/* The same provider instance for the life of the board: creating the row and replacing the
          URL must not remount the tree, or the streaming first answer would be lost. */}
      <BoardProvider boardId={boardId} key={boardId ?? "new"} onBoardCreated={onCreated} seed={seed}>
        <BoardArea frontDoor={boardId === null && toggle}>
          <BoardSurface />
          <EmptyStateHint />
          <LimitNotice />
          <BoardComposer />
          {boardId === null && toggle && <FrontDoorSwitch />}
        </BoardArea>
        <BoardOutputPanel />
      </BoardProvider>
    </main>
  );
}


/**
 * The board narrows when a reading panel is docked on the right, the way the chat does
 * (canvas-surface.tsx reads the same inset): the panel is a sibling, not a cover.
 */
function BoardArea({ children, frontDoor }: { children: ReactNode; frontDoor: boolean }) {
  const inset = useSidePanelInset();
  const dragging = useSidePanelLive();
  return (
    <div
      className={dragging ? "absolute inset-y-0 left-0" : "absolute inset-y-0 left-0 transition-[right] duration-200 ease-out motion-reduce:transition-none"}
      // The switch's fade stamps land here (front-door-toggle.tsx): its host is a direct child.
      data-front-door-page={frontDoor ? "" : undefined}
      style={{ right: inset }}
    >
      {children}
    </div>
  );
}

/** A deliverable opened from its card: the chat's own reading panel, docked right. */
function BoardOutputPanel() {
  const { openedOutput, closeOutput, boardId } = useBoard();
  const { session } = useAuth();
  if (!openedOutput) return null;
  return <OutputPreview canvasId={boardId ?? ""} comments={{ preview: false, uid: session?.user?.id ?? null }} initialMode="docked" onClose={closeOutput} output={openedOutput} />;
}
