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
//   * THE ROW'S "SNIPPET" IS NOT A CONTENT PREVIEW. ChatGPT's second line is the chat's last
//     message, which costs nothing to show because the row already carries the whole thread.
//     `CanvasSummary` (`listCanvases`) does not — a real preview would mean loading every full
//     canvas just to list them, the same N+1 the Library avoids by reading only what it already
//     has. So line two shows the one real thing a summary carries about WHAT is inside — the
//     course title, when a canvas built one — and a plain, honest label otherwise. It is real
//     data or it is nothing; it is never an invented sentence standing in for content nobody read.
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
import { ArrowUp, Folder as FolderIcon, MoreHorizontal } from "lucide-react";

import { useConfirm } from "@/components/desktop-ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/desktop-ui/dropdown-menu";
import {
  CANVASES_CHANGED_EVENT,
  deleteFolder,
  listCanvases,
  listFolders,
  newCanvas,
  renameFolder,
  saveCanvas,
  setCanvasFolder,
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
 * Reference: **25px between one row's bottom and the next row's top**, so title-to-title pitch is
 * 65px.
 *
 * 🔴 THIS NUMBER WAS MISSING FROM THE FIRST SPEC, AND THE REASON IS WORTH KEEPING. The project I
 * measured the row shape from held exactly ONE chat, so there was no second row to measure a gap
 * against — the spec handed over a row height and silently no rhythm, and the page shipped its
 * rows nearly touching: two 40px blocks of two lines each, stacked, read as one four-line block
 * rather than as two rows. Re-measured on a project with two chats: gap 25, pitch 65, confirmed
 * both by the row boxes and independently by title-to-title distance.
 *
 * 🔴 A GAP ON THE LIST, NOT PADDING ON THE ROW. The row's own box is 40px in the reference and the
 * hover fill is drawn around it, so growing the row to 65px would put 12px of dead hover above and
 * below every title. `flex flex-col` with a `gap` keeps the row exactly 40 and puts the air
 * between rows, where the reference puts it.
 */
const ROW_GAP_PX = 25;

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

type Tab = "canvases" | "sources";

const TABS: readonly { id: Tab; label: string }[] = [
  // "Chats" → "Canvases": see the header comment. Shape and every measurement are the
  // reference's; the word is ours.
  { id: "canvases", label: "Canvases" },
  { id: "sources", label: "Sources" },
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
  /** The draft rename text, or null when the title is not being edited. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [starting, setStarting] = useState(false);

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
                <FolderIcon aria-hidden className="shrink-0 text-(--ui-text-secondary)" size={24} strokeWidth={1.8} />
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

                {/* 🔴 NO SHARE BUTTON — see the header comment. `…` alone, opening Rename/Delete. */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`${project.name} options`}
                    className="flex size-[36px] shrink-0 items-center justify-center rounded-lg text-(--ui-text-secondary) transition-colors hover:bg-black/[0.05] hover:text-(--ui-text-primary) dark:hover:bg-white/[0.10]"
                  >
                    <MoreHorizontal aria-hidden size={20} strokeWidth={1.8} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setRenaming(project.name)}>Rename</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void removeProject()}>Delete</DropdownMenuItem>
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

              <ul className="flex flex-col" style={{ gap: ROW_GAP_PX, marginTop: ROWS_GAP_PX }}>
                {tab === "canvases" ? (
                  project.canvases.length === 0 ? (
                    <p className={cn("text-[14px]", "text-(--ui-text-secondary)")}>Nothing filed here yet.</p>
                  ) : (
                    project.canvases.map((canvas) => (
                      <CanvasRow canvas={canvas} key={canvas.id} onOpen={(id) => router.push(`/learn?c=${id}`)} />
                    ))
                  )
                ) : (
                  // 🔴 AN HONEST EMPTY TAB, NOT A MISSING FEATURE DRESSED UP — see the header
                  // comment on why there is no per-project source list to read yet.
                  <p className={cn("text-[14px]", "text-(--ui-text-secondary)")}>No sources filed here yet.</p>
                )}
              </ul>
            </>
          )}
        </div>
      </div>
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
function CanvasRow({ canvas, onOpen }: { canvas: CanvasSummary; onOpen: (id: string) => void }) {
  return (
    <li>
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
          {/* See the header comment: a real fact (the course this canvas built) or a plain,
              honest label — never a fabricated content preview. */}
          <span className={cn("truncate", ROW_META_TEXT)}>{canvas.courseTitle || "Canvas"}</span>
        </span>
        <span className={cn("shrink-0", ROW_META_TEXT)}>{when(canvas.updatedAt)}</span>
      </button>
    </li>
  );
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
