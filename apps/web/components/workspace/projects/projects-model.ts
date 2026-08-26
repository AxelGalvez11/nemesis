// What the Projects page is looking at, worked out away from the pixels.
//
// 🔴 A PROJECT IS A FOLDER. There is no `projects` table and there must not be one — `folders`
// (migration 20260810T01) is already the object the sidebar groups under "Projects", the object
// the Library files outputs into, and the object a canvas points at through
// `learning_canvases.folder_id`. A second table would give the learner two kinds of container
// with the same name and no way to tell which one they made.
//
// 🔴 THE TWO COLUMNS ARE COMPUTED, NOT READ, AND BOTH HAD TO BE. The page shows Name and
// Modified:
//
//   * `folders.updated_at` EXISTS AND IS DEAD. The column is declared `not null default now()`
//     and no trigger anywhere bumps it — `renameFolder` writes `name` alone. Printing it as
//     "Modified" would print the creation date under a heading that says otherwise, for every
//     project, forever. So Modified is the most recent `updated_at` of the canvases inside
//     (at any depth), falling back to the folder's own `created_at` when it holds nothing yet.
//     That is also the honest answer to "when did I last work on this project".
//
//   * `folders` HAS NO `pinned_at`; only `learning_canvases` does. So the "Pinned" filter means
//     *this project holds something the learner pinned*, which is real data and a real filter.
//     A per-project pin would need a migration, and inventing one in the browser (localStorage)
//     would be a pin the sidebar could not see.

import type { CanvasSummary, Folder } from "@/lib/learn/canvas-store";

export interface ProjectNode {
  id: string;
  name: string;
  /** ISO timestamp for the Modified column, or `""` when nothing dates it. */
  modifiedAt: string;
  /** True when this project, or anything nested inside it, holds a pinned canvas. */
  holdsPinned: boolean;
  /** Canvases filed directly in this folder, most recently worked first. */
  canvases: CanvasSummary[];
  /** Sub-projects. The database caps nesting at two levels (`folders_depth_guard`). */
  children: ProjectNode[];
}

function later(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Fold the two lists the store already returns into the tree the page draws.
 *
 * 🔴 A CYCLE CANNOT HANG THIS, EVEN THOUGH THE DATABASE ALLOWS ONE. `setFolderParent`'s own
 * header says it: `folders.parent_id` has no ancestry check, so a bad move can make a ring, and
 * a naive recursive build would spin until the tab dies. The `seen` set makes a ring terminate
 * as a shorter branch instead.
 *
 * 🔴 AN ORPHAN STILL SHOWS. A folder whose parent is missing from `folders` (a partial read, a
 * row the learner cannot see) is treated as top level rather than dropped, because a project
 * that silently is not on the page reads as a deleted project.
 */
export function buildProjects(folders: readonly Folder[], canvases: readonly CanvasSummary[]): ProjectNode[] {
  const ids = new Set(folders.map((folder) => folder.id));
  const byParent = new Map<string, Folder[]>();
  for (const folder of folders) {
    const parent = folder.parentId && ids.has(folder.parentId) ? folder.parentId : null;
    if (parent === null) continue;
    const bucket = byParent.get(parent);
    if (bucket) bucket.push(folder);
    else byParent.set(parent, [folder]);
  }

  const held = new Map<string, CanvasSummary[]>();
  for (const canvas of canvases) {
    const folderId = canvas.folderId;
    if (!folderId || !ids.has(folderId)) continue;
    const bucket = held.get(folderId);
    if (bucket) bucket.push(canvas);
    else held.set(folderId, [canvas]);
  }

  const seen = new Set<string>();
  const build = (folder: Folder): ProjectNode => {
    seen.add(folder.id);
    const children = (byParent.get(folder.id) ?? []).filter((child) => !seen.has(child.id)).map(build);
    const own = (held.get(folder.id) ?? []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    let modifiedAt = folder.createdAt ?? "";
    for (const canvas of own) modifiedAt = later(modifiedAt, canvas.updatedAt);
    for (const child of children) modifiedAt = later(modifiedAt, child.modifiedAt);
    return {
      canvases: own,
      children,
      holdsPinned: own.some((canvas) => Boolean(canvas.pinnedAt)) || children.some((child) => child.holdsPinned),
      id: folder.id,
      modifiedAt,
      name: folder.name,
    };
  };

  const roots = folders.filter((folder) => !folder.parentId || !ids.has(folder.parentId));
  const nodes = roots.map(build);
  // 🔴 A RING HAS NO ROOT AT ALL, and filtering for one silently returned an EMPTY PAGE — every
  // project gone, no error, nothing to click. Two folders each naming the other as parent is a
  // state `setFolderParent` says the database will accept, so anything the walk never reached is
  // surfaced at the top level rather than left off the page.
  for (const folder of folders) if (!seen.has(folder.id)) nodes.push(build(folder));
  return nodes.sort(byRecency);
}

/** Most recently worked first — which is the only ordering a "Modified" column implies. */
function byRecency(a: ProjectNode, b: ProjectNode): number {
  return b.modifiedAt.localeCompare(a.modifiedAt);
}

/** Does this project, or any project nested in it, answer to what was typed? */
export function matchesQuery(node: ProjectNode, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (node.name.toLowerCase().includes(needle)) return true;
  return node.children.some((child) => matchesQuery(child, needle));
}

export type ProjectFilter = "all" | "pinned";

/** The rows the page actually draws, after the pill and the search box have had their say. */
export function visibleProjects(
  projects: readonly ProjectNode[],
  filter: ProjectFilter,
  query: string,
): ProjectNode[] {
  return projects
    .filter((project) => (filter === "pinned" ? project.holdsPinned : true))
    .filter((project) => matchesQuery(project, query));
}
