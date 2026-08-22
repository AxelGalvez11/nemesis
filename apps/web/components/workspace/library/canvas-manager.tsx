"use client";

// Library — the canvas manager (§L, owner 2026-08-13).
//
// Library's primary objects are CANVASES, not raw files. Folders organise canvases. That is the
// whole object model, and it is deliberately smaller than a file browser: "avoid a full desktop
// file explorer unless usage proves the complexity is necessary."
//
// 🔴 FILING IS NOT EVIDENCE. Nothing on this surface may change what Nemesis asks next. This file
// imports the canvas STORE and nothing from the policy runtime — no diagnosis, no objectives, no
// evidence. Moving a canvas into a folder is a fact about the learner's shelf, not about the
// learner.
//
// 🔴 EVERY FUNCTION HERE DRAWS SOMETHING (§38.3, owner 2026-08-13). Measured on the live Library
// and reproduced in `/dev-preview/library` at 1280x800:
//
//     rows in the list                        62
//     row-action buttons with opacity 0       62      ← ALL of them, at rest
//     <svg> elements anywhere in the list      0
//
// The owner's words were *"make sure that all library functions have UI decoration"*, and the
// finding underneath them is precise: **the functions were not missing, they were invisible**.
// Rename, move, pin and delete all lived behind a control that painted nothing until the pointer
// crossed its row, so a canvas manager read as a bare list of text — and on a touch screen, where
// there is no hover, the actions had no affordance at all.
//
// 🔴 THE `<svg>` COUNT IS A SEPARATE POINT, AND NOT THE ONE THAT MATTERED. The glyphs here were
// `Codicon`s — `<i class="codicon …">` styled by a webfont — which is why a count of `<svg>` came
// back zero even where an icon was drawn. Checked rather than assumed: `document.fonts.check('16px
// codicon')` is TRUE in this app and the glyphs measured 18x18, so the font was not broken. They
// are lucide SVGs now for two reasons that are both real but neither dramatic: the owner
// re-verifies by counting `<svg>`, and an icon font that fails to load leaves a control that
// measures, takes clicks and draws nothing — which is exactly the failure this section is about.
//
// 🔴 DECORATION MEANS "YOU CAN SEE THE CONTROL EXISTS", NOT "THE LIST IS ORNAMENTED" (§19). Quiet
// glyphs, hover states, subtle borders. No cards, no badges, no colour, no progress, no counts.
// The reference register is ChatGPT, not a study app.
//
// 🔴 AND NOTHING HERE IS DERIVED FROM DATA THAT DOES NOT EXIST. "What distinguishes one canvas
// from another at a glance" is answered by its KIND (folder vs canvas) and by the pin the learner
// set themselves. A source count or a preview would be a confident false claim — see the note
// directly below, which is the reason.
//
// 🔴 NO PREVIEW, AND NO SOURCE COUNT. §L's mock shows a `Sources` column; it does not ship, and
// not for cost reasons. `canvas_sources` is empty in production while canvases carry their
// sources inside `document`, so a count over that table would render `0` on a canvas with
// material attached — a confident false claim about the learner's own work. A sparse row that is
// always true beats a rich one that is wrong half the time.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Ellipsis,
  Folder as FolderIcon,
  FolderPlus,
  Inbox,
  Layers,
  Pencil,
  Pin,
  PinOff,
  PanelsTopLeft,
  Search,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import {
  createFolder,
  deleteCanvas,
  deleteFolder,
  listFolders,
  renameCanvas,
  renameFolder,
  setCanvasFolder,
  setCanvasPinned,
  setFolderParent,
  type CanvasSummary,
  type Folder,
} from "@/lib/learn/canvas-store";
import { PAGE_SIZE, searchCanvases, type CanvasSort, type CanvasTable } from "@/lib/library/canvas-index";
import { cn } from "@/lib/utils";

/** `undefined` = every canvas · `null` = Unfiled · a string = that folder. */
type Scope = string | null | undefined;

/**
 * The table's column template, shared by the header and every row so a column is one column.
 *
 * 🔴 FOUR COLUMNS NOW, AND THE THIRD ONE IS `created_at`. This block used to argue for three and
 * the argument was specifically that there was nothing HONEST to put in the reference's third
 * slot: `canvas_sources` is empty in production, so a source count renders 0 on a canvas that
 * plainly has material attached, and a canvas has no size in bytes. Both of those are still true.
 * Neither applies to `created_at`, which is `not null default now()` on both tables — it cannot
 * be absent, cannot be stale and cannot be wrong.
 *
 * 🔴 AND LEAVING IT OUT WAS NOT FREE. Measured against the reference at 1440: with three columns
 * Name runs 462px and the date column lands 486px from the frame's left edge, against 368 and 384
 * there. Same rows, same 60px height, same 736px table — and ours read as the stretched one,
 * because the only thing absorbing the missing column was white space inside the name.
 */
const LIST_COLUMNS =
  "minmax(0,1fr) var(--list-col-meta) var(--list-col-created) var(--list-col-actions)";

/**
 * Everything every row shares, including the shape of its highlight.
 *
 * 🔴 THE HIGHLIGHT IS A PILL THAT OVERHANGS THE TABLE, NOT A FILL OF THE ROW'S OWN BOX. Measured
 * on the reference: a pseudo-element at `inset: -1px -16px` with a 16px radius, so the fill
 * starts 16px outside the first column and ends 16px past the last. Ours shaded the row rectangle
 * itself, corner to corner and square — which reads as a selected cell in a spreadsheet, where
 * the reference's reads as picking one row up off the page.
 *
 * 🔴 AND IT IS WHY THE ROW CAN BE FLUSH LEFT AT ALL. The old `px-2` was doing two jobs: aligning
 * the row and giving the hover fill somewhere to breathe. Take the padding away without building
 * the overhang and the highlight ends up tighter than before, hard against the icon tile. These
 * two changes are one change.
 */
const ROW_BASE =
  "list-row group relative isolate grid min-h-[var(--list-row-height)] items-center " +
  "gap-x-[var(--list-gap)] border-b border-(--ui-stroke-tertiary)/50 pl-0 pr-[var(--list-row-pad-r)]";

/**
 * The three orderings, keyed by the column each one belongs to.
 *
 * 🔴 THE SORT LIVES ON THE COLUMN HEADERS NOW, not in a menu (the reference does the same). The
 * menu it replaces was a 146px pill in the toolbar's right corner — the widest control on the
 * surface, spent on its least-used function, and naming a column a second time three rows above
 * the column itself.
 *
 * 🔴 ONE DIRECTION PER COLUMN, DELIBERATELY. The reference toggles ascending/descending; we do
 * not, because for each of these there is exactly one order anyone means — names run A→Z, dates
 * run newest first. A toggle would double the states to explain and put "oldest first" one
 * mis-click away from a learner looking for what they touched this morning.
 */
const SORT_LABELS: Record<CanvasSort, string> = {
  created: "Created",
  name: "Name",
  recent: "Last opened",
};

/** Sentinel for "the drop target is out of every folder", which is the All canvases tab. Leading
 *  space so it can never collide with a folder id. */
const UNFILED_DROP = " unfiled";

/** Relative, and deliberately coarse. "3 days ago" is what the learner is actually asking, and a
 *  timestamp to the minute invites them to read precision into a shelf. */
function lastOpened(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A creation date, absolute and short — "14 Aug", or "14 Aug 2025" once the year stops being
 * this one.
 *
 * 🔴 ABSOLUTE WHERE "Last opened" IS RELATIVE, ON PURPOSE. Two relative columns side by side
 * ("3 days ago" / "2 weeks ago") is two of the same sentence and the eye stops separating them.
 * The questions are different too: last opened is asked as "how long since I touched this",
 * created is asked as "which term was this from".
 */
function createdOn(iso: string | undefined): string {
  if (!iso) return "—";
  const when = new Date(iso);
  if (!Number.isFinite(when.getTime())) return "—";
  const sameYear = when.getFullYear() === new Date().getFullYear();
  return when.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function CanvasManager({
  userId,
  table,
  seedFolders,
}: {
  userId: string | null;
  /** 🔴 DEV-PREVIEW SEAM, and the SAME one the query's tests use. `/dev-preview/library` renders
   *  this component exactly as the real route does and substitutes only where the rows come from,
   *  because a screenshot of a differently-assembled surface proves nothing about the real one. */
  table?: () => CanvasTable;
  seedFolders?: Folder[];
}) {
  const router = useRouter();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [rows, setRows] = useState<CanvasSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [scope, setScope] = useState<Scope>(undefined);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CanvasSort>("recent");
  const [loading, setLoading] = useState(true);
  /**
   * Has a list for the CURRENT scope ever arrived?
   *
   * 🔴 THIS EXISTS SO THE SKELETON DOES NOT STROBE, and it is the whole reason the placeholders
   * are not simply wired to `loading`. `loading` flips true on every `load()` — which is every
   * keystroke in the search box and every change of sort. Placeholders on a keystroke would
   * replace the list the learner is reading, four times a second, with grey bars.
   *
   * So: placeholders only where there is nothing on screen worth keeping — the first paint, and
   * opening a folder, which is a genuinely different list. Refining a list you can already see
   * leaves it in place while the new rows are fetched.
   */
  const [settled, setSettled] = useState(false);
  /** Which row is being renamed, and the text so far. */
  const [editing, setEditing] = useState<{ id: string; kind: "canvas" | "folder"; value: string } | null>(null);
  /** A folder awaiting confirmation, because deleting one takes its subfolders with it. */
  const [confirming, setConfirming] = useState<Folder | null>(null);
  /**
   * 🔴 THE LAST TWO BROWSER DIALOGS ON THIS SURFACE, REPLACED (owner 2026-08-15: "make sure all
   * button popups have ui"). "New folder" called `window.prompt` and "Delete canvas" called
   * `window.confirm` — controls that are drawn in the product and then hand the learner an OS
   * dialog in a system font, unstyleable, unthemeable, and in the prompt's case silently disabled
   * in some browsers, which turns a button into one that does nothing at all. The surface already
   * had a real modal for deleting a FOLDER; these two now use the same one.
   */
  const [naming, setNaming] = useState<{ parentId: string | null; value: string } | null>(null);
  const [deletingCanvas, setDeletingCanvas] = useState<CanvasSummary | null>(null);
  /**
   * 🔴 FILING BY HAND, WITHOUT OPENING A MENU (owner 2026-08-15). Moving a canvas already existed
   * behind the row's kebab, as a "Move to …" item per folder — which is a list that grows with the
   * folder count and makes the common case the slowest one. Dragging is the direct version.
   *
   * `dragging` is what is in flight; `dropTarget` is the folder row under the pointer. Both are
   * state rather than DOM classes because the ROW being dragged also has to render differently, and
   * a CSS-only treatment cannot dim the source and highlight the target at the same time.
   */
  const [dragging, setDragging] = useState<{ id: string; kind: "canvas" | "folder"; name: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  /**
   * Which row's overflow menu is open, if any.
   *
   * 🔴🔴 THIS LIVES OUT HERE BECAUSE `ROW_BASE` CARRIES `isolate`, AND THAT IS THE WHOLE BUG.
   * `isolation: isolate` makes every row its own stacking context, which is load-bearing — the
   * hover pill is an `::after` at `z-index: -10`, and without the isolate it sinks behind the page
   * instead of sitting behind the row's own text. But a stacking context is a ceiling as well as a
   * floor: NOTHING inside a row can outrank anything outside it, however large its z-index.
   *
   * So #710's fix — raising the menu's wrapper to `z-50` — was reasoning correctly about sibling
   * order and then applying it one level too deep. The wrapper won its race inside its own row and
   * lost the only race that mattered, and the rows below carried on painting their Created dates
   * straight through an opaque menu (owner, twice: "there is overlap in the library page when
   * clicking on the '...' button", then "the library still has clashing here").
   *
   * The ROW is the element that has to move, because the row is what the later rows are siblings
   * of. One id rather than a boolean per row: only one menu is ever open, and the rows are built in
   * a `.map` where a hook cannot go.
   */
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  /** A filing write that did not land. Stated rather than swallowed — see `fileAndVerify`. */
  const [failure, setFailure] = useState<string | null>(null);

  // 🔴 A SEARCH IGNORES THE CURRENT FOLDER, ON PURPOSE. The failure this surface exists to fix is
  // "I can see my canvas in my account and the box says nothing matched". Scoping a search to
  // wherever the learner happens to be standing rebuilds that failure with a nicer cause.
  const searching = search.trim().length > 0;
  const effectiveScope: Scope = searching ? undefined : scope;

  const load = useCallback(async () => {
    setLoading(true);
    const [dirs, result] = await Promise.all([
      seedFolders ? Promise.resolve(seedFolders) : listFolders(userId),
      searchCanvases(userId, { folderId: effectiveScope, page, search, sort }, table),
    ]);
    setFolders(dirs);
    setRows(result.rows);
    setTotal(result.total);
    setLoading(false);
    setSettled(true);
    return result;
  }, [effectiveScope, page, search, seedFolders, sort, table, userId]);

  // Declared BEFORE the effect that loads, so a scope change clears this flag in the same commit
  // the new fetch starts in — otherwise the previous folder's rows stay on screen for one frame
  // pretending to be the new folder's.
  useEffect(() => {
    setSettled(false);
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  // Any change to what is being asked for starts at the first page — otherwise typing a search
  // while on page 3 returns an empty list and reads as "no results".
  useEffect(() => {
    setPage(0);
  }, [search, scope, sort]);

  const act = useCallback(
    async (work: Promise<unknown>) => {
      await work;
      await load();
    },
    [load],
  );

  /**
   * Would moving `id` under `parentId` put a folder inside its own subtree?
   *
   * 🔴 THE DATABASE WILL HAPPILY DO THIS. `folders.parent_id` has no ancestry check, so dropping
   * "Fall 2026" into its own child detaches the pair from every root: they stop appearing anywhere,
   * and because `parent_id` is `on delete cascade`, deleting either takes the rest with it. Nothing
   * would surface the loss. Walking up from the target is cheap — the whole folder list is already
   * in memory — and the `seen` set means a tree that is ALREADY broken makes this return true
   * rather than spin forever.
   */
  const wouldCycle = useCallback(
    (id: string, parentId: string | null) => {
      const seen = new Set<string>();
      let cursor = parentId;
      while (cursor) {
        if (cursor === id || seen.has(cursor)) return true;
        seen.add(cursor);
        cursor = folders.find((entry) => entry.id === cursor)?.parentId ?? null;
      }
      return false;
    },
    [folders],
  );


  /**
   * A filing write, followed by a read-back that checks it actually landed.
   *
   * 🔴 THIS IS NOT DEFENSIVENESS FOR ITS OWN SAKE. `pinned_at`, `folder_id` and `deleted` had
   * NEVER been written in production — measured 2026-08-13: zero rows for all three. Library is
   * the first surface that exercises any of them, so every move and pin here is a
   * first-in-production write, not a well-trodden path.
   *
   * `setCanvasFolder` and `setCanvasPinned` return `void` and only `console.warn` on failure, so
   * a policy refusal would otherwise be perfectly silent: the learner drags a canvas into a
   * folder, nothing happens, and nothing says why. The list already re-reads from the database,
   * which means the surface can compare what it asked for against what came back and SAY so.
   */
  const fileAndVerify = useCallback(
    async (id: string, work: Promise<unknown>, landed: (row: CanvasSummary) => boolean) => {
      setFailure(null);
      await work;
      const result = await load();
      const row = result.rows.find((entry) => entry.id === id);
      // Gone from this view means it moved out of the folder being browsed — that absence IS the
      // confirmation, so only a row still present and still unchanged is a failure.
      if (row && !landed(row)) {
        setFailure("That did not save. Nothing was lost — the canvas is still exactly where it was.");
      }
    },
    [load],
  );

  const open = (folder: Folder | null | undefined) => {
    setSearch("");
    setScope(folder === undefined ? undefined : folder === null ? null : folder.id);
  };

  const current = useMemo(
    () => (typeof scope === "string" ? (folders.find((entry) => entry.id === scope) ?? null) : null),
    [folders, scope],
  );

  /** Does the breadcrumb have anything to say? At the top level it does not, and a row that
   *  renders nothing must not reserve the space it would have used. */
  const showCrumb = searching || Boolean(current) || scope === null;

  /** Placeholders instead of rows — see `settled` for why this is not simply `loading`. */
  const showSkeleton = loading && !settled;

  /** Folders shown at this level: top-level when browsing everything, children when inside one.
   *  Hidden entirely during a search — a search is over canvases, and mixing in folders that do
   *  not match anything makes the result list read as noise. */
  const visibleFolders = useMemo(() => {
    if (searching || scope === null) return [];
    if (scope === undefined) return folders.filter((entry) => !entry.parentId);
    return folders.filter((entry) => entry.parentId === scope);
  }, [folders, scope, searching]);

  /** Drop whatever is in flight into `folderId` (`null` = Unfiled, i.e. out of every folder). */
  const dropInto = async (folderId: string | null) => {
    const item = dragging;
    setDragging(null);
    setDropTarget(null);
    if (!item) return;

    if (item.kind === "canvas") {
      // Same verified write the kebab's "Move to …" uses, so a drag and a menu choice cannot
      // succeed and fail differently.
      await fileAndVerify(item.id, setCanvasFolder(userId, item.id, folderId), (row) => row.folderId === folderId);
      return;
    }

    if (item.id === folderId) return; // onto itself: a no-op, not worth a message
    if (wouldCycle(item.id, folderId)) {
      setFailure(`“${item.name}” can't go inside itself, or inside a folder it already contains.`);
      return;
    }
    setFailure(null);
    const moved = await setFolderParent(userId, item.id, folderId);
    if (!moved) setFailure("That did not save. Nothing was lost — the folder is still where it was.");
    await load();
  };

  const commitRename = async () => {
    if (!editing) return;
    const { id, kind, value } = editing;
    setEditing(null);
    setFailure(null);
    // 🔴 READ BACK, FOR THE SAME REASON MOVE AND PIN DO. Both rename functions return the stored
    // name or `null` when the write was refused, and discarding that would put the learner in
    // front of a list that silently still shows the old name with nothing saying why.
    const stored = await (kind === "canvas" ? renameCanvas(userId, id, value) : renameFolder(userId, id, value));
    await load();
    if (stored === null && value.trim()) {
      setFailure("That name did not save. Nothing was lost — the old name is still in place.");
    }
  };

  return (
    // 🔴 THE PAGE SCROLLS, NOT THE LIST INSIDE IT (owner 2026-08-15: "this circled area doesn't look
    // aligned well"). The toolbar sat outside a scrolling list, so the list's scrollbar ate width
    // from the table and nothing else — the column rules stopped ~15px short of the New folder
    // button directly above them, and the whole header block looked shifted right. Moving the
    // overflow to this outer element puts the scrollbar at the viewport edge, OUTSIDE the 768
    // frame, so the toolbar and the table are measured against the same right edge.
    <div className="h-full overflow-y-auto">
      {/* 🔴 THE SAME FRAME THE COMPOSER USES, so Library and Canvas share one content column
          instead of each choosing a width. It was `max-w-[880px]` against the reference's 768 —
          112px wider, which is most of why this page read as spread out: the same rows, stretched. */}
      <div className="mx-auto flex min-h-full w-full max-w-[var(--content-max-width)] flex-col px-[var(--page-gutter)] pt-[var(--list-page-top)] pb-[var(--list-page-bottom)]">
      {/* ---------------------------------------------------------------- header
          🔴 TITLE LEFT, ONE ACTION RIGHT, EVERYTHING ELSE ON THE NEXT ROW. The toolbar used to be
          a single wrapping line holding the title, a search box, a sort select and a button, all
          at 13px on ~28px boxes — four different jobs at one weight, and on a narrow window they
          wrapped into a ragged block. The reference splits it: the page names itself and offers
          its one creating action, then filters and search sit on their own row above the table. */}
      {/* 🔴 SEARCH BELONGS ON THE TITLE LINE, NOT WITH THE FILTERS. Measured on the reference: the
          title, a 240px search field and the create button all sit on one 36px row, right-aligned
          to the frame's edge; the row below holds only the filters. Putting search among the
          filters read as "another filter", which it is not — it ignores the current folder on
          purpose (see `effectiveScope`) and searches the whole library. */}
      {/* 🔴 THE ROW IS PINNED TO THE CONTROL HEIGHT, so the title cannot change the row's height
          by changing its own line box. It was sized by its contents, which made the gap below it
          depend on the font metrics of one word. */}
      <div className="flex h-[var(--control-height)] items-center gap-[var(--list-control-gap)]">
        {/* 🔴 REGULAR WEIGHT, NOT MEDIUM. The reference sets its page titles at 28/400; ours was
            28/500 with tighter tracking, and at 28px that half-step of weight is the difference
            between a page NAME and a headline shouting at the table underneath it. The size was
            already right, which is why this reads as "heavier" rather than "bigger". */}
        <h1 className="mr-auto text-[length:var(--page-title-size)] font-normal leading-[34px] text-(--ui-text-primary)">Library</h1>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-[12px] top-1/2 -translate-y-1/2 text-(--ui-text-quaternary)"
            size={16}
            strokeWidth={2}
          />
          <input
            aria-label="Search canvases"
            // 🔴 A BORDERED FIELD, NOT A GREY SLAB. The reference draws its search as white with a
            // 1px hairline; ours filled it with the same grey as the buttons either side of it, so
            // the toolbar read as three identical lozenges and nothing said "you can type here".
            // Elevated + a hairline is the same treatment the row icon tiles use, which is what
            // "a surface you can put something into" looks like in both themes.
            className="h-[var(--control-height)] w-[var(--list-search-width)] rounded-full bg-(--ui-bg-elevated) pl-[36px] pr-[14px] text-[14px] text-(--ui-text-primary) outline-none ring-1 ring-(--ui-stroke-tertiary) placeholder:text-(--ui-text-tertiary) focus:ring-(--ui-stroke-secondary)"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search canvases…"
            value={search}
          />
        </div>

        {/* 🔴 THE PAGE'S ONE CREATING ACTION IS THE PAGE'S ONE SOLID BUTTON. It was a grey pill
            identical to the search field beside it and the filter chip below it — three different
            jobs wearing one costume, so nothing on the toolbar looked like the thing to press.
            The reference gives the same slot a filled dark pill, and this is the same fill the
            modals' confirming button already uses, so "solid" means one thing everywhere. */}
        <button
          className="flex h-[var(--control-height)] shrink-0 items-center gap-1.5 rounded-full bg-(--ui-text-primary) px-[14px] text-[14px] font-medium text-(--ui-bg-editor) transition-opacity hover:opacity-90"
          onClick={() => setNaming({ parentId: current?.id ?? null, value: "" })}
          type="button"
        >
          <FolderPlus size={16} strokeWidth={2} />
          New folder
        </button>
      </div>

      {/* The reference's second row, which carries only view controls.
          🔴 NOTHING SITS ON THE RIGHT OF IT ANY MORE. The reference puts three round 36px buttons
          there — filters, grid view, list view. We have no second view to switch to (a grid needs
          a thumbnail per canvas and no such image exists), and no filters beyond the scope this
          row already is, so copying the buttons would be copying three controls that do nothing.
          The sort that used to live here moved onto the column headers, where the reference's
          also is. */}
      <div className="mt-[var(--list-title-gap)] flex items-center">
        {/* 🔴 `null` IS UNFILED, `undefined` IS EVERYTHING. Two different absences with two
            different meanings — reading either as "no folder" puts the learner in the wrong view. */}
        {/* 🔴 THE "UNFILED" TAB IS GONE, ITS SCOPE IS NOT (owner 2026-08-15: "remove the 'unfiled'
            button"). `scope === null` still means unfiled, the kebab still offers "Move to
            Unfiled", and the store is untouched — this removes the control, not the idea behind it.
            🔴 AND ITS DROP TARGET MOVED HERE RATHER THAN BEING DELETED WITH IT. Taking a canvas OUT
            of a folder has to be as direct as putting one in; a drag that only ever goes one
            direction teaches the learner that dragging does not really work. Dropping on "All
            canvases" now means "out of every folder", which is the same write the tab performed and
            reads more plainly than the word Unfiled did. */}
        <ScopeTab
          active={scope === undefined}
          dropActive={dropTarget === UNFILED_DROP}
          icon={Layers}
          label="All canvases"
          onClick={() => open(undefined)}
          onDragLeaveTarget={() => setDropTarget((value) => (value === UNFILED_DROP ? null : value))}
          onDragOverTarget={() => setDropTarget(UNFILED_DROP)}
          onDropInto={dragging ? () => void dropInto(null) : undefined}
        />

      </div>

      {/* ---------------------------------------------------------------- where am I
          🔴 IT RENDERS ONLY WHEN IT HAS SOMETHING TO SAY. At the top level there is no path and no
          search, so this row held nothing — but it still carried its margins, which put 36px
          between the filters and the table where the reference has 21, and made the whole toolbar
          read as floating above the list rather than sitting on it. An empty element with spacing
          is the hardest kind of layout bug to see, because there is nothing there to look at. */}
      {showCrumb && (
      <div className="mt-[var(--list-filter-gap)] flex items-center gap-1.5 text-[13px] text-(--ui-text-quaternary)">
        {searching ? (
          <span>Searching every canvas</span>
        ) : (
          <>
            {/* 🔴 THE SCOPE TABS MOVED UP TO THE TOOLBAR and are deliberately not repeated here.
                They are filters, not location: rendering them inside the breadcrumb made "where am
                I" and "what am I filtering by" the same line, and after the toolbar gained them
                this row drew a second, live copy of both. The breadcrumb below is now only the
                folder path — a statement about position. */}
            {/* 🔴 GOING BACK UP IS A LIBRARY FUNCTION TOO (§38.3), and it was the least visible one
                on the surface: a bare word in the breadcrumb's own grey, changing colour only on
                hover, which is nothing at all on a touch screen. It reads as a control now — a
                folder glyph and the same hover fill every other control here uses. It only renders
                inside a nested folder, which is why the top-level screenshots never showed it. */}
            {current?.parentId && (
              <>
                <span aria-hidden="true">/</span>
                <button
                  aria-label={`Back to ${folders.find((entry) => entry.id === current.parentId)?.name ?? "the parent folder"}`}
                  className="flex items-center gap-1.5 rounded-lg px-[8px] py-[4px] transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-secondary)"
                  onClick={() => {
                    const parent = folders.find((entry) => entry.id === current.parentId);
                    if (parent) open(parent);
                  }}
                  type="button"
                >
                  <FolderIcon size={13} strokeWidth={2} />
                  {folders.find((entry) => entry.id === current.parentId)?.name ?? "…"}
                </button>
              </>
            )}
            {/* Where you are, which is a statement rather than a control — so it is marked with the
                same glyph but deliberately gets no hover, no fill and no button. */}
            {current && (
              <>
                <span aria-hidden="true">/</span>
                <span className="flex items-center gap-1.5 px-[8px] py-[4px] text-(--ui-text-primary)">
                  <FolderIcon size={13} strokeWidth={2} />
                  {current.name}
                </span>
              </>
            )}
            {scope === null && (
              <>
                <span aria-hidden="true">/</span>
                <span className="flex items-center gap-1.5 px-[8px] py-[4px] text-(--ui-text-primary)">
                  <Inbox size={13} strokeWidth={2} />
                  Unfiled
                </span>
              </>
            )}
          </>
        )}
      </div>
      )}

      {/* 🔴 A REFUSED WRITE IS STATED, NEVER SWALLOWED. The store logs and returns void, so
          without this the learner would file a canvas, watch it stay put, and be told nothing. */}
      {failure && (
        <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-600">{failure}</p>
      )}

      {/* ---------------------------------------------------------------- the list */}
      <div className={showCrumb ? "mt-3" : "mt-[var(--list-filter-gap)]"}>
        {/* 🔴 A GRID, NOT A FLEX ROW WITH A GAP. The header and every row below share one column
            template, so "Last opened" is genuinely the same column on every line instead of the
            result of each row's own flex maths. It was an 11px uppercase strip, which is a section
            label; the reference sets its column names at the same 14px as the data and lets colour
            carry the difference, so the header reads as part of the table rather than above it.
            🔴 AND IT HAS NO RULE UNDER IT. The reference draws a hairline between ROWS and nowhere
            else; ours drew one here too, which closed the header into a box of its own and made
            the column names read as a band sitting on the table rather than as its first line. */}
        <div
          className="grid h-[var(--list-header-height)] items-center gap-x-[var(--list-gap)] pl-0 pr-[var(--list-row-pad-r)] text-[14px] text-(--ui-text-secondary)"
          style={{ gridTemplateColumns: LIST_COLUMNS }}
        >
          <SortHeader column="name" current={sort} onSort={setSort} />
          <SortHeader column="recent" current={sort} onSort={setSort} />
          <SortHeader column="created" current={sort} onSort={setSort} />
          <span />
        </div>

        {/* 🔴 THE PLACEHOLDERS REPLACE THE LIST, THEY DO NOT FOLLOW IT. Rendered after the rows,
            they appended 8 grey bars BELOW the previous folder's canvases — measured at y≈4004 on
            a full list — so opening a folder showed the old folder's contents with a loading
            indicator scrolled far out of sight. The stale rows are the thing being replaced. */}
        {showSkeleton ? <SkeletonRows /> : (<>
        {visibleFolders.map((folder) => (
          // 🔴 A FOLDER IS BOTH ENDS OF A DRAG: it can be picked up and it can be dropped into.
          // `onDragOver` must call preventDefault or the browser refuses the drop entirely — the
          // row highlights, the pointer says "move", and nothing happens on release.
          <div
            className={cn(
              ROW_BASE,
              // The source stays in place, faded, so the list does not reflow under the pointer.
              dragging?.id === folder.id && "opacity-40",
              // 🔴 THE ROW OUTRANKS THE ROWS BELOW IT, so its open menu can too. See `openMenu`.
              openMenu === folder.id && "z-50",
            )}
            data-drop-target={dropTarget === folder.id ? "true" : undefined}
            draggable={!editing}
            key={folder.id}
            onDragEnd={() => { setDragging(null); setDropTarget(null); }}
            onDragEnter={() => { if (dragging && dragging.id !== folder.id) setDropTarget(folder.id); }}
            onDragLeave={(event) => {
              // Only when the pointer leaves the ROW, not when it crosses one of its children.
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDropTarget((value) => (value === folder.id ? null : value));
              }
            }}
            onDragOver={(event) => {
              if (!dragging || dragging.id === folder.id) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              // Firefox will not start a drag unless some data is set.
              event.dataTransfer.setData("text/plain", folder.name);
              setDragging({ id: folder.id, kind: "folder", name: folder.name });
            }}
            onDrop={(event) => { event.preventDefault(); void dropInto(folder.id); }}
            style={{ gridTemplateColumns: LIST_COLUMNS }}
          >
            {editing?.id === folder.id ? (
              <input
                autoFocus
                className="min-w-0 rounded bg-(--ui-bg-tertiary) px-1.5 py-1 text-[length:var(--list-name-size)] text-(--ui-text-primary) outline-none"
                onBlur={commitRename}
                onChange={(event) => setEditing({ ...editing, value: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void commitRename();
                  if (event.key === "Escape") setEditing(null);
                }}
                value={editing.value}
              />
            ) : (
              <button className="flex min-w-0 items-center gap-[var(--list-icon-gap)] text-left" onClick={() => open(folder)} type="button">
                <RowIcon icon={FolderIcon} />
                <span className="truncate text-[length:var(--list-name-size)] leading-[var(--list-name-leading)] text-(--ui-text-primary)">{folder.name}</span>
              </button>
            )}
            {/* 🔴 AN EM DASH, NOT A BLANK, AND NOT A GUESS. A folder has no "last opened": nothing
                records opening one, and `folders.updated_at` means "renamed or moved", which
                would put a date in this column that answers a different question. The dash says
                the column does not apply here — two empty cells would just look unfinished. */}
            <MetaCell>—</MetaCell>
            <MetaCell>{createdOn(folder.createdAt)}</MetaCell>
            <RowMenu
              actions={[
                { icon: Pencil, label: "Rename", run: () => setEditing({ id: folder.id, kind: "folder", value: folder.name }) },
                { danger: true, icon: Trash2, label: "Delete folder", run: () => setConfirming(folder) },
              ]}
              name={folder.name}
              onOpenChange={(next) => setOpenMenu(next ? folder.id : null)}
              open={openMenu === folder.id}
            />
          </div>
        ))}

        {rows.map((canvas) => (
          // A canvas is a source only — there is nothing to drop INTO a canvas.
          <div
            className={cn(
              ROW_BASE,
              dragging?.id === canvas.id && "opacity-40",
              // 🔴 THE ROW OUTRANKS THE ROWS BELOW IT, so its open menu can too. See `openMenu`.
              openMenu === canvas.id && "z-50",
            )}
            draggable={!editing}
            key={canvas.id}
            onDragEnd={() => { setDragging(null); setDropTarget(null); }}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", canvas.title || "Untitled canvas");
              setDragging({ id: canvas.id, kind: "canvas", name: canvas.title || "Untitled canvas" });
            }}
            style={{ gridTemplateColumns: LIST_COLUMNS }}
          >
            {editing?.id === canvas.id ? (
              <input
                autoFocus
                className="min-w-0 rounded bg-(--ui-bg-tertiary) px-1.5 py-1 text-[length:var(--list-name-size)] text-(--ui-text-primary) outline-none"
                onBlur={commitRename}
                onChange={(event) => setEditing({ ...editing, value: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void commitRename();
                  if (event.key === "Escape") setEditing(null);
                }}
                value={editing.value}
              />
            ) : (
              <button
                className="flex min-w-0 items-center gap-[var(--list-icon-gap)] text-left"
                onClick={() => router.push(`/learn?c=${canvas.id}`)}
                type="button"
              >
                {/* 🔴 A CANVAS ROW HAD NO GLYPH AT ALL, so a folder was marked and a canvas was
                    bare — the list read as "two folders, then some text". This says only what is
                    certainly true: this row is a canvas. 🔴 A PLAIN SQUARE WAS THE FIRST TRY AND IT
                    READ AS AN EMPTY CHECKBOX — 62 of them down the left edge invite a selection
                    this surface does not have. A panelled workspace glyph cannot be mistaken for one.
                    Nothing here is derived from the canvas's CONTENTS, because `canvas_sources` is
                    empty in production and a count over it would render 0 on a canvas that has
                    material attached (see the header note). */}
                <RowIcon icon={PanelsTopLeft} />
                <span className="truncate text-[length:var(--list-name-size)] leading-[var(--list-name-leading)] text-(--ui-text-primary)">{canvas.title || "Untitled canvas"}</span>
                {/* The learner's own mark, kept — the one honest per-canvas distinction there is. */}
                {canvas.pinnedAt && <Pin className="shrink-0 text-(--ui-text-quaternary)" size={11} strokeWidth={2} />}
              </button>
            )}
            <MetaCell>{lastOpened(canvas.updatedAt)}</MetaCell>
            <MetaCell>{createdOn(canvas.createdAt)}</MetaCell>
            <RowMenu
              actions={[
                { icon: Pencil, label: "Rename", run: () => setEditing({ id: canvas.id, kind: "canvas", value: canvas.title }) },
                {
                  icon: canvas.pinnedAt ? PinOff : Pin,
                  label: canvas.pinnedAt ? "Unpin" : "Pin",
                  run: () =>
                    void fileAndVerify(
                      canvas.id,
                      setCanvasPinned(userId, canvas.id, !canvas.pinnedAt),
                      (row) => Boolean(row.pinnedAt) !== Boolean(canvas.pinnedAt),
                    ),
                },
                ...(canvas.folderId
                  ? [
                      {
                        icon: Inbox,
                        label: "Move to Unfiled",
                        run: () =>
                          void fileAndVerify(
                            canvas.id,
                            setCanvasFolder(userId, canvas.id, null),
                            (row) => row.folderId === null,
                          ),
                      },
                    ]
                  : []),
                ...folders
                  .filter((folder) => folder.id !== canvas.folderId)
                  .map((folder) => ({
                    icon: FolderIcon,
                    label: `Move to ${folder.name}`,
                    run: () =>
                      void fileAndVerify(
                        canvas.id,
                        setCanvasFolder(userId, canvas.id, folder.id),
                        (row) => row.folderId === folder.id,
                      ),
                  })),
                {
                  danger: true,
                  icon: Trash2,
                  label: "Delete canvas",
                  // Soft delete — the row is flagged, never removed, and the learner's
                  // demonstrations survive regardless (`learner_evidence.canvas_id` is
                  // `on delete set null`). Still confirmed, because it disappears from view.
                  run: () => setDeletingCanvas(canvas),
                },
              ]}
              name={canvas.title || "Untitled canvas"}
              onOpenChange={(next) => setOpenMenu(next ? canvas.id : null)}
              open={openMenu === canvas.id}
            />
          </div>
        ))}

        {!loading && rows.length === 0 && visibleFolders.length === 0 && (
          <p className="px-2 py-8 text-[14px] text-(--ui-text-tertiary)">
            {searching ? `Nothing matches "${search.trim()}".` : "Nothing here yet."}
          </p>
        )}
        </>)}

        {/* 🔴 THE LIST SAYS HOW MUCH OF ITSELF IT IS SHOWING. A truncated list that does not
            disclose truncation is the defect this surface was built to remove, and raising the
            row cap without this only moves it further out. */}
        {total > rows.length + page * PAGE_SIZE && (
          <div className="flex items-center justify-between px-2 py-4">
            {/* 🔴 A RANGE, NOT A RUNNING TOTAL. "Show more" fetches the NEXT page rather than
                appending to this one, so "Showing 120 of 340" would describe a list that is not
                on screen — the exact genre of quiet inaccuracy this surface exists to remove. */}
            <span className="text-[13px] text-(--ui-text-quaternary)">
              Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + rows.length} of {total}
            </span>
            <button
              className="rounded-lg bg-(--ui-bg-tertiary) px-[10px] py-[6px] text-[13px] text-(--ui-text-secondary) hover:text-(--ui-text-primary)"
              onClick={() => setPage((value) => value + 1)}
              type="button"
            >
              Show more
            </button>
          </div>
        )}
        {page > 0 && (
          <button
            className="mt-2 px-2 text-[13px] text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)"
            onClick={() => setPage(0)}
            type="button"
          >
            Back to the first page
          </button>
        )}
      </div>

      {/* ---------------------------------------------------------------- folder delete */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6">
          <div className="w-full max-w-[380px] rounded-2xl bg-(--ui-bg-elevated) p-5 shadow-[0_8px_32px_rgba(0,0,0,0.18)] ring-1 ring-(--ui-stroke-tertiary)">
            <p className="text-[15px] text-(--ui-text-primary)">Delete “{confirming.name}”?</p>
            {/* 🔴 BOTH EFFECTS, NAMED. The database returns canvases to Unfiled on its own
                (`folder_id … on delete set null`), but `folders.parent_id` is `on delete cascade`,
                so subfolders go with it — and no constraint will ever tell the learner that. */}
            <p className="mt-2 text-[13px] leading-relaxed text-(--ui-text-tertiary)">
              {folders.some((entry) => entry.parentId === confirming.id)
                ? "The folders inside it are deleted too. No canvas is deleted — everything in them moves back to Unfiled."
                : "No canvas is deleted. Everything in this folder moves back to Unfiled."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-lg px-[12px] py-[7px] text-[13px] text-(--ui-text-secondary) hover:bg-(--ui-bg-tertiary)"
                onClick={() => setConfirming(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-(--ui-text-primary) px-[12px] py-[7px] text-[13px] text-(--ui-bg-editor)"
                onClick={() => {
                  const folder = confirming;
                  setConfirming(null);
                  if (scope === folder.id) setScope(undefined);
                  void act(deleteFolder(userId, folder.id));
                }}
                type="button"
              >
                Delete folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- new folder */}
      {naming && (
        <Modal onDismiss={() => setNaming(null)} title={naming.parentId ? `New folder inside ${current?.name ?? "this folder"}` : "New folder"}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const name = naming.value.trim();
              if (!name) return;
              setNaming(null);
              void act(createFolder(userId, name, naming.parentId));
            }}
          >
            <input
              // Autofocus is right here and not a nuisance: the modal exists only to collect this
              // one value, and the learner opened it deliberately.
              autoFocus
              aria-label="Folder name"
              className="mt-3 w-full rounded-lg bg-(--ui-bg-tertiary) px-3 py-2 text-[15px] text-(--ui-text-primary) outline-none ring-1 ring-(--ui-stroke-tertiary) focus:ring-(--ui-action)"
              onChange={(event) => setNaming({ ...naming, value: event.target.value })}
              placeholder="Folder name"
              value={naming.value}
            />
            <div className="mt-5 flex justify-end gap-2">
              <ModalButton onClick={() => setNaming(null)}>Cancel</ModalButton>
              {/* Disabled until there is a name, rather than accepting a blank one and creating an
                  untitled folder the learner then has to find and rename. */}
              <ModalButton disabled={!naming.value.trim()} primary type="submit">Create folder</ModalButton>
            </div>
          </form>
        </Modal>
      )}

      {/* ---------------------------------------------------------------- canvas delete */}
      {deletingCanvas && (
        <Modal onDismiss={() => setDeletingCanvas(null)} title={`Delete “${deletingCanvas.title || "Untitled canvas"}”?`}>
          {/* What actually survives, said plainly — the learner's demonstrations are kept because
              `learner_evidence.canvas_id` is `on delete set null`, which nothing else here says. */}
          <p className="mt-2 text-[13px] leading-relaxed text-(--ui-text-tertiary)">
            It leaves your library. What you have already worked through on it is kept.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <ModalButton onClick={() => setDeletingCanvas(null)}>Cancel</ModalButton>
            <ModalButton
              onClick={() => {
                const canvas = deletingCanvas;
                setDeletingCanvas(null);
                void act(deleteCanvas(userId, canvas.id));
              }}
              primary
            >
              Delete canvas
            </ModalButton>
          </div>
        </Modal>
      )}
      </div>
    </div>
  );
}

/**
 * The one modal shell this surface uses, so a prompt, a confirm and a folder delete are the same
 * object rather than three that drifted. Dismisses on backdrop click and on Escape, which is the
 * part hand-rolled overlays usually miss and the part a browser dialog got right for free.
 */
function Modal({
  children,
  onDismiss,
  title,
}: {
  children: ReactNode;
  onDismiss: () => void;
  title: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onDismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onDismiss(); }}
      role="presentation"
    >
      <div
        aria-modal="true"
        className="w-full max-w-[380px] rounded-2xl bg-(--ui-bg-elevated) p-5 shadow-[0_8px_32px_rgba(0,0,0,0.18)] ring-1 ring-(--ui-stroke-tertiary)"
        role="dialog"
      >
        <p className="text-[15px] text-(--ui-text-primary)">{title}</p>
        {children}
      </div>
    </div>
  );
}

/** Modal footer button, in the two weights the shell uses. */
function ModalButton({
  children,
  disabled,
  onClick,
  primary,
  type = "button",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  primary?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      className={cn(
        "rounded-lg px-[12px] py-[7px] text-[13px] transition-colors",
        primary
          ? "bg-(--ui-text-primary) text-(--ui-bg-editor) disabled:opacity-40"
          : "text-(--ui-text-secondary) hover:bg-(--ui-bg-tertiary)",
      )}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

/** One of the table's data cells — the same size and colour in the header and in every row, so a
 *  column reads as a column rather than as a stack of similar-looking text. */
function MetaCell({ children }: { children: ReactNode }) {
  return <span className="truncate text-[14px] text-(--ui-text-secondary)">{children}</span>;
}

/**
 * A column name that is also the control for ordering by that column.
 *
 * 🔴 THE ARROW ONLY APPEARS ON THE ACTIVE COLUMN, and it points the way the list actually runs —
 * up for A→Z, down for newest-first. An arrow on every header would suggest all three are sorting
 * at once; an arrow that always points the same way would be decoration.
 *
 * 🔴 CLICKING THE ACTIVE COLUMN DOES NOTHING, deliberately, because there is no second direction
 * to go to. `aria-pressed` says which one is live so this is not a control that silently ignores
 * a press with no explanation.
 */
function SortHeader({
  column,
  current,
  onSort,
}: {
  column: CanvasSort;
  current: CanvasSort;
  onSort: (next: CanvasSort) => void;
}) {
  const active = column === current;
  const Arrow = column === "name" ? ArrowUp : ArrowDown;
  return (
    <button
      aria-label={`Sort by ${SORT_LABELS[column].toLowerCase()}`}
      aria-pressed={active}
      className={cn(
        "flex min-w-0 items-center gap-1 rounded text-left text-[14px] transition-colors",
        active ? "text-(--ui-text-primary)" : "text-(--ui-text-secondary) hover:text-(--ui-text-primary)",
      )}
      onClick={() => onSort(column)}
      type="button"
    >
      <span className="truncate">{SORT_LABELS[column]}</span>
      {active && <Arrow className="shrink-0" size={13} strokeWidth={2} />}
    </button>
  );
}

/**
 * What the table looks like before its rows exist.
 *
 * 🔴 IT IS THE REAL ROW'S GRID AND THE REAL ROW'S HEIGHT, not an approximation. A placeholder
 * with its own metrics makes the list jump the moment data lands, which is a worse experience
 * than showing nothing at all — the whole point is that the page is already the right shape.
 *
 * 🔴 EIGHT, NOT `PAGE_SIZE`. A page holds 60 canvases; 60 shimmering bars is a 3,600px wall of
 * motion for something that will be gone in under a second. Eight fills the fold and stops.
 *
 * The bar widths step down the list rather than being random: a fixed pattern cannot flicker
 * between renders, and `Math.random()` in a render is a hydration mismatch waiting to happen.
 */
const SKELETON_NAME_WIDTHS = ["62%", "45%", "71%", "38%", "56%", "49%", "66%", "42%"];

function SkeletonRows() {
  return (
    <div aria-hidden="true">
      {SKELETON_NAME_WIDTHS.map((width, index) => (
        <div
          className="grid min-h-[var(--list-row-height)] items-center gap-x-[var(--list-gap)] border-b border-(--ui-stroke-tertiary)/50 pl-0 pr-[var(--list-row-pad-r)]"
          key={index}
          style={{ gridTemplateColumns: LIST_COLUMNS }}
        >
          <span className="flex min-w-0 items-center gap-[var(--list-icon-gap)]">
            <span className="list-skeleton-bar size-[var(--list-icon-tile)] shrink-0 rounded-[var(--shell-icon-button-radius)]" />
            <span className="list-skeleton-bar h-[14px]" style={{ width }} />
          </span>
          <span className="list-skeleton-bar h-[14px] w-[72px]" />
          <span className="list-skeleton-bar h-[14px] w-[52px]" />
          <span />
        </div>
      ))}
    </div>
  );
}

/**
 * A row's leading glyph, as a filled tile.
 *
 * 🔴 THE TILE IS THE POINT, NOT THE GLYPH. A 13px outline sitting directly against a 16px name
 * left the row's left edge reading as empty at 60px tall, and made folders and canvases look like
 * two weights of the same thing rather than two kinds. The reference gives every row a 32px filled
 * square at 8px radius with a 20px glyph inside; the fill is what makes a row read as an object.
 */
function RowIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      aria-hidden="true"
      // 🔴 THE RADIUS IS NAMED, NOT `rounded-lg`. That utility resolves to 13.5px at this root font
      // — it measured as a squircle where the reference draws 8px — which is the rem trap again.
      // 🔴 ELEVATED, NOT TERTIARY. `--ui-bg-tertiary` is a translucent DARK overlay: correct in
      // dark mode, where "raised" means lighter, and backwards in light mode, where it rendered the
      // tile at ~#e0e0e0 — a grey hole punched into a #fcfcfc page. The reference's tile is #ffffff,
      // i.e. one step UP from the page in both themes, which is what `--ui-bg-elevated` means.
      // 🔴 THE GLYPH IS FULL-STRENGTH TEXT COLOUR, NOT THE SECONDARY STEP. The reference draws it
      // at its primary #0d0d0d; ours sat at 66% of that, so every row's leading mark looked faded
      // against the name right beside it and the left edge of the table read as washed out. The
      // tile is what makes the glyph quiet — dimming the glyph as well does it twice.
      className="grid size-[var(--list-icon-tile)] shrink-0 place-items-center rounded-[var(--shell-icon-button-radius)] bg-(--ui-bg-elevated) text-(--ui-text-primary) ring-1 ring-(--ui-stroke-tertiary)"
    >
      <Icon size={20} strokeWidth={2} />
    </span>
  );
}

/** One of the two views the list can be in. A control, not a word (§38.3). */
function ScopeTab({
  active,
  dropActive,
  icon: Icon,
  label,
  onClick,
  onDragLeaveTarget,
  onDragOverTarget,
  onDropInto,
}: {
  active: boolean;
  /** Something is hovering over it mid-drag. */
  dropActive?: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  onDragLeaveTarget?: () => void;
  onDragOverTarget?: () => void;
  /** Absent when nothing is being dragged, which is also what turns the drop affordance off. */
  onDropInto?: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      onDragLeave={onDropInto ? (event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDragLeaveTarget?.();
      } : undefined}
      onDragOver={onDropInto ? (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; onDragOverTarget?.(); } : undefined}
      onDrop={onDropInto ? (event) => { event.preventDefault(); onDropInto(); } : undefined}
      className={cn(
        // A filter chip at the toolbar's own height, matching the reference's All / Images /
        // Documents pills — 36px tall, fully rounded, 16px of padding either side, 14px medium.
        "flex h-[var(--control-height)] items-center gap-1.5 rounded-full px-[16px] text-[14px] font-medium transition-colors",
        active
          ? "bg-(--ui-bg-tertiary) text-(--ui-text-primary)"
          : "text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)",
        dropActive && "ring-1 ring-inset ring-(--ui-action) text-(--ui-text-primary)",
      )}
      onClick={onClick}
      type="button"
    >
      <Icon size={16} strokeWidth={2} />
      {label}
    </button>
  );
}

interface RowAction {
  label: string;
  run: () => void;
  icon: LucideIcon;
  danger?: boolean;
}

/** The per-row overflow. Small, and only ever filing actions — never a learning action (§48). */
function RowMenu({
  actions,
  name,
  onOpenChange,
  open,
}: {
  actions: RowAction[];
  name: string;
  /** Told to the row, which is the only element that can lift this menu clear of the rows below. */
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const setOpen = onOpenChange;

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open, setOpen]);

  return (
    // 🔴 RIGHT-ALIGNED, AND IT REACHES THE FRAME'S EDGE. Measured on the reference: the actions
    // cell is `justify-end` and overhangs its column by exactly the row's right padding, so the
    // menu button's right edge lands on the table's right edge rather than 8px inside it. Ours
    // sat at the LEFT of a 64px column, which put a floating 24px dot in the middle of nowhere
    // with 40px of blank after it — the single thing that most made the row look unfinished.
    // 🔴 THE STACKING IS NOT SOLVED HERE, AND IT CANNOT BE. Two attempts were made at this level —
    // `z-40` on the panel, then `z-50` on this wrapper — and both failed for the same reason: the
    // row above us carries `isolate`, so every z-index inside it is ranked only against its own
    // siblings and never against the next row. The row lifts itself instead; see `openMenu`.
    // `relative` stays because the panel is positioned against this box.
    <div className="relative -mr-[var(--list-row-pad-r)] flex justify-end">
      {/* 🔴 THE ONE MEASURED DEFECT §38.3 IS ABOUT. This carried `opacity-0` with
          `group-hover:opacity-100`, so EVERY row's rename, move, pin and delete lived behind a
          control that painted nothing until the pointer crossed it — 62 of 62 rows measured at
          `opacity: 0` at rest. On a touch screen, where there is no hover at all, they had no
          affordance whatsoever.

          It is drawn now and it is still quiet: the faintest text colour in the system, no
          border, no fill, stepping up to the ordinary hover treatment the rest of the surface
          uses. Visible ≠ loud (§19).

          🔴 AND IT SAYS WHICH ROW IT BELONGS TO. "Canvas actions" repeated 62 times is one label
          for 62 different controls, which is unusable with a screen reader and was also why the
          owner's own probe could only report that a button existed. The visible name is in the
          row beside it, so this is `aria-label` only. */}
      <button
        aria-label={`Actions for ${name}`}
        className="flex size-[var(--shell-icon-button)] shrink-0 items-center justify-center rounded-[var(--shell-icon-button-radius)] text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) focus-visible:bg-(--ui-bg-tertiary) focus-visible:text-(--ui-text-primary)"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
        type="button"
      >
        {/* Same 36px box and 20px glyph as every other bare icon button in the shell — it was a
            24px box holding a 14px glyph, a size that exists nowhere else in the product. */}
        <Ellipsis size={20} strokeWidth={2} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 max-h-[260px] w-[190px] overflow-y-auto rounded-xl bg-(--ui-bg-elevated) p-1 shadow-[0_8px_32px_rgba(0,0,0,0.12)] ring-1 ring-(--ui-stroke-tertiary)">
          {/* Every item in the menu is named AND drawn: §38.3 is "all library functions", and the
              menu is where rename, pin, move and delete actually live. */}
          {actions.map((action) => (
            <button
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-(--ui-bg-tertiary)",
                action.danger ? "text-red-500" : "text-(--ui-text-secondary)",
              )}
              key={action.label}
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                action.run();
              }}
              type="button"
            >
              <action.icon className="shrink-0 opacity-70" size={13} strokeWidth={2} />
              <span className="truncate">{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
