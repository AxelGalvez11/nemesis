"use client";

// Projects — every folder the learner has, on one page.
//
// 🔴 DRAWN TO A MEASUREMENT, NOT TO A MEMORY OF THE REFERENCE. The owner's acceptance condition
// for this page was "pixel, sizing, spacing and colouring 1 to 1" with ChatGPT's Projects page,
// so every number in the block below was read off the live signed-in app at a 1456px viewport
// (scratchpad/ref/chatgpt-reference.md, 2026-08-26) with `getComputedStyle` /
// `getBoundingClientRect`. Nothing here is an eyeballed approximation, and a number changed
// without a new measurement is a regression even when it looks fine.
//
// 🔴 WHERE A NEMESIS TOKEN ALREADY *IS* THE REFERENCE VALUE, THE TOKEN WINS. Our light theme was
// calibrated against the same app in August: `--theme-foreground` is `#0d0d0d`, which is the
// reference's `--text-primary` exactly, and `--ui-bg-sidebar` resolves to `#fcfcfc`, which is its
// `--component-sidebar-bg` exactly. Using the token keeps the page inside the theme system (dark
// mode, the accent picker) instead of freezing one rendering of it into this file. Literals appear
// only where we genuinely have no token for the measured value — the `#f3f3f3` selected pill and
// the 5%-black divider — and each says so.
//
// 🔴🔴 EVERY SPACING VALUE HERE IS IN PIXELS, AND `px-4` IS NOT 16px IN THIS APP. `globals.css`
// sets `html { font-size: 112.5% }`, so one rem is EIGHTEEN pixels and every rem-based Tailwind
// class is 12.5% larger than its name: `px-4` measured 0px 18px against the reference's
// `0px 16px`, and `gap-3` is 13.5px rather than 12. That is a two-pixel error per pill that no
// one would ever spot by eye, on a page whose whole acceptance condition is not making it.
// `globals.css` says it outright: *"WRITE THESE IN PX, NEVER REM"*. So does this file's test.
//
// 🔴 DARK MODE FOLLOWS *OUR* DARK, NOT THE REFERENCE'S. The reference paints its page `#181818`;
// ours is pure black by an explicit owner decision ("bring back the 100% black background",
// 2026-08-05, desktop-ui.css). Copying `#181818` here would put one page on a different ground
// from every other screen in the product, which is a worse failure than a 1:1 miss. What the
// literals below do carry across is the reference's dark *relationships* — the 5% divider, the
// 10% row hover, the `#414141` selected pill.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus, Search } from "lucide-react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { projectTint } from "@/lib/learn/project-look";
import { useConfirm } from "@/components/desktop-ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { ProjectCustomizeDialog } from "@/components/workspace/shell/project-customize-dialog";
import {
  CANVASES_CHANGED_EVENT,
  createFolder,
  deleteFolder,
  listCanvases,
  listFolders,
  setFolderPinned,
  type CanvasSummary,
  type Folder,
} from "@/lib/learn/canvas-store";
import { buildProjects, visibleProjects, type ProjectFilter, type ProjectNode } from "./projects-model";
import { cn } from "@/lib/utils";

// ── The measured frame ───────────────────────────────────────────────────────────────────────
// One block, at the top, because these numbers are the specification. Read them here and the
// whole page is legible; scatter them through the JSX and the next person has to reverse the
// layout out of Tailwind classes to find out what was measured and what was invented.

/** Content column, horizontally centred in whatever the sidebar leaves. Reference: 768px. */
const COLUMN_PX = 768;
/** Every control on the title row, and every filter pill. Reference: 36px. */
const CONTROL_H_PX = 36;
/** The title's own line box. Reference: 28px type on a 34px line, weight 500. */
const TITLE_LINE_PX = 34;
/** Top of the `<h1>` in the viewport. Reference: y=116. */
const TITLE_TOP_PX = 116;
/** Top of the filter pills. Reference: y=204, i.e. exactly 88px below the title's top. */
const PILLS_TOP_PX = 204;
/** A list row. Reference: 60px tall. */
const ROW_H_PX = 60;
/** A row's padding. Reference: `10px 8px 10px 0` — nothing on the left, the divider does the work. */
const ROW_PAD_Y_PX = 10;
const ROW_PAD_RIGHT_PX = 8;
/**
 * The 20x20 leading icon and the 12px gap after it, and the 32px lead those two make together.
 *
 * 🔴 ONE 32, TWO JOBS, AND THEY ARE THE SAME 32 BY CONSTRUCTION. It is what a nested row indents
 * by, AND it is the lead in front of the Name column on every row and on the column headings.
 * They were briefly two different numbers modelled from two different sides — a lead BEFORE the
 * Name column on the Library page, a gap AFTER it here — which produced identical rows and a
 * column heading in the wrong place. See NAME_W_PX.
 */
const ICON_PX = 20;
const ICON_GAP_PX = 12;
const INDENT_PX = ICON_PX + ICON_GAP_PX;
/** The search field. Reference: 240px on the Library, 240-280px on Plugins; take the low end. */
const SEARCH_W_PX = 240;
/** The Modified column. Reference: the Library's own Modified cell measured 160px. */
const MODIFIED_W_PX = 160;
/**
 * The Name column: 368px wide, starting AFTER the icon's 32px lead.
 *
 * 🔴🔴 THE COLUMNS PACK FROM THE LEFT AND STOP — THEY ARE NOT RIGHT-ALIGNED, and the reference's
 * own Library measurements are what settle it. Its cells are Name 368 / Modified 160 / Size 88,
 * and at the SAME 768px column this page uses the row accounts exactly:
 *
 *     32 lead + 616 cells + 112 empty tail + 8 right padding = 768
 *
 * 112px of every Library row is deliberately empty at the right-hand end, which a right-aligned
 * Modified cannot produce. So the reference's list packs its cells from the left edge and stops.
 * (616, not 632: Size's `padding-left:16px` is already inside its 88 — measured on both pages as
 * one 88px box with the inset within it. Adding the 16 again double-counts it.)
 *
 * Projects is that list minus Size, which means Name and Modified keep the positions they hold on
 * Library and the trailing space grows — it does not mean the date slides to the right margin.
 * This page DID slide it there until it was measured beside the Library page in the same browser:
 * Library put Modified's left edge 400px into the column and Projects put it at 600px, so the
 * date column jumped 200px when a learner moved between two pages built the same week.
 *
 * 🔴🔴🔴 AND THE ICON SITS OUTSIDE THIS COLUMN, WHICH IS THE HALF THAT WAS STILL WRONG AFTER THE
 * DATES LINED UP. The reference publishes `Name 368` and, separately, "leading icon 20x20, then a
 * gap to the name", and never says whether the 368 includes the icon. Both readings satisfy every
 * published width, so the reference cannot decide it — but one of them is checkable without the
 * reference at all: the column heading has to sit over the text it names. With the icon INSIDE
 * the cell, this page drew "Name" at x=370 over a column of folder icons while the names it
 * labelled began at x=402, and it also gave every name 336px before truncating where the Library
 * gave 368. Icon outside: heading and names both start at 402, and both pages truncate alike.
 */
const NAME_W_PX = 368;
/** The column headings strip above the list. Reference: 20px tall, 14px/400 `--text-secondary`. */
const HEADINGS_H_PX = 20;

/**
 * 🔴 THE TITLE ROW STARTS ONE PIXEL ABOVE THE TITLE. The measurement is of the `<h1>`, and the h1
 * is centred inside a 36px row of controls while being 34px tall — so the row has to start one
 * pixel higher for the title itself to land on y=116. Written as arithmetic rather than as `115`
 * so a future change to either height keeps the measured fact true.
 */
const HEADER_TOP_PX = TITLE_TOP_PX - (CONTROL_H_PX - TITLE_LINE_PX) / 2;
/** And the gap under that row that puts the pills on y=204. Same arithmetic, same reason. */
const PILLS_GAP_PX = PILLS_TOP_PX - HEADER_TOP_PX - CONTROL_H_PX;

/**
 * 🔴 THE DIVIDER IS THE ONLY THING SEPARATING TWO ROWS — no card, no box, no shadow (the
 * reference uses no shadow anywhere on this page). It is `--border-light`: black at 5% on
 * paper, white at 5% in the dark. Our nearest token, `--ui-stroke-quaternary`, is 5% of
 * `#0d0d0d` rather than of black; visually identical, but this is the one measurement the
 * owner will check, so it is written the way the reference wrote it.
 */
const DIVIDER = "border-b border-b-black/[0.05] dark:border-b-white/[0.05]";
/** `--interactive-bg-secondary-hover`: 5% black on paper, 10% white in the dark. */
const ROW_HOVER = "hover:bg-black/[0.05] dark:hover:bg-white/[0.10]";
/** 14px/400 name text on `--text-primary`, which our `--ui-text-primary` already equals. */
const NAME_TEXT = "text-[14px] leading-[20px] font-normal text-(--ui-text-primary)";
/** 14px meta text on `--text-secondary`: the column headings and every date. */
const META_TEXT = "text-[14px] leading-[20px] font-normal text-(--ui-text-secondary)";

const FILTERS: readonly { id: ProjectFilter; label: string }[] = [
  { id: "all", label: "All" },
  // 🔴 NOT "Created by you / Shared with you". The reference's two other pills describe sharing,
  // and Nemesis has no sharing — both would be controls that change nothing, which §38 forbids
  // and which is the one way to fail a 1:1 copy while matching it exactly. "Pinned" filters on
  // something the learner really did; see projects-model.ts for what it reads.
  { id: "pinned", label: "Pinned" },
];

/** The box every row shares, so a nested row cannot quietly become a different height. */
function rowBox(indent: number): React.CSSProperties {
  return {
    height: ROW_H_PX,
    paddingBottom: ROW_PAD_Y_PX,
    paddingLeft: indent,
    paddingRight: ROW_PAD_RIGHT_PX,
    paddingTop: ROW_PAD_Y_PX,
  };
}

/**
 * A row's left side: the icon's 32px lead, then the Name column. Two cells, one helper, because
 * four call sites writing these widths by hand is how a list ends up with four column layouts.
 *
 * 🔴 THE NAME CELL'S RIGHT EDGE STAYS AT 402+368 AT EVERY NESTING DEPTH. The row indents with
 * padding, so the cell gives back exactly what the padding took; without that subtraction an
 * opened project would push its children's dates out of the Modified column, one step per level,
 * and the list would read as three ragged columns instead of two.
 */
function NameCells({ children, icon, indent }: { children: React.ReactNode; icon?: React.ReactNode; indent: number }) {
  return (
    <>
      {/* 20px of icon and 12px of gap, held open whether or not this row draws a glyph. */}
      <span className="flex shrink-0 items-center" style={{ height: ICON_PX, width: INDENT_PX }}>
        {icon}
      </span>
      <span className="flex min-w-0 shrink-0 items-center" style={{ width: NAME_W_PX - indent }}>
        {children}
      </span>
    </>
  );
}

/** How a date reads in the Modified column. Same shape the Library uses, so the two agree. */
function modified(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/**
 * Rows supplied by the dev-preview harness instead of by the database.
 *
 * 🔴 IT SUBSTITUTES THE ROWS, NOT THE COMPONENT — the same rule `/dev-preview/library` states in
 * its own header. Everything below this line renders identically whether the folders arrived from
 * Supabase or from the harness, because a measurement taken against a differently-assembled
 * surface would prove nothing about the real one. The preview also makes no network call at all,
 * which is the second half of that harness's contract.
 */
export interface ProjectsPreview {
  readonly folders: readonly Folder[];
  readonly canvases: readonly CanvasSummary[];
}

export function ProjectsPage({ preview, userId }: { preview?: ProjectsPreview; userId: string | null }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [canvases, setCanvases] = useState<CanvasSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const [query, setQuery] = useState("");
  /** The draft name of a project being created, or null when none is. */
  const [naming, setNaming] = useState<string | null>(null);
  /** The folder whose look/instructions dialog is open — the same dialog the sidebar opens. */
  const [customizing, setCustomizing] = useState<Folder | null>(null);

  const refresh = useCallback(async () => {
    if (preview) {
      setFolders([...preview.folders]);
      setCanvases([...preview.canvases]);
      setLoaded(true);
      return;
    }
    const [nextFolders, nextCanvases] = await Promise.all([listFolders(userId), listCanvases(userId)]);
    setFolders(nextFolders);
    setCanvases(nextCanvases);
    setLoaded(true);
  }, [preview, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 🔴 THE SIDEBAR CAN RENAME AND DELETE THE SAME FOLDERS THIS PAGE IS SHOWING, and it is on
  // screen at the same time. `CANVASES_CHANGED_EVENT` is the store's own broadcast for exactly
  // this; without it the page would quietly keep showing a project the learner just deleted
  // three inches to the left.
  useEffect(() => {
    const onChanged = () => void refresh();
    window.addEventListener(CANVASES_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CANVASES_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const projects = useMemo(() => buildProjects(folders, canvases), [canvases, folders]);
  const shown = useMemo(() => visibleProjects(projects, filter, query), [filter, projects, query]);

  /** Same copy the sidebar's delete uses — the row's canvases survive, and that has to be said. */
  const removeProject = useCallback(
    async (project: ProjectNode) => {
      const sure = await confirm({
        body:
          project.children.length > 0
            ? `Its canvases are kept — they go back to Unfiled — but the projects nested inside "${project.name}" are deleted with it.`
            : `Its canvases are kept — they go back to Unfiled.`,
        confirmLabel: "Delete project",
        title: `Delete "${project.name}"?`,
      });
      if (!sure) return;
      await deleteFolder(userId, project.id);
      void refresh();
    },
    [confirm, refresh, userId],
  );

  /**
   * 🔴 THE NAME IS AN ARGUMENT, NOT READ FROM STATE. Enter commits and blur commits, and Escape
   * has to cancel the blur it causes itself — the Library learned this the hard way (see
   * `addFolder` there): a handler that closes over `naming` still holds the text after Escape
   * cleared it, and creates the folder anyway on the way out. Taking the value from the event
   * means Escape can simply empty the input, and an empty name is already a no-op.
   */
  const addProject = useCallback(
    async (raw: string) => {
      const name = raw.trim();
      setNaming(null);
      if (!name) return;
      // A refused create leaves the list alone: `createFolder` returns null when the database says
      // no (the two-level depth trigger raises rather than nesting deeper), and a row for a folder
      // that does not exist is somewhere to file things that vanishes on the next reload.
      const made = await createFolder(userId, name);
      if (made) await refresh();
    },
    [refresh, userId],
  );

  const emptyMessage = !loaded
    ? // Plain and quiet: a spinner over a list that usually arrives in one frame is more motion
      // than information.
      "Loading…"
    : projects.length === 0
      ? "No projects yet. Make one to gather canvases that belong together."
      : query.trim()
        ? "No projects match that search."
        : "Nothing pinned in a project yet.";

  return (
    <main className="scrollbar-dt h-full overflow-x-hidden overflow-y-auto overscroll-contain bg-(--ui-bg-sidebar)">
      {/* The column is centred in what the sidebar leaves, and the padding only ever bites on a
          viewport too narrow to hold it — at the reference's 1456px there is slack on both sides
          and the column is exactly 768px. */}
      <div className="flex justify-center px-[24px] pb-[96px]">
        <div className="w-full" style={{ maxWidth: COLUMN_PX, paddingTop: HEADER_TOP_PX }}>
          <header className="flex items-center gap-[12px]" style={{ height: CONTROL_H_PX }}>
            <h1
              className="min-w-0 flex-1 truncate text-[28px] font-medium text-(--ui-text-primary)"
              style={{ lineHeight: `${TITLE_LINE_PX}px` }}
            >
              Projects
            </h1>

            {/* 🔴 THE REFERENCE PUBLISHES THE SEARCH FIELD'S SIZE AND SHAPE BUT NOT ITS FILL.
                So: no fill, and the one border token it does publish — `--border-default`, black
                at 10% on paper and white at 15% in the dark. A guessed fill would have been the
                only unmeasured colour on the page. */}
            <label className="relative shrink-0" style={{ height: CONTROL_H_PX, width: SEARCH_W_PX }}>
              <span className="sr-only">Search projects</span>
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-[12px] -translate-y-1/2 text-(--ui-text-secondary)"
                size={16}
                strokeWidth={1.8}
              />
              <input
                className="h-full w-full rounded-full border border-black/[0.10] bg-transparent pr-[12px] pl-[36px] text-[14px] text-(--ui-text-primary) placeholder:text-(--ui-text-secondary) focus:outline-none dark:border-white/[0.15]"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search projects"
                type="text"
                value={query}
              />
            </label>

            {/* 🔴 `--ui-action`, NOT THE REFERENCE'S `#0d0d0d`. The two are three units apart and
                indistinguishable on screen, but `--ui-action` is the product's accent — the owner
                ruled 2026-08-23 that the send button and the mascot follow one colour, and the
                Settings picker writes this token. A literal here would be the one button in the
                app that ignores the learner's chosen accent. */}
            <button
              className="flex shrink-0 items-center gap-[6px] rounded-full bg-(--ui-action) px-[16px] text-[14px] font-medium text-(--ui-action-glyph) transition-opacity hover:opacity-80"
              onClick={() => setNaming("")}
              style={{ height: CONTROL_H_PX }}
              type="button"
            >
              <Plus size={16} strokeWidth={2} />
              New
            </button>
          </header>

          {/* Filter pills: 36px tall, `0 16px`, rounded full, 14px/500 on a 20px line. */}
          <div className="flex items-center gap-[8px]" style={{ marginTop: PILLS_GAP_PX }}>
            {FILTERS.map((option) => (
              <button
                aria-pressed={filter === option.id}
                className={cn(
                  "rounded-full px-[16px] text-[14px] leading-[20px] font-medium transition-colors",
                  filter === option.id
                    ? // 🔴 `--bg-tertiary` = `#f3f3f3` light / `#414141` dark, MEASURED. We have no
                      // token for it: `--ui-bg-tertiary` resolves near `#e2e2e2` here because it
                      // blends the accent in, which is a visibly darker pill than the reference's.
                      "bg-[#f3f3f3] text-(--ui-text-primary) dark:bg-[#414141]"
                    : // The reference does not publish a hover for the unselected pill, so it
                      // borrows the one it DOES publish for secondary interactive surfaces —
                      // `--interactive-bg-secondary-hover`, the same value the rows use. A pill
                      // that does not answer the pointer on a page whose rows do reads as disabled.
                      cn("bg-transparent text-(--ui-text-secondary)", ROW_HOVER),
                )}
                key={option.id}
                onClick={() => setFilter(option.id)}
                style={{ height: CONTROL_H_PX }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* 🔴 THE HEADINGS RUN THROUGH THE ROWS' OWN CELLS, INCLUDING THE ICON'S EMPTY LEAD.
              Skipping the lead is what put "Name" over a column of folder icons while the names
              it labels began 32px further right — a heading that is not above its own column. */}
          <div
            className={cn("mt-[24px] flex items-center", META_TEXT)}
            style={{ height: HEADINGS_H_PX, paddingLeft: 0, paddingRight: ROW_PAD_RIGHT_PX }}
          >
            <span aria-hidden className="shrink-0" style={{ width: INDENT_PX }} />
            <span className="shrink-0" style={{ width: NAME_W_PX }}>
              Name
            </span>
            <span className="shrink-0" style={{ width: MODIFIED_W_PX }}>
              Modified
            </span>
          </div>

          <ul className="flex flex-col">
            {naming !== null && (
              <li className={cn("flex items-center", DIVIDER)} style={rowBox(0)}>
                <NameCells
                  icon={
                    <Codicon
                      aria-hidden
                      className="shrink-0 text-(--ui-text-secondary)"
                      name="folder"
                      size={`${ICON_PX}px`}
                    />
                  }
                  indent={0}
                >
                  <input
                    aria-label="Name the new project"
                    autoFocus
                    className={cn("min-w-0 flex-1 bg-transparent outline-none", NAME_TEXT)}
                    maxLength={120}
                    onBlur={(event) => void addProject(event.currentTarget.value)}
                    onChange={(event) => setNaming(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void addProject(event.currentTarget.value);
                      if (event.key === "Escape") {
                        // Empty the DOM node, not the state: whatever blur follows reads the node.
                        event.currentTarget.value = "";
                        setNaming(null);
                      }
                    }}
                    placeholder="Project name"
                    value={naming}
                  />
                </NameCells>
              </li>
            )}

            {shown.map((project) => (
              <ProjectRow
                key={project.id}
                onCustomize={() =>
                  setCustomizing({
                    color: project.color,
                    icon: project.icon,
                    id: project.id,
                    instructions: project.instructions,
                    name: project.name,
                    parentId: null,
                  })
                }
                onDelete={() => void removeProject(project)}
                onOpen={(id) => router.push(`/projects/${id}`)}
                onPin={() => void setFolderPinned(userId, project.id, !project.pinnedAt)}
                project={project}
              />
            ))}
          </ul>

          {shown.length === 0 && naming === null && (
            <p className={cn("pt-[16px]", META_TEXT)} style={{ paddingRight: ROW_PAD_RIGHT_PX }}>
              {emptyMessage}
            </p>
          )}
        </div>
      </div>
      <ProjectCustomizeDialog
        folder={customizing}
        onClose={() => setCustomizing(null)}
        onSaved={() => void refresh()}
        userId={userId}
      />
    </main>
  );
}

/**
 * One project. Clicking it goes to the project's own page — `/projects/<id>` — the way clicking
 * a ChatGPT project row does.
 *
 * 🔴 IT USED TO OPEN IN PLACE, "BECAUSE THERE WAS NOWHERE ELSE TO SEND IT." That was true until
 * `project-page.tsx` existed. Now there is somewhere else to send it, and a row that both expanded
 * AND navigated would be two different meanings for one click — the reference's own row only ever
 * does the second. See `project-page.tsx` for what the destination shows.
 *
 * 🔴 A NESTED SUB-PROJECT LOSES ITS INLINE ROW HERE, AND THAT IS A DELIBERATE, NARROW GAP, NOT AN
 * OVERSIGHT. `projects-model.ts` still rolls a sub-project's canvases up into its parent's
 * Modified date and Pinned status — nothing about search or sorting changed — only the ONE THING
 * that used to reveal a sub-project's own row on THIS page is gone. It is not stranded: the
 * sidebar (`sidebar-canvases.tsx`) keeps its own, independent expand/collapse at every depth, so a
 * project nested inside another is still reachable there today, exactly as it was before this
 * change. What it does NOT get from this page is a click-through to ITS OWN `/projects/<id>` —
 * ChatGPT has no nested projects to have measured that behaviour from, so nothing here invents one.
 */
function ProjectRow({
  onCustomize,
  onDelete,
  onOpen,
  onPin,
  project,
}: {
  onCustomize: () => void;
  onDelete: () => void;
  onOpen: (id: string) => void;
  onPin: () => void;
  project: ProjectNode;
}) {
  return (
    <li className="group/row relative">
      <button
        className={cn("flex w-full items-center text-left transition-colors", DIVIDER, ROW_HOVER)}
        onClick={() => onOpen(project.id)}
        style={rowBox(0)}
        type="button"
      >
        <NameCells
          // 🔴 THE PROJECT'S OWN MARK, matching its sidebar row and its page header: the learner's
          // chosen glyph in the learner's chosen colour, a plain folder otherwise.
          icon={
            <Codicon
              aria-hidden
              className={cn("shrink-0", !project.color && "text-(--ui-text-secondary)")}
              name={project.icon ?? "folder"}
              size={`${ICON_PX}px`}
              style={projectTint(project)}
            />
          }
          indent={0}
        >
          <span className={cn("min-w-0 flex-1 truncate", NAME_TEXT)}>{project.name}</span>
        </NameCells>
        <span className={cn("shrink-0", META_TEXT)} style={{ width: MODIFIED_W_PX }}>
          {modified(project.modifiedAt)}
        </span>
      </button>
      {/* The row's own ⋯, in the trailing space the row already reserves — the same actions the
          sidebar's project menu carries, minus the ones that only mean something over there. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${project.name} options`}
          className="absolute top-1/2 right-[8px] flex size-[28px] -translate-y-1/2 items-center justify-center rounded-lg text-(--ui-text-secondary) opacity-0 transition-opacity hover:bg-black/[0.05] hover:text-(--ui-text-primary) focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100 dark:hover:bg-white/[0.10]"
        >
          <MoreHorizontal aria-hidden size={18} strokeWidth={1.8} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onCustomize}>Project settings</DropdownMenuItem>
          <DropdownMenuItem onClick={onPin}>{project.pinnedAt ? "Unpin project" : "Pin project"}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} variant="destructive">
            Delete project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
