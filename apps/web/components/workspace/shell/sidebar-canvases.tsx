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
import { projectTint } from "@/lib/learn/project-look";
import { ProjectCreateDialog } from "./project-create-dialog";
import { ProjectCustomizeDialog } from "./project-customize-dialog";
import { useAuth } from "@/components/AuthProvider";
import {
  CANVASES_CHANGED_EVENT,
  readCanvasesChangedDetail,
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
import { cn } from "@/lib/utils";

import {
  SCROLL_Y,
  SidebarGroup,
  SidebarSectionHeader,
} from "./sidebar-primitives";
import { SidebarBoards } from "./sidebar-boards";

/** Coalesces the autosave storm: a streaming answer saves the canvas every few seconds and
 *  each save broadcasts; one trailing re-read covers a whole burst. */
const REFRESH_DEBOUNCE_MS = 1200;
/** A window focus re-reads the list only when the last read is older than this. */
const FOCUS_STALE_MS = 60_000;

/** The order listCanvases returns: pinned first (latest pin first), then most recently updated. */
function sortCanvasSummaries(rows: CanvasSummary[]): CanvasSummary[] {
  return rows.slice().sort((a, b) => {
    const pinA = a.pinnedAt ?? "";
    const pinB = b.pinnedAt ?? "";
    if (pinA !== pinB) {
      if (!pinA) return 1;
      if (!pinB) return -1;
      return pinB.localeCompare(pinA);
    }
    return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  });
}

const OPEN_FOLDERS_KEY = "nemesis.sidebar.canvases.v1.openFolders";
const CLOSED_SECTIONS_KEY = "nemesis.sidebar.canvases.v1.closedSections";


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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ kind: "canvas" | "folder"; id: string; value: string } | null>(null);
  /** The project whose look and instructions are being edited, or null. */
  const debounceRef = useRef<number | null>(null);
  /** When the list was last read from the cloud; a window focus re-reads only past FOCUS_STALE_MS. */
  const lastFetchRef = useRef(0);
  /** The listed rows, readable from the event handler without re-subscribing on every change. */
  const canvasesRef = useRef<CanvasSummary[]>([]);
  canvasesRef.current = canvases;

  const refresh = useCallback(async () => {
    if (seed) {
      setCanvases(seed.canvases);
      setFolders(seed.folders);
      return;
    }
    const [nextCanvases, nextFolders] = await Promise.all([listCanvases(userId), listFolders(userId)]);
    lastFetchRef.current = Date.now();
    setCanvases(nextCanvases);
    // 🔴 STILL READ, NO LONGER DRAWN. Projects left the sidebar on 2026-09-07 (see the render), but
    //    `canvas_folders` is untouched and a chat still carries its `folderId`. Holding the rows
    //    means nothing here has to guess whether a folder exists.
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
    const onChanged = (event: Event) => {
      const detail = readCanvasesChangedDetail(event);
      if (detail.kind !== "save" || seed) {
        debounced();
        return;
      }
      // A save of a row already listed: patch it in place and keep the server's order
      // (pinned first, then most recent). A save of an unknown id is a first save, so re-read.
      if (!canvasesRef.current.some((row) => row.id === detail.summary.id)) {
        debounced();
        return;
      }
      setCanvases((rows) => sortCanvasSummaries(rows.map((row) => (row.id === detail.summary.id ? { ...row, ...detail.summary } : row))));
    };
    const onFocus = () => {
      if (Date.now() - lastFetchRef.current > FOCUS_STALE_MS) void refresh();
    };
    window.addEventListener(CANVASES_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onFocus);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      window.removeEventListener(CANVASES_CHANGED_EVENT, onChanged);
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
      title: "Delete this chat?",
      body: `“${canvas.title || "Untitled"}” and its work leave your list. This does not touch anything already in your library.`,
      confirmLabel: "Delete",
    });
    if (!sure) return;
    await deleteCanvas(userId, canvas.id);
    void refresh();
  };

  // Always top level. "New sub-project" sat in the project menu until
  // 2026-09-01, when the owner cut it: "I don't get why that's there. I don't
  // need that." Nesting is not ripped out of the model — the database still
  // caps it at two levels and any folder that already has a parent still draws
  // under it — there is simply no longer a door that makes a new one.
  // 🔴🔴 NOTHING IS WRITTEN UNTIL THE LEARNER PRESSES THE BUTTON, AND THAT IS THE FIX. This used to
  // INSERT a folder literally named "New project" and then open an inline rename on the row. Press
  // Escape, click elsewhere, or change your mind, and a project called "New project" is in the
  // sidebar for good — a real row in a real table nobody asked for. The dialog holds the name until
  // it is confirmed, so a cancelled creation leaves nothing behind.
  //
  // 🔴 THE SAME DIALOG THE COMPOSER'S PICKER OPENS. Two doors to "make a project" that looked
  // nothing alike was the shape the owner flagged on 2026-09-03; one component is what stops them
  // drifting again.
  const pinned = useMemo(() => canvases.filter((c) => c.pinnedAt), [canvases]);
  /** Every chat in one list, most recently worked on first. See the render for why there is only one. */
  const everyChat = useMemo(() => [...canvases].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")), [canvases]);
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
              aria-label={canvas.pinnedAt ? "Unpin chat" : "Pin chat"}
              className="absolute right-[30px] grid size-6 shrink-0 place-items-center rounded-md text-(--ui-text-tertiary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100"
              onClick={() => void setCanvasPinned(userId, canvas.id, !canvas.pinnedAt).then(refresh)}
              title={canvas.pinnedAt ? "Unpin chat" : "Pin chat"}
              type="button"
            >
              <Codicon name={canvas.pinnedAt ? "pinned" : "pin"} size="0.8rem" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Chat actions"
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
                  {canvas.pinnedAt ? "Unpin chat" : "Pin chat"}
                </DropdownMenuItem>
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


  return (
    <SidebarGroup className="flex min-h-0 flex-1 flex-col p-0 pt-1">
      <div className={cn("min-h-0 flex-1 pb-2", SCROLL_Y)}>
        {isEmpty ? (
          <div className="grid min-h-16 place-items-center rounded-lg px-2 text-center text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
            Your chats will gather here.
          </div>
        ) : (
          <>
            {/* 🔴🔴 ONE FLAT LIST, NO PROJECTS, NO PINNED. Owner, 2026-09-07: *"since the canvas is
                going to be like the main feature thing, I would like there to be pretty much no
                more projects … each canvas is supposed to grow, you know, it's like supposed to be
                a long term thing, not just a throwaway canvas like a chat"*, and, asked what the
                list should look like without a Projects page, *"One flat list, newest first"*.
                Filing was an answer to a pile of throwaway conversations; a canvas you keep coming
                back to does not need filing, it needs to be at the top when you last touched it.

                🔴 THE OLD CHATS ARE STILL LISTED, and that is deliberate rather than an oversight.
                Nothing new arrives at /learn any more, but every conversation made before today is
                still real work, and taking the last route to it out of the sidebar would put it
                beyond reach with nobody having asked for that. `canvas_folders` is untouched: the
                rows are still there, they are simply not what the sidebar draws.

                🔴 `Reveal` AND THE COLLAPSE STATE STAY, because one section is still a section and
                a learner with two hundred chats wants to fold them away under the canvases. */}
            <SidebarSectionHeader
              label="Chats"
              onToggle={() => toggleSection("canvases")}
              open={!closedSections.has("canvases")}
            />
            <Reveal open={!closedSections.has("canvases")}>
              {everyChat.map((canvas) => canvasRow(canvas, 0))}
            </Reveal>
          </>
        )}
        {/* 🔴 CANVASES SIT UNDER THE CHATS, IN THE SAME SCROLLER. Owner, 2026-09-03: "the sidebar
            will have chats and canvases together in the left sidebar." A second scroll region would
            split one list into two, so the boards section rides the same column; it always shows,
            because its header carries the only way to make a first board. */}
        <SidebarBoards className={isEmpty ? undefined : "pt-4"} onNavigate={onNavigate} userId={userId} />
      </div>
    </SidebarGroup>
  );
}
