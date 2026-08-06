// What a note's breadcrumb trail actually contains.
//
// Split out of docs-crumbs.tsx so the rules that are easy to get subtly wrong —
// which crumbs are navigable, how deep chains fold, and the folder-page case
// where the page and its folder are the same thing — can be tested without
// rendering anything.

export type LibraryCrumb =
  /** The Library root. Always first, always navigable. */
  | { kind: "root" }
  /** Folded ancestors, e.g. "…". Carries their names for the tooltip. */
  | { kind: "folded"; hidden: string[] }
  /** A folder page above this one. */
  | { kind: "folder"; label: string; target: string }
  /** The page being read. Never navigable — see the note in docs-crumbs.tsx. */
  | { kind: "current"; label: string };

/** Crumbs communicate LOCATION, not storage depth (owner 2026-08-05: "aim for
 *  roughly 2–3 meaningful levels; hide the complexity"). Deeper chains keep
 *  their last two levels and fold the rest. */
export const MAX_VISIBLE_SEGMENTS = 2;

/**
 * The trail for a note at `path`'s folder chain, titled `currentTitle`.
 *
 * `folderPath` is the chain ABOVE the page — "" for a note at the root, which
 * yields just the root crumb plus the page.
 */
export function libraryCrumbs(folderPath: string, currentTitle: string): LibraryCrumb[] {
  const segments = folderPath.split("/").map((segment) => segment.trim()).filter(Boolean);
  const hiddenCount = Math.max(0, segments.length - MAX_VISIBLE_SEGMENTS);
  const visible = segments.slice(hiddenCount);
  const current = currentTitle.trim();

  // 🔴 A FOLDER'S OWN PAGE IS ITS FOLDER. Folders are notes here (the Notion
  // model, owner 2026-08-04), so opening "Constitutional law" lands on a note of
  // that name INSIDE a folder of that name. Appending the title naively renders
  // "Library / Constitutional law / Constitutional law"; the last folder crumb
  // already IS this page, so it becomes the current one rather than repeating.
  const selfTitled = current !== "" && visible.length > 0 && visible[visible.length - 1] === current;

  const crumbs: LibraryCrumb[] = [{ kind: "root" }];
  if (hiddenCount > 0) crumbs.push({ hidden: segments.slice(0, hiddenCount), kind: "folded" });
  visible.forEach((segment, index) => {
    const last = index === visible.length - 1;
    if (selfTitled && last) {
      crumbs.push({ kind: "current", label: segment });
      return;
    }
    crumbs.push({ kind: "folder", label: segment, target: segments.slice(0, hiddenCount + index + 1).join("/") });
  });
  if (current !== "" && !selfTitled) crumbs.push({ kind: "current", label: current });
  return crumbs;
}
