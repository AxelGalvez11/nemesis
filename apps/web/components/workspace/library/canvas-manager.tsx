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
  ArrowUpDown,
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
 * 🔴 THREE COLUMNS, NOT THE REFERENCE'S FOUR. Its Library carries Name / Modified / Size, and the
 * obvious way to "look exactly like" it would be to add a third data column here. There is nothing
 * honest to put in one: `canvas_sources` is empty in production, so a source count would render 0
 * on a canvas that plainly has material attached, and a size in bytes is not a fact a learner has
 * any use for. An invented column is worse than an absent one, so Name takes the space Size would
 * have used and the geometry — 60px rows, a 16px gutter, a fixed meta column, one hairline rule —
 * is what carries the resemblance.
 */
const LIST_COLUMNS = "minmax(0,1fr) var(--list-col-meta) var(--list-col-actions)";

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
    return result;
  }, [effectiveScope, page, search, seedFolders, sort, table, userId]);

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

  /** Folders shown at this level: top-level when browsing everything, children when inside one.
   *  Hidden entirely during a search — a search is over canvases, and mixing in folders that do
   *  not match anything makes the result list read as noise. */
  const visibleFolders = useMemo(() => {
    if (searching || scope === null) return [];
    if (scope === undefined) return folders.filter((entry) => !entry.parentId);
    return folders.filter((entry) => entry.parentId === scope);
  }, [folders, scope, searching]);

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
    // 🔴 THE SAME FRAME THE COMPOSER USES, so Library and Canvas share one content column instead
    // of each choosing a width. It was `max-w-[880px]` against the reference's 768 — 112px wider,
    // which is most of why this page read as spread out: the same rows, stretched.
    <div className="mx-auto flex h-full w-full max-w-[var(--content-max-width)] flex-col px-[var(--page-gutter)] py-10">
      {/* ---------------------------------------------------------------- header
          🔴 TITLE LEFT, ONE ACTION RIGHT, EVERYTHING ELSE ON THE NEXT ROW. The toolbar used to be
          a single wrapping line holding the title, a search box, a sort select and a button, all
          at 13px on ~28px boxes — four different jobs at one weight, and on a narrow window they
          wrapped into a ragged block. The reference splits it: the page names itself and offers
          its one creating action, then filters and search sit on their own row above the table. */}
      <div className="flex items-center gap-[var(--list-gap)]">
        <h1 className="mr-auto text-[length:var(--page-title-size)] font-medium tracking-[-0.01em] text-(--ui-text-primary)">Library</h1>
        <button
          className="flex h-[var(--control-height)] shrink-0 items-center gap-1.5 rounded-full bg-(--ui-bg-tertiary) px-[14px] text-[14px] font-medium text-(--ui-text-primary) transition-colors hover:bg-(--ui-control-hover-background)"
          onClick={() => setNaming({ parentId: current?.id ?? null, value: "" })}
          type="button"
        >
          <FolderPlus size={16} strokeWidth={2} />
          New folder
        </button>
      </div>

      {/* Filters and search, one row, all at --control-height so the row reads as one bar. */}
      <div className="mt-4 flex items-center gap-2">
        {/* 🔴 `null` IS UNFILED, `undefined` IS EVERYTHING. Two different absences with two
            different meanings — reading either as "no folder" puts the learner in the wrong view. */}
        <ScopeTab active={scope === undefined} icon={Layers} label="All canvases" onClick={() => open(undefined)} />
        <ScopeTab active={scope === null} icon={Inbox} label="Unfiled" onClick={() => open(null)} />

        <div className="relative ml-auto">
          <Search
            className="pointer-events-none absolute left-[12px] top-1/2 -translate-y-1/2 text-(--ui-text-quaternary)"
            size={16}
            strokeWidth={2}
          />
          <input
            aria-label="Search canvases"
            className="h-[var(--control-height)] w-[220px] rounded-full bg-(--ui-bg-tertiary) pl-[36px] pr-[14px] text-[14px] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search canvases…"
            value={search}
          />
        </div>

        {/* 🔴 A GLYPH ON THE LEFT, AND DELIBERATELY NO CHEVRON. This is a native <select>, so the
            browser already draws its own arrow on the right — a second one would say "menu" twice
            and say nothing about what the menu is for. The sort icon is the missing half: at rest
            the control read as the words "Last opened" with no indication they were a choice. */}
        <div className="relative">
          <ArrowUpDown
            className="pointer-events-none absolute left-[12px] top-1/2 -translate-y-1/2 text-(--ui-text-quaternary)"
            size={16}
            strokeWidth={2}
          />
          <select
            aria-label="Sort canvases"
            className="h-[var(--control-height)] cursor-pointer rounded-full bg-(--ui-bg-tertiary) pl-[34px] pr-[10px] text-[14px] text-(--ui-text-secondary) outline-none hover:text-(--ui-text-primary)"
            onChange={(event) => setSort(event.target.value as CanvasSort)}
            value={sort}
          >
            <option value="recent">Last opened</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      {/* ---------------------------------------------------------------- where am I */}
      <div className="mt-5 flex items-center gap-1.5 text-[13px] text-(--ui-text-quaternary)">
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

      {/* 🔴 A REFUSED WRITE IS STATED, NEVER SWALLOWED. The store logs and returns void, so
          without this the learner would file a canvas, watch it stay put, and be told nothing. */}
      {failure && (
        <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-600">{failure}</p>
      )}

      {/* ---------------------------------------------------------------- the list */}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {/* 🔴 A GRID, NOT A FLEX ROW WITH A GAP. The header and every row below share one column
            template, so "Last opened" is genuinely the same column on every line instead of the
            result of each row's own flex maths. It was an 11px uppercase strip, which is a section
            label; the reference sets its column names at the same 14px as the data and lets colour
            carry the difference, so the header reads as part of the table rather than above it. */}
        <div
          className="grid h-[var(--list-header-height)] items-center gap-x-[var(--list-gap)] border-b border-(--ui-stroke-tertiary) px-2 text-[14px] text-(--ui-text-tertiary)"
          style={{ gridTemplateColumns: LIST_COLUMNS }}
        >
          <span>Name</span>
          <span>Last opened</span>
          <span />
        </div>

        {visibleFolders.map((folder) => (
          <div
            className="group grid min-h-[var(--list-row-height)] items-center gap-x-[var(--list-gap)] border-b border-(--ui-stroke-tertiary)/50 px-2 transition-colors hover:bg-(--ui-control-hover-background)"
            style={{ gridTemplateColumns: LIST_COLUMNS }}
            key={folder.id}
          >
            {editing?.id === folder.id ? (
              <input
                autoFocus
                className="min-w-0 rounded bg-(--ui-bg-tertiary) px-1.5 py-1 text-[16px] text-(--ui-text-primary) outline-none"
                onBlur={commitRename}
                onChange={(event) => setEditing({ ...editing, value: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void commitRename();
                  if (event.key === "Escape") setEditing(null);
                }}
                value={editing.value}
              />
            ) : (
              <button className="flex min-w-0 items-center gap-2 text-left" onClick={() => open(folder)} type="button">
                <FolderIcon className="shrink-0 text-(--ui-text-quaternary)" size={14} strokeWidth={2} />
                <span className="truncate text-[16px] text-(--ui-text-primary)">{folder.name}</span>
              </button>
            )}
            <span />
            <RowMenu
              actions={[
                { icon: Pencil, label: "Rename", run: () => setEditing({ id: folder.id, kind: "folder", value: folder.name }) },
                { danger: true, icon: Trash2, label: "Delete folder", run: () => setConfirming(folder) },
              ]}
              name={folder.name}
            />
          </div>
        ))}

        {rows.map((canvas) => (
          <div
            className="group grid min-h-[var(--list-row-height)] items-center gap-x-[var(--list-gap)] border-b border-(--ui-stroke-tertiary)/50 px-2 transition-colors hover:bg-(--ui-control-hover-background)"
            style={{ gridTemplateColumns: LIST_COLUMNS }}
            key={canvas.id}
          >
            {editing?.id === canvas.id ? (
              <input
                autoFocus
                className="min-w-0 rounded bg-(--ui-bg-tertiary) px-1.5 py-1 text-[16px] text-(--ui-text-primary) outline-none"
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
                className="flex min-w-0 items-center gap-2 text-left"
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
                <PanelsTopLeft className="shrink-0 text-(--ui-text-quaternary)" size={13} strokeWidth={2} />
                <span className="truncate text-[16px] text-(--ui-text-primary)">{canvas.title || "Untitled canvas"}</span>
                {/* The learner's own mark, kept — the one honest per-canvas distinction there is. */}
                {canvas.pinnedAt && <Pin className="shrink-0 text-(--ui-text-quaternary)" size={11} strokeWidth={2} />}
              </button>
            )}
            <span className="truncate text-[14px] text-(--ui-text-tertiary)">
              {lastOpened(canvas.updatedAt)}
            </span>
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
            />
          </div>
        ))}

        {!loading && rows.length === 0 && visibleFolders.length === 0 && (
          <p className="px-2 py-8 text-[14px] text-(--ui-text-tertiary)">
            {searching ? `Nothing matches "${search.trim()}".` : "Nothing here yet."}
          </p>
        )}

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

/** One of the two views the list can be in. A control, not a word (§38.3). */
function ScopeTab({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        // A filter chip at the toolbar's own height, matching the reference's All / Images /
        // Documents pills. It was a 13px control on a ~21px box, which read as a link.
        "flex h-[var(--control-height)] items-center gap-1.5 rounded-full px-[14px] text-[14px] font-medium transition-colors",
        active
          ? "bg-(--ui-bg-tertiary) text-(--ui-text-primary)"
          : "text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)",
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
function RowMenu({ actions, name }: { actions: RowAction[]; name: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  return (
    <div className="relative w-[24px] shrink-0">
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
        className="flex h-[24px] w-[24px] items-center justify-center rounded-md text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) focus-visible:bg-(--ui-bg-tertiary) focus-visible:text-(--ui-text-primary)"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        type="button"
      >
        <Ellipsis size={14} strokeWidth={2} />
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
