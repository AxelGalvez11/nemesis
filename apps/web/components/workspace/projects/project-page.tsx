"use client";

// A single project's own page — `/projects/<id>` — the destination a row on the Projects list
// now navigates to.
//
// 🔴 WHY THIS EXISTS. The owner, reporting two faults in one sentence: *"I created a new...
// project, but it's showed up in the library, and that's not where it should go… make an actual
// project in ChatGPT and compare the difference because it's supposed to be… also a different
// page."* The second half is this file. In ChatGPT, clicking a project row navigates to
// `/g/g-p-<id>/project`; Nemesis had no equivalent and expanded the row in place instead (see the
// comment that used to sit on `ProjectRow` in `projects-page.tsx`, and still explains why that was
// the right call until this page existed). It is not the right call anymore, so the row now
// pushes here and this page owns everything that used to render inline.
//
// 🔴🔴 2026-09-04: THE PAGE WEARS THE SHARED FRAME (`shell/page-frame.tsx`). It was drawn to
// ChatGPT's project page (title on y=116, composer on 176, tabs on 260, rows on 326, measured
// 2026-08-26). That day the owner said the shelf pages "looked too much like ChatGPT", pointed at
// gemini.google.com/library, asked for "consistent spacing across projects, library, and apps
// pages", and then "do the project page, calendar, and settings too". So the column, the title
// row, the round buttons, the pills and the soft rows are the frame's, and the composer sits
// under the title at the frame's section gap. What a row DOES is unchanged.
//
// 🔴 WHAT ISN'T ON THE REFERENCE, BECAUSE CHATGPT HAS NOTHING TO MEASURE IT FROM:
//
//   * NO SHARE BUTTON. We have no sharing. The reference's trailing control is `Share` and `…`;
//     ours is `…` alone, opening Rename/Delete. Drawing a Share button that does nothing would be
//     the one way to fail a 1:1 copy while matching it pixel-for-pixel — the same reasoning
//     `projects-page.tsx` already applied to the reference's sharing filter pills.
//   * "CHATS" BECOMES "CANVASES". A canvas is not a chat — it is Nemesis's own unit of work, the
//     same word the sidebar, the Library and `/projects` already use. The tab SHAPE (pill size,
//     the two-tab layout, every measurement) is copied exactly; only the label changes to say
//     what we actually have.
//   * THE ROW'S SNIPPET IS THE REAL TAIL OF THE CONVERSATION NOW. The first version of this
//     comment refused a preview because it would have meant loading every full canvas (the N+1
//     the Library avoids). The N+1 is gone without the load: `listCanvases` extracts the last
//     moment's `assistantText` INSIDE its own SELECT (`document->moments->-1->>assistantText`),
//     so the summary carries what a ChatGPT row carries — its last message — for free. When the
//     last moment holds no assistant text, line two falls back to the course title and then to a
//     plain label; it is still never an invented sentence.
//   * SOURCES IS A HONEST EMPTY TAB. Nemesis has no per-project source list — a canvas's sources
//     live on that canvas, not indexed by folder, and the Library's own "Documents" shelf is
//     Nemesis-generated notes, a different object from uploaded material entirely (see
//     `library-outputs.tsx`'s own header on why that page reads only what a real table backs).
//     Inventing a merged, mislabelled list here would be worse than an honest "nothing yet".
//
// 🔴 A SUB-PROJECT DOES NOT GET A ROW HERE. Only this project's own DIRECT canvases (`project.
// canvases` — not `project.children`) are listed. ChatGPT has no nested projects to have measured
// a row shape from, and inventing one — mixing a folder-shaped row into a list whose only
// specified row is a canvas — is exactly the kind of unmeasured addition this feature's whole
// discipline exists to avoid. A nested project is not stranded: the sidebar's own folder tree
// still expands it at any depth, unchanged by anything in this file.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, MoreHorizontal } from "lucide-react";

import { Codicon } from "@/components/desktop-ui/codicon";
import type { CanvasOutput, CanvasSource } from "@/lib/learn/canvas-model";
import { fileMark } from "@/lib/learn/kind-mark";
import { projectTint } from "@/lib/learn/project-look";
import { useConfirm } from "@/components/desktop-ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/desktop-ui/dropdown-menu";
import {
  FRAME_BUTTON_FILL,
  FRAME_HEAD_GAP_PX,
  FRAME_ROW_GAP_PX,
  FRAME_ROW_H_PX,
  FRAME_SECTION_GAP_PX,
  PageFrame,
  PageTitle,
  Pill,
  RowIcon,
  RowText,
  SOFT_ROW,
} from "@/components/workspace/shell/page-frame";
import { ProjectCustomizeDialog } from "@/components/workspace/shell/project-customize-dialog";
import {
  CANVASES_CHANGED_EVENT,
  deleteFolder,
  listCanvases,
  projectMaterial,
  type ProjectMaterial,
  listFolders,
  newCanvas,
  renameFolder,
  saveCanvas,
  setCanvasFolder,
  setFolderPinned,
  type CanvasSummary,
  type Folder,
} from "@/lib/learn/canvas-store";
import { buildProjects, findProject, type ProjectNode } from "./projects-model";
import { cn } from "@/lib/utils";

// ── The frame ────────────────────────────────────────────────────────────────────────────────
// Every measurement is the frame's now. The only number this page owns is the composer's height,
// which is the composer's own token everywhere else in the app.

/** The composer's box. The front door's composer measures the same; a project's composer is it. */
const COMPOSER_H_PX = 52;
/** Empty-state copy, in a row's own padding so it sits where a row would. */
const EMPTY = "px-[20px] py-[12px] text-[length:var(--canvas-text-small)] text-(--ui-text-secondary)";

type Tab = "canvases" | "sources" | "outputs";

const TABS: readonly { id: Tab; label: string }[] = [
  // "Chats" → "Canvases": see the header comment. Shape and every measurement are the
  // reference's; the word is ours.
  { id: "canvases", label: "Canvases" },
  { id: "sources", label: "Sources" },
  // 🔴 OUTPUTS IS THE THIRD TAB, ADDED 2026-09-03 ON THE OWNER'S ASK (*"in the projects home could
  // you show like another tab for viewing like the outputs of the project"*). It reads the same
  // one query Sources does — a canvas's `document.outputs` beside its `document.sources` — so the
  // tab costs nothing beyond its own rows, and cannot show a list the Sources tab disagrees with.
  { id: "outputs", label: "Outputs" },
];

/** Same shape as `projects-page.tsx`'s own preview — see that file for why. */
export interface ProjectPagePreview {
  readonly folders: readonly Folder[];
  readonly canvases: readonly CanvasSummary[];
}

export function ProjectPage({
  preview,
  projectId,
  userId,
}: {
  preview?: ProjectPagePreview;
  projectId: string;
  userId: string | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [canvases, setCanvases] = useState<CanvasSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("canvases");
  const [material, setMaterial] = useState<{
    sources: ProjectMaterial<CanvasSource>[];
    outputs: ProjectMaterial<CanvasOutput>[];
  }>({ outputs: [], sources: [] });
  /** The draft rename text, or null when the title is not being edited. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [starting, setStarting] = useState(false);
  /** The folder whose look/instructions dialog is open, or null — same dialog the sidebar opens. */
  const [customizing, setCustomizing] = useState<Folder | null>(null);

  const refresh = useCallback(async () => {
    if (preview) {
      setFolders([...preview.folders]);
      setCanvases([...preview.canvases]);
      setLoaded(true);
      return;
    }
    const [nextFolders, nextCanvases, nextMaterial] = await Promise.all([
      listFolders(userId),
      listCanvases(userId),
      // 🔴 KEYED ON THE ROUTE'S OWN id, NOT ON A RESOLVED PROJECT. `project` is derived from the
      // folders that have not arrived yet, so waiting for it would cost a second round trip on
      // every open; the query is a `folder_id` equality and needs nothing else.
      projectMaterial(userId, projectId),
    ]);
    setFolders(nextFolders);
    setCanvases(nextCanvases);
    setMaterial(nextMaterial);
    setLoaded(true);
  }, [preview, projectId, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Same reason `projects-page.tsx` listens: the sidebar can rename or delete the very folder
  // this page is looking at while it is on screen.
  useEffect(() => {
    const onChanged = () => void refresh();
    window.addEventListener(CANVASES_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CANVASES_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const project: ProjectNode | null = useMemo(() => {
    const tree = buildProjects(folders, canvases);
    return findProject(tree, projectId);
  }, [canvases, folders, projectId]);

  /**
   * 🔴 THE NAME IS AN ARGUMENT, NOT READ FROM STATE — the same correctness argument
   * `projects-page.tsx` and `library-outputs.tsx` both already document on their own inline-name
   * inputs. Enter commits, blur commits, and Escape has to cancel a blur it causes itself; reading
   * `renaming` from the closure would still hold the old text after Escape cleared it.
   */
  const commitRename = useCallback(
    async (raw: string) => {
      setRenaming(null);
      const name = raw.trim();
      if (!name || !project || name === project.name) return;
      await renameFolder(userId, project.id, name);
    },
    [project, userId],
  );

  const removeProject = useCallback(async () => {
    if (!project) return;
    // 🔴 THE CONFIRMATION COPY OWNS SAYING WHAT DELETE ACTUALLY DOES, because nothing in the
    // database will: `deleteFolder`'s own header records that canvases return to Unfiled by an
    // `on delete set null` constraint, and that a project's own SUB-projects are gone with it by
    // `on delete cascade` — silently, unless the caller says so. This mirrors the sidebar's own
    // `removeFolder` copy and extends it with the one fact that copy does not carry: whether
    // anything nested is about to go too.
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
    router.push("/projects");
  }, [confirm, project, router, userId]);

  /**
   * Starts a canvas already filed in this project, the way the reference's own project composer
   * starts a chat already filed in its project.
   *
   * 🔴 TWO WRITES, NOT ONE, BECAUSE THE STORE HAS NO THIRD OPTION. `canvasToRow` deliberately
   * omits `folder_id` (see its own header — an upsert must never clobber a filing a drag just
   * made), so there is no single call that creates a canvas already filed. Every other place in
   * this app that files a canvas — the sidebar, the Library — does it in exactly these two steps:
   * make it, then move it. `saveCanvas` already writes the browser's local copy even signed out,
   * so this never throws; `setCanvasFolder` is the one of the two that needs a real account,
   * which is also true of every other filing control in the product today.
   *
   * 🔴 THE TYPED TEXT BECOMES THE TITLE, NOT A FIRST QUESTION ASKED OF BRAIN. The front door's
   * own composer (`canvas-home.tsx`) already has an established way to open a canvas that does
   * not exist yet with a question already asked — `/learn?ask=<text>` — but that path always
   * lands the new canvas in Unfiled; there is no parameter that also files it, and building one
   * reaches into `use-canvas-session.ts`, which this feature does not own. Saving the typed text
   * as the canvas's title is the honest middle ground: nothing the learner typed is thrown away,
   * the canvas really is filed in this project the moment it exists, and nothing here pretends to
   * have asked Brain a question it was never given.
   */
  const startCanvas = useCallback(async () => {
    const text = draft.trim();
    if (!text || starting || !project) return;
    setStarting(true);
    const canvas = newCanvas();
    canvas.title = text.slice(0, 300);
    await saveCanvas(userId, canvas);
    await setCanvasFolder(userId, canvas.id, project.id);
    router.push(`/learn?c=${canvas.id}`);
  }, [draft, project, router, starting, userId]);

  return (
    <PageFrame>
      {!loaded ? null : !project ? (
        <p className="px-[20px] pt-[16px] text-[length:var(--canvas-text-small)] text-(--ui-text-secondary)">
          This project is gone, or never existed. <a className="underline" href="/projects">Back to Projects</a>
        </p>
      ) : (
        <>
          {/* The project's own icon in its own colour beside its name — the same mark its row on
              /projects and its row in the sidebar wear. Rename swaps the name for a field in the
              same slot, so nothing else on the row moves. */}
          <PageTitle
            before={
              <Codicon
                aria-hidden
                className={cn("shrink-0", !project.color && "text-(--ui-text-secondary)")}
                name={project.icon ?? "folder"}
                size="28px"
                style={projectTint(project)}
              />
            }
            controls={
              // 🔴 NO SHARE BUTTON. We have no sharing. The ⋯ carries what the reference's page
              // ⋯ carries (Project settings, Pin) plus the Rename/Delete the reference keeps
              // inside its settings modal — ours are menu rows because our dialog does not rename.
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`${project.name} options`}
                  className={cn("flex size-[40px] shrink-0 items-center justify-center rounded-full text-(--ui-text-primary) transition-colors", FRAME_BUTTON_FILL)}
                >
                  <MoreHorizontal aria-hidden size={18} strokeWidth={1.8} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      setCustomizing({
                        color: project.color,
                        icon: project.icon,
                        id: project.id,
                        instructions: project.instructions,
                        name: project.name,
                        parentId: null,
                      })
                    }
                  >
                    Project settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void setFolderPinned(userId, project.id, !project.pinnedAt)}>
                    {project.pinnedAt ? "Unpin project" : "Pin project"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setRenaming(project.name)}>Rename</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void removeProject()} variant="destructive">
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          >
            {renaming !== null ? (
              <input
                aria-label="Rename this project"
                autoFocus
                className="w-full min-w-0 bg-transparent font-[inherit] text-[length:inherit] leading-[inherit] outline-none"
                maxLength={120}
                onBlur={(event) => void commitRename(event.currentTarget.value)}
                onChange={(event) => setRenaming(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void commitRename(event.currentTarget.value);
                  if (event.key === "Escape") {
                    event.currentTarget.value = "";
                    setRenaming(null);
                  }
                }}
                value={renaming}
              />
            ) : (
              project.name
            )}
          </PageTitle>

          {/* The composer: the front door's tokens (`--composer-*`), not its component — this
              one starts a canvas already FILED here. It sits under the title at the frame's
              section gap, where the Library's first heading would be. */}
          <form
            className={cn("flex items-center bg-(--composer-fill)", "rounded-[var(--composer-radius)]", "shadow-[var(--composer-edge)]")}
            onSubmit={(event) => {
              event.preventDefault();
              void startCanvas();
            }}
            style={{ marginTop: FRAME_SECTION_GAP_PX, minHeight: COMPOSER_H_PX, maxWidth: "var(--composer-max-width)" }}
          >
            <input
              aria-label={`New chat in ${project.name}`}
              className="min-w-0 flex-1 bg-transparent px-[20px] text-[length:var(--canvas-text-body)] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-secondary)"
              onChange={(event) => setDraft(event.target.value)}
              placeholder={`New chat in ${project.name}`}
              type="text"
              value={draft}
            />
            <button
              aria-label="Start canvas"
              className="mr-[var(--composer-pad-x)] flex shrink-0 items-center justify-center rounded-full bg-(--ui-action) text-(--ui-action-glyph) transition-opacity disabled:opacity-40"
              disabled={!draft.trim() || starting}
              style={{ height: "var(--composer-control)", width: "var(--composer-control)" }}
              type="submit"
            >
              <ArrowUp aria-hidden size={18} strokeWidth={2} />
            </button>
          </form>

          {/* Three pills in the frame's grammar, on the heading line a section would take. The
              labels say what we actually have: a canvas is not a chat. */}
          <div className="flex items-center gap-[4px]" role="tablist" style={{ marginTop: FRAME_SECTION_GAP_PX }}>
            {TABS.map((option) => (
              <Pill active={tab === option.id} key={option.id} onClick={() => setTab(option.id)} pressed={tab === option.id}>
                {option.label}
              </Pill>
            ))}
          </div>

          <ul className="flex flex-col" style={{ gap: FRAME_ROW_GAP_PX, marginTop: FRAME_HEAD_GAP_PX }}>
            {tab === "canvases" ? (
              project.canvases.length === 0 ? (
                <p className={EMPTY}>Nothing filed here yet.</p>
              ) : (
                project.canvases.map((canvas) => (
                  <CanvasRow canvas={canvas} key={canvas.id} onOpen={(id) => router.push(`/learn?c=${id}`)} />
                ))
              )
            ) : tab === "sources" ? (
              material.sources.length === 0 ? (
                <p className={EMPTY}>No sources filed here yet.</p>
              ) : (
                material.sources.map((row) => (
                  <MaterialRow
                    canvasTitle={row.canvasTitle}
                    key={row.item.id}
                    mark={fileMark(row.item.title, row.item.kind)}
                    onOpen={() => router.push(`/learn?c=${row.canvasId}`)}
                    title={row.item.title}
                  />
                ))
              )
            ) : material.outputs.length === 0 ? (
              <p className={EMPTY}>Nothing made here yet.</p>
            ) : (
              material.outputs.map((row) => (
                <MaterialRow
                  canvasTitle={row.canvasTitle}
                  key={row.item.id}
                  mark={fileMark(row.item.title, row.item.kind)}
                  onOpen={() => router.push(`/learn?c=${row.canvasId}`)}
                  title={row.item.title}
                />
              ))
            )}
          </ul>
        </>
      )}
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
 * One canvas row: two stacked 20px lines that exactly fill the reference's 40px row (20 + 20 =
 * 40 — deliberately, not a coincidence of the type scale), the date beside them. Reference: no
 * divider, no fill, no radius. The hover below is not in that measurement — the reference was not
 * probed for its OWN row hover here — but every other list in this product signals a clickable
 * row that way, and a row nothing on screen marks as clickable is the worse miss.
 */
/**
 * One document or artifact a project holds.
 *
 * 🔴 THE SAME ROW GEOMETRY AS `CanvasRow`, BECAUSE THE TABS SIT ON THE SAME LIST. Three tabs whose
 * rows are three different heights read as three pages, and the measured spec this page follows
 * only ever specified one row.
 *
 * 🔴 IT OPENS THE CANVAS, NOT THE FILE. A source belongs to a conversation — that is where it was
 * dropped, what it was read for, and the only place the reading pane exists. A row that opened a
 * bare document would strand the learner outside the thing that gives it meaning, and the second
 * line names that conversation so the row says where it is going.
 */
function MaterialRow({
  title,
  canvasTitle,
  mark,
  onOpen,
}: {
  title: string;
  canvasTitle: string;
  mark: { icon: string; tint: string };
  onOpen: () => void;
}) {
  return (
    <li>
      <button className={cn(SOFT_ROW, "items-start")} onClick={onOpen} style={{ minHeight: FRAME_ROW_H_PX }} type="button">
        {/* The same glyph and tint the canvas's own source list draws for this object — one
            object drawn the same way. See `lib/learn/kind-mark.ts`. */}
        <RowIcon>
          <Codicon className="shrink-0" name={mark.icon} size="22px" style={{ color: `var(${mark.tint})` }} />
        </RowIcon>
        <RowText meta={canvasTitle || "Untitled chat"} title={title || "Untitled"} />
      </button>
    </li>
  );
}

/**
 * One canvas filed here. Line one is its title; line two is the REAL tail of its conversation
 * (`listCanvases` extracts it inside its own SELECT), falling back to the course title and then
 * to a plain label — never an invented sentence. The date sits at the row's right.
 */
function CanvasRow({ canvas, onOpen }: { canvas: CanvasSummary; onOpen: (id: string) => void }) {
  return (
    <li>
      <button className={cn(SOFT_ROW, "items-start")} onClick={() => onOpen(canvas.id)} style={{ minHeight: FRAME_ROW_H_PX }} type="button">
        <RowText meta={snippet(canvas)} title={canvas.title || "Untitled"} />
        <span className="shrink-0 pt-[3px] text-[length:var(--canvas-text-small)] leading-[18px] text-(--ui-text-tertiary) tabular-nums">
          {when(canvas.updatedAt)}
        </span>
      </button>
    </li>
  );
}

function snippet(canvas: CanvasSummary): string {
  const raw = canvas.preview?.trim();
  if (raw) {
    const flat = raw
      .replace(/```[a-z]*\n?/gi, " ")
      .replace(/[`*_#>]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (flat) return flat.slice(0, 160);
  }
  return canvas.courseTitle || "Canvas";
}

/** Same date rendering `projects-page.tsx` and `library-outputs.tsx` both already use. */
function when(iso: string): string {
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
