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

/** True for links we should hand straight to the OS opener (real web/mail/tel). */
export function isExternalUrl(url: string): boolean {
  return /^(https?|mailto|tel):/i.test(url);
}

/** Resolve ANY in-note link to a target note's pathHash, or null. Handles both
 *  our wikilink: scheme AND a bare relative note reference the agent may write as
 *  an ordinary markdown link — [text](Some Note.md) or [text](Folder/Note) — which
 *  the wikilink preprocessor never touches. This is why taps used to die silently:
 *  a relative .md link isn't a wikilink and isn't external, so nothing handled it.
 *  Matches on the full relative path first, then the basename (Obsidian's
 *  shortest-path style). Heading anchors and a leading ./ or / are stripped. */
export function resolveInternalHref(url: string, resolver: Map<string, string>): string | null {
  if (url.startsWith(WIKILINK_SCHEME)) return resolveWikilinkUrl(url, resolver);
  if (isExternalUrl(url)) return null;
  let raw = url;
  try {
    raw = decodeURIComponent(url);
  } catch {
    // keep the raw form if it isn't valid percent-encoding
  }
  const target = raw.split("#")[0].replace(/^\.?\//, "").trim();
  if (!target) return null;
  const byPath = resolver.get(normalizeLinkKey(target));
  if (byPath) return byPath;
  const base = target.split("/").pop() ?? target;
  return resolver.get(normalizeLinkKey(base)) ?? null;
}
