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

export type WikiTextPiece = { kind: "text"; text: string } | { kind: "wiki"; target: string; label: string };

/**
 * Split a run of plain text into text pieces and wiki-link pieces, in order.
 * The editor uses this to lift [[Target]] / [[Target|Label]] out of text and
 * into atomic link nodes; everything between stays untouched text.
 */
export function splitWikiLinks(text: string): WikiTextPiece[] {
  const pieces: WikiTextPiece[] = [];
  const pattern = new RegExp(WIKILINK_RE.source, "g");
  let cursor = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    const target = match[1]?.trim() ?? "";
    if (!target) continue;
    if (match.index > cursor) pieces.push({ kind: "text", text: text.slice(cursor, match.index) });
    pieces.push({ kind: "wiki", label: match[2]?.trim() || target, target });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) pieces.push({ kind: "text", text: text.slice(cursor) });
  return pieces;
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

/**
 * The base route Library-surface links should build on, from the pathname the
 * surface is mounted at. Keeps each mount self-contained: the docs Library at
 * /library, the classic fallback at /library/classic, and both of their
 * dev-preview harness mounts, without any of them leaking navigations into the
 * others. Order matters — longest prefix first.
 */
export function libraryRouteBase(pathname: string): string {
  if (pathname.startsWith("/dev-preview/workspace/library-classic")) return "/dev-preview/workspace/library-classic";
  if (pathname.startsWith("/dev-preview/workspace/")) return "/dev-preview/workspace/library";
  if (pathname.startsWith("/library/classic")) return "/library/classic";
  return "/library";
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
