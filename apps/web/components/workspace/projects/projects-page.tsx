"use client";

// Projects — every folder the learner has, on one page.
//
// 🔴🔴 2026-09-04: THE PAGE WEARS THE SHARED FRAME (`shell/page-frame.tsx`). The owner's
// sequence that day: the shelf pages "looked too much like ChatGPT"; Codex moved this page to
// Claude-style cards; then, pointing at gemini.google.com/library, "maybe something similar to
// this"; then "make sure spacing is consistent across projects, library, and apps pages". So
// the title row, the column, the round buttons and the soft rows are the frame's, measured off
// Gemini and documented there, and a project is one soft row in a two-across grid — the same
// 89px band a deck is on the Library, wearing the learner's own icon and colour for the project.
//
// 🔴 THE PROJECT'S OWN MARK IS BACK. The card version dropped it; the sidebar row and the
// project's page both draw it, and a page that shows the same project without it is the one
// place it looks like somebody else's.
//
// 🔴 NO FILTER PILLS — owner 2026-09-04: "remove the pinned for projects". A lone "All" filters
// nothing, so the row went with it. The pin itself survives in the row's menu because the
// sidebar still orders by it.
//
// 🔴🔴 EVERY SPACING VALUE HERE IS IN PIXELS, AND `px-4` IS NOT 16px IN THIS APP. `globals.css`
// sets `html { font-size: 112.5% }`, so one rem is EIGHTEEN pixels and every rem-based Tailwind
// utility is 12.5% bigger than its name says. The frame writes its numbers in px for that reason.

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
import { ProjectCreateDialog } from "@/components/workspace/shell/project-create-dialog";
import {
  FRAME_BUTTON_FILL,
  FRAME_ROW_GAP_PX,
  FRAME_ROW_H_PX,
  FRAME_SECTION_GAP_PX,
  PageFrame,
  PageTitle,
  RoundButton,
  RowIcon,
  RowText,
  SOFT_ROW,
} from "@/components/workspace/shell/page-frame";
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
import { projectFolders } from "@/lib/learn/project-folders";
import { buildProjects, visibleProjects, type ProjectNode } from "./projects-model";
import { cn } from "@/lib/utils";

// ── The measured frame ───────────────────────────────────────────────────────────────────────
// One block, at the top, because these numbers are the specification. Read them here and the
// whole page is legible; scatter them through the JSX and the next person has to reverse the
// layout out of Tailwind classes to find out what was measured and what was invented.

/** Two rows across the frame's 760: (760 - 8) / 2 = 376 each. */
const ACROSS = 2;

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
  const [query, setQuery] = useState("");
  /** Whether the round magnifier has opened into a field. Closes again when emptied and left. */
  const [searching, setSearching] = useState(false);
  /** The draft name of a project being created, or null when none is. */
  /**
   * 🔴🔴 A DIALOG, AND THE OWNER NAMED THE REFERENCE. 2026-09-04: *"creating a new project in the
   * project page should work like in chatgpt https://chatgpt.com/projects."* Driven there the same
   * day: their "New" pill opens the SAME "Create project" modal the sidebar's row opens — 512 x 264,
   * a named field with a glyph in its left inset, a line saying what a project is, and a primary
   * button that stays disabled until the field has something in it.
   *
   * 🔴 SO THIS PAGE REUSES `ProjectCreateDialog` RATHER THAN GROWING A SECOND ONE. It was built
   * against those measurements in #1107 for the sidebar; two doors to one object that look
   * different is the exact split that dialog was created to end.
   *
   * 🔴 WHAT STOOD HERE WAS AN INPUT IN THE TABLE, with three exits meaning different things: Enter
   * created, Escape cancelled, and clicking anywhere else ALSO created. The Library had the same
   * row and lost it for the same reason (#1134).
   */
  const [creating, setCreating] = useState(false);
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
    // 🔴 PROJECTS ONLY. A folder made on the Library is a place to file documents, not a
    //    project (owner 2026-09-04). See lib/learn/project-folders.ts.
    setFolders([...projectFolders(nextFolders)]);
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
  const shown = useMemo(() => visibleProjects(projects, "all", query), [projects, query]);

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
   * 🔴 IT REPORTS THE NEW PROJECT'S ID, and the dialog stays open when there is none. The inline row
   * this replaced could not: it had already removed itself by the time the database answered, so a
   * refusal left the learner looking at a list with no new project in it and nothing said.
   *
   * A refused create leaves the list alone: `createFolder` returns null when the database says no
   * (the two-level depth trigger raises rather than nesting deeper), and a row for a folder that
   * does not exist is somewhere to file things that vanishes on the next reload.
   */
  const addProject = useCallback(
    async (raw: string, icon: string | null): Promise<string | null> => {
      const name = raw.trim();
      if (!name) return null;
      const made = await createFolder(userId, name, null, icon);
      if (!made) return null;
      await refresh();
      return made.id;
    },
    [refresh, userId],
  );

  const emptyMessage = !loaded
    ? // Plain and quiet: a spinner over a list that usually arrives in one frame is more motion
      // than information.
      "Loading…"
    : projects.length === 0
      ? "No projects yet. Make one to gather canvases that belong together."
      : "No projects match that search.";

  const searchControl = searching ? (
    <label className="relative flex h-[40px] w-[240px] items-center">
      <Search aria-hidden className="pointer-events-none absolute left-[14px] text-(--ui-text-secondary)" size={16} strokeWidth={1.8} />
      <input
        aria-label="Search projects"
        autoFocus
        className={cn("h-full w-full rounded-full pr-[14px] pl-[40px] text-[14px] text-(--ui-text-primary) placeholder:text-(--ui-text-tertiary) focus:outline-none", FRAME_BUTTON_FILL)}
        onBlur={() => { if (query === "") setSearching(false); }}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search projects"
        type="text"
        value={query}
      />
    </label>
  ) : (
    <RoundButton label="Search projects" onClick={() => setSearching(true)}>
      <Search size={18} strokeWidth={1.8} />
    </RoundButton>
  );

  return (
    <PageFrame>
      <PageTitle
        controls={
          <>
            {searchControl}
            {/* 🔴 THE ONE MAKER ON THE PAGE, in the frame's round-button grammar rather than a
                filled pill: the reference puts every control on this row in a 40px circle. */}
            <RoundButton label="New project" onClick={() => setCreating(true)}>
              <Plus size={20} strokeWidth={1.8} />
            </RoundButton>
          </>
        }
      >
        Projects
      </PageTitle>

      {/* Two rows across, on the frame's 8px gap both ways; the first row sits where a section
          would begin, 24px under the title row, so the page keeps the Library's rhythm without a
          heading it has no need of. */}
      <ul
        className="grid"
        style={{ gap: FRAME_ROW_GAP_PX, gridTemplateColumns: `repeat(${ACROSS}, minmax(0, 1fr))`, marginTop: FRAME_SECTION_GAP_PX }}
      >
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

      {shown.length === 0 && (
        <p className="px-[20px] pt-[16px] text-[14px] leading-[20px] text-(--ui-text-secondary)">{emptyMessage}</p>
      )}
      <ProjectCreateDialog onCreate={addProject} onOpenChange={setCreating} open={creating} />
      <ProjectCustomizeDialog
        folder={customizing}
        onClose={() => setCustomizing(null)}
        onSaved={() => void refresh()}
        userId={userId}
      />
    </PageFrame>
  );
}

/**
 * One project: a soft row. Clicking it goes to the project's own page, `/projects/<id>`.
 *
 * 🔴 A NESTED SUB-PROJECT HAS NO ROW HERE, AND THAT IS A DELIBERATE, NARROW GAP. `projects-model`
 * still rolls a sub-project's canvases up into its parent's date and pin; the sidebar keeps its
 * own expand/collapse at every depth, so a nested project is reachable there exactly as before.
 *
 * 🔴🔴 THE ROW IS A LIST ITEM HOLDING A BUTTON AND A MENU, NOT A BUTTON HOLDING A MENU — a menu
 * trigger inside a button is a button inside a button. The press covers the whole row; the ⋯
 * floats at the right padding and is the only thing on the row that is not the press.
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
    <li className={cn("group/row min-w-0", SOFT_ROW)} style={{ minHeight: FRAME_ROW_H_PX }}>
      <button
        className="absolute inset-0 flex items-start gap-[16px] rounded-[28px] p-[20px] pr-[72px] text-left"
        onClick={() => onOpen(project.id)}
        type="button"
      >
        {/* The project's own mark, matching its sidebar row and its page header: the learner's
            chosen glyph in the learner's chosen colour, a plain folder otherwise. */}
        <RowIcon>
          <Codicon aria-hidden name={project.icon ?? "folder"} size="22px" style={projectTint(project)} />
        </RowIcon>
        <RowText meta={modified(project.modifiedAt) || "Nothing in it yet"} title={project.name} />
      </button>
      <span className="absolute top-1/2 right-[20px] -translate-y-1/2">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`${project.name} options`}
            className={cn(
              "flex size-[40px] items-center justify-center rounded-full text-(--ui-text-primary) opacity-0 transition-[background-color,color,opacity] group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
              FRAME_BUTTON_FILL,
            )}
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
      </span>
    </li>
  );
}
