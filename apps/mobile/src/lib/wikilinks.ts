// Wikilink support for the read-only note viewer: turn Obsidian-style
// [[Target|label]] into a tappable markdown link, and build the title/basename →
// pathHash map the viewer uses to resolve a tap to another note. Pure +
// dependency-free so it Deno-tests (repo convention, like library-sync.ts).

const WIKILINK_RE = /\[\[([^\[\]\n]+)\]\]/g;
export const WIKILINK_SCHEME = "wikilink:";

/** Case-insensitive lookup key: trimmed, lower-cased, .md dropped. */
export function normalizeLinkKey(name: string): string {
  return name.trim().replace(/\.md$/i, "").toLowerCase();
}

/** [[Target]] / [[Target|Label]] / [[Target#Heading]] → [Label](wikilink:Target).
 *  The link TEXT is the label (or the raw target); the URL carries the resolve
 *  target. Malformed/empty markers pass through as literal text. */
export function preprocessWikilinks(markdown: string): string {
  return markdown.replace(WIKILINK_RE, (whole, inner: string) => {
    const pipe = inner.indexOf("|");
    const rawTarget = pipe === -1 ? inner : inner.slice(0, pipe);
    const label = pipe === -1 ? "" : inner.slice(pipe + 1).trim();
    const target = rawTarget.split("#")[0].trim();
    if (!target) return whole;
    // No label → show the target WITHOUT its #heading (Obsidian's display rule).
    const text = label || target;
    return `[${text}](${WIKILINK_SCHEME}${encodeURIComponent(target)})`;
  });
}

export interface ResolvableNote {
  title: string;
  path: string;
  pathHash: string;
}

/** Build the resolver: a note is reachable by its title, its file basename, and
 *  its full path (all normalized). The FIRST note wins a key collision, so the
 *  map is stable regardless of iteration order (callers pass a sorted list). */
export function buildNoteResolver(notes: ResolvableNote[]): Map<string, string> {
  const map = new Map<string, string>();
  const add = (key: string, pathHash: string) => {
    if (key && !map.has(key)) map.set(key, pathHash);
  };
  for (const note of notes) {
    add(normalizeLinkKey(note.title), note.pathHash);
    add(normalizeLinkKey(note.path.split("/").pop() ?? ""), note.pathHash);
    add(normalizeLinkKey(note.path), note.pathHash);
  }
  return map;
}

/** A wikilink: URL → the target note's pathHash, or null (not a wikilink, or
 *  unresolved — a link to a note that doesn't exist / isn't synced). */
export function resolveWikilinkUrl(url: string, resolver: Map<string, string>): string | null {
  if (!url.startsWith(WIKILINK_SCHEME)) return null;
  const target = decodeURIComponent(url.slice(WIKILINK_SCHEME.length));
  return resolver.get(normalizeLinkKey(target)) ?? null;
}

/** True for our internal wikilink URLs (so the viewer can swallow unresolved ones
 *  instead of handing "wikilink:…" to the OS link opener). */
export function isWikilinkUrl(url: string): boolean {
  return url.startsWith(WIKILINK_SCHEME);
}
