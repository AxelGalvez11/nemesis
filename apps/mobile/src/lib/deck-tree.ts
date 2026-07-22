// The nested deck-folder tree — a port of the web workspace's buildDeckTree
// (components/workspace/study/cards-tab.tsx) to the phone.
//
// Study decks have no server-side folder entity: a deck's own NAME is the
// path, using Anki's "Group::Subgroup::Leaf" convention. The phone used to
// flatten everything above the leaf into a single label, so
// "Pharm::Cardio::Beta blockers" rendered under one folder literally called
// "Pharm::Cardio" with no "Pharm" above it (owner bug, 2026-07-22). This
// module builds the real tree instead: every level becomes its own folder,
// parents are auto-created even when no deck sits directly in them, counts sum
// up from every descendant, and collapsing a folder takes its whole subtree
// with it.
//
// Deliberately generic over the deck payload and free of React/Supabase
// imports: the screen hands in whatever row shape it already computed, and
// this stays a pure, unit-testable module (deck-tree.test.ts).
//
// ONE DIVERGENCE FROM WEB, ON PURPOSE: web sorts every sibling alphabetically.
// The phone's deck list is a "what do I study right now" surface, so within a
// level FOLDERS sort alphabetically but DECKS sort due-first (the ordering the
// Study screen has always used). Don't "fix" this back to web's — the test
// "folders sort alphabetically; decks in a level sort due-first" pins it.

/** One deck handed to the tree. `name` is the full "A::B::Leaf" deck name;
 *  `actionable` is new+due (what the folder badge counts) and `total` is the
 *  deck's whole card count. `deck` is the caller's own row, passed straight
 *  back out on the matching node. */
export interface DeckTreeItem<T> {
  actionable: number;
  deck: T;
  name: string;
  total: number;
}

export interface DeckTreeNode<T> {
  /** Sums every descendant on a folder; the deck's own number on a leaf. */
  actionable: number;
  children: DeckTreeNode<T>[];
  /** Null on a folder, the caller's row on a deck. */
  deck: T | null;
  id: string;
  /** This node's OWN segment ("Cardio"), never the full path. */
  label: string;
  /** The full "A::B" path — unique, and what collapse state keys off, since
   *  two different parents can each hold a folder named "Cardio". */
  path: string;
  total: number;
}

export type DeckTreeRow<T> =
  | { actionable: number; collapsed: boolean; depth: number; label: string; path: string; total: number; type: "folder" }
  | { deck: T; depth: number; label: string; path: string; type: "deck" };

/** Splits a deck name into clean path segments, dropping blank ones so
 *  "A :: :: B" is just A → B. */
function segments(name: string): string[] {
  return name.split("::").map((part) => part.trim()).filter(Boolean);
}

function joinPath(parts: readonly string[]): string {
  return parts.join("::");
}

/** Orders one level: folders first (alphabetical), then decks (due-first,
 *  ties alphabetical). See the file header on why this differs from web. */
function compareNodes<T>(a: DeckTreeNode<T>, b: DeckTreeNode<T>): number {
  const aIsDeck = a.deck !== null ? 1 : 0;
  const bIsDeck = b.deck !== null ? 1 : 0;
  if (aIsDeck !== bIsDeck) return aIsDeck - bIsDeck;
  if (aIsDeck === 0) return a.label.localeCompare(b.label);
  return b.actionable - a.actionable || a.label.localeCompare(b.label);
}

function sortTree<T>(nodes: DeckTreeNode<T>[]): void {
  nodes.sort(compareNodes);
  for (const node of nodes) sortTree(node.children);
}

/** Walks bottom-up so a folder's badge includes grandchildren, not just the
 *  decks sitting directly inside it. Leaves keep the numbers they came with. */
function rollUp<T>(node: DeckTreeNode<T>): { actionable: number; total: number } {
  if (node.deck !== null) return { actionable: node.actionable, total: node.total };
  let actionable = 0;
  let total = 0;
  for (const child of node.children) {
    const sums = rollUp(child);
    actionable += sums.actionable;
    total += sums.total;
  }
  node.actionable = actionable;
  node.total = total;
  return { actionable, total };
}

/** Builds the folder tree. Input is never mutated — the nodes are new objects
 *  and only they are sorted/summed in place while being assembled. */
export function buildDeckTree<T>(items: readonly DeckTreeItem<T>[]): DeckTreeNode<T>[] {
  const roots: DeckTreeNode<T>[] = [];

  /** Walks/creates each level of `parts` and returns the child list a deck at
   *  that path belongs in — this is what auto-creates missing parents. */
  function ensureGroup(parts: readonly string[]): DeckTreeNode<T>[] {
    let siblings = roots;
    let path = "";
    for (const label of parts) {
      path = path ? `${path}::${label}` : label;
      const id = `group:${path}`;
      let node = siblings.find((candidate) => candidate.id === id);
      if (!node) {
        node = { actionable: 0, children: [], deck: null, id, label, path, total: 0 };
        siblings.push(node);
      }
      siblings = node.children;
    }
    return siblings;
  }

  items.forEach((item, index) => {
    const parts = segments(item.name);
    // A name that is nothing but separators keeps its raw text and lands loose
    // at the root rather than vanishing.
    const label = parts.pop() ?? item.name;
    const parentPath = joinPath(parts);
    ensureGroup(parts).push({
      actionable: item.actionable,
      children: [],
      deck: item.deck,
      id: `deck:${index}`,
      label,
      path: parentPath ? `${parentPath}::${label}` : label,
      total: item.total,
    });
  });

  for (const root of roots) rollUp(root);
  sortTree(roots);
  return roots;
}

/** Flattens the tree into the row list the screen renders, depth-first, with
 *  an indent `depth` per row. A collapsed folder is emitted but NOT recursed
 *  into, so its entire subtree — children, grandchildren and all — is hidden
 *  by construction rather than by a separate cascade rule. */
export function flattenDeckTree<T>(
  nodes: readonly DeckTreeNode<T>[],
  collapsed: ReadonlySet<string>,
  depth = 0,
): DeckTreeRow<T>[] {
  const rows: DeckTreeRow<T>[] = [];
  for (const node of nodes) {
    if (node.deck !== null) {
      rows.push({ deck: node.deck, depth, label: node.label, path: node.path, type: "deck" });
      continue;
    }
    const isCollapsed = collapsed.has(node.path);
    rows.push({
      actionable: node.actionable,
      collapsed: isCollapsed,
      depth,
      label: node.label,
      path: node.path,
      total: node.total,
      type: "folder",
    });
    if (!isCollapsed) rows.push(...flattenDeckTree(node.children, collapsed, depth + 1));
  }
  return rows;
}

/** Every folder path in the set, INCLUDING intermediate ancestors — seeding
 *  the default-collapsed state off only the deepest group would leave inner
 *  folders open the moment a student expands a root. Sorted for stability. */
export function allGroupPaths(names: readonly string[]): string[] {
  const paths = new Set<string>();
  for (const name of names) {
    const parts = segments(name);
    parts.pop();
    let path = "";
    for (const label of parts) {
      path = path ? `${path}::${label}` : label;
      paths.add(path);
    }
  }
  return [...paths].sort((a, b) => a.localeCompare(b));
}
