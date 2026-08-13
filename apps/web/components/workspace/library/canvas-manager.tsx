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
// 🔴 NO PREVIEW, AND NO SOURCE COUNT. §L's mock shows a `Sources` column; it does not ship, and
// not for cost reasons. `canvas_sources` is empty in production while canvases carry their
// sources inside `document`, so a count over that table would render `0` on a canvas with
// material attached — a confident false claim about the learner's own work. A sparse row that is
// always true beats a rich one that is wrong half the time.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Codicon } from "@/components/desktop-ui/codicon";
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
    <div className="mx-auto flex h-full w-full max-w-[880px] flex-col px-6 py-10">
      {/* ---------------------------------------------------------------- header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-[20px] font-medium tracking-[-0.01em] text-(--ui-text-primary)">Library</h1>

        <div className="relative">
          <Codicon
            className="pointer-events-none absolute left-[9px] top-1/2 -translate-y-1/2 text-(--ui-text-quaternary)"
            name="search"
            size="12px"
          />
          <input
            aria-label="Search canvases"
            className="w-[200px] rounded-lg bg-(--ui-bg-tertiary) py-[6px] pl-[28px] pr-[10px] text-[13px] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search canvases…"
            value={search}
          />
        </div>

        <select
          aria-label="Sort canvases"
          className="rounded-lg bg-(--ui-bg-tertiary) px-[8px] py-[6px] text-[13px] text-(--ui-text-secondary) outline-none"
          onChange={(event) => setSort(event.target.value as CanvasSort)}
          value={sort}
        >
          <option value="recent">Last opened</option>
          <option value="name">Name</option>
        </select>

        <button
          className="flex items-center gap-1.5 rounded-lg px-[10px] py-[6px] text-[13px] text-(--ui-text-secondary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
          onClick={async () => {
            const name = window.prompt(current ? `New folder inside ${current.name}` : "New folder");
            if (name?.trim()) await act(createFolder(userId, name.trim(), current?.id ?? null));
          }}
          type="button"
        >
          <Codicon name="new-folder" size="12px" />
          New folder
        </button>
      </div>

      {/* ---------------------------------------------------------------- where am I */}
      <div className="mt-5 flex items-center gap-1.5 text-[13px] text-(--ui-text-quaternary)">
        {searching ? (
          <span>Searching every canvas</span>
        ) : (
          <>
            <button
              className={cn("rounded px-1", scope === undefined ? "text-(--ui-text-primary)" : "hover:text-(--ui-text-secondary)")}
              onClick={() => open(undefined)}
              type="button"
            >
              All canvases
            </button>
            {current?.parentId && (
              <>
                <span>/</span>
                <button
                  className="rounded px-1 hover:text-(--ui-text-secondary)"
                  onClick={() => {
                    const parent = folders.find((entry) => entry.id === current.parentId);
                    if (parent) open(parent);
                  }}
                  type="button"
                >
                  {folders.find((entry) => entry.id === current.parentId)?.name ?? "…"}
                </button>
              </>
            )}
            {current && (
              <>
                <span>/</span>
                <span className="px-1 text-(--ui-text-primary)">{current.name}</span>
              </>
            )}
            {scope === null && (
              <>
                <span>/</span>
                <span className="px-1 text-(--ui-text-primary)">Unfiled</span>
              </>
            )}
            {scope === undefined && (
              <button
                className="ml-2 rounded px-1 hover:text-(--ui-text-secondary)"
                onClick={() => open(null)}
                type="button"
              >
                Unfiled
              </button>
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
        <div className="flex items-center gap-3 border-b border-(--ui-stroke-tertiary) px-2 pb-1.5 text-[11px] uppercase tracking-wide text-(--ui-text-quaternary)">
          <span className="flex-1">Name</span>
          <span className="w-[110px] shrink-0 text-right">Last opened</span>
          <span className="w-[24px] shrink-0" />
        </div>

        {visibleFolders.map((folder) => (
          <div
            className="group flex items-center gap-3 border-b border-(--ui-stroke-tertiary)/50 px-2 py-2.5"
            key={folder.id}
          >
            {editing?.id === folder.id ? (
              <input
                autoFocus
                className="flex-1 rounded bg-(--ui-bg-tertiary) px-1.5 py-1 text-[14px] text-(--ui-text-primary) outline-none"
                onBlur={commitRename}
                onChange={(event) => setEditing({ ...editing, value: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void commitRename();
                  if (event.key === "Escape") setEditing(null);
                }}
                value={editing.value}
              />
            ) : (
              <button className="flex flex-1 items-center gap-2 text-left" onClick={() => open(folder)} type="button">
                <Codicon className="text-(--ui-text-quaternary)" name="folder" size="13px" />
                <span className="truncate text-[14px] text-(--ui-text-primary)">{folder.name}</span>
              </button>
            )}
            <span className="w-[110px] shrink-0" />
            <RowMenu
              actions={[
                { label: "Rename", run: () => setEditing({ id: folder.id, kind: "folder", value: folder.name }) },
                { label: "Delete folder", run: () => setConfirming(folder) },
              ]}
            />
          </div>
        ))}

        {rows.map((canvas) => (
          <div
            className="group flex items-center gap-3 border-b border-(--ui-stroke-tertiary)/50 px-2 py-2.5"
            key={canvas.id}
          >
            {editing?.id === canvas.id ? (
              <input
                autoFocus
                className="flex-1 rounded bg-(--ui-bg-tertiary) px-1.5 py-1 text-[14px] text-(--ui-text-primary) outline-none"
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
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => router.push(`/learn?c=${canvas.id}`)}
                type="button"
              >
                {canvas.pinnedAt && <Codicon className="text-(--ui-text-quaternary)" name="pinned" size="11px" />}
                <span className="truncate text-[14px] text-(--ui-text-primary)">{canvas.title || "Untitled canvas"}</span>
              </button>
            )}
            <span className="w-[110px] shrink-0 text-right text-[13px] text-(--ui-text-quaternary)">
              {lastOpened(canvas.updatedAt)}
            </span>
            <RowMenu
              actions={[
                { label: "Rename", run: () => setEditing({ id: canvas.id, kind: "canvas", value: canvas.title }) },
                {
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
                  label: "Delete canvas",
                  run: () => {
                    // Soft delete — the row is flagged, never removed, and the learner's
                    // demonstrations survive regardless (`learner_evidence.canvas_id` is
                    // `on delete set null`). Still confirmed, because it disappears from view.
                    if (window.confirm(`Delete "${canvas.title || "Untitled canvas"}"?`)) {
                      void act(deleteCanvas(userId, canvas.id));
                    }
                  },
                },
              ]}
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
    </div>
  );
}

/** The per-row overflow. Small, and only ever filing actions — never a learning action (§48). */
function RowMenu({ actions }: { actions: { label: string; run: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  return (
    <div className="relative w-[24px] shrink-0">
      <button
        aria-label="Canvas actions"
        className="flex h-[24px] w-[24px] items-center justify-center rounded text-(--ui-text-quaternary) opacity-0 transition-opacity hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) focus-visible:opacity-100 group-hover:opacity-100"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        type="button"
      >
        <Codicon name="ellipsis" size="12px" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 max-h-[260px] w-[190px] overflow-y-auto rounded-xl bg-(--ui-bg-elevated) p-1 shadow-[0_8px_32px_rgba(0,0,0,0.12)] ring-1 ring-(--ui-stroke-tertiary)">
          {actions.map((action) => (
            <button
              className={cn(
                "block w-full truncate rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-(--ui-bg-tertiary)",
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
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
