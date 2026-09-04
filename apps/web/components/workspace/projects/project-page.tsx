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
// 🔴 DRAWN TO A MEASUREMENT, LIKE THE REST OF THIS FEATURE. Every pixel value in the block below
// was read off the owner's own signed-in ChatGPT account, 1470px viewport, 2026-08-26, and is
// recorded verbatim in `docs/chatgpt-reference.md`. Where the arithmetic below produces a number
// that IS one of the four measured absolutes (y=116, 176, 260, 326) that is not a coincidence —
// it is the same "state the anchors, derive the gaps" discipline `projects-page.tsx` already
// uses for its own title/pills offsets, and `projects-page.test.ts` re-derives it rather than
// trusting the literal.
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

// ── The measured frame ───────────────────────────────────────────────────────────────────────
// Same discipline as projects-page.tsx: state the anchors the reference actually measured, then
// derive every gap as an expression so a test can recompute it rather than trust a literal.

/** Content column. Reference: 768px — the same column every page in this feature shares. */
const COLUMN_PX = 768;
/** Top of the title row (folder glyph, name, overflow). Reference: y=116. */
const TITLE_TOP_PX = 116;
/**
 * The title row's own height. Not independently measured — the reference records where the
 * COMPOSER starts beneath it (y=176), not the row's own box — but 36 is what every other
 * title-row control on this page and on `/projects` already stands on (`CONTROL_H_PX` there),
 * and it is the value that makes the derived composer/tabs/rows tops land exactly on the three
 * numbers that WERE measured. See the arithmetic below.
 */
const HEADER_H_PX = 36;
/** Reference: the composer's top is 24px below the title row's bottom. */
const COMPOSER_GAP_PX = 24;
/**
 * The composer's own height. Reference: 52px, `min-height: 52px` — the same `--composer-min-
 * height` token every composer in the product uses (see `globals.css`). Named again here, rather
 * than only read off the CSS custom property, so the y=260 arithmetic below is checkable from
 * source text the way `projects-page.tsx`'s `HEADER_TOP_PX` is.
 */
const COMPOSER_H_PX = 52;
/** Reference: the tabs' top is 32px below the composer's bottom. */
const TABS_GAP_PX = 32;
/** Reference: a tab pill is 38px tall. */
const TAB_H_PX = 38;
/** Reference: rows start 28px below the tabs' bottom. */
const ROWS_GAP_PX = 28;
/** Reference: a row is 40px tall — exactly two 20px lines stacked with no gap between them. */
const ROW_H_PX = 40;
/**
 * Reference, RE-MEASURED 2026-08-30 in the owner's Chrome: the rows are separated by a hairline
 * divider now (rgba(255,255,255,0.05) dark / rgba(0,0,0,0.05) light), with 13px of padding on
 * each side of the 40px content block — title-to-title pitch 66-67px, confirmed on a six-chat
 * project.
 *
 * 🔴 THE 2026-08-26 SPEC SAID "no divider", AND IT WAS TRUE THEN — the reference changed under
 * us (its project list now draws the same hairline its Library table does). This is why the
 * measurement carries a date: a 1:1 page is 1:1 with a moving target, and the honest move when
 * the target moves is to re-measure and say so, not to defend a stale number.
 *
 * 🔴 PADDING ON THE LIST ITEM, DIVIDER ON THE LIST ITEM, HOVER ON THE ROW. The 40px content box
 * keeps its own hover fill (dead hover above the title was the reason the old gap lived on the
 * list); the li carries the air and the hairline, so the divider spans the full column the way
 * the reference's does.
 */
const ROW_PAD_Y_PX = 13;

/** 116 + 36 + 24 = 176, the reference's own measured composer top. */
const COMPOSER_TOP_PX = TITLE_TOP_PX + HEADER_H_PX + COMPOSER_GAP_PX;
/** 176 + 52 + 32 = 260, the reference's own measured tabs top. */
const TABS_TOP_PX = COMPOSER_TOP_PX + COMPOSER_H_PX + TABS_GAP_PX;
/** 260 + 38 + 28 = 326, the reference's own measured rows top. */
const ROWS_TOP_PX = TABS_TOP_PX + TAB_H_PX + ROWS_GAP_PX;

const TITLE_TEXT = "text-[28px] font-medium text-(--ui-text-primary)";
/** 14px / 500 / 20px line / `#0d0d0d` — a row's own title. */
const ROW_NAME_TEXT = "text-[14px] leading-[20px] font-medium text-(--ui-text-primary)";
/** 14px / 400 / 20px line / `rgb(93,93,93)` — a row's snippet AND its date; the reference gives
 *  the date no separate weight or colour from the snippet beneath it. `--ui-text-secondary` is
 *  used rather than the literal because `projects-page.tsx` already established the two are the
 *  same colour on this page's own text tokens. */
const ROW_META_TEXT = "text-[14px] leading-[20px] font-normal text-(--ui-text-secondary)";

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
    <main className="scrollbar-dt h-full overflow-x-hidden overflow-y-auto overscroll-contain bg-(--ui-bg-sidebar)">
      <div className="flex justify-center px-[24px] pb-[96px]">
        <div className="w-full" style={{ maxWidth: COLUMN_PX, paddingTop: TITLE_TOP_PX }}>
          {!loaded ? null : !project ? (
            <p className={cn("text-[14px]", "text-(--ui-text-secondary)")}>
              This project is gone, or never existed. <a className="underline" href="/projects">Back to Projects</a>
            </p>
          ) : (
            <>
              <header className="flex items-center gap-[10px]" style={{ height: HEADER_H_PX }}>
                {/* 🔴 THE PROJECT'S OWN MARK, NOT A GENERIC FOLDER. Re-measured 2026-08-30: the
                    reference draws the project's own icon in its own colour at 32px beside the
                    28px title ("school" wears its blue mortar-board on its page, not a folder).
                    `buildProjects` carries icon/colour through `ProjectNode` for exactly this. */}
                <Codicon
                  aria-hidden
                  className={cn("shrink-0", !project.color && "text-(--ui-text-secondary)")}
                  name={project.icon ?? "folder"}
                  size="32px"
                  style={projectTint(project)}
                />
                {/* 🔴 `self-start` ON THE NAME ALONE, NOT THE WHOLE ROW. The icon and the overflow
                    button both want to sit centred in the 36px row (`items-center`, above); the
                    name wants its OWN top pinned to the measured y=116 exactly. A 34px line
                    centred in a 36px row lands its top at 117 — one pixel off a number the owner
                    can and does check — while the row's BOTTOM has to stay at 116+36=152 for the
                    composer to land on its own measured y=176 (152+24). Both are true at once
                    only if the row's height carries the 36 and the name alone opts out of being
                    centred inside it. */}
                {renaming !== null ? (
                  <input
                    aria-label="Rename this project"
                    autoFocus
                    className={cn("min-w-0 flex-1 self-start bg-transparent outline-none", TITLE_TEXT)}
                    maxLength={120}
                    onBlur={(event) => void commitRename(event.currentTarget.value)}
                    onChange={(event) => setRenaming(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void commitRename(event.currentTarget.value);
                      if (event.key === "Escape") {
                        // Empty the DOM node, not the state — the blur this causes reads the node.
                        event.currentTarget.value = "";
                        setRenaming(null);
                      }
                    }}
                    style={{ lineHeight: "34px" }}
                    value={renaming}
                  />
                ) : (
                  <h1 className={cn("min-w-0 flex-1 self-start truncate", TITLE_TEXT)} style={{ lineHeight: "34px" }}>
                    {project.name}
                  </h1>
                )}

                {/* 🔴 NO SHARE BUTTON — see the header comment. The ⋯ carries what the
                    reference's page ⋯ carries (measured 2026-08-30: Project settings, Pin
                    project) plus the Rename/Delete the reference keeps inside its settings
                    modal — ours are menu rows because our settings dialog does not rename. */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`${project.name} options`}
                    className="flex size-[36px] shrink-0 items-center justify-center rounded-lg text-(--ui-text-secondary) transition-colors hover:bg-black/[0.05] hover:text-(--ui-text-primary) dark:hover:bg-white/[0.10]"
                  >
                    <MoreHorizontal aria-hidden size={20} strokeWidth={1.8} />
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
              </header>

              {/* The SAME composer object as everywhere else — see globals.css's `--composer-*`
                  tokens and canvas-composer.tsx's own use of them. Not that component itself:
                  this feature does not own it, and this composer's job (start a canvas already
                  FILED here) is different from the front door's. Same tokens, same look, own
                  wiring. */}
              <form
                className={cn(
                  "flex items-center bg-(--composer-fill)",
                  "rounded-[var(--composer-radius)]",
                  "shadow-[var(--composer-edge)]",
                )}
                onSubmit={(event) => {
                  event.preventDefault();
                  void startCanvas();
                }}
                style={{ marginTop: COMPOSER_GAP_PX, minHeight: COMPOSER_H_PX, maxWidth: "var(--composer-max-width)" }}
              >
                <input
                  aria-label={`New canvas in ${project.name}`}
                  className="min-w-0 flex-1 bg-transparent px-[20px] text-[16px] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-secondary)"
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={`New canvas in ${project.name}`}
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

              <div className="flex items-center gap-[8px]" style={{ marginTop: TABS_GAP_PX }}>
                {TABS.map((option) => (
                  <button
                    aria-pressed={tab === option.id}
                    className={cn(
                      "rounded-full text-[14px] leading-[20px] font-medium transition-colors",
                      tab === option.id
                        ? "bg-black/[0.05] text-(--ui-text-primary) dark:bg-white/[0.10]"
                        : "bg-transparent text-(--ui-text-tertiary)",
                    )}
                    key={option.id}
                    onClick={() => setTab(option.id)}
                    style={{ height: TAB_H_PX, padding: "9px 16px" }}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <ul className="flex flex-col" style={{ marginTop: ROWS_GAP_PX - ROW_PAD_Y_PX }}>
                {tab === "canvases" ? (
                  project.canvases.length === 0 ? (
                    <p className={cn("text-[14px]", "text-(--ui-text-secondary)")}>Nothing filed here yet.</p>
                  ) : (
                    project.canvases.map((canvas) => (
                      <CanvasRow canvas={canvas} key={canvas.id} onOpen={(id) => router.push(`/learn?c=${id}`)} />
                    ))
                  )
                ) : tab === "sources" ? (
                  material.sources.length === 0 ? (
                    <p className={cn("text-[14px]", "text-(--ui-text-secondary)")}>No sources filed here yet.</p>
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
                  <p className={cn("text-[14px]", "text-(--ui-text-secondary)")}>Nothing made here yet.</p>
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
    <li
      className="border-b border-b-black/[0.05] dark:border-b-white/[0.05]"
      style={{ paddingBottom: ROW_PAD_Y_PX, paddingTop: ROW_PAD_Y_PX }}
    >
      <button
        className="flex w-full items-center gap-[12px] text-left transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.10]"
        onClick={onOpen}
        style={{ height: ROW_H_PX }}
        type="button"
      >
        {/* The shared kind mark, so a .pptx here and a .pptx in the sources panel are the same
            object drawn the same way. See `lib/learn/kind-mark.ts`. */}
        <Codicon className="shrink-0" name={mark.icon} size="20px" style={{ color: `var(${mark.tint})` }} />
        <span className="flex min-w-0 flex-1 flex-col justify-center">
          <span className={cn("truncate", ROW_NAME_TEXT)}>{title || "Untitled"}</span>
          <span className={cn("truncate", ROW_META_TEXT)}>{canvasTitle || "Untitled canvas"}</span>
        </span>
      </button>
    </li>
  );
}

function CanvasRow({ canvas, onOpen }: { canvas: CanvasSummary; onOpen: (id: string) => void }) {
  return (
    <li
      className="border-b border-b-black/[0.05] dark:border-b-white/[0.05]"
      style={{ paddingBottom: ROW_PAD_Y_PX, paddingTop: ROW_PAD_Y_PX }}
    >
      {/* 🔴 NO RADIUS, EVEN ON HOVER — the measured spec says so explicitly, and the /projects
          list page's own hover (`ROW_HOVER`) is square-cornered for the same reason: a rounded
          hover on a full-width band reads as a button, and this is a row in a list. */}
      <button
        className="flex w-full items-center gap-[12px] text-left transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.10]"
        onClick={() => onOpen(canvas.id)}
        style={{ height: ROW_H_PX }}
        type="button"
      >
        <span className="flex min-w-0 flex-1 flex-col justify-center">
          <span className={cn("truncate", ROW_NAME_TEXT)}>{canvas.title || "Untitled"}</span>
          {/* See the header comment: the conversation's real tail, then the course title, then a
              plain label — never an invented sentence. */}
          <span className={cn("truncate", ROW_META_TEXT)}>{snippet(canvas)}</span>
        </span>
        <span className={cn("shrink-0", ROW_META_TEXT)}>{when(canvas.updatedAt)}</span>
      </button>
    </li>
  );
}

/**
 * Line two of a row: the last thing Nemesis said, flattened to one plain line. Markdown survives
 * in the stored moment (a reply can open with a ```mermaid fence), and a snippet that prints
 * fence syntax reads as a bug — so code fences drop to their bare text, whitespace collapses,
 * and list/heading markers at the start go. The fallbacks are the old honest ones.
 */
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
