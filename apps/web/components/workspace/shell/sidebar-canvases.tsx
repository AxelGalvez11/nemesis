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
// 🔴 THE ROW GRAMMAR IS THE REFERENCE'S, MEASURED IN THE OWNER'S OWN CHROME 2026-08-30 (his
// report: "the side bar of nemesis still doesnt match chatgpt in terms of projects opening and
// closing, and the canvases or projects or pinned things being collapsable"):
//   * Every section header (Pinned / Projects / Canvases) is a COLLAPSIBLE button — 12px caret
//     beside the label on hover, whole label toggles, state persisted like `openFolders` is.
//   * A project row is icon + name, NO leading chevron (the reference marks expandability with
//     nothing at rest), and clicking it expands in place — smoothly, on a `0fr → 1fr` grid row.
//     Hover reveals ONE quiet control, the ⋯ menu. The pencil that started a canvas already
//     filed here was cut by the owner on 2026-09-01 (*"remove the pencil icon in the projects
//     in sidebar, clicking on projects in sidebar should only open the project folder"*); the
//     `?folder=` lane it used is still how the front door's project picker files a new canvas.
//   * An expanded project lists its FIVE most recent canvases, then a "Show more" row.
//   * A canvas row's hover controls are pin + ⋯ (the reference's chat rows: pin + ⋯).
//   * A pinned PROJECT (folders.pinned_at, 20260830T40) moves into Pinned — same row, same
//     expand — and leaves the Projects section rather than appearing twice.
//   * Projects order by RECENCY (most recently worked canvas anywhere inside), not by name —
//     `buildProjects` already computes exactly that rollup for /projects, so it is the one
//     ordering the sidebar and the page can share without disagreeing.
//
// 🔴 A COURSE-BEARING CANVAS IS KNOWN, AND ONLY WHISPERS IT. The 2026-08-25 ruling ("course
// canvases should be distinguished on the sidebar") put a lead glyph on those rows; the
// 2026-08-30 ruling ("the canvases shouldnt have icons, only the projects") outranks it, so the
// fact moved into the row's tooltip. `CanvasSummary.courseTitle` still rides the SELECT — pulled
// from the territory jsonb, because a course deliberately has no column of its own.

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { useConfirm } from "@/components/desktop-ui/confirm-dialog";
import { ProjectCustomizeDialog } from "./project-customize-dialog";
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
  setFolderPinned,
  type CanvasSummary,
  type Folder,
} from "@/lib/learn/canvas-store";
import { buildProjects, type ProjectNode } from "@/components/workspace/projects/projects-model";
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
const CLOSED_SECTIONS_KEY = "nemesis.sidebar.canvases.v1.closedSections";

/** The reference's own cap, measured 2026-08-30: an expanded project lists its five most recent
 *  chats, then a tertiary "Show more" row reveals the rest in place. */
const FOLDER_PREVIEW_ROWS = 5;

/**
 * A list that GROWS open instead of appearing — the sidebar's one disclosure.
 *
 * 🔴🔴 Owner, 2026-09-01: *"clicking on projects in sidebar should only open the project folder
 * and have a smooth animation."* Every one of these was `{open ? <ul/> : null}`: the rows were
 * mounted and unmounted, so opening a project was a jump-cut and everything below it teleported
 * down the rail by however many canvases had just arrived.
 *
 * 🔴 A `0fr → 1fr` GRID ROW, WHICH IS THE ONLY WAY TO ANIMATE TO A HEIGHT NOBODY KNOWS. `height:
 * auto` does not interpolate, and every alternative has to name a number it cannot know: a fixed
 * max-height is wrong for every project that is not exactly that tall (too small clips it, too
 * large spends the duration animating empty space), and measuring the list to write a pixel height
 * back has to re-measure on every canvas added, renamed or filed. The track needs no number at
 * all. The list inside carries `min-h-0` AND `overflow-hidden` — without both, it refuses to
 * shrink below its own content and the fraction never bites.
 *
 * 🔴 THE ROWS STAY RENDERED WHEN IT IS CLOSED, SO `inert`. They sit in the document at zero
 * height; without this they stay in the tab order and a keyboard learner walks into rows that are
 * not on screen, with nothing to say where focus went.
 *
 * 🔴 ONE COMPONENT FOR THE PROJECT BODIES AND THE THREE SECTIONS. Four hand-written copies of a
 * `0fr` grid is four chances for one of them to keep the old jump-cut, and the rail would then
 * move two different ways depending on which triangle you pressed.
 */
function Reveal({ children, open }: { children: ReactNode; open: boolean }) {
  return (
    <div
      className="grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 motion-safe:ease-out"
      inert={!open}
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <ul className="flex min-h-0 flex-col overflow-hidden">{children}</ul>
    </div>
  );
}

/** Stored as the CLOSED set, not the open one, so every section defaults to open — including a
 *  section (a first pin, a first project) that did not exist when the learner last touched one. */
function readClosedSections(): Set<string> {
  try {
    const raw = window.localStorage.getItem(CLOSED_SECTIONS_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // Storage refused: every section simply starts open.
  }
  return new Set();
}

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
  const [closedSections, setClosedSections] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : readClosedSections(),
  );
  /** Projects whose expanded list shows every canvas rather than the first five. Session-only:
   *  "Show more" is a reading gesture, not a setting worth remembering. */
  const [showAll, setShowAll] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ kind: "canvas" | "folder"; id: string; value: string } | null>(null);
  /** The project whose look and instructions are being edited, or null. */
  const [customizing, setCustomizing] = useState<Folder | null>(null);
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

  const toggleSection = (name: string) => {
    setClosedSections((was) => {
      const next = new Set(was);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      try {
        window.localStorage.setItem(CLOSED_SECTIONS_KEY, JSON.stringify([...next]));
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
      title: "Delete this project?",
      body: `Canvases inside “${folder.name}” are kept — they go back to your recents.`,
      confirmLabel: "Delete project",
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

  // Always top level. "New sub-project" sat in the project menu until
  // 2026-09-01, when the owner cut it: "I don't get why that's there. I don't
  // need that." Nesting is not ripped out of the model — the database still
  // caps it at two levels and any folder that already has a parent still draws
  // under it — there is simply no longer a door that makes a new one.
  const newFolder = async () => {
    const folder = await createFolder(userId, "New project", null);
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
  // 🔴 RECENCY ORDER, SHARED WITH /projects RATHER THAN REIMPLEMENTED. `buildProjects` already
  // rolls "most recently worked canvas anywhere inside" up the tree and sorts by it — the same
  // fact the reference's sidebar orders projects by. Reading the tree here means the sidebar and
  // the Projects page can never disagree about which project was touched last.
  const projectTree = useMemo(() => buildProjects(folders, canvases), [canvases, folders]);
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f] as const)), [folders]);
  const nodeById = useMemo(() => {
    const map = new Map<string, ProjectNode>();
    const walk = (nodes: readonly ProjectNode[]) =>
      nodes.forEach((node) => {
        map.set(node.id, node);
        walk(node.children);
      });
    walk(projectTree);
    return map;
  }, [projectTree]);
  /** Pinned projects live in the Pinned section and LEAVE Projects — the reference does not show
   *  a pinned project twice. Ordered by when they were pinned, newest first, like pinned canvases. */
  const pinnedFolders = useMemo(
    () => folders.filter((f) => f.pinnedAt).sort((a, b) => (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? "")),
    [folders],
  );
  const rootFolders = useMemo(
    () =>
      projectTree
        .map((node) => folderById.get(node.id))
        .filter((f): f is Folder => Boolean(f && !f.pinnedAt)),
    [folderById, projectTree],
  );
  /** Children in the tree's recency order, for RENDERING an expanded project. */
  const childFolders = useCallback(
    (id: string) =>
      (nodeById.get(id)?.children ?? [])
        .map((child) => folderById.get(child.id))
        .filter((f): f is Folder => Boolean(f)),
    [folderById, nodeById],
  );
  /** The full flat list for the Move-to menu — filing into a pinned project must stay possible,
   *  so the menu deliberately does NOT reuse `rootFolders`' pinned-exclusion. */
  const menuRootFolders = useMemo(() => folders.filter((f) => !f.parentId), [folders]);
  const menuChildFolders = useCallback((id: string) => folders.filter((f) => f.parentId === id), [folders]);
  /** The project page the learner is on, so its row lights up the way an open canvas's row does. */
  const activeFolderId = pathname?.startsWith("/projects/") ? (pathname.split("/")[2] ?? null) : null;

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
                "flex h-[var(--nav-row-height)] min-w-0 flex-1 items-center gap-[var(--nav-icon-gap)] rounded-[var(--nav-row-radius)] border border-transparent pr-[56px] text-left text-[length:var(--canvas-text-small)] text-foreground transition-colors duration-100 ease-out hover:bg-(--ui-control-hover-background) hover:transition-none",
                activeId === canvas.id &&
                  "border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) hover:border-(--ui-stroke-tertiary)!",
              )}
              onClick={() => open(canvas.id)}
              // 🔴 26px PER LEVEL — the reference's own child inset (its expanded-project rows pad
              // 36px where a top row pads 10: one 20px icon plus its 6px gap), so a child canvas's
              // text starts exactly under its project's NAME rather than under the icon.
              style={{ paddingLeft: `calc(var(--nav-row-pad-x) - 1px + ${depth * 26}px)` }}
              // 🔴 A CANVAS ROW WEARS NO ICON, EVER — owner 2026-08-30: "the canvases shouldnt
              // have icons, only the projects should be allowed to have icons", matching the
              // reference, where a chat is always a bare title. The course mark that used to sit
              // here (#900-era) survives as this tooltip, so "which of these is my course" still
              // has an answer without the list becoming an icon column.
              title={canvas.courseTitle ? `Course: ${canvas.courseTitle}` : undefined}
              type="button"
            >
              <span className="min-w-0 flex-1 truncate">{canvas.title || "Untitled"}</span>
            </button>
            {/* The reference's chat-row hover pair: pin, then ⋯. The pin is the quick toggle the
                menu also carries — one press for the common gesture, the menu for everything else. */}
            <button
              aria-label={canvas.pinnedAt ? "Unpin canvas" : "Pin canvas"}
              className="absolute right-[30px] grid size-6 shrink-0 place-items-center rounded-md text-(--ui-text-tertiary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100"
              onClick={() => void setCanvasPinned(userId, canvas.id, !canvas.pinnedAt).then(refresh)}
              title={canvas.pinnedAt ? "Unpin canvas" : "Pin canvas"}
              type="button"
            >
              <Codicon name={canvas.pinnedAt ? "pinned" : "pin"} size="0.8rem" />
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
              {/* Grouped the way the reference groups a chat row's menu (measured 2026-08-30):
                  identity actions, then pin/delete, then a project-scoped group under the
                  project's own name — with "Remove from project" as its own verb, not a "No
                  project" row hidden inside the submenu. */}
              <DropdownMenuContent align="start" side="right">
                <DropdownMenuItem onClick={() => setEditing({ kind: "canvas", id: canvas.id, value: canvas.title })}>
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void setCanvasPinned(userId, canvas.id, !canvas.pinnedAt).then(refresh)}>
                  {canvas.pinnedAt ? "Unpin canvas" : "Pin canvas"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void removeCanvas(canvas)} variant="destructive">
                  Delete
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {canvas.folderId ? (
                  <DropdownMenuLabel>{folderById.get(canvas.folderId)?.name ?? "This project"}</DropdownMenuLabel>
                ) : null}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Move to project</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {menuRootFolders.map((folder) => (
                      <div key={folder.id}>
                        <DropdownMenuItem
                          disabled={canvas.folderId === folder.id}
                          onClick={() => void fileInto(canvas.id, folder.id)}
                        >
                          {folder.name}
                        </DropdownMenuItem>
                        {menuChildFolders(folder.id).map((child) => (
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
                    {menuRootFolders.length > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuItem onClick={() => void newFolder()}>New project…</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {canvas.folderId ? (
                  <DropdownMenuItem onClick={() => void fileInto(canvas.id, null)}>Remove from project</DropdownMenuItem>
                ) : null}
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
    // The reference's cap: five most recent, then "Show more" reveals the rest in place.
    const revealed = showAll.has(folder.id) ? contents : contents.slice(0, FOLDER_PREVIEW_ROWS);
    const hidden = contents.length - revealed.length;
    // 🔴 A FOLDER ROW LOOKS EXACTLY LIKE A CANVAS ROW, AND ONLY THE ICON SAYS WHICH IS WHICH.
    // Owner 2026-08-29: *"the sidebar kinda just looks like it's too bolded, especially the
    // pages"*. This row carried `font-medium` AND `--ui-text-secondary` — heavier than the canvases
    // under it and simultaneously faded, which is the two ways of standing out fighting each other.
    // Measured on chatgpt.com the same day: a project row and a chat row are both 14px / weight
    // 400 / rgb(13,13,13), identical, told apart by the glyph alone.
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
              {/* 🔴 NO LEADING CHEVRON — the reference's project row is icon + name and nothing
                  else at rest (measured in the owner's Chrome 2026-08-30); expandability shows in
                  what the click DOES, not in an ornament. The old chevron also indented every
                  project 14px past the canvases, which no reference row does. */}
              <button
                aria-expanded={isOpen}
                className={cn(
                  "flex h-[var(--nav-row-height)] min-w-0 flex-1 items-center gap-[var(--nav-icon-gap)] rounded-[var(--nav-row-radius)] border border-transparent pr-[30px] text-left text-[length:var(--canvas-text-small)] text-foreground transition-colors duration-100 ease-out hover:bg-(--ui-control-hover-background) hover:transition-none",
                  activeFolderId === folder.id &&
                    "border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) hover:border-(--ui-stroke-tertiary)!",
                )}
                onClick={() => toggleFolder(folder.id)}
                style={{ paddingLeft: `calc(var(--nav-row-pad-x) - 1px + ${depth * 26}px)` }}
                type="button"
              >
                {/* 🔴 THE PROJECT'S OWN LOOK (owner 2026-08-30, the reference's model): a custom
                    glyph holds steady open or closed, at the reference's 20px, and the colour
                    tints ONLY this glyph — an identity mark, never a second theme. */}
                <Codicon
                  className="shrink-0"
                  name={folder.icon ?? (isOpen ? "folder-opened" : "folder")}
                  size="20px"
                  style={folder.color ? { color: folder.color } : undefined}
                />
                <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Project actions"
                    className="absolute right-1 grid size-6 shrink-0 place-items-center rounded-md text-(--ui-text-tertiary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"
                    type="button"
                  >
                    <Codicon name="kebab-vertical" size="0.8rem" />
                  </button>
                </DropdownMenuTrigger>
                {/* The reference's project menu (measured 2026-08-30): Rename / Project settings /
                    Project home, then Pin project / Delete project. "Share project" is not drawn
                    because Nemesis has no project sharing — a dead door would be the one way to
                    fail a 1:1 copy while matching it (project-page.tsx's own precedent). */}
                <DropdownMenuContent align="start" side="right">
                  <DropdownMenuItem onClick={() => setEditing({ kind: "folder", id: folder.id, value: folder.name })}>
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCustomizing(folder)}>Project settings</DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      router.push(`/projects/${folder.id}`);
                      onNavigate?.();
                    }}
                  >
                    Project home
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void setFolderPinned(userId, folder.id, !folder.pinnedAt).then(refresh)}>
                    {folder.pinnedAt ? "Unpin project" : "Pin project"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void removeFolder(folder)} variant="destructive">
                    Delete project
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
        <Reveal open={isOpen}>
          {children.map((child) => folderRow(child, depth + 1))}
          {revealed.map((canvas) => canvasRow(canvas, depth + 1))}
          {hidden > 0 ? (
            <li>
              <button
                className="flex h-[var(--nav-row-height)] w-full items-center rounded-[var(--nav-row-radius)] border border-transparent text-left text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary) transition-colors duration-100 ease-out hover:bg-(--ui-control-hover-background) hover:text-foreground hover:transition-none"
                onClick={() => setShowAll((was) => new Set(was).add(folder.id))}
                style={{ paddingLeft: `calc(var(--nav-row-pad-x) - 1px + ${(depth + 1) * 26}px)` }}
                type="button"
              >
                Show more
              </button>
            </li>
          ) : null}
          {children.length === 0 && contents.length === 0 ? (
            <li
              className="h-7 content-center truncate text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)"
              style={{ paddingLeft: `calc(var(--nav-row-pad-x) + ${(depth + 1) * 26}px)` }}
            >
              Empty
            </li>
          ) : null}
        </Reveal>
      </li>
    );
  };

  // 🔴🔴 THREE NAMED GROUPS, NOT ONE RUN OF ROWS (owner 2026-08-24: *"use the ChatGPT sidebar, how
  // it organizes the chats and projects and folders so that we can do the same in the sidebar for
  // nemesis"*). The rows were already ordered pinned → folders → recents, but under a single
  // "Canvases" header — so the ordering was a rule only the code knew. Nothing on screen said the
  // top rows were pinned, and a folder sat in the same undifferentiated column as a canvas.
  // Measured off the reference the same day: `Pinned`, `Projects`, `Chats`, each a quiet grey
  // label over its own rows, which is what makes the order legible instead of merely present.
  //
  // 🔴🔴 THE SECOND HALF OF THAT PARAGRAPH USED TO READ "a folder is a folder here… copying its
  // vocabulary would rename the product's objects after another product's", AND THE OWNER REVERSED
  // IT ON 2026-08-26: *"the projects in Sidebar are still called folders, and not projects."* The
  // argument was sound and the premise was wrong — "project" is not the reference's word borrowed,
  // it is already NEMESIS's word. There is a `Projects` row in the nav above this list, a
  // `/projects` route, and a `ProjectsPage` that has said "Projects" since it shipped. This header
  // was the one surface still calling the same object a folder, so the product had two names for
  // one thing and the learner met both in the same sidebar.
  //
  // 🔴 THE COPY MOVED; THE DATA LAYER DID NOT. `Folder`, `folderId`, `createFolder` and the
  // `canvas_folders` table keep their names — a rename that reached the schema would be a migration
  // and a week of churn to change a word nobody sees. The line is: everything a learner READS says
  // project, everything the code CALLS ITSELF stays folder, and this comment is why.
  const isEmpty = canvases.length === 0 && folders.length === 0;

  const newFolderButton = (
    <button
      aria-label="New project"
      className="grid size-6 place-items-center rounded-md text-(--ui-text-tertiary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground focus-visible:opacity-100 group-hover/section:opacity-100"
      onClick={() => void newFolder()}
      title="New project"
      type="button"
    >
      <Codicon name="new-folder" size="0.875rem" />
    </button>
  );

  return (
    <SidebarGroup className="flex min-h-0 flex-1 flex-col p-0 pt-1">
      <div className={cn("min-h-0 flex-1 pb-2", SCROLL_Y)}>
        {isEmpty ? (
          <div className="grid min-h-16 place-items-center rounded-lg px-2 text-center text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
            Your canvases will gather here.
          </div>
        ) : (
          <>
            {/* 🔴 EVERY SECTION HEADER COLLAPSES — the owner's 2026-08-30 report named this
                exactly ("the canvases or projects or pinned things being collapsable"), and the
                reference's Pinned/Projects/Chats headers are all buttons with a hover caret.
                Collapse hides the ROWS, never the header, and the state persists the same way
                `openFolders` does (stored closed-set, so new sections default open). */}
            {/* Pinned only exists when something is pinned — an empty "Pinned" header would be a
                heading over nothing, which reads as a list that failed to load. Pinned PROJECTS
                come first (the reference's own order: its pinned project sits above its pinned
                chat), then pinned canvases; both render their ordinary rows, so a pinned project
                still expands in place. */}
            {pinned.length > 0 || pinnedFolders.length > 0 ? (
              <>
                <SidebarSectionHeader
                  label="Pinned"
                  onToggle={() => toggleSection("pinned")}
                  open={!closedSections.has("pinned")}
                />
                <Reveal open={!closedSections.has("pinned")}>
                  {pinnedFolders.map((folder) => folderRow(folder, 0))}
                  {pinned.map((canvas) => canvasRow(canvas, 0))}
                </Reveal>
              </>
            ) : null}

            {/* 🔴 PROJECTS ALWAYS SHOWS, BECAUSE IT CARRIES THE ONLY WAY TO MAKE ONE. Hiding the
                header until a project exists would hide the button that creates the first one, and
                a learner with every canvas already filed would have no way back to it. */}
            <SidebarSectionHeader
              action={newFolderButton}
              className={pinned.length > 0 || pinnedFolders.length > 0 ? "pt-4" : undefined}
              label="Projects"
              onToggle={() => toggleSection("projects")}
              open={!closedSections.has("projects")}
            />
            <Reveal open={!closedSections.has("projects")}>
              {rootFolders.length > 0 ? (
                rootFolders.map((folder) => folderRow(folder, 0))
              ) : (
                <li className="h-7 content-center px-[var(--nav-row-pad-x)] text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
                  None yet.
                </li>
              )}
            </Reveal>

            {unfiled.length > 0 ? (
              <>
                <SidebarSectionHeader
                  className="pt-4"
                  label="Canvases"
                  onToggle={() => toggleSection("canvases")}
                  open={!closedSections.has("canvases")}
                />
                <Reveal open={!closedSections.has("canvases")}>
                  {unfiled.map((canvas) => canvasRow(canvas, 0))}
                </Reveal>
              </>
            ) : null}
          </>
        )}
      </div>
      <ProjectCustomizeDialog
        folder={customizing}
        onClose={() => setCustomizing(null)}
        onSaved={() => void refresh()}
        userId={userId}
      />
    </SidebarGroup>
  );
}
