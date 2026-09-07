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
import { BoardLanding } from "./board-landing";
import { BoardDock } from "./board-panel";
import { BoardProvider, useBoard } from "./board-provider";
import { BoardSurface } from "./board-surface";
import { useAuth } from "@/components/AuthProvider";
import { documentKey, useDocumentDock } from "@/components/workspace/learn/document-dock";
import { SourcePreview } from "@/components/workspace/learn/source-preview";
import { OutputPreview } from "@/components/workspace/learn/output-preview";
import { useSidePanelInset, useSidePanelLive } from "@/components/workspace/shell/side-panel";

/**
 * What the board shows besides its cards.
 *
 * 🔴🔴 AN EMPTY BOARD IS THE LANDING, NOT A HINT AND A COMPOSER (owner 2026-09-06, "make new landing
 * ... where users are invited to drop in material"). The landing (board-landing.tsx) IS the front
 * door's composer; the moment anything is on the board, a source, a thread or a thing being made,
 * it gives way to Wondering's compact composer at the bottom and the frame around the board
 * (board-surface.tsx draws the rail and the panel for the same non-empty board).
 *
 * The Chat | Canvas switch belongs to the front door only: an empty, unsaved board. Once a card
 * exists the board is a place of its own (the same way a chat in progress shows no switch), and
 * the switch would otherwise sit on top of the first card's title.
 */
function BoardChrome() {
  const { cards, sources, outputs, enteredCardId } = useBoard();
  const empty = cards.length === 0 && sources.length === 0 && outputs.length === 0;
  // 🔴 THE BOARD'S COMPOSER STANDS DOWN INSIDE A THREAD. That box opens a NEW thread; the one in
  // front already has its own, and two composers on one screen is the defect the canvas's own
  // clarification card was rewritten to avoid.
  if (enteredCardId) return null;
  if (!empty) return <BoardComposer />;
  /**
   * 🔴🔴 NO Chat | Canvas SWITCH ANY MORE. Owner, 2026-09-07: *"get rid of the chat as landing page
   * in webapp, the canvas should be landing page"*, and, asked directly whether a plain full-screen
   * chat should still exist on its own, *"No, chats only live on boards"*. A switch between two
   * front doors needs two front doors; there is one. A conversation is a card here, and entering it
   * makes it full screen, which is what the other door was for.
   *
   * `front-door-toggle.tsx` is left standing and unused on purpose: /learn still opens every chat
   * made before today, and the switch is the only way back from one of them.
   */
  return <BoardLanding />;
}

/**
 * 🔴 THE CANVAS DOES NOT TOUCH THE SIDEBAR, AND THAT IS A CORRECTION. On 2026-09-06 the board was
 * made to claim the immersive registry, so opening a canvas folded the learner's sidebar to the
 * rail the way a chat does. The owner corrected the reading the same evening: *"I said to remove
 * the left sidebar with the chat library and projects, WHEN INSIDE FULLSCREEN CHAT"*. So the claim
 * lives where he asked for it — `board-thread.tsx`, which takes the whole window including the
 * rail — and a canvas leaves the learner's own preference alone, exactly as it did before.
 *
 * Reinstating it is one component if he ever wants it: a child that declares the immersive claim and
 * renders only when the board has something on it. The name is deliberately not spelled here —
 * `board-panel.test.ts` fails on that call appearing in this file, and a guard that trips on its own
 * explanation teaches the next person to delete the explanation.
 */

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

export function BoardPage({
  boardId,
  seed,
  toggle = true,
}: {
  boardId: string | null;
  seed?: BoardState;
  toggle?: boolean;
  /** 🔴 DEV-PREVIEW SEAM: open this source in the reading panel on mount, so /dev-preview/board
   *  shows the panel. Nothing in the real product opens a document by itself. */
}) {
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
        {/* 🔴🔴 ONE DOCK AROUND EVERYTHING, WHICH IS WHAT MAKES A DELIVERABLE AND A LECTURE TABS OF
            THE SAME PANEL. The dock has to wrap the board because the thing that opens a document is
            a source card drawn deep inside the surface, and it has to wrap the output panel because
            that panel now draws the dock's own tab strip. See board-panel.tsx. */}
        <BoardDock>
          <BoardArea frontDoor={boardId === null && toggle}>
            <BoardSurface />
            <LimitNotice />
            <BoardChrome />
          </BoardArea>
          <BoardOutputPanel />
          <BoardSourcePanel />
        </BoardDock>
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

/**
 * A deliverable opened from its card: the chat's own reading panel, docked right.
 *
 * 🔴🔴 IT IS A TAB OF THE READING PANEL NOW, NOT A PANEL OF ITS OWN (2026-09-04). It used to render
 * straight from `openedOutput`, which was correct while a deliverable was the only thing the board
 * could open — but the moment documents opened on that same edge, a page Nemesis made and a lecture
 * the learner dropped were two rectangles at the same width, each certain it owned that side of the
 * screen. That is the exact failure the chat's dock was extracted to end (`document-dock.tsx` says
 * so at length), and the answer is the same one: one list, one strip, whichever body is in front.
 *
 * 🔴 THE FRONT ITEM DECIDES, NOT A FLAG. `dock.active` is the single answer to "what is showing",
 * so this cannot disagree with the document panel about which of them is on screen.
 */
function BoardOutputPanel() {
  const { boardId, enteredCardId } = useBoard();
  const { session } = useAuth();
  const dock = useDocumentDock();
  const active = dock.active;
  if (active?.kind !== "output") return null;
  return (
    <OutputPreview
      activeKey={dock.activeKey}
      canvasId={boardId ?? ""}
      comments={{ preview: false, uid: session?.user?.id ?? null }}
      // 🔴🔴 FULL ON THE BOARD, DOCKED INSIDE A FULL-SIZE CHAT, AND BOTH ARE THE OWNER'S.
      //
      // On the board: *"i dont want a sidebar to open in canvas"* (2026-09-04). A note or a deck
      // opens over the board and closes back to it; nothing narrows the cards it was made from,
      // because the cards ARE the canvas and a panel beside them would squeeze the thing you are
      // arranging.
      //
      // Inside a full-size chat there are no cards to squeeze, and he asked for the other shape by
      // name (2026-09-06, of the Gemini thread he linked): *"i like the fullscreen chat with right
      // side panel … you basically have a chat and you prompt it to create flashcard"*. Measured in
      // that thread at 1470 wide: the chat keeps a narrow column on the left and the made thing
      // takes 865 on the right. So the chat narrows and the thing it made stands beside it.
      initialMode={enteredCardId ? "docked" : "full"}
      items={dock.items}
      onClose={dock.closeAll}
      onCloseKey={dock.close}
      onSelectKey={dock.select}
      output={active.output}
    />
  );
}


/**
 * A dropped document, opened beside a full-size chat.
 *
 * 🔴🔴 INSIDE A THREAD ONLY, AND THAT IS NOT A HEDGE. On the board a document is drawn inside its
 * own card, by the owner's own ruling (*"i dont want any popups in canvas, everything should be
 * seen and done within the cards"*, 2026-09-04), and board-panel.tsx records how much was cut to
 * honour it. A full-size chat covers the board, so from inside one that card is the single thing
 * the learner cannot reach — which is why he asked for exactly this and no more, 2026-09-07:
 * *"chats in fullscreen view can open a right sidepanel to view sources"*.
 *
 * 🔴 THE READER'S ACTIONS SEND INTO THIS THREAD. *"users can dropp annotations to ask questions"*,
 * and *"if you select a certain amount of text it only answers from those"*. `onSendToChat` is the
 * reader's existing channel for a highlighted passage; pointing it at `sendCardMessage` with the
 * passage as the question's context is what makes the answer come back from that passage rather
 * than from the whole document.
 */
function BoardSourcePanel() {
  const { enteredCardId, sendCardMessage } = useBoard();
  const { session } = useAuth();
  const dock = useDocumentDock();
  const onSendToChat = useCallback(
    (prompt: string, _files: File[], _notes?: unknown, said?: string) => {
      if (!enteredCardId) return;
      // `said` is the passage the learner marked. Passing it as the turn's context excerpt is what
      // narrows the answer to it: the same field a selection on a card fills (board-provider.tsx).
      sendCardMessage(enteredCardId, prompt, undefined, said);
    },
    [enteredCardId, sendCardMessage],
  );
  if (!enteredCardId) return null;
  return (
    <SourcePreview
      activeId={dock.activeId}
      activeKey={dock.activeKey}
      items={dock.items}
      onClose={dock.closeAll}
      onCloseKey={dock.close}
      onCloseTab={(id) => dock.close(documentKey(id))}
      onSelect={(id) => dock.select(documentKey(id))}
      onSelectKey={dock.select}
      onSendToChat={onSendToChat}
      open={dock.open}
      uid={session?.user?.id ?? null}
    />
  );
}
