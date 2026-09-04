"use client";

// The Canvas page: a board (new at /canvas, saved at /canvas/<id>), its composer at the bottom, the
// hint on an empty board, and the notice strip. Assembled the way Wondering assembles theirs
// (docs/wondering-canvas-reference.md §3, §7).
//
// 🔴 A NEW BOARD GETS ITS ADDRESS THE MOMENT IT IS FIRST SAVED. The first send creates the row and
// the URL is REPLACED with /canvas/<id>, so a reload lands on the same board rather than on a
// fresh one. The chat learned this lesson the hard way (see memory "chat had no address").

import { X } from "lucide-react";
import { useCallback } from "react";

import type { BoardState } from "@/lib/board/board-model";

import { BoardComposer } from "./board-composer";
import { BoardProvider, useBoard } from "./board-provider";
import { BoardSurface } from "./board-surface";
import { FrontDoorToggle } from "./front-door-toggle";

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
    window.history.replaceState(window.history.state, "", `/canvas/${id}`);
  }, []);
  return (
    <main className="relative h-full min-h-0 overflow-hidden bg-(--ui-bg-editor)">
      {/* The same provider instance for the life of the board: creating the row and replacing the
          URL must not remount the tree, or the streaming first answer would be lost. */}
      <BoardProvider boardId={boardId} key={boardId ?? "new"} onBoardCreated={onCreated} seed={seed}>
        <BoardSurface />
        <EmptyStateHint />
        <LimitNotice />
        <BoardComposer />
        {boardId === null && toggle && <FrontDoorSwitch />}
      </BoardProvider>
    </main>
  );
}
