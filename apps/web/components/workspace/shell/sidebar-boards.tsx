"use client";

// The sidebar's list of Canvases (the spatial boards), beside the list of chats.
//
// Owner, 2026-09-03: *"the sidebar will have chats and canvases together in the left sidebar."*
// Same row grammar as a chat row (a bare title, hover-revealed ⋯ with Rename and Delete), same
// collapsible header, and the header carries a `+` that opens a new board — the reference's own
// section (docs/wondering-canvas-reference.md §9): "Canvas ▾  +", rows, "No canvases yet".
//
// 🔴 A BOARD IS NOT A CHAT. It reads `canvas_boards` through board-store, not `learning_canvases`
// through canvas-store, and it is never pinned or filed into a project: those are the chat list's
// features and a board has neither table column. Adding either later means adding the column.

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { useConfirm } from "@/components/desktop-ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/desktop-ui/dropdown-menu";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { BOARDS_CHANGED_EVENT, deleteBoard, listBoards, renameBoard, type BoardSummary } from "@/lib/board/board-store";
import { UNTITLED_BOARD } from "@/lib/board/board-model";
import { cn } from "@/lib/utils";

import { SidebarSectionHeader } from "./sidebar-primitives";

const REFRESH_DEBOUNCE_MS = 1200;
const CLOSED_KEY = "nemesis.sidebar.boards.v1.closed";

function readClosed(): boolean {
  try {
    return window.localStorage.getItem(CLOSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function SidebarBoards({
  onNavigate,
  seed,
  className,
  /** Whether the learner is signed in; a signed-out sidebar shows the header and nothing under it. */
  userId,
}: {
  onNavigate?: () => void;
  seed?: BoardSummary[];
  className?: string;
  userId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const confirm = useConfirm();
  const preview = useWorkspacePreview() !== null;
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(() => (typeof window === "undefined" ? true : !readClosed()));
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const debounce = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (seed) {
      setBoards(seed);
      setLoaded(true);
      return;
    }
    if (preview) {
      setBoards([]);
      setFailed(false);
      setLoaded(true);
      return;
    }
    if (!userId) {
      setBoards([]);
      setLoaded(true);
      return;
    }
    try {
      setBoards(await listBoards());
      setFailed(false);
    } catch (error) {
      console.error("Failed to load canvas list:", error);
      setFailed(true);
    } finally {
      setLoaded(true);
    }
  }, [preview, seed, userId]);

  useEffect(() => {
    void refresh();
    const debounced = () => {
      if (debounce.current !== null) window.clearTimeout(debounce.current);
      debounce.current = window.setTimeout(() => {
        debounce.current = null;
        void refresh();
      }, REFRESH_DEBOUNCE_MS);
    };
    const onFocus = () => void refresh();
    window.addEventListener(BOARDS_CHANGED_EVENT, debounced);
    window.addEventListener("focus", onFocus);
    return () => {
      if (debounce.current !== null) window.clearTimeout(debounce.current);
      window.removeEventListener(BOARDS_CHANGED_EVENT, debounced);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const activeId = pathname?.startsWith("/canvas/") ? (pathname.split("/")[2] ?? null) : null;
  const onNewBoard = pathname === "/canvas";

  const toggle = () => {
    setOpen((was) => {
      try {
        window.localStorage.setItem(CLOSED_KEY, was ? "true" : "false");
      } catch {
        // Persistence is a nicety; the toggle itself already happened.
      }
      return !was;
    });
  };

  const openBoard = (id: string) => {
    router.push(`/canvas/${id}`);
    onNavigate?.();
  };

  const commitRename = async () => {
    if (!editing) return;
    const value = editing.value.trim() || UNTITLED_BOARD;
    const board = boards.find((item) => item.id === editing.id);
    setEditing(null);
    if (!board || value === board.title) return;
    try {
      await renameBoard(board.id, value);
    } catch (error) {
      console.error("Failed to rename canvas:", error);
    }
    void refresh();
  };

  const remove = async (board: BoardSummary) => {
    const sure = await confirm({
      title: "Delete canvas?",
      body: `“${board.title || UNTITLED_BOARD}” and all of its conversations will be permanently deleted.`,
      confirmLabel: "Delete",
    });
    if (!sure) return;
    try {
      await deleteBoard(board.id);
    } catch (error) {
      console.error("Failed to delete canvas:", error);
    }
    if (activeId === board.id) router.push("/canvas");
    void refresh();
  };

  const newButton = (
    <button
      aria-label="New canvas"
      className="grid size-6 place-items-center rounded-md text-(--ui-text-tertiary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground focus-visible:opacity-100 group-hover/section:opacity-100"
      onClick={() => {
        setOpen(true);
        try {
          window.localStorage.setItem(CLOSED_KEY, "false");
        } catch {
          // Persistence is a nicety.
        }
        router.push("/canvas");
        onNavigate?.();
      }}
      title="New canvas"
      type="button"
    >
      <Codicon name="add" size="0.875rem" />
    </button>
  );

  const row = (board: BoardSummary) => {
    const active = activeId === board.id;
    const isEditing = editing?.id === board.id;
    return (
      <li className="group/row relative flex min-w-0 items-center" key={board.id}>
        {isEditing ? (
          <input
            aria-label={`Rename ${board.title}`}
            autoFocus
            className="my-px h-7 w-full rounded-[var(--nav-row-radius)] border border-(--ui-stroke-secondary) bg-transparent px-2 text-[length:var(--canvas-text-small)] text-foreground outline-none"
            maxLength={120}
            onBlur={() => void commitRename()}
            onChange={(event) => setEditing({ id: board.id, value: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") void commitRename();
              if (event.key === "Escape") setEditing(null);
            }}
            value={editing.value}
          />
        ) : (
          <>
            <button
              className={cn(
                "flex h-[var(--nav-row-height)] min-w-0 flex-1 items-center gap-[var(--nav-icon-gap)] rounded-[var(--nav-row-radius)] border border-transparent pr-[32px] text-left text-[length:var(--canvas-text-small)] text-foreground transition-colors duration-100 ease-out hover:bg-(--ui-control-hover-background) hover:transition-none",
                active && "border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) hover:border-(--ui-stroke-tertiary)!",
              )}
              onClick={() => openBoard(board.id)}
              style={{ paddingLeft: "calc(var(--nav-row-pad-x) - 1px)" }}
              title={board.title}
              type="button"
            >
              <span className="min-w-0 flex-1 truncate">{board.title || UNTITLED_BOARD}</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`More options for ${board.title || UNTITLED_BOARD}`}
                  className="absolute right-1 grid size-6 shrink-0 place-items-center rounded-md text-(--ui-text-tertiary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"
                  type="button"
                >
                  <Codicon name="kebab-vertical" size="0.8rem" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="right">
                <DropdownMenuItem onClick={() => setEditing({ id: board.id, value: board.title })}>Rename</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void remove(board)} variant="destructive">
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </li>
    );
  };

  return (
    <div className={className} data-sidebar-boards="">
      <SidebarSectionHeader action={newButton} label="Canvases" onToggle={toggle} open={open} />
      <div className="grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 motion-safe:ease-out" inert={!open} style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <ul className="flex min-h-0 flex-col overflow-hidden">
          {failed && (
            <li className="flex h-7 items-center justify-between gap-2 px-[var(--nav-row-pad-x)] text-[length:var(--canvas-text-meta)]">
              <span className="text-(--board-error-text,inherit)" role="alert">
                Couldn’t load canvases.
              </span>
              <button className="shrink-0 font-medium text-(--ui-text-secondary) hover:text-foreground" onClick={() => void refresh()} type="button">
                Retry
              </button>
            </li>
          )}
          {onNewBoard && (
            <li className="flex min-w-0 items-center">
              <button
                aria-current="page"
                className="flex h-[var(--nav-row-height)] min-w-0 flex-1 items-center rounded-[var(--nav-row-radius)] border border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) text-left text-[length:var(--canvas-text-small)] text-foreground"
                onClick={() => onNavigate?.()}
                style={{ paddingLeft: "calc(var(--nav-row-pad-x) - 1px)" }}
                type="button"
              >
                <span className="min-w-0 flex-1 truncate">{UNTITLED_BOARD}</span>
              </button>
            </li>
          )}
          {!failed && loaded && !onNewBoard && boards.length === 0 && (
            <li className="h-7 content-center px-[var(--nav-row-pad-x)] text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">No canvases yet</li>
          )}
          {boards.map(row)}
        </ul>
      </div>
    </div>
  );
}
