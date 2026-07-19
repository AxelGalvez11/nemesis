import type { CloudLibraryNote } from "@/lib/workspace/library-tree";

export interface VaultNote {
  title: string;
  path: string;
  content: string;
  folder: string;
}

export interface GraphNode {
  id: string;
  title: string;
  degree: number;
  ghost: boolean;
  path: string | null;
  target: string | null;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphIndex {
  nodes: GraphNode[];
  links: GraphLink[];
  ghostCount: number;
}

const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
const MD_LINK_RE = /\[[^\]]*\]\(([^)]+\.md)\)/g;

export function extractWikilinks(content: string): string[] {
  const targets: string[] = [];
  for (const match of content.matchAll(WIKILINK_RE)) {
    const target = match[1]?.trim();
    if (target) targets.push(target);
  }
  for (const match of content.matchAll(MD_LINK_RE)) {
    const raw = match[1];
    if (!raw) continue;
    const title = (raw.split("/").pop() ?? raw).replace(/\.md$/i, "").trim();
    if (title) targets.push(title);
  }
  return targets;
}

export function cloudNotesToVault(notes: readonly CloudLibraryNote[]): VaultNote[] {
  return notes.map((note) => ({
    title: note.title,
    path: note.path,
    content: note.content,
    folder: note.path.split("/").slice(0, -1).join("/"),
  }));
}

function normalizeRef(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/\.(md|markdown|txt)$/i, "").toLocaleLowerCase();
}

export function buildGraphIndex(notes: VaultNote[]): GraphIndex {
  const byReference = new Map<string, VaultNote>();
  for (const note of notes) {
    byReference.set(normalizeRef(note.path), note);
    if (!byReference.has(normalizeRef(note.title))) byReference.set(normalizeRef(note.title), note);
    const basename = note.path.split("/").pop() ?? note.path;
    if (!byReference.has(normalizeRef(basename))) byReference.set(normalizeRef(basename), note);
  }

  const degree = new Map<string, number>();
  const links: GraphLink[] = [];
  const linkKeys = new Set<string>();
  const ghosts = new Map<string, string>();
  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);

  for (const note of notes) {
    for (const target of extractWikilinks(note.content)) {
      const resolved = byReference.get(normalizeRef(target));
      const targetId = resolved?.path ?? `ghost:${normalizeRef(target)}`;
      if (!resolved) ghosts.set(targetId, target);
      const key = `${note.path}\u0000${targetId}`;
      if (linkKeys.has(key)) continue;
      linkKeys.add(key);
      links.push({ source: note.path, target: targetId });
      bump(note.path);
      bump(targetId);
    }
  }

  const nodes: GraphNode[] = [
    ...notes.map((note) => ({ id: note.path, title: note.title, degree: degree.get(note.path) ?? 0, ghost: false, path: note.path, target: null })),
    ...Array.from(ghosts, ([id, target]) => ({ id, title: target, degree: degree.get(id) ?? 0, ghost: true, path: null, target })),
  ];

  return { nodes, links, ghostCount: ghosts.size };
}
