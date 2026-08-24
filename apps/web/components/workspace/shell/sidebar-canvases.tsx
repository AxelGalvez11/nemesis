"use client";

// The sidebar's canvas list — every canvas the learner has, pinned first, then folders,
// then recents, accumulating the way a chat app's history does.
//
// 🔴 THIS REVERSES §L ("the sidebar represents destinations, not content", owner 2026-08-13).
// The reversal is the owner's own, 2026-08-25: "I would like the chats or canvases to
// accumulate on the left sidebar, like it does in ChatGPT… and the user can create folders
// for the canvases." Confirmed against the old rule the same day — full list plus folders,
// and the Library page stops being the canvas manager (it becomes the home of outputs).
//
// 🔴 THE DATA LAYER IS canvas-store's, UNTOUCHED. listCanvases/listFolders and the mutation
// helpers are the same calls the Library's manager used; this list is another reader, not a
// second system. Freshness comes from CANVASES_CHANGED_EVENT — every mutator in canvas-store
// broadcasts, so a rename made inside the canvas shows up here without polling. The refresh
// is debounced because saveCanvas fires on every autosave while an answer is streaming.
//
// 🔴 A COURSE-BEARING CANVAS IS MARKED, NOT COLOURED (owner 2026-08-25: course canvases
// "should be distinguished on the sidebar"). The mark is a mortar-board glyph in the lead
// slot ordinary rows leave empty, read from `CanvasSummary.courseTitle` — which the SELECT
// pulls out of the territory jsonb, because a course deliberately has no column of its own.

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { useConfirm } from "@/components/desktop-ui/confirm-dialog";
import { useAuth } from "@/components/AuthProvider";
import {
  CANVASES_CHANGED_EVENT,
  createFolder,
  deleteCanvas,
  deleteFolder,
  listCanvases,
  listFolders,
  renameCanvas,
  renameFolder,
  setCanvasFolder,
  setCanvasPinned,
  type CanvasSummary,
  type Folder,
} from "@/lib/learn/canvas-store";
import { cn } from "@/lib/utils";

import {
  SCROLL_Y,
  SidebarGroup,
  SidebarSectionHeader,
} from "./sidebar-primitives";

/** Coalesces the autosave storm: a streaming answer saves the canvas every few seconds and
 *  each save broadcasts; one trailing re-read covers a whole burst. */
const REFRESH_DEBOUNCE_MS = 1200;

const OPEN_FOLDERS_KEY = "nemesis.sidebar.canvases.v1.openFolders";

function readOpenFolders(): Set<string> {
  try {
    const raw = window.localStorage.getItem(OPEN_FOLDERS_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // A browser that refuses storage just starts with everything closed.
  }
  return new Set();
}

export function SidebarCanvases({
  onNavigate,
  seed,
}: {
  onNavigate?: () => void;
  /** 🔴 DEV-PREVIEW SEAM, same shape as CanvasManager's: `/dev-preview/sidebar-canvases`
   *  renders this exact component and substitutes only where rows come from, because a
   *  local environment signed into an unreachable cloud can never show a populated list. */
  seed?: { canvases: CanvasSummary[]; folders: Folder[] };
}) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const router = useRouter();
  const pathname = usePathname();
  const confirm = useConfirm();

  const [canvases, setCanvases] = useState<CanvasSummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [openFolders, setOpenFolders] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : readOpenFolders(),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ kind: "canvas" | "folder"; id: string; value: string } | null>(null);
  const debounceRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (seed) {
      setCanvases(seed.canvases);
      setFolders(seed.folders);
      return;
    }
    const [nextCanvases, nextFolders] = await Promise.all([listCanvases(userId), listFolders(userId)]);
    setCanvases(nextCanvases);
    setFolders(nextFolders);
  }, [seed, userId]);

  useEffect(() => {
    void refresh();
    const debounced = () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void refresh();
      }, REFRESH_DEBOUNCE_MS);
    };
    const onFocus = () => void refresh();
    window.addEventListener(CANVASES_CHANGED_EVENT, debounced);
    window.addEventListener("focus", onFocus);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      window.removeEventListener(CANVASES_CHANGED_EVENT, debounced);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  // Which canvas is open. Read from the URL rather than tracked through navigation, so a
  // reload and a shared link highlight correctly too. Re-read on every path change AND on
  // every list refresh — pushing `/learn?c=…` while already on /learn changes only the query,
  // which usePathname cannot see, but such a push always comes from a row click below.
  useEffect(() => {
    if (!pathname?.startsWith("/learn")) {
      setActiveId(null);
      return;
    }
    setActiveId(new URLSearchParams(window.location.search).get("c"));
  }, [pathname, canvases]);

  const open = useCallback(
    (id: string) => {
      setActiveId(id);
      router.push(`/learn?c=${id}`);
      onNavigate?.();
    },
    [onNavigate, router],
  );

  const toggleFolder = (id: string) => {
    setOpenFolders((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(OPEN_FOLDERS_KEY, JSON.stringify([...next]));
      } catch {
        // Persistence is a nicety; the toggle itself already happened.
      }
      return next;
    });
  };

  const commitRename = async () => {
    if (!editing) return;
    const value = editing.value.trim();
    setEditing(null);
    if (!value) return;
    if (editing.kind === "canvas") await renameCanvas(userId, editing.id, value);
    else await renameFolder(userId, editing.id, value);
    void refresh();
  };

  const removeCanvas = async (canvas: CanvasSummary) => {
    const sure = await confirm({
      title: "Delete this canvas?",
      body: `“${canvas.title || "Untitled"}” and its work leave your list. This does not touch anything already in your library.`,
      confirmLabel: "Delete",
    });
    if (!sure) return;
    await deleteCanvas(userId, canvas.id);
    void refresh();
  };

  const removeFolder = async (folder: Folder) => {
    const sure = await confirm({
      title: "Delete this folder?",
      body: `Canvases inside “${folder.name}” are kept — they go back to your recents.`,
      confirmLabel: "Delete folder",
    });
    if (!sure) return;
    await deleteFolder(userId, folder.id);
    void refresh();
  };

  const fileInto = async (canvasId: string, folderId: string | null) => {
    await setCanvasFolder(userId, canvasId, folderId);
    if (folderId) setOpenFolders((was) => new Set(was).add(folderId));
    void refresh();
  };

  const newFolder = async (parentId?: string | null) => {
    const folder = await createFolder(userId, "New folder", parentId ?? null);
    if (!folder) return;
    setOpenFolders((was) => new Set(was).add(folder.id));
    setEditing({ kind: "folder", id: folder.id, value: folder.name });
    void refresh();
  };

  const pinned = useMemo(() => canvases.filter((c) => c.pinnedAt), [canvases]);
  const unfiled = useMemo(() => canvases.filter((c) => !c.pinnedAt && !c.folderId), [canvases]);
  const byFolder = useMemo(() => {
    const map = new Map<string, CanvasSummary[]>();
    for (const canvas of canvases) {
      if (canvas.pinnedAt || !canvas.folderId) continue;
      const list = map.get(canvas.folderId) ?? [];
      list.push(canvas);
      map.set(canvas.folderId, list);
    }
    return map;
  }, [canvases]);
  const rootFolders = useMemo(() => folders.filter((f) => !f.parentId), [folders]);
  const childFolders = useCallback((id: string) => folders.filter((f) => f.parentId === id), [folders]);

  const canvasRow = (canvas: CanvasSummary, depth: number) => {
    const isEditing = editing?.kind === "canvas" && editing.id === canvas.id;
    return (
      <li className="group/row relative flex min-w-0 items-center" key={canvas.id}>
        {isEditing ? (
          <input
            autoFocus
            className="my-px h-7 w-full rounded-[var(--nav-row-radius)] border border-(--ui-stroke-secondary) bg-transparent px-2 text-[length:var(--canvas-text-small)] text-foreground outline-none"
            onBlur={() => void commitRename()}
            onChange={(e) => setEditing({ kind: "canvas", id: canvas.id, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitRename();
              if (e.key === "Escape") setEditing(null);
            }}
            value={editing.value}
          />
        ) : (
          <>
            <button
              className={cn(
                "flex h-8 min-w-0 flex-1 items-center gap-[var(--nav-icon-gap)] rounded-[var(--nav-row-radius)] border border-transparent pr-7 text-left text-[length:var(--canvas-text-small)] text-foreground transition-colors duration-100 ease-out hover:bg-(--ui-control-hover-background) hover:transition-none",
                activeId === canvas.id &&
                  "border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) hover:border-(--ui-stroke-tertiary)!",
              )}
              onClick={() => open(canvas.id)}
              style={{ paddingLeft: `calc(var(--nav-row-pad-x) - 1px + ${depth * 14}px)` }}
              type="button"
            >
              {/* The course mark: the one visual difference the owner asked for. Ordinary
                  canvases carry no icon at all, so the mortar-board alone says "this one
                  holds a course" without turning the list into an icon column. */}
              {canvas.courseTitle ? (
                <Codicon
                  className="shrink-0 text-(--ui-text-secondary)"
                  name="mortar-board"
                  size="0.875rem"
                  title={`Course: ${canvas.courseTitle}`}
                />
              ) : null}
              <span className="min-w-0 flex-1 truncate">{canvas.title || "Untitled"}</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Canvas actions"
                  className="absolute right-1 grid size-6 shrink-0 place-items-center rounded-md text-(--ui-text-tertiary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"
                  type="button"
                >
                  <Codicon name="kebab-vertical" size="0.8rem" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="right">
                <DropdownMenuItem onClick={() => void setCanvasPinned(userId, canvas.id, !canvas.pinnedAt).then(refresh)}>
                  {canvas.pinnedAt ? "Unpin" : "Pin"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEditing({ kind: "canvas", id: canvas.id, value: canvas.title })}>
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem disabled={!canvas.folderId} onClick={() => void fileInto(canvas.id, null)}>
                      No folder
                    </DropdownMenuItem>
                    {folders.length > 0 && <DropdownMenuSeparator />}
                    {rootFolders.map((folder) => (
                      <div key={folder.id}>
                        <DropdownMenuItem
                          disabled={canvas.folderId === folder.id}
                          onClick={() => void fileInto(canvas.id, folder.id)}
                        >
                          {folder.name}
                        </DropdownMenuItem>
                        {childFolders(folder.id).map((child) => (
                          <DropdownMenuItem
                            className="pl-6"
                            disabled={canvas.folderId === child.id}
                            key={child.id}
                            onClick={() => void fileInto(canvas.id, child.id)}
                          >
                            {child.name}
                          </DropdownMenuItem>
                        ))}
                      </div>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => void newFolder()}>New folder…</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void removeCanvas(canvas)} variant="destructive">
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </li>
    );
  };

  const folderRow = (folder: Folder, depth: number) => {
    const contents = byFolder.get(folder.id) ?? [];
    const children = childFolders(folder.id);
    const isOpen = openFolders.has(folder.id);
    const isEditing = editing?.kind === "folder" && editing.id === folder.id;
    return (
      <li className="min-w-0" key={folder.id}>
        <div className="group/row relative flex min-w-0 items-center">
          {isEditing ? (
            <input
              autoFocus
              className="my-px h-7 w-full rounded-[var(--nav-row-radius)] border border-(--ui-stroke-secondary) bg-transparent px-2 text-[length:var(--canvas-text-small)] text-foreground outline-none"
              onBlur={() => void commitRename()}
              onChange={(e) => setEditing({ kind: "folder", id: folder.id, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitRename();
                if (e.key === "Escape") setEditing(null);
              }}
              value={editing.value}
            />
          ) : (
            <>
              <button
                className="flex h-8 min-w-0 flex-1 items-center gap-[var(--nav-icon-gap)] rounded-[var(--nav-row-radius)] border border-transparent pr-7 text-left text-[length:var(--canvas-text-small)] font-medium text-(--ui-text-secondary) transition-colors duration-100 ease-out hover:bg-(--ui-control-hover-background) hover:text-foreground hover:transition-none"
                onClick={() => toggleFolder(folder.id)}
                style={{ paddingLeft: `calc(var(--nav-row-pad-x) - 1px + ${depth * 14}px)` }}
                type="button"
              >
                <Codicon className="shrink-0" name={isOpen ? "chevron-down" : "chevron-right"} size="0.8rem" />
                <Codicon className="shrink-0" name={isOpen ? "folder-opened" : "folder"} size="0.875rem" />
                <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Folder actions"
                    className="absolute right-1 grid size-6 shrink-0 place-items-center rounded-md text-(--ui-text-tertiary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"
                    type="button"
                  >
                    <Codicon name="kebab-vertical" size="0.8rem" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="right">
                  <DropdownMenuItem onClick={() => setEditing({ kind: "folder", id: folder.id, value: folder.name })}>
                    Rename
                  </DropdownMenuItem>
                  {depth === 0 ? (
                    <DropdownMenuItem onClick={() => void newFolder(folder.id)}>New subfolder</DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void removeFolder(folder)} variant="destructive">
                    Delete folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
        {isOpen ? (
          <ul className="flex flex-col">
            {children.map((child) => folderRow(child, depth + 1))}
            {contents.map((canvas) => canvasRow(canvas, depth + 1))}
            {children.length === 0 && contents.length === 0 ? (
              <li
                className="h-7 content-center truncate text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)"
                style={{ paddingLeft: `calc(var(--nav-row-pad-x) + ${(depth + 1) * 14}px)` }}
              >
                Empty
              </li>
            ) : null}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <SidebarGroup className="flex min-h-0 flex-1 flex-col p-0 pt-1">
      <SidebarSectionHeader
        action={
          <button
            aria-label="New folder"
            className="grid size-6 place-items-center rounded-md text-(--ui-text-tertiary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground focus-visible:opacity-100 group-hover/section:opacity-100"
            onClick={() => void newFolder()}
            type="button"
          >
            <Codicon name="new-folder" size="0.875rem" />
          </button>
        }
        collapsible={false}
        label="Canvases"
        onToggle={() => {}}
        open
      />
      <div className={cn("min-h-0 flex-1 pb-2", SCROLL_Y)}>
        {canvases.length === 0 && folders.length === 0 ? (
          <div className="grid min-h-16 place-items-center rounded-lg px-2 text-center text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
            Your canvases will gather here.
          </div>
        ) : (
          <ul className="flex flex-col">
            {pinned.map((canvas) => canvasRow(canvas, 0))}
            {rootFolders.map((folder) => folderRow(folder, 0))}
            {unfiled.map((canvas) => canvasRow(canvas, 0))}
          </ul>
        )}
      </div>
    </SidebarGroup>
  );
}
