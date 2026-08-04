// Inline citations in notes (owner 2026-08-04: "there should be inline
// citation pills and a bottom sources section for any that require sources").
//
// A CITATION IS JUST A MARKDOWN LINK whose whole text is a small number:
// [1](https://…) for a web source, [2](?source=<id>) for a Library source
// file. Nothing extra is stored, so a note exported anywhere degrades to a
// tiny numbered link instead of broken syntax. The editor renders these as
// favicon pills (note-editor.tsx), and the Sources section at the bottom of a
// note is DERIVED from them here — it can never drift from the prose the way
// a hand-written list can.
//
// 🔴 NO DOM. Same rule as note-markdown.ts — the phone renders notes too.

/** The whole link text must be a bare 1–3 digit number to count. */
export const CITATION_TEXT_RE = /^\d{1,3}$/;

export interface NoteCitation {
  /** The citation's visible number — the first one seen for this target. */
  n: number;
  /** Web URL, or a Library-source reference like "?source=<id>". */
  href: string;
}

/** The Library-source id a citation points at, or null for web citations. */
export function citationSourceId(href: string): string | null {
  if (!href.startsWith("?source=")) return null;
  const id = href.slice("?source=".length);
  try {
    return decodeURIComponent(id) || null;
  } catch {
    return id || null;
  }
}

/** Only http(s) may leave the app from a note link — never javascript: etc. */
export function isSafeExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href.trim());
}

// A [n](target) link that is not an image (![n]) and not a wiki construct
// ([[n]]). The target must be bracket-, space- and quote-free — real URLs and
// ?source= refs are; prose accidentally shaped like this is not.
const CITATION_LINK_RE = /(?<![!\[])\[(\d{1,3})\]\(([^()\s"']+)\)/g;

/**
 * Every citation in a note, in order of first appearance, deduplicated by
 * target (the first number wins — repeated cites of one source are one row in
 * the Sources section). Fenced code contributes nothing.
 */
export function extractNoteCitations(markdown: string): NoteCitation[] {
  const seen = new Set<string>();
  const citations: NoteCitation[] = [];
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    for (const match of line.matchAll(CITATION_LINK_RE)) {
      const href = match[2] ?? "";
      const n = Number.parseInt(match[1] ?? "", 10);
      if (!href || !Number.isFinite(n)) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      citations.push({ href, n });
    }
  }
  return citations;
}
