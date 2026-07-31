// Turning a portal page into courses and coursework.
//
// PURE. Everything here works on a PageSnapshot — a plain description of the
// page produced by the thin DOM adapter in dom.ts. That split is the whole
// reason this logic can be tested: fixtures in, courses out, no browser.
//
// WHAT THIS READS AND WHY IT IS THE STABLE PART.
//
// Course discovery keys off LINK URLS, not markup. Every one of these products
// has a fixed internal routing contract — a Canvas course lives at /courses/:id
// and a Moodle course at /course/view.php?id=:id, on every installation, because
// the applications' own links depend on it. Themes, versions and institutional
// customisation all leave that alone. Class names do not survive contact with a
// single university's brand team.
//
// DATES ARE READ ONLY FROM MACHINE-READABLE ATTRIBUTES. Portals emit
// `<time datetime="2026-08-04T23:59:00Z">` next to the human text. Where that
// exists we take it; where it does not, the item arrives with a title and no
// date. That is deliberate. Parsing "Aug 4" out of prose means guessing a year
// and a timezone, and a deadline that is silently wrong by a day or a month is
// worse than one that visibly has no date — the student can see a missing date
// and fix it, and cannot see a wrong one. The dated path already exists and is
// better: the syllabus importer reads the actual document with a model and
// verifies every date against a quote from the source.
//
// FIELD-AGNOSTIC. Nothing here knows what any subject is. Course names are
// whatever the portal calls them. The only vocabulary is document-type words
// like "syllabus", which mean the same thing to a law student and a welding
// student.

import type { LmsKind, ScrapedCourse, ScrapedItem, ScrapedKind, ScrapedLink } from "../wire.ts";

export interface SnapshotLink {
  /** Visible text of the link, already whitespace-collapsed by the adapter. */
  text: string;
  /** Absolute URL. The adapter resolves relative hrefs against the page. */
  href: string;
}

export interface SnapshotBlock {
  /** Text of a candidate row: an assignment line, a to-do entry. */
  text: string;
  /** The row's own link, when it has one. */
  href?: string;
  /** A machine-readable timestamp the page published for this row, verbatim
   *  from a datetime attribute. The ONLY date source — see the header. */
  isoDateTime?: string;
  /** The row's own idea of what it is ("assignment", "quiz"), where the page
   *  says so. Advisory; unrecognised values fall back to a title scan. */
  hint?: string;
}

export interface PageSnapshot {
  url: string;
  title: string;
  links: readonly SnapshotLink[];
  blocks: readonly SnapshotBlock[];
}

/** How each product routes to a course. The capture group is the course id,
 *  used only to group links that belong together. */
const COURSE_ROUTES: Record<Exclude<LmsKind, "unknown">, readonly RegExp[]> = {
  blackboard: [/\/ultra\/courses\/(_\d+_\d+)\b/i, /[?&]course_id=(_\d+_\d+)/i],
  brightspace: [/\/d2l\/home\/(\d+)\b/i, /\/d2l\/le\/[a-z]+\/(\d+)\b/i],
  canvas: [/\/courses\/(\d+)\b/i],
  moodle: [/\/course\/view\.php\?[^#]*\bid=(\d+)\b/i],
};

/** Routes that identify a single piece of coursework rather than a course. */
const ITEM_ROUTES: Record<Exclude<LmsKind, "unknown">, readonly RegExp[]> = {
  blackboard: [/\/ultra\/courses\/_\d+_\d+\/outline\/assessment\//i, /\/webapps\/assignment\//i],
  brightspace: [/\/d2l\/lms\/(?:dropbox|quizzing)\//i],
  canvas: [/\/courses\/\d+\/(assignments|quizzes|discussion_topics)\/\d+/i],
  moodle: [/\/mod\/(assign|quiz)\/view\.php/i],
};

/**
 * Words that mark a file as the course's own governing document.
 *
 * NOT a subject list — these describe a KIND OF DOCUMENT and mean the same
 * thing in every discipline. "Syllabus" is what a law school and a welding
 * programme both call it; the alternatives cover the schools that say
 * something else.
 */
const SYLLABUS_WORDS = ["syllabus", "course outline", "course information", "course guide", "unit outline"];

/** Words that place an item on the calendar as an exam rather than homework.
 *  Same reasoning: assessment vocabulary, not subject vocabulary. */
const EXAM_WORDS = ["exam", "midterm", "final", "test", "quiz"];

function lower(text: string): string {
  return text.toLocaleLowerCase();
}

/** Does any of a product's course routes match this URL, and if so which
 *  course? PURE. */
export function courseIdFrom(href: string, lms: LmsKind): string | null {
  if (lms === "unknown") return null;
  for (const route of COURSE_ROUTES[lms]) {
    const match = route.exec(href);
    if (match?.[1]) return match[1];
  }
  return null;
}

/** Is this link a single piece of coursework? PURE. */
export function isItemLink(href: string, lms: LmsKind): boolean {
  if (lms === "unknown") return false;
  return ITEM_ROUTES[lms].some((route) => route.test(href));
}

/**
 * Is this link an attached file rather than a place in the course? PURE.
 *
 * Matters because a file lives UNDER a course URL, so it carries the course id
 * and would otherwise be treated as another way of naming the course. A slide
 * deck called "Lecture 3 — Thermodynamics of Reversible Processes" is longer
 * than "Thermodynamics", and longest-wins would hand the student a Library
 * folder named after one lecture.
 */
export function isFileLink(href: string): boolean {
  return /\/files?\//i.test(href) || /pluginfile\.php/i.test(href) || /\.(pdf|docx?|pptx?|xlsx?|zip)(\?|#|$)/i.test(href);
}

/** Does this link look like the course's syllabus? PURE. */
export function looksLikeSyllabus(link: SnapshotLink): boolean {
  const haystack = `${lower(link.text)} ${lower(link.href)}`;
  return SYLLABUS_WORDS.some((word) => haystack.includes(word));
}

/**
 * Classify one row for the calendar. PURE.
 *
 * Conservative on purpose: only assessment words promote something to "exam",
 * and only a page's own hint or an item route makes it an "assignment".
 * Everything else is "other", which a student relabels in a click. Guessing
 * "assignment" for every row would fill their calendar with confident nonsense.
 */
export function classifyItem(title: string, hint?: string): ScrapedKind {
  const haystack = lower(title);
  if (EXAM_WORDS.some((word) => new RegExp(`\\b${word}\\b`).test(haystack))) return "exam";
  const hinted = hint ? lower(hint) : "";
  if (hinted.includes("assign") || hinted.includes("homework") || hinted.includes("dropbox")) return "assignment";
  if (hinted.includes("quiz") || hinted.includes("exam")) return "exam";
  if (hinted.includes("lecture") || hinted.includes("class") || hinted.includes("meeting")) return "class";
  return "other";
}

/**
 * Split a machine-readable timestamp into the local date and time the calendar
 * stores. PURE.
 *
 * The calendar keeps local dates with no timezone, so a UTC instant has to be
 * converted through the reader's own clock — a deadline published as
 * 2026-08-05T03:59:00Z is the 4th at 11:59pm for a student on the US east
 * coast, and filing it on the 5th would move a deadline by a day.
 */
export function splitTimestamp(iso: string): { date: string; time?: string } | null {
  const trimmed = iso.trim();

  // 🔴 A DATE-ONLY STRING IS A LOCAL CALENDAR DATE AND MUST NOT BE CONVERTED.
  // `new Date("2026-08-04")` is specified to parse as UTC midnight, so reading
  // it back with getDate() in any negative-offset timezone returns the 3rd —
  // every date-only deadline silently a day early for the entire Americas.
  // When the portal gave no time it named a day, not an instant, so the string
  // passes straight through.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return { date: trimmed };

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const date = `${year}-${month}-${day}`;
  const hours = parsed.getHours();
  const minutes = parsed.getMinutes();
  // A date-only value ("2026-08-04") parses as local midnight. Reporting
  // "00:00" would put a made-up time on the calendar, so midnight is treated
  // as "no time given" — a deadline genuinely at midnight is vanishingly rare
  // next to a date with no time at all.
  if (hours === 0 && minutes === 0) return { date };
  return { date, time: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}` };
}

function itemFromBlock(block: SnapshotBlock): ScrapedItem | null {
  const title = block.text.trim();
  if (!title) return null;
  const stamp = block.isoDateTime ? splitTimestamp(block.isoDateTime) : null;
  return {
    kind: classifyItem(title, block.hint),
    title,
    ...(stamp ? { dueDate: stamp.date } : {}),
    ...(stamp?.time ? { dueTime: stamp.time } : {}),
    ...(block.href ? { url: block.href } : {}),
  };
}

/**
 * The best name for a course, out of every link pointing at it.
 *
 * Portals link the same course many times: a sidebar entry with the full title,
 * a breadcrumb with the code, a card with both, and a bare "Course Home". The
 * LONGEST distinct link text is almost always the real name, because navigation
 * chrome is short and titles are not. Ties keep the first seen, so ordering on
 * the page decides rather than anything arbitrary. PURE.
 */
export function bestCourseName(texts: readonly string[]): string {
  let best = "";
  for (const raw of texts) {
    const text = raw.trim();
    if (!text) continue;
    // Pure navigation words are never the course's name.
    if (/^(home|course home|content|announcements|grades|syllabus|modules|assignments)$/i.test(text)) continue;
    if (text.length > best.length) best = text;
  }
  return best;
}

/**
 * Read a portal page. PURE.
 *
 * Returns every course the page links to, each with any syllabus files and
 * coursework rows that could be attributed to it. A dashboard yields many
 * courses with little detail; a single course page yields one course with a
 * lot. Both are useful, and the review screen merges repeat scans.
 */
export function parseSnapshot(snapshot: PageSnapshot, lms: LmsKind): ScrapedCourse[] {
  if (lms === "unknown") return [];

  const names = new Map<string, string[]>();
  const homes = new Map<string, string>();
  const syllabi = new Map<string, Map<string, ScrapedLink>>();

  for (const link of snapshot.links) {
    const courseId = courseIdFrom(link.href, lms);
    if (!courseId) continue;

    if (!names.has(courseId)) {
      names.set(courseId, []);
      syllabi.set(courseId, new Map());
    }
    // Only links that stand for the COURSE ITSELF may name it. An assignment,
    // an attached file and a syllabus all live under the course URL and all
    // carry its id, but each is named after itself — and since the longest
    // candidate wins, any one of them would beat the real course name.
    // Caught in a real browser: a footer link reading "Syllabus (footer copy)"
    // became the course name for General Chemistry I.
    const namesTheCourse = !isItemLink(link.href, lms) && !isFileLink(link.href) && !looksLikeSyllabus(link);
    if (namesTheCourse) names.get(courseId)?.push(link.text);

    // The shortest URL for a course is its landing page.
    const home = homes.get(courseId);
    if (!home || link.href.length < home.length) homes.set(courseId, link.href);

    if (looksLikeSyllabus(link)) {
      // Keyed by URL so the same file linked three times appears once, and
      // FIRST LABEL WINS — a page's primary link comes before its footer
      // repeat, so "Syllabus" should not be overwritten by "Syllabus (again)".
      const bucket = syllabi.get(courseId);
      if (bucket && !bucket.has(link.href)) {
        bucket.set(link.href, { label: link.text || "Syllabus", url: link.href });
      }
    }
  }

  // Which course this page IS, for attributing rows that carry no course of
  // their own — a course page's assignment list links to items, not courses.
  const pageCourseId = courseIdFrom(snapshot.url, lms);

  const items = new Map<string, ScrapedItem[]>();
  for (const block of snapshot.blocks) {
    const owner = (block.href ? courseIdFrom(block.href, lms) : null) ?? pageCourseId;
    if (!owner) continue;
    const item = itemFromBlock(block);
    if (!item) continue;
    if (!items.has(owner)) items.set(owner, []);
    items.get(owner)?.push(item);
  }

  // A page can produce rows for a course it never linked to by name — its own.
  if (pageCourseId && !names.has(pageCourseId) && items.has(pageCourseId)) {
    names.set(pageCourseId, [snapshot.title]);
    syllabi.set(pageCourseId, new Map());
  }

  const courses: ScrapedCourse[] = [];
  for (const [courseId, texts] of names) {
    const name = bestCourseName(texts);
    // No usable name means we would be offering the student an unnamed folder.
    if (!name) continue;
    const home = homes.get(courseId);
    courses.push({
      items: items.get(courseId) ?? [],
      name,
      syllabusLinks: [...(syllabi.get(courseId)?.values() ?? [])],
      ...(home ? { url: home } : {}),
    });
  }
  return courses;
}
