import { titleFromPath, type CloudLibraryNote } from "./library-tree";

const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;

export interface LibraryLink {
  target: string;
  label: string;
}

export function extractLibraryLinks(content: string): LibraryLink[] {
  const seen = new Set<string>();
  const links: LibraryLink[] = [];
  for (const match of content.matchAll(WIKILINK_RE)) {
    const target = match[1]?.trim() ?? "";
    if (!target) continue;
    const key = target.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ target, label: match[2]?.trim() || target });
  }
  return links;
}

function normalizedReference(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/\.(md|markdown|txt)$/i, "").toLocaleLowerCase();
}

export function findLibraryNote(notes: readonly CloudLibraryNote[], target: string): CloudLibraryNote | null {
  const wanted = normalizedReference(target);
  return (
    notes.find((note) => normalizedReference(note.path) === wanted) ??
    notes.find((note) => normalizedReference(note.title) === wanted) ??
    notes.find((note) => normalizedReference(titleFromPath(note.path)) === wanted) ??
    null
  );
}

export function backlinksFor(notes: readonly CloudLibraryNote[], target: CloudLibraryNote): CloudLibraryNote[] {
  return notes.filter(
    (note) => note.id !== target.id && extractLibraryLinks(note.content).some((link) => findLibraryNote([target], link.target) !== null),
  );
}

export function wikiLinksToMarkdown(content: string): string {
  return content.replace(WIKILINK_RE, (_whole, rawTarget: string, rawLabel?: string) => {
    const target = rawTarget.trim();
    const label = rawLabel?.trim() || target;
    return `[${label}](#nemesis-note=${encodeURIComponent(target)})`;
  });
}

export function obsidianTagsToMarkdown(text: string): string {
  const normalized = text.replace(/^\s*tags:\s*\[([^\]]*)\]\s*$/gim, (_line, rawTags: string) => {
    const tags = rawTags.split(",").map((tag) => tag.trim().replace(/^['\"]|['\"]$/g, "")).filter(Boolean);
    return tags.map((tag) => `#${tag.replace(/\s+/g, "-")}`).join(" ");
  });

  let fenced = false;
  return normalized.split("\n").map((line) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return line;
    }
    if (fenced || /^\s*#{1,6}\s/.test(line)) return line;
    return line.replace(/(^|[\s(])#([\p{L}\p{N}_-]+)/gu, (_match, prefix: string, tag: string) => (
      `${prefix}[#${tag}](#nemesis-tag=${encodeURIComponent(tag)})`
    ));
  }).join("\n");
}

export function normalizeLibraryFolder(value: string): string {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim().replace(/[<>:"|?*]/g, ""))
    .filter(Boolean)
    .join("/");
}

export function safeLibraryTitle(value: string): string {
  return value.trim().replace(/[\\/:<>"|?*]/g, "-").replace(/\s+/g, " ").slice(0, 120) || "Untitled note";
}

export function notePathFor(title: string, folder = ""): string {
  const filename = `${safeLibraryTitle(title)}.md`;
  const normalizedFolder = normalizeLibraryFolder(folder);
  return normalizedFolder ? `${normalizedFolder}/${filename}` : filename;
}
