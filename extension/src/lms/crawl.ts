// Deciding where to walk inside a course, and where to stop.
//
// PURE. Nothing here touches the network, the DOM, or chrome.*. It takes a
// starting course URL and a stream of links found on pages, and answers two
// questions: is this worth visiting, and is this worth keeping. The part that
// actually loads pages lives elsewhere and is deliberately thin, because a
// crawler's dangerous decisions are all in here and none of them are testable
// once they are tangled up with a browser.
//
// WHY A CRAWLER AT ALL. The scanner reads the page it is standing on. A course
// list page holds course cards and nothing else, so it found nine courses and
// zero documents — correct, and useless. Slides and readings live inside each
// course, inside folders, inside folders. There is no page in Blackboard that
// lists them all, so they have to be walked to.
//
// 🔴 THE THREE WAYS A CRAWLER GOES WRONG, and what stops each here:
//   - It never finishes. A portal that links B from A and A from B is a loop.
//     Every target is normalised and checked against `visited` BEFORE being
//     queued, so a cycle costs one visit, not infinite ones.
//   - It wanders off. A course page links to other courses, to the institution
//     homepage, to the wider web. `withinCourse` keeps the walk inside the one
//     course the student is importing, on the one origin they granted.
//   - It never stops being polite. Depth, per-course pages and total pages are
//     all capped, so a portal with a pathological tree costs a bounded number
//     of requests rather than however many it feels like.
//
// FIELD-AGNOSTIC. Nothing here knows what a subject is. A folder is a folder
// because of where it points, not because of the words in it.

import type { DocumentKind } from "../wire.ts";

/** How far in, how much, and how long. Bounds on damage, not guesses at real
 *  portals — see the loop/wander/politeness note above. */
export interface CrawlLimits {
  /** Folder nesting below the course root. */
  maxDepth: number;
  /** Pages fetched for ONE course. */
  maxPagesPerCourse: number;
  /** Pages fetched across the whole scan, over every course. */
  maxTotalPages: number;
}

export const DEFAULT_LIMITS: CrawlLimits = {
  maxDepth: 4,
  maxPagesPerCourse: 40,
  maxTotalPages: 240,
};

/** Somewhere still to look. */
export interface CrawlTarget {
  url: string;
  /** The folder path that led here, outermost first. Empty at a course root. */
  folder: string[];
  depth: number;
}

export interface CrawlState {
  /** Normalised URLs already queued or visited. Both, deliberately: a page
   *  queued twice before either visit is the same waste as visiting twice. */
  seen: ReadonlySet<string>;
  queue: readonly CrawlTarget[];
  /** Pages actually fetched for the current course. */
  pagesThisCourse: number;
  /** Pages fetched across every course so far. */
  pagesTotal: number;
}

/** A link as the page gave it to us. */
export interface CrawlLink {
  href: string;
  text: string;
  /**
   * Whether the ROW this link sits in claims to be a real file.
   *
   * 🔴 MEASURED ON A REAL SIGNED-IN CANVAS (2026-08-04). A Canvas course lists
   * its contents as rows like
   *
   *     <li class="context_module_item ... attachment ...">
   *       <a href="/courses/14977/modules/items/964858">Lecture 3</a>
   *
   * and EVERY row — a PDF, an assignment, a quiz, a wiki page, an external tool
   * — links to the identical `/modules/items/:id` shape. One real course had 73
   * such rows and ZERO direct file links. So the URL cannot tell a slide deck
   * from a quiz, and without this the import downloads all 73, discovers most
   * of them are web pages, and hands the student sixty red failure lines.
   *
   * The row's own class says which is which. `undefined` means the page said
   * nothing — every portal but Canvas — and is treated as "keep it".
   */
  attachment?: boolean;
}

// ── URLs ─────────────────────────────────────────────────────────────────────

/**
 * The form used for "have I been here". PURE.
 *
 * Drops the fragment, sorts query parameters and strips a trailing slash, so
 * the same folder linked three slightly different ways is recognised as one
 * place. Returns null for anything unparseable or not http(s) — those are not
 * places we go.
 */
export function normaliseUrl(href: string, base?: string): string | null {
  let parsed: URL;
  try {
    parsed = base ? new URL(href, base) : new URL(href);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  parsed.hash = "";
  // Sorted so ?a=1&b=2 and ?b=2&a=1 are one page rather than two.
  parsed.search = new URLSearchParams([...parsed.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))).toString();
  // Trim the slash off the PATH, not off the finished string: with a query on
  // the end the string stops with the query, so trimming the string leaves
  // "/a/b/?q=1" and "/a/b?q=1" looking like two different pages.
  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  return parsed.toString();
}

/**
 * Is this link inside the course we are importing? PURE.
 *
 * Same origin AND sharing the course's path prefix. The prefix test is what
 * stops a crawl of one course from walking into the student's other eight, or
 * into the institution's public pages — both of which every course page links
 * to, and neither of which the student asked for.
 */
export function withinCourse(courseUrl: string, href: string): boolean {
  const course = normaliseUrl(courseUrl);
  const target = normaliseUrl(href, courseUrl);
  if (!course || !target) return false;
  const a = new URL(course);
  const b = new URL(target);
  if (a.origin !== b.origin) return false;
  // Compare on path SEGMENTS, so /courses/12 does not swallow /courses/1234.
  const wanted = a.pathname.split("/").filter(Boolean);
  const got = b.pathname.split("/").filter(Boolean);
  if (got.length < wanted.length) return false;
  return wanted.every((segment, index) => got[index] === segment);
}

/** The extension a URL admits to, lowercase, or undefined. PURE. Read from the
 *  PATH only: a `?type=pdf` query says what a page is about, not what it is. */
export function fileTypeOf(href: string): string | undefined {
  let path: string;
  try {
    path = new URL(href, "https://x.invalid").pathname;
  } catch {
    return undefined;
  }
  const last = path.split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  if (dot <= 0 || dot === last.length - 1) return undefined;
  const ext = last.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,12}$/.test(ext) ? ext : undefined;
}

// ── What a link is ───────────────────────────────────────────────────────────

/** Extensions that mean "a student can open this and read it". Structural, not
 *  subject-specific: it is the container format, never the topic. */
const READABLE = new Set([
  "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "rtf", "odt", "odp", "ods",
  "csv", "md", "epub", "key", "pages", "numbers", "zip",
]);

export type LinkRole = "folder" | "document" | "ignore";

/**
 * What to do with a link. PURE.
 *
 * `isFolderHref` is injected rather than hardcoded because "this URL is a
 * folder" is the one genuinely portal-specific judgement, and it belongs with
 * the other route knowledge in detect.ts/parse.ts rather than smeared in here.
 */
export function roleOf(
  link: CrawlLink,
  courseUrl: string,
  isFolderHref: (href: string) => boolean,
): LinkRole {
  if (!link.href || !withinCourse(courseUrl, link.href)) return "ignore";
  // A link with no words on it cannot be shown to a student in a list, and a
  // student cannot choose something with no name.
  if (!link.text.trim()) return "ignore";
  if (isFolderHref(link.href)) return "folder";
  return "document";
}

/** How to describe a document we are keeping. PURE. A known readable extension
 *  makes it a file; anything still on this origin is a page; everything else
 *  is a link out. */
export function kindOf(href: string): DocumentKind {
  const ext = fileTypeOf(href);
  if (ext && READABLE.has(ext)) return "file";
  return "page";
}

// ── The frontier ─────────────────────────────────────────────────────────────

export function newCrawl(): CrawlState {
  return { pagesThisCourse: 0, pagesTotal: 0, queue: [], seen: new Set() };
}

/** Start a fresh course: the queue and per-course count reset, the total and
 *  the seen set do NOT. PURE — returns new state. */
export function startCourse(state: CrawlState, courseUrl: string): CrawlState {
  const root = normaliseUrl(courseUrl);
  if (!root) return { ...state, pagesThisCourse: 0, queue: [] };
  return {
    pagesThisCourse: 0,
    pagesTotal: state.pagesTotal,
    queue: [{ depth: 0, folder: [], url: root }],
    seen: new Set([...state.seen, root]),
  };
}

/**
 * Queue a folder found on a page, if it is worth queueing. PURE.
 *
 * Returns state unchanged when the target is already seen, too deep, or the
 * budget is spent — so a caller can pour every link on a page through this
 * without checking anything itself.
 */
export function enqueue(
  state: CrawlState,
  from: CrawlTarget,
  link: CrawlLink,
  courseUrl: string,
  limits: CrawlLimits = DEFAULT_LIMITS,
): CrawlState {
  const url = normaliseUrl(link.href, from.url);
  if (!url || state.seen.has(url)) return state;
  if (from.depth + 1 > limits.maxDepth) return state;
  if (!withinCourse(courseUrl, url)) return state;
  // Budget is counted against what is already fetched PLUS what is already
  // waiting, or a wide page queues a hundred folders the budget cannot pay for.
  if (state.pagesThisCourse + state.queue.length >= limits.maxPagesPerCourse) return state;
  if (state.pagesTotal + state.queue.length >= limits.maxTotalPages) return state;

  const label = link.text.trim();
  return {
    ...state,
    queue: [...state.queue, { depth: from.depth + 1, folder: [...from.folder, label], url }],
    seen: new Set([...state.seen, url]),
  };
}

/** The next place to look and the state that follows, or null when done. PURE.
 *  Breadth-first: the shallowest folders are the ones a student recognises, so
 *  a crawl that runs out of budget should have covered those first. */
export function takeNext(
  state: CrawlState,
  limits: CrawlLimits = DEFAULT_LIMITS,
): { target: CrawlTarget; next: CrawlState } | null {
  if (state.queue.length === 0) return null;
  if (state.pagesThisCourse >= limits.maxPagesPerCourse) return null;
  if (state.pagesTotal >= limits.maxTotalPages) return null;
  const [target, ...rest] = state.queue;
  if (!target) return null;
  return {
    next: {
      pagesThisCourse: state.pagesThisCourse + 1,
      pagesTotal: state.pagesTotal + 1,
      queue: rest,
      seen: state.seen,
    },
    target,
  };
}
