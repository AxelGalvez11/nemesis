// Vault notes → graph index. Ported from desktop's `../library/vault`
// (loadVault/buildIndex/extractWikilinks) per graph-graph spec §B.2, minus the
// Electron filesystem coupling.
//
// v1: loadVaultNotes() always resolves []  — no cloud-synced Library note store
// exists yet in the web port (a browser has no filesystem, and the Library
// page is still a read-only stub per the C2 scope). That keeps this pipeline
// ready to wire up once cloud library sync lands, while guaranteeing the graph
// page always resolves status 'empty' and never mounts the WebGL canvas.

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

/** Link targets referenced by a note's content — wikilinks + relative .md links. */
export function extractWikilinks(content: string): string[] {
  const targets: string[] = [];
  for (const match of content.matchAll(WIKILINK_RE)) {
    const target = match[1]?.trim();
    if (target) targets.push(target);
  }
  for (const match of content.matchAll(MD_LINK_RE)) {
    const raw = match[1];
    if (!raw) continue;
    const basename = raw.split("/").pop() ?? raw;
    const title = basename.replace(/\.md$/i, "").trim();
    if (title) targets.push(title);
  }
  return targets;
}

/** Web replacement for the Electron `readDir` + `readFileText` vault walk. */
export async function loadVaultNotes(): Promise<VaultNote[]> {
  return [];
}

/** Resolves wikilink targets against note titles (case-insensitive); unresolved
 * targets become ghost nodes. Degree = in + out link count. */
export function buildGraphIndex(notes: VaultNote[]): GraphIndex {
  const byTitleLower = new Map<string, VaultNote>();
  for (const note of notes) byTitleLower.set(note.title.toLowerCase(), note);

  const degree = new Map<string, number>();
  const links: GraphLink[] = [];
  const ghostTitles = new Set<string>();
  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);

  for (const note of notes) {
    for (const target of extractWikilinks(note.content)) {
      const resolved = byTitleLower.get(target.toLowerCase());
      const targetId = resolved ? resolved.title : target;
      if (!resolved) ghostTitles.add(target);
      links.push({ source: note.title, target: targetId });
      bump(note.title);
      bump(targetId);
    }
  }

  const nodes: GraphNode[] = [
    ...notes.map((note) => ({ id: note.title, title: note.title, degree: degree.get(note.title) ?? 0, ghost: false })),
    ...Array.from(ghostTitles).map((title) => ({ id: title, title, degree: degree.get(title) ?? 0, ghost: true })),
  ];

  return { nodes, links, ghostCount: ghostTitles.size };
}
