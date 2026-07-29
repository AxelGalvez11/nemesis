// Pure path helpers for Study's "::"-delimited folders.
//
// Study has no folder table: a deck stores its folder as a prefix INSIDE its
// own name ("Pharm::Exam 1::Cardio"). So every folder rename or delete is a
// string rewrite fanned across many deck rows, and the one bug that matters is
// prefix matching that isn't segment-aware — a raw startsWith makes "Exam 1"
// swallow "Exam 10" and quietly rename or delete a folder the student never
// touched. Keeping the rewrite here makes that case testable without React or
// Supabase.

const SEPARATOR = "::";

/** Trim every segment and drop the empty ones ("a :: :: b" → "a::b"). */
export function normalizeGroupPath(value: string): string {
  return value.split(SEPARATOR).map((part) => part.trim()).filter(Boolean).join(SEPARATOR);
}

/** Last segment of a path — the name shown on the row. */
export function pathLeaf(path: string): string {
  const parts = normalizeGroupPath(path).split(SEPARATOR);
  return parts[parts.length - 1] ?? "";
}

/** Enclosing folder of a path, or "" when the item sits at the root. */
export function pathParent(path: string): string {
  return normalizeGroupPath(path).split(SEPARATOR).slice(0, -1).join(SEPARATOR);
}

/** Put `leaf` under `group`; an empty group leaves it at the root. */
export function joinGroupPath(group: string, leaf: string): string {
  const folder = normalizeGroupPath(group);
  const name = normalizeGroupPath(leaf);
  if (!folder) return name;
  if (!name) return folder;
  return `${folder}${SEPARATOR}${name}`;
}

/** True when `path` IS `ancestor` or sits beneath it. The trailing separator is
 *  what keeps "Exam 1" from matching "Exam 10". */
export function isWithinGroup(path: string, ancestor: string): boolean {
  const target = normalizeGroupPath(path);
  const root = normalizeGroupPath(ancestor);
  if (!root) return true;
  return target === root || target.startsWith(`${root}${SEPARATOR}`);
}

/** Swap a folder's last segment, keeping it where it lives. */
export function renamedGroupPath(path: string, nextLeaf: string): string {
  return joinGroupPath(pathParent(path), nextLeaf);
}

/** Rewrite `name` when its enclosing folder moves from `from` to `to`.
 *  Returns null when `name` is out of scope, so callers skip the write. */
export function rewriteGroupPrefix(name: string, from: string, to: string): string | null {
  const current = normalizeGroupPath(name);
  const source = normalizeGroupPath(from);
  if (!source || !isWithinGroup(current, source)) return null;
  const destination = normalizeGroupPath(to);
  const remainder = current.slice(source.length).replace(new RegExp(`^${SEPARATOR}`), "");
  const next = remainder ? joinGroupPath(destination, remainder) : destination;
  return next === current ? null : next;
}

/** Every deck at or beneath `group`, nested folders included. */
export function decksInGroup<T extends { name: string }>(decks: readonly T[], group: string): T[] {
  const root = normalizeGroupPath(group);
  if (!root) return [];
  return decks.filter((deck) => isWithinGroup(deck.name, root));
}

/** First free name in the "Cardio", "Cardio 2", "Cardio 3" series. Comparison is
 *  case-insensitive because Study treats deck names that way everywhere else. */
export function uniqueDeckName(desired: string, taken: ReadonlySet<string>): string {
  if (!taken.has(desired.toLowerCase())) return desired;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${desired} ${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return desired;
}

/** Plan the rename of every deck inside `group` one level up, which is how a
 *  folder is removed WITHOUT deleting anything (owner 2026-07-23: "make folder
 *  delete keep the contents"). The folder stops existing because nothing spells
 *  its prefix any more.
 *
 *  Two edges the naive version gets wrong:
 *  - A promoted deck can collide with one already sitting in the destination.
 *    Refusing would wedge the student on the delete they asked to be the safe
 *    one, and overwriting would lose a deck, so the promoted deck takes the next
 *    free name.
 *  - A deck named exactly like the folder ("Pharm" the deck beside "Pharm" the
 *    folder) promotes to "", which is not a name. It keeps what it has. */
export function planGroupDissolve<T extends { name: string }>(decks: readonly T[], group: string): { deck: T; name: string }[] {
  const source = normalizeGroupPath(group);
  if (!source) return [];
  const destination = pathParent(source);
  const taken = new Set(decks.filter((deck) => !isWithinGroup(deck.name, source)).map((deck) => normalizeGroupPath(deck.name).toLowerCase()));
  const plan: { deck: T; name: string }[] = [];
  for (const deck of decksInGroup(decks, source)) {
    const promoted = rewriteGroupPrefix(deck.name, source, destination);
    if (!promoted) {
      // Stays put, but still owns its name for the collision check below.
      taken.add(normalizeGroupPath(deck.name).toLowerCase());
      continue;
    }
    const name = uniqueDeckName(promoted, taken);
    taken.add(name.toLowerCase());
    plan.push({ deck, name });
  }
  return plan;
}

// ── Tests / Mindmaps folders ────────────────────────────────────────────────
// A folder on those tabs is NOT a "::" path like a deck group. It is a flat
// label in the artifact's `group_name` column, so the rules below are their own
// thing rather than a reuse of the deck helpers above.

/** Display name for artifacts with no folder. Stored as "" on the row itself. */
export const UNGROUPED_LABEL = "Ungrouped";

/** What a drag on the Tests/Mindmaps list is carrying. For a group, `name` is
 *  its full "::" path, not its displayed leaf. */
export type ArtifactDrag = { kind: "item"; id: string } | { kind: "group"; name: string };

// `artifactDropAccepts` used to live here: the drop rule for FLAT folders, where
// a folder-on-folder drop could only merge and "Ungrouped" was a row you could
// drop onto but never pick up. Deleted 2026-07-29 with the flat list — folders
// nest now, so folderDropAccepts below is the whole rule, and loose items sit at
// the top level rather than under a heading standing in for "no folder".

// ── Tests/Mindmaps: the same folder tree the Cards tab has ───────────────────
// Owner 2026-07-28: "tests page should be identical to cards page in terms of
// drag and drop functionality."
//
// Cards decks were already a tree, because a deck's folder lives as a "::"
// prefix inside its own name. A test artifact keeps its folder in `groupName`
// instead, but that is the same string with the same separator — so the tree,
// and every drop rule over it, is shared rather than reimplemented per tab.

export interface ArtifactTreeNode<T> {
  /** "group:<path>" or "item:<id>" — stable across renders, unique per tree. */
  id: string;
  /** The row's own name: a folder's last segment, or the artifact's title. */
  label: string;
  /** The folder this node sits IN (a folder's own path is `groupPath`+label). */
  groupPath: string;
  /** Full path for a folder; "" for an item row. */
  path: string;
  item: T | null;
  children: ArtifactTreeNode<T>[];
}

/**
 * Nest artifacts under their "::"-delimited folders.
 *
 * `extraGroups` are folders the student made that hold nothing yet — without
 * them an empty folder would vanish the moment its last test moved out, which
 * is not how a folder behaves anywhere else.
 *
 * Folders sort before items at every level, then alphabetically, matching the
 * Cards tab exactly.
 */
export function buildArtifactTree<T extends { id: string; title: string; groupName: string }>(
  items: readonly T[],
  extraGroups: readonly string[] = [],
): ArtifactTreeNode<T>[] {
  const roots: ArtifactTreeNode<T>[] = [];

  function ensureGroup(path: string): ArtifactTreeNode<T> | null {
    const parts = normalizeGroupPath(path).split(SEPARATOR).filter(Boolean);
    if (parts.length === 0) return null;
    let siblings = roots;
    let currentPath = "";
    let current: ArtifactTreeNode<T> | null = null;
    for (const label of parts) {
      const parent = currentPath;
      currentPath = joinGroupPath(currentPath, label);
      current = siblings.find((node) => node.id === `group:${currentPath}`) ?? null;
      if (!current) {
        current = { children: [], groupPath: parent, id: `group:${currentPath}`, item: null, label, path: currentPath };
        siblings.push(current);
      }
      siblings = current.children;
    }
    return current;
  }

  for (const group of extraGroups) ensureGroup(group);
  for (const item of items) {
    const groupPath = normalizeGroupPath(item.groupName ?? "");
    const siblings = ensureGroup(groupPath)?.children ?? roots;
    siblings.push({ children: [], groupPath, id: `item:${item.id}`, item, label: item.title, path: "" });
  }

  const sort = (nodes: ArtifactTreeNode<T>[]) => {
    nodes.sort((a, b) => Number(Boolean(a.item)) - Number(Boolean(b.item)) || a.label.localeCompare(b.label));
    for (const node of nodes) sort(node.children);
  };
  sort(roots);
  return roots;
}

/**
 * May folder `source` be dropped into folder `target`? ("" is the root.)
 *
 * The rule that matters is the third: dropping a folder inside its own
 * descendant detaches the whole subtree from the tree, because every path
 * rewrite would then be relative to a folder that no longer has a parent.
 * `isWithinGroup` is segment-aware, so "Exam 1" is not treated as an ancestor
 * of "Exam 10".
 */
export function folderDropAccepts(source: string, target: string): boolean {
  const from = normalizeGroupPath(source);
  const to = normalizeGroupPath(target);
  if (!from) return false; // the root is not a folder anyone can pick up
  if (from === to) return false; // onto itself
  if (isWithinGroup(to, from)) return false; // into its own descendant
  return pathParent(from) !== to; // already sitting there
}

/** Where folder `source` ends up once dropped into `target`. */
export function movedFolderPath(source: string, target: string): string {
  return joinGroupPath(target, pathLeaf(source));
}
