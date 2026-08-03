// Walking INTO a course — the half of the crawl that was written, tested, and
// then never connected to anything (owner 2026-08-01: "it should grab nested
// documents and folders").
//
// crawl.ts is the frontier: what counts as a folder, where the budget runs out,
// which place to look at next. It is pure and it has always worked. What was
// missing is this — the loop that actually goes and looks, and turns what it
// finds into the ScrapedDocument[] the app already knows how to file.
//
// PURE BY CONSTRUCTION. `linksOn` is injected rather than calling fetch here,
// for two reasons that both bit earlier work in this extension:
//   1. It can be tested with no network, no DOM and no browser — the same way
//      crawl.ts, detect.ts and parse.ts are tested.
//   2. Reading a page is portal-shaped (same-origin fetch on Canvas, clicking
//      an expander on Blackboard Ultra — see the note at the bottom). Those do
//      not belong in the same function as the budget arithmetic.

import type { ScrapedDocument } from "../wire.ts";

import {
  DEFAULT_LIMITS,
  enqueue,
  fileTypeOf,
  kindOf,
  newCrawl,
  normaliseUrl,
  roleOf,
  startCourse,
  takeNext,
  withinCourse,
  type CrawlLimits,
  type CrawlLink,
  type CrawlState,
} from "./crawl.ts";

export interface WalkDeps {
  /**
   * Every link on one page, or null when the page could not be read.
   *
   * null is not an error to report to the student — a portal that 403s one
   * folder still has nine others worth having, and a walk that gives up on the
   * first refusal returns nothing on a portal that mostly works.
   */
  linksOn: (url: string) => Promise<readonly CrawlLink[] | null>;
  /** "This URL is a folder, go inside it." Portal-specific — see folderRule. */
  isFolderHref: (href: string) => boolean;
  /** Called after each page, with the running document count, so the card can
   *  count up while the walk is happening instead of sitting still. */
  onProgress?: (documentsSoFar: number, pagesRead: number) => void;
}

export interface WalkResult {
  /** What was found, deduped, outermost folder first. */
  documents: ScrapedDocument[];
  /** Carry this into the next course: the page budget and the seen-set are
   *  shared across the whole scan, so one enormous course cannot spend every
   *  other course's allowance. */
  state: CrawlState;
  /** True when the budget stopped the walk with places still queued — the
   *  difference between "that is everything" and "that is what we had time
   *  for", which the card should not blur. */
  truncated: boolean;
}

/**
 * Walk one course and return what is inside it.
 *
 * Never throws: a page that fails to load is skipped, and the walk carries on
 * with the rest of the queue.
 */
export async function walkCourse(
  courseUrl: string,
  deps: WalkDeps,
  carried: CrawlState = newCrawl(),
  limits: CrawlLimits = DEFAULT_LIMITS,
): Promise<WalkResult> {
  let state = startCourse(carried, courseUrl);
  const documents: ScrapedDocument[] = [];
  // Deduped on the NORMALISED url, so the same reading linked from both the
  // week folder and the "recently added" rail is one document, not two.
  const seenDocs = new Set<string>();
  let pagesRead = 0;
  // Folders we found and could NOT go into. See `truncated` below.
  let unvisited = 0;

  for (;;) {
    const step = takeNext(state, limits);
    if (!step) break;
    state = step.next;
    pagesRead += 1;

    const links = await deps.linksOn(step.target.url);
    if (links) {
      for (const link of links) {
        const role = roleOf(link, courseUrl, deps.isFolderHref);
        if (role === "ignore") continue;
        if (role === "folder") {
          const before = state;
          state = enqueue(state, step.target, link, courseUrl, limits);
          if (state === before) {
            // enqueue refused. That is only worth reporting when the folder was
            // somewhere NEW inside this course — a refusal because we have been
            // there already is the frontier working, not a gap.
            const target = normaliseUrl(link.href, step.target.url);
            if (target && !before.seen.has(target) && withinCourse(courseUrl, target)) unvisited += 1;
          }
          continue;
        }
        const absolute = normaliseUrl(link.href, step.target.url);
        if (!absolute || seenDocs.has(absolute)) continue;
        seenDocs.add(absolute);
        const fileType = fileTypeOf(absolute);
        documents.push({
          folder: [...step.target.folder],
          kind: kindOf(absolute),
          title: link.text.trim(),
          url: absolute,
          // Absent rather than guessed — the shared contract is explicit that a
          // missing fileType means "the link did not say", not "plain text".
          ...(fileType ? { fileType } : {}),
        });
      }
    }
    deps.onProgress?.(documents.length, pagesRead);
  }

  // NOT `queue.length > 0`: enqueue stops accepting once the budget is spent,
  // so the queue is empty at precisely the moment we ran out of room. Counting
  // the folders we turned away is the only honest measure of what was missed.
  return { documents, state, truncated: state.queue.length > 0 || unvisited > 0 };
}

// ── Which URLs are folders ───────────────────────────────────────────────────

/**
 * Per-portal folder rules, kept HERE with the other route knowledge rather than
 * inside crawl.ts, which is deliberately portal-blind.
 *
 * Every pattern is a ROUTE, never markup and never a name. The same rule the
 * rest of this extension follows: a folder called "Week 1" is a folder because
 * of where it lives in the URL, not because of what it is called — course
 * pages are written by instructors in every language and every field.
 */
const FOLDER_ROUTES: Record<string, readonly RegExp[]> = {
  blackboard: [
    // The classic (non-Ultra) content tree.
    /\/webapps\/blackboard\/content\/listContent\.jsp/i,
    /\/webapps\/blackboard\/execute\/content\/blankPage/i,
  ],
  brightspace: [
    /\/d2l\/le\/content\/\d+\/Home/i,
    /\/d2l\/le\/content\/\d+\/ModuleDetailsPartial/i,
    /\/d2l\/le\/content\/\d+\/viewContent\/\d+\/Modules/i,
  ],
  canvas: [
    /\/courses\/\d+\/modules(?:\/|$|\?)/i,
    /\/courses\/\d+\/files(?:\/folder\/|\/?$|\?)/i,
    /\/courses\/\d+\/pages(?:\/|$|\?)/i,
    /\/courses\/\d+\/assignments(?:\/?$|\?)/i,
  ],
  moodle: [
    /\/course\/view\.php/i,
    /\/mod\/folder\/view\.php/i,
    /\/course\/section\.php/i,
  ],
};

/**
 * The folder test for one portal. Unknown portals get a rule that says "nothing
 * is a folder", which makes the walk read the course landing page and stop —
 * shallow, but never wrong, and never a crawl wandering an unfamiliar site.
 */
export function folderRule(lms: string): (href: string) => boolean {
  const routes = FOLDER_ROUTES[lms] ?? [];
  if (routes.length === 0) return () => false;
  return (href: string) => {
    let path: string;
    try {
      const url = new URL(href);
      path = `${url.pathname}${url.search}`;
    } catch {
      return false;
    }
    // A link to a READABLE file is a document even when it sits on a
    // folder-shaped route — "…/files/notes.pdf" matches Canvas's files route
    // and is plainly not a folder to walk into.
    //
    // kindOf, NOT fileTypeOf: fileTypeOf reports any extension at all, so it
    // calls Blackboard's listContent.JSP and every Moodle view.PHP a file and
    // refuses to walk the two portals whose folders are exactly those routes.
    // kindOf only says "file" for extensions a student can actually open.
    if (kindOf(path) === "file") return false;
    return routes.some((route) => route.test(path));
  };
}

// 🔴 BLACKBOARD ULTRA IS NOT DONE HERE, AND CANNOT BE.
//
// Everything above walks LINKS: take a URL, read the page, find more URLs.
// Ultra has none to walk. Its folders are buttons — `aria-expanded="false"`
// with no href — and opening one reveals its children in the page that is
// already on screen, which can in turn reveal more. There is no second page to
// fetch, so there is nothing for this loop to do.
//
// That needs a different mechanism entirely: click the expanders in the live
// tab, wait for the DOM to settle, re-read, repeat until nothing new appears —
// with its own budget, because the expansion cascades. It belongs beside the
// live-DOM polling in content-scan.ts, not in a fetch loop.
//
// Left explicit rather than half-built: `folderRule("blackboard")` covers the
// CLASSIC content tree, which is a real thing many institutions still run, and
// on Ultra it correctly finds no folders instead of pretending to.
