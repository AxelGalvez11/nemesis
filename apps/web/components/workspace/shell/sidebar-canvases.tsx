"use client";

// The sidebar's list of work: the learner's canvases, and nothing else.
//
// 🔴🔴 THIS FILE WAS THE CHAT LIST UNTIL 2026-09-07, AND ALMOST ALL OF IT WENT THAT DAY. Owner, in
// order over two days: *"get rid of the chat as landing page in webapp, the canvas should be
// landing page"*; asked whether a plain full-screen chat should survive beside it, *"No, chats only
// live on boards"*; *"pretty much no more projects"*; and finally *"remove 'chats' from the left
// sidebar"*. What is left is the container and `SidebarBoards`.
//
// 🔴 WHAT WAS HERE, NAMED SO A `git log -S` FINDS IT AT 6a66b6b1 AND BEFORE. Three collapsible
// sections (Pinned / Projects / Chats) copied from the ChatGPT sidebar on 2026-08-24; project rows
// with the learner's icon, a ⋯ carrying Project settings / Project home / Pin / Delete, a five-row
// preview with "Show more", and drag-and-drop filing; a `Reveal` disclosure that animated a
// `0fr → 1fr` grid track so the rail grew instead of jump-cutting; pinned canvases lifting into
// their own section; and a Move-to-project sub-menu on every chat row.
//
// 🔴🔴 NO DATA WAS TOUCHED, AND THAT IS THE POINT OF DOING IT THIS WAY. `learning_canvases`,
// `canvas_folders` and every row in them are exactly as they were; `listCanvases`, `listFolders`,
// `setCanvasFolder`, `setFolderPinned` and the rest of `canvas-store.ts` are untouched and still
// exported; and every chat made before today still opens at `/learn?c=<id>`. Nothing here was a
// migration, so all of it is reversible by restoring this file from the history above.
//
// 🔴 THE COMPONENT KEEPS ITS NAME AND ITS PLACE IN `chat-sidebar.tsx`. Renaming it to
// `SidebarBoards` would collide with the component it now renders, and moving the scroller into
// that component would give the rail two scroll regions the first time anything joins this one.

import { useAuth } from "@/components/AuthProvider";
import type { BoardSummary } from "@/lib/board/board-store";
import { cn } from "@/lib/utils";

import { SCROLL_Y, SidebarGroup } from "./sidebar-primitives";
import { SidebarBoards } from "./sidebar-boards";

export function SidebarCanvases({
  onNavigate,
  seed,
}: {
  onNavigate?: () => void;
  /** 🔴 DEV-PREVIEW SEAM: `/dev-preview/sidebar-canvases` renders this exact component and
   *  substitutes only where the rows come from, because a local environment signed into an
   *  unreachable cloud can never show a populated list. */
  seed?: BoardSummary[];
}) {
  const { session } = useAuth();
  return (
    <SidebarGroup className="flex min-h-0 flex-1 flex-col p-0 pt-1">
      <div className={cn("min-h-0 flex-1 pb-2", SCROLL_Y)}>
        <SidebarBoards onNavigate={onNavigate} seed={seed} userId={session?.user?.id ?? null} />
      </div>
    </SidebarGroup>
  );
}
