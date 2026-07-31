// The only file in the extension that touches a real page.
//
// Its whole job is to turn a live document into the plain PageSnapshot that
// parse.ts understands, so that every decision worth testing lives somewhere
// testable. Keep this file boring: read, normalise, hand over. If you find
// yourself writing an `if` about what something MEANS, it belongs in parse.ts.
//
// READ-ONLY, ALWAYS. Nothing here clicks, submits, navigates, or changes the
// page in any way. The extension is a pair of eyes on a portal the student is
// already looking at, and a scraper that alters a grade page is a catastrophe
// waiting for its first bug report.

import type { PageSnapshot, SnapshotBlock, SnapshotCourseNode, SnapshotLink } from "./parse.ts";

/** Bounds, so a pathological page cannot hang the tab or hand us a payload
 *  nobody can review. A real course page has tens of links, not thousands. */
const MAX_LINKS = 3000;
const MAX_BLOCKS = 1000;
const MAX_TEXT_CHARS = 400;

function collapse(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS);
}

/** Absolute http(s) URL, or null. Relative hrefs resolve against the page, and
 *  anything exotic (javascript:, mailto:, #anchors) is simply not a link we
 *  care about. */
function absoluteHref(anchor: HTMLAnchorElement, base: string): string | null {
  const raw = anchor.getAttribute("href");
  if (!raw || raw.startsWith("#")) return null;
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Cheap tells about what this application is, for detection's fallback path. */
function readMarkers(doc: Document): string[] {
  const markers: string[] = [];
  const generator = doc.querySelector('meta[name="generator"]')?.getAttribute("content");
  if (generator) markers.push(generator);
  const appName = doc.querySelector('meta[name="application-name"]')?.getAttribute("content");
  if (appName) markers.push(appName);
  // Body classes and the root id are where these products name themselves.
  if (doc.body?.className) markers.push(doc.body.className);
  if (doc.documentElement.id) markers.push(doc.documentElement.id);
  return markers.map((marker) => collapse(marker)).filter(Boolean);
}

function readLinks(doc: Document, base: string): SnapshotLink[] {
  const links: SnapshotLink[] = [];
  for (const anchor of Array.from(doc.querySelectorAll("a[href]")).slice(0, MAX_LINKS)) {
    const href = absoluteHref(anchor as HTMLAnchorElement, base);
    if (!href) continue;
    // An icon-only link has no text; its title or aria-label is what a screen
    // reader would announce, and it is the best name we have.
    const text =
      collapse(anchor.textContent) ||
      collapse(anchor.getAttribute("aria-label")) ||
      collapse(anchor.getAttribute("title"));
    links.push({ href, text });
  }
  return links;
}

/** The nearest ancestor that behaves like a row, so a date can be paired with
 *  the title next to it. Bounded walk — an unbounded one ends at <body> and
 *  pairs every date with the whole page. */
function rowFor(node: Element): Element {
  let current: Element = node;
  for (let depth = 0; depth < 6; depth += 1) {
    const parent: Element | null = current.parentElement;
    if (!parent) break;
    current = parent;
    if (current.querySelector("a[href]")) break;
  }
  return current;
}

/**
 * Rows that might be coursework.
 *
 * Two sources, deliberately. Portals publish machine-readable due dates as
 * `<time datetime>`, which is by far the best signal, so every such element
 * anchors a row. Pages that show coursework without dates still matter, so any
 * link the caller recognises as an item also becomes a row — dateless, which
 * the review screen shows honestly.
 */
function readBlocks(doc: Document, base: string, isItem: (href: string) => boolean): SnapshotBlock[] {
  const blocks: SnapshotBlock[] = [];
  const seen = new Set<string>();

  for (const timeNode of Array.from(doc.querySelectorAll("time[datetime]")).slice(0, MAX_BLOCKS)) {
    const isoDateTime = collapse(timeNode.getAttribute("datetime"));
    if (!isoDateTime) continue;
    const row = rowFor(timeNode);
    const anchor = row.querySelector("a[href]") as HTMLAnchorElement | null;
    const href = anchor ? absoluteHref(anchor, base) : null;
    const title = anchor ? collapse(anchor.textContent) : collapse(row.textContent);
    if (!title) continue;
    const key = `${title}|${href ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    blocks.push({
      isoDateTime,
      text: title,
      // The row's own type words, where the markup names them. Advisory only.
      ...(row.className ? { hint: collapse(row.className) } : {}),
      ...(href ? { href } : {}),
    });
  }

  for (const anchor of Array.from(doc.querySelectorAll("a[href]")).slice(0, MAX_LINKS)) {
    if (blocks.length >= MAX_BLOCKS) break;
    const href = absoluteHref(anchor as HTMLAnchorElement, base);
    if (!href || !isItem(href)) continue;
    const title = collapse(anchor.textContent) || collapse(anchor.getAttribute("aria-label"));
    if (!title) continue;
    const key = `${title}|${href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    blocks.push({ href, text: title, ...(href.includes("assign") ? { hint: "assignment" } : {}) });
  }

  return blocks;
}

/** Pull "_38534_1" out of "course-list-course-_38534_1". */
function idSuffix(value: string | null, prefix: string): string | null {
  if (!value || !value.startsWith(prefix)) return null;
  const rest = value.slice(prefix.length);
  return rest || null;
}

/**
 * Courses a page declares in its markup rather than in its links.
 *
 * 🔴 THE CASE THAT FORCED THIS: Blackboard Ultra renders every course as
 * `<a href="javascript:void(0);">`. Navigation is a click handler, so the URL
 * carries no identity and the anchor is one this adapter deliberately discards.
 * Reading only links found nine courses' worth of nothing on a real
 * installation.
 *
 * Two sources, most-standard first:
 *   - `[data-course-id]`, which is a plain data attribute any portal might use.
 *   - `id="course-list-course-…"`, which is Blackboard's own naming.
 *
 * Titles and codes are then read from the card's own labelled children
 * (`course-name-…`, `course-id-…`), falling back to the card's first heading.
 * Everything is bounded and read-only.
 */
function readCourseNodes(doc: Document, base: string): SnapshotCourseNode[] {
  const cards = new Map<string, Element>();

  for (const el of Array.from(doc.querySelectorAll("[data-course-id]")).slice(0, 200)) {
    const id = collapse(el.getAttribute("data-course-id"));
    if (id) cards.set(id, el);
  }
  for (const el of Array.from(doc.querySelectorAll('[id^="course-list-course-"]')).slice(0, 200)) {
    const id = idSuffix(el.getAttribute("id"), "course-list-course-");
    if (id && !cards.has(id)) cards.set(id, el);
  }

  const nodes: SnapshotCourseNode[] = [];
  for (const [courseId, card] of cards) {
    const named = card.querySelector(`[id="course-name-${CSS.escape(courseId)}"]`);
    const heading = card.querySelector("h1, h2, h3, h4, h5, .js-course-title-element");
    const title = collapse(named?.textContent) || collapse(heading?.textContent);
    if (!title) continue;

    const codeNode = card.querySelector(`[id="course-id-${CSS.escape(courseId)}"]`);
    const code = collapse(codeNode?.textContent);

    // A card's own anchor is usually javascript:void(0), which absoluteHref
    // rejects — so this is normally absent, and that is fine. A course with no
    // URL is still a course.
    const anchor = card.querySelector("a[href]") as HTMLAnchorElement | null;
    const href = anchor ? absoluteHref(anchor, base) : null;

    nodes.push({ courseId, title, ...(code ? { code } : {}), ...(href ? { href } : {}) });
  }
  return nodes;
}

/** Describe the page for detection, without reading its links. */
export function readFacts(doc: Document, href: string): { markers: string[]; url: string } {
  return { markers: readMarkers(doc), url: href };
}

/** Everything parse.ts needs, read once. */
export function readSnapshot(doc: Document, href: string, isItem: (link: string) => boolean): PageSnapshot {
  return {
    blocks: readBlocks(doc, href, isItem),
    courseNodes: readCourseNodes(doc, href),
    links: readLinks(doc, href),
    title: collapse(doc.title),
    url: href,
  };
}
