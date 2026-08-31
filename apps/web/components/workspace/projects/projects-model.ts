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
//   * `folders.pinned_at` EXISTS NOW (20260830T40) — the migration the first version of this
//     comment said a real pin would need. The "Pinned" filter reads it: pinned means *the learner
//     pinned this project*, exactly like a pinned canvas, and the sidebar's Pinned section shows
//     the same rows this filter keeps. `holdsPinned` (a project holding a pinned canvas) is still
//     computed — the sidebar's Pinned section is not the only reader of the tree — but it is no
//     longer what "Pinned" means here, because a filter named like the reference's must mean what
//     the reference's means.

import type { CanvasSummary, Folder } from "@/lib/learn/canvas-store";

export interface ProjectNode {
  id: string;
  name: string;
  /** ISO timestamp for the Modified column, or `""` when nothing dates it. */
  modifiedAt: string;
  /** True when this project, or anything nested inside it, holds a pinned canvas. */
  holdsPinned: boolean;
  /** The learner's own pin on the PROJECT itself (`folders.pinned_at`), or null. */
  pinnedAt: string | null;
  /** The project's own look and standing instructions, carried through from `Folder` so the
   *  pages drawing a node (`/projects`, `/projects/<id>`) can wear the learner's icon and colour
   *  without a second lookup. */
  icon: string | null;
  color: string | null;
  instructions: string | null;
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
      children: children.sort(byRecency),
      color: folder.color ?? null,
      holdsPinned: own.some((canvas) => Boolean(canvas.pinnedAt)) || children.some((child) => child.holdsPinned),
      icon: folder.icon ?? null,
      id: folder.id,
      instructions: folder.instructions ?? null,
      modifiedAt,
      name: folder.name,
      pinnedAt: folder.pinnedAt ?? null,
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

/**
 * One project, at any depth — the project PAGE's own lookup (`/projects/<id>`).
 *
 * 🔴 SAFE TO RECURSE PLAINLY, UNLIKE `buildProjects`. A ring in `folders.parent_id` cannot make
 * this loop forever, because `buildProjects` already turned whatever the database holds into a
 * genuine tree: its own `seen` set guarantees a folder is `child` of at most one node in the
 * output, so walking that OUTPUT can never revisit a node. The cycle guard belongs at the one
 * place the cycle can actually happen — the build — not at every place the built tree is read.
 */
export function findProject(nodes: readonly ProjectNode[], id: string): ProjectNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findProject(node.children, id);
    if (found) return found;
  }
  return null;
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
    // "Pinned" is the project's OWN pin (`folders.pinned_at`) — the same fact the sidebar's
    // Pinned section shows — not the older "holds a pinned canvas" reading. See the header.
    .filter((project) => (filter === "pinned" ? Boolean(project.pinnedAt) : true))
    .filter((project) => matchesQuery(project, query));
}
