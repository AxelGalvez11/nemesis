// Inline citations in notes (owner 2026-08-04: "there should be inline
// citation pills and a bottom sources section for any that require sources").
//
// A CITATION IS JUST A MARKDOWN LINK whose whole text is a small number:
// [1](https://…) for a web source, [2](?source=<id>) for a Library source
// file. Nothing extra is stored, so a note exported anywhere degrades to a
// tiny numbered link instead of broken syntax. The editor renders these as
// pills (note-editor.tsx), and the Sources section at the bottom of a note is
// DERIVED from them here — it can never drift from the prose the way a
// hand-written list can.
//
// ── WHERE THE PILL'S WORDS COME FROM (2026-08-06) ──────────────────────────
//
// Owner: "important claims should be traceable back to the source … Lecture 6 ·
// Slide 18". None of that text is in the markdown, and it deliberately is not.
// A citation carries an ID and a LOCATION; the words are looked up from the
// source itself when the note is rendered (describeCitation below). Two reasons:
// renaming a file must not leave a note quoting the old name, and a note that
// travels anywhere else still degrades to a plain "[1]" rather than to a stale
// caption.
//
// So the anchor rides in the href, using the SAME parameters the reader already
// consumes (lib/reader/reader-anchor.ts — `page`, `slide`, `q`):
//
//   ?source=<id>                     the file, wherever it opens
//   ?source=<id>&page=18             page/slide 18 of it
//   ?source=<id>&slide=18            the same thing, spelled for a deck
//   ?source=<id>&page=4&q=<phrase>   …and highlight that phrase on arrival
//   ?source=<id>&t=762               12:42 into a recording
//
// Every one of those is backward-compatible: a plain `?source=<id>` written
// before this existed still parses, still renders, still opens the file.
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

/** Where in a source a citation points. All null = "just open the file". */
export interface CitationAnchor {
  /** 1-based page / slide / sheet. */
  unit: number | null;
  /** Passage to highlight on arrival, verbatim. */
  query: string | null;
  /** Seconds into a recording. */
  seconds: number | null;
}

export const NO_CITATION_ANCHOR: CitationAnchor = { unit: null, query: null, seconds: null };

/**
 * Read `key=value` out of a citation href's query string.
 *
 * Hand-rolled rather than `new URLSearchParams(...)` because this module is
 * shared with the phone and a `?source=…` fragment is not a URL any parser
 * accepts on its own. Small enough to be obvious, and it cannot throw.
 */
function citationParam(href: string, key: string): string | null {
  const start = href.indexOf("?");
  if (start < 0) return null;
  for (const pair of href.slice(start + 1).split("&")) {
    const split = pair.indexOf("=");
    if (split < 0) continue;
    if (pair.slice(0, split) !== key) continue;
    const raw = pair.slice(split + 1);
    if (!raw) return null;
    try {
      return decodeURIComponent(raw.replace(/\+/g, " ")) || null;
    } catch {
      return raw;
    }
  }
  return null;
}

function positiveInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** The Library-source id a citation points at, or null for web citations. */
export function citationSourceId(href: string): string | null {
  if (!href.startsWith("?source=")) return null;
  // Read it as a parameter rather than "everything after the prefix" — that
  // older form swallowed `&page=18` into the id and turned every anchored
  // citation into a lookup for a source that does not exist.
  return citationParam(href, "source");
}

/** Where inside the source this citation points. Unrecognised or malformed
 *  values are DROPPED, never clamped: a link claiming "page banana" is broken,
 *  and quietly landing on page 1 hides that. */
export function citationAnchor(href: string): CitationAnchor {
  if (!href.startsWith("?source=")) return NO_CITATION_ANCHOR;
  return {
    unit: positiveInteger(citationParam(href, "page") ?? citationParam(href, "slide")),
    query: citationParam(href, "q"),
    // `t` is seconds, and 0 is a legitimate timestamp — so this one accepts
    // zero where `unit` does not (there is no page 0).
    seconds: (() => {
      const raw = citationParam(href, "t");
      if (raw === null || !/^\d+$/.test(raw)) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    })(),
  };
}

/** m:ss, or h:mm:ss past an hour — how a timestamp reads on a pill. */
export function citationClock(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(whole / 3_600);
  const minutes = Math.floor((whole % 3_600) / 60);
  const seconds = whole % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Longest source name a pill shows before it clips. Past this the pill starts
 *  competing with the sentence it is attached to, which is the opposite of
 *  "visually quiet". */
export const CITATION_NAME_MAX = 22;

function shortName(name: string): string {
  const withoutExtension = name.trim().replace(/\.[a-z0-9]{1,5}$/i, "");
  const compact = withoutExtension.replace(/\s+/g, " ").trim();
  if (compact.length <= CITATION_NAME_MAX) return compact;
  return `${compact.slice(0, CITATION_NAME_MAX - 1).trimEnd()}…`;
}

export interface CitationSubject {
  /** The file's own name, e.g. "Con Law – Week 4 slides.pdf". */
  name: string;
  /** LibrarySourceKind — decides whether a unit is a slide or a page. */
  kind: string;
}

/**
 * What one citation pill says: `<source> · <where>`.
 *
 * "Con Law – Week 4 slides · Slide 18", "Lecture 9 · 12:42", "Syllabus · Page 4"
 * — the shapes the owner asked for, built from the source and the anchor rather
 * than from anything written into the note.
 *
 * A citation with no anchor is just the source name: still traceable, and
 * honest about not knowing where in the file the claim came from.
 */
export function describeCitation(subject: CitationSubject, anchor: CitationAnchor): string {
  const name = shortName(subject.name);
  if (anchor.seconds !== null) return `${name} · ${citationClock(anchor.seconds)}`;
  if (anchor.unit !== null) {
    const noun = UNIT_NOUN[subject.kind] ?? "Part";
    return `${name} · ${noun} ${anchor.unit}`;
  }
  return name;
}

/** Capitalised for a pill. Mirrors unitNoun() in lib/reader/reader-anchor.ts —
 *  the note and the reader must call the same thing by the same name. */
const UNIT_NOUN: Record<string, string> = {
  pdf: "Page",
  slides: "Slide",
  image: "Image",
  document: "Section",
  audio: "Track",
  file: "Part",
};

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
 *
 * Deduplication is by the WHOLE href, so two claims citing different slides of
 * the same deck stay two citations. They collapse to one row in the Sources
 * section, which groups by source id — the same file listed twice would read as
 * two files.
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

/** One row per SOURCE for the Sources section: the same file cited at three
 *  different slides is one entry, keeping its lowest number. */
export function citationSources(citations: readonly NoteCitation[]): NoteCitation[] {
  const byTarget = new Map<string, NoteCitation>();
  for (const citation of citations) {
    const key = citationSourceId(citation.href) ?? citation.href;
    const existing = byTarget.get(key);
    if (!existing || citation.n < existing.n) byTarget.set(key, citation);
  }
  return [...byTarget.values()];
}
