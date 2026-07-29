// Path arithmetic for Study's "::"-delimited folders — a port of the web's
// lib/workspace/study-tree.ts, which the phone needed once decks grew rename /
// move / delete (owner 2026-07-22).
//
// Study has no folder table: a deck stores its folder as a prefix INSIDE its own
// name ("Pharm::Exam 1::Cardio"). So every folder rename or move is a string
// rewrite fanned across many deck rows, and the one bug that matters is prefix
// matching that isn't segment-aware — a raw startsWith makes "Exam 1" swallow
// "Exam 10" and quietly rename or delete a folder the student never touched.
//
// Copied rather than reinvented so both clients rewrite names identically: a
// phone move that produced a different name from the web's would show up over
// there as a stray duplicate folder. lib/deck-tree.ts is the separate, already-
// existing module that BUILDS the tree; this one does the arithmetic on paths.

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

/** One folder or deck name, with the nesting syntax taken out of the student's
 *  hands (owner 2026-07-24: "folders shouldnt be created with the
 *  'folder::nested folder' syntax, users should just drag and drop, or add a
 *  drop down or use the 'move' function").
 *
 *  The "::" encoding stays — it is the storage contract this whole file exists
 *  to keep identical to the web app — but it stops being something anyone types.
 *  A name field now takes a LEAF and the parent comes from a dropdown, so any
 *  "::" someone pastes in is a separator they did not mean; folding it to a
 *  space keeps their words and drops the accidental nesting, where stripping it
 *  outright would silently glue two words together. */
export function safeLeafName(value: string): string {
  return value.split(SEPARATOR).map((part) => part.trim()).filter(Boolean).join(" ").trim();
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

export type ArtifactTreeRow<T> =
  | { collapsed: boolean; count: number; depth: number; label: string; path: string; type: "folder" }
  | { artifact: T; depth: number; type: "artifact" };

interface ArtifactFolder<T> {
  children: Map<string, ArtifactFolder<T>>;
  items: T[];
  label: string;
  path: string;
}

/** Build the Tests/Mindmaps tree from each artifact's `groupName`. Artifacts
 * keep their own identity; folders are virtual "::"-paths, exactly like cards. */
export function buildArtifactTreeRows<T extends { groupName: string }>(
  artifacts: readonly T[],
  collapsed: ReadonlySet<string>,
): ArtifactTreeRow<T>[] {
  const root: ArtifactFolder<T> = { children: new Map(), items: [], label: "", path: "" };
  for (const artifact of artifacts) {
    const parts = normalizeGroupPath(artifact.groupName).split(SEPARATOR).filter(Boolean);
    let folder = root;
    let path = "";
    for (const label of parts) {
      path = joinGroupPath(path, label);
      let child = folder.children.get(label);
      if (!child) {
        child = { children: new Map(), items: [], label, path };
        folder.children.set(label, child);
      }
      folder = child;
    }
    folder.items.push(artifact);
  }

  const count = (folder: ArtifactFolder<T>): number =>
    folder.items.length + [...folder.children.values()].reduce((sum, child) => sum + count(child), 0);

  const flatten = (folder: ArtifactFolder<T>, depth: number): ArtifactTreeRow<T>[] => {
    const rows: ArtifactTreeRow<T>[] = [];
    const children = [...folder.children.values()].sort((a, b) => a.label.localeCompare(b.label));
    for (const child of children) {
      const isCollapsed = collapsed.has(child.path);
      rows.push({ collapsed: isCollapsed, count: count(child), depth, label: child.label, path: child.path, type: "folder" });
      if (!isCollapsed) rows.push(...flatten(child, depth + 1));
    }
    rows.push(...folder.items.map((artifact) => ({ artifact, depth, type: "artifact" as const })));
    return rows;
  };
  return flatten(root, 0);
}

/** Every real and intermediate Tests/Mindmaps folder path. */
export function allArtifactGroupPaths<T extends { groupName: string }>(artifacts: readonly T[]): string[] {
  const paths = new Set<string>();
  for (const artifact of artifacts) {
    const parts = normalizeGroupPath(artifact.groupName).split(SEPARATOR).filter(Boolean);
    let path = "";
    for (const label of parts) {
      path = joinGroupPath(path, label);
      paths.add(path);
    }
  }
  return [...paths].sort((a, b) => a.localeCompare(b));
}
