// Blackboard Ultra: the folders that are not links.
//
// MEASURED ON THE OWNER'S OWN PORTAL, 2026-08-02, inside a real course
// (blackboard.uthsc.edu/ultra/courses/_37630_1/outline). Of 15 anchors on the
// page, THIRTEEN were course navigation — Calendar, Gradebook, Roster — and
// ZERO were documents. Every piece of lecture material sat behind one of ten
// collapsed folders, each of them a <button> with no href at all:
//
//     <button aria-expanded="false"
//             aria-label="Folder, Basics of Sterile Compounding"
//             data-testid="content.item.folder.toggleFolder.button">
//
// So the link-walking crawl in walk.ts cannot work here, and no amount of
// route knowledge fixes it: there is no route. The folder opens in place, and
// opening it can reveal more folders, which is why this needs its own budget.
//
// 🔴 data-analytics-id, NOT data-testid. THIS COST A REWRITE.
//
// The first pass here selected on `data-testid`, because the probe that found
// these buttons read `getAttribute("data-testid") || getAttribute(
// "data-analytics-id")` and the result got written down under the first name.
// Re-measured on the live portal: of the twelve expanders on a real course
// page, ZERO carry data-testid and TWELVE carry data-analytics-id. The only
// data-testid in the whole document belongs to a media mini-player.
//
// A selector on data-testid matches nothing, on every Ultra course, forever —
// and the failure is silent: no folders found reads exactly like a course with
// nothing in it, which is the false report this whole feature exists to stop.
//
// Test ids are a development-build affordance. Analytics ids ship to
// production because the vendor uses them itself. Prefer the attribute the
// vendor has a reason to keep.
//
// WHY AN ATTRIBUTE AND NOT THE LABEL. `aria-label` reads "Folder, <name>" —
// tempting, and wrong to match on. "Folder" is an English word; a Spanish or
// French installation says something else, and a keyword list that only works
// for one language is the same mistake as one that only works for one subject.

/**
 * The two content expanders, by Blackboard's own component id.
 *
 * Deliberately a closed set. The same page carries expanders for "Show more
 * course faculty members" and "Help for current page" — both measured, both
 * would be clicked by a naive `[aria-expanded="false"]` sweep, and neither
 * contains a single document.
 */
export const ULTRA_EXPANDER_ANALYTICS_IDS: readonly string[] = [
  "content.item.folder.toggleFolder.button",
  "course.learning.module.base.item.toggleLm.button",
];

/**
 * A SECOND way in, measured alongside the first: the buttons also carry a
 * stable id — `folder-title-_2017713_1`, `learning-module-title-_2018896_1`.
 * Kept as a fallback so a vendor who renames one hook does not take the whole
 * feature down silently. Belt and braces, because the failure mode here is not
 * an error the student sees — it is a zero they believe.
 */
export const ULTRA_EXPANDER_ID_PREFIXES: readonly string[] = [
  "folder-title-",
  "learning-module-title-",
];

export const ULTRA_EXPANDER_SELECTOR = [
  ...ULTRA_EXPANDER_ANALYTICS_IDS.map((id) => `button[data-analytics-id="${id}"][aria-expanded="false"]`),
  ...ULTRA_EXPANDER_ID_PREFIXES.map((prefix) => `button[id^="${prefix}"][aria-expanded="false"]`),
].join(",");

// ── 🔴 WAITING BY DURATION IS BROKEN IN A BACKGROUND TAB ─────────────────────
//
// MEASURED on the owner's live course, 2026-08-02, in a tab that was open but
// not the frontmost one (`document.visibilityState === "hidden"`):
//
//   setTimeout(…, 50)      scheduled → FIRED 147,604 ms LATER
//   setTimeout(…, 500)     scheduled → FIRED 147,656 ms LATER
//   requestAnimationFrame  never fired at all
//   Promise.resolve().then FIRED IMMEDIATELY
//   MutationObserver       FIRED AT 82 ms, last callback at 498 ms
//
// Chrome throttles timers in a hidden tab to roughly one wake per minute. The
// page itself is perfectly alive — the folder expanded, the DOM updated, the
// observer saw every change on time. Only the CLOCK is frozen.
//
// This scan used to `await sleep(400)` after every click. A student who hits
// Scan and then switches tabs — which is the natural thing to do while waiting
// — turned each of those 400ms pauses into ~2.5 MINUTES. A ten-second scan
// became a quarter of an hour of a card that looks stuck.
//
// 🔴 NOT the old background-tab theory. An earlier version of this file
// refused to scan a hidden tab, on the belief that Ultra tore its content down
// when hidden. That was a misdiagnosis of a broken selector and it was
// removed. This is the opposite finding, with a positive control: the DOM and
// the observer work fine in a hidden tab, and only setTimeout does not.
//
// SO: WAIT FOR A CONDITION, NEVER FOR A DURATION. Everything below waits on
// something observable — "this folder now reports itself open", "the list got
// longer" — delivered by MutationObserver, which is not throttled. A duration
// survives only as a backstop for the case where the condition never arrives.

/**
 * Wait until something is true.
 *
 * Resolves true the moment `predicate` holds, false if the wait was spent
 * first. MUST be driven by DOM mutations rather than a clock — see above.
 * Injected rather than implemented here so the stopping rules stay testable
 * with no browser.
 */
export type WaitUntil = (predicate: () => boolean) => Promise<boolean>;

/** How far the cascade may run before we stop opening things. */
export interface UltraLimits {
  /** Rounds of "open everything visible, look again". Nesting depth, in effect. */
  maxRounds: number;
  /** Folders opened in one course, over all rounds. */
  maxExpansions: number;
  /**
   * Times to ask ONE folder to open before giving up on it.
   *
   * 🔴 A CLICK IS NOT A GUARANTEE. Measured on the live course: two folders
   * ("Exam 7", "Course Orientation") stayed shut after being clicked, while
   * their neighbours opened from the same loop. Ultra re-renders the outline
   * as each folder opens, so a node captured a moment ago can be detached by
   * the time it is clicked, and the click lands on nothing.
   *
   * The old code counted a click as an opened folder. Every dropped click was
   * a folder of lecture material silently missing from the import.
   */
  maxClickAttempts: number;
}

export const ULTRA_DEFAULTS: UltraLimits = {
  maxClickAttempts: 3,
  maxExpansions: 120,
  // Rounds now carry PAGING as well as nesting depth, so this is no longer
  // "how deep do folders go" — a single folder holding fifty items needs five
  // rounds on its own just to show them all. Cheap to allow: the loop stops on
  // the first round that reveals nothing, so a shallow course still exits in
  // two or three.
  maxRounds: 25,
};

/**
 * The folder's own name, from its accessible label. PURE.
 *
 * The label is "<Type>, <name>" — "Folder, USP 797". The type prefix is
 * stripped POSITIONALLY, by taking everything after the first comma, never by
 * matching the word "Folder". That keeps it working on a portal in any
 * language, which a word list never would.
 *
 * A label with no comma is returned whole: better a name with a stray prefix
 * than an empty folder name, which would collapse two different folders into
 * one path.
 */
export function ultraFolderName(label: string): string {
  const trimmed = label.replace(/\s+/g, " ").trim();
  const comma = trimmed.indexOf(",");
  if (comma === -1) return trimmed;
  const name = trimmed.slice(comma + 1).trim();
  return name || trimmed;
}

/** How many more we may open before the budget is spent. PURE. */
export function expansionAllowance(
  openedTotal: number,
  limits: UltraLimits = ULTRA_DEFAULTS,
): number {
  return Math.max(0, limits.maxExpansions - openedTotal);
}

/** One collapsed folder on the page, and the two things we need from it. */
export interface UltraExpander {
  label: string;
  /**
   * Has it ACTUALLY opened? Re-reads the live page rather than trusting that
   * the click worked — the whole point of maxClickAttempts above.
   */
  isOpen: () => boolean;
  /** Ask it to open. May silently do nothing; that is why we check. */
  open: () => void;
}

export interface UltraRevealDeps {
  /** Collapsed content expanders currently on the page, in document order. */
  collapsed: () => readonly UltraExpander[];
  /**
   * Load-more controls that still have something to give.
   *
   * ONLY THE LIVE ONES. An exhausted control is a real `disabled` button —
   * measured, all seven of them on a finished outline — so filtering on that
   * is what lets the loop finish instead of clicking dead buttons forever.
   * Never filtered on its label: the two states share one analytics id and
   * differ only in English words.
   */
  loadMore: () => readonly { click: () => void }[];
  /** How many content rows are on the page right now. */
  rowCount: () => number;
  /** Resolve as soon as the page has done the thing we are waiting for. */
  waitUntil: WaitUntil;
  /** Progress, so the card can move while a deep course is opening. */
  onRound?: (openedTotal: number, rows: number, round: number) => void;
}

export interface UltraRevealResult {
  openedTotal: number;
  rounds: number;
  /** Rows on the page once everything has been revealed. */
  rows: number;
  /** Folders that would not open however many times we asked. Counted rather
   *  than assumed away: each one is course material the student did not get. */
  refused: number;
  /** True when the round budget stopped us with folders still shut or lists
   *  still holding back — the difference between "that is the whole course"
   *  and "that is as far as we went". */
  truncated: boolean;
}

/**
 * Open ONE folder, and be sure it opened.
 *
 * Returns true only when the folder reports itself open. Retries because a
 * click can land on a node Ultra has already replaced — see maxClickAttempts.
 */
async function openOne(
  target: UltraExpander,
  waitUntil: WaitUntil,
  attempts: number,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (target.isOpen()) return true;
    try {
      target.open();
    } catch {
      // A control that throws on click is one folder missed, not a failed
      // course.
      return false;
    }
    if (await waitUntil(() => target.isOpen())) return true;
  }
  return target.isOpen();
}

/**
 * Reveal the whole course: open every folder, and make every list show all of
 * its items, until neither produces anything new.
 *
 * 🔴 OPENING AND PAGING CANNOT BE SEPARATE PASSES. This was two functions —
 * "load the whole outline, then expand every folder" — and it undercounted
 * every course it ran on. Measured on the owner's course from a cold load:
 * 80 documents found where there were 107.
 *
 * The reason is that EACH FOLDER PAGINATES ITS OWN CHILDREN. A folder holding
 * twenty-one items opens to show ten, with its own "Load 10 more" control
 * inside it. That control does not exist until the folder is open — so a
 * paging pass that runs first finds nothing to click (the cold page has four
 * rows and no controls at all), and every folder quietly stops at ten. Three
 * of the owner's eight lecture folders were cut off at exactly ten items, and
 * nothing anywhere said so.
 *
 * So the two have to interleave: open what is visible, ask every open list for
 * more, and go round again, because more can reveal more folders. The loop
 * ends on the first round that produces neither a new folder nor a new row.
 *
 * Clicking is the only way in, so this genuinely does drive the page — but it
 * only ever touches the expanders and load-more controls identified above,
 * which toggle a disclosure or extend a list. It never follows a link, never
 * submits anything, and never touches a control it has not identified.
 */
export async function revealWholeOutline(
  deps: UltraRevealDeps,
  limits: UltraLimits = ULTRA_DEFAULTS,
): Promise<UltraRevealResult> {
  let openedTotal = 0;
  let refused = 0;
  let round = 0;

  for (; round < limits.maxRounds; round++) {
    let progressed = false;

    // 1. Open what is visible. ONE AT A TIME, each confirmed before moving on.
    //    The old code clicked every folder in a tight loop and then waited
    //    once — which is how the dropped clicks went unnoticed, and which
    //    fires a dozen content requests at the school's server at once.
    const targets = deps.collapsed().slice(0, expansionAllowance(openedTotal, limits));
    for (const target of targets) {
      if (await openOne(target, deps.waitUntil, limits.maxClickAttempts)) {
        openedTotal += 1;
        progressed = true;
      } else {
        refused += 1;
      }
    }

    // 2. Ask every list that admits it has more. Batched, because these are
    //    separate containers and the growth check below verifies the lot; a
    //    control that does nothing simply shows up as no growth.
    const before = deps.rowCount();
    const controls = deps.loadMore();
    if (controls.length > 0) {
      for (const control of controls) {
        try { control.click(); } catch { /* one dead control is not a failed course */ }
      }
      await deps.waitUntil(() => deps.rowCount() > before);
      if (deps.rowCount() > before) progressed = true;
    }

    deps.onRound?.(openedTotal, deps.rowCount(), round);
    // Stopping because a round achieved nothing is NOT the same as finishing.
    // If folders are still shut or lists still holding back, say so — either
    // the budget ran out or the page refused us, and both mean the student is
    // missing material. Only an empty page in both senses is "that is all".
    if (!progressed) return { ...tally(deps), openedTotal, refused, rounds: round + 1 };
  }

  return { ...tally(deps), openedTotal, refused, rounds: round };
}

/** What is still outstanding, and therefore whether this reading is complete. */
function tally(deps: UltraRevealDeps): { rows: number; truncated: boolean } {
  return {
    rows: deps.rowCount(),
    truncated: deps.collapsed().length > 0 || deps.loadMore().length > 0,
  };
}

// ── Where the content lives, and when it is there at all ─────────────────────

/** An Ultra course's content page. The course id is the capture group. */
export const ULTRA_COURSE_ROUTE = /\/ultra\/courses\/([^/]+)\/outline/;

/**
 * Where an Ultra course's content lives, built from its id. PURE.
 *
 * 🔴 THIS IS WHAT MAKES READING A WHOLE ACCOUNT POSSIBLE. Ultra course cards
 * carry `href="javascript:void(0);"` — measured — so the course list offers
 * nothing to open, and a scan of it could only ever return names. Every
 * document the student wants is one navigation away, and there was no address
 * to navigate to.
 *
 * But the identity IS in the markup (`data-course-id="_38534_1"`), and Ultra's
 * routing is fixed at `/ultra/courses/<id>/outline`. So the address can be
 * CONSTRUCTED for a card that has no link on it at all.
 *
 * Same reasoning as every other route here: the application's own navigation
 * depends on this path, so themes and versions leave it alone. The id shape is
 * CHECKED rather than trusted — it comes from a page a stranger can write, and
 * it is about to become a URL we open in a tab.
 */
export function ultraOutlineUrl(pageUrl: string, courseId: string): string | null {
  if (!/^_\d+_\d+$/.test(courseId)) return null;
  try {
    const base = new URL(pageUrl);
    if (base.protocol !== "https:" && base.protocol !== "http:") return null;
    return new URL(`/ultra/courses/${courseId}/outline`, base.origin).toString();
  } catch {
    return null;
  }
}

/**
 * Course NAVIGATION, measured on the live portal: of 15 anchors on a real
 * course page, 13 were these and none was a document. Excluded by ROUTE, so
 * the rule holds whatever the tabs are called in a given language.
 */
const ULTRA_NAV_ROUTE =
  /\/(?:outline|calendar|announcements|engagement|grades|messages|groups|roster|attendanceGrade|booksAndTools|institution-page)(?:\/|$|\?)/i;

/** Is this link course furniture rather than course material? PURE. */
export function isUltraNavLink(href: string): boolean {
  return ULTRA_NAV_ROUTE.test(href);
}

/**
 * A row that launches another tool rather than opening a document. PURE.
 *
 * MEASURED on the live course. "Simple Syllabus" sits in the outline looking
 * exactly like a document — same analytics id, same row — and its href is:
 *
 *   https://dmuwut6e40u5o.cloudfront.net/ultra/uiv4000.19.0-rel.13_f1a6800#
 *
 * That is Ultra's own JavaScript bundle with a `#` on the end. There is no
 * document at that address; the real launch happens in script. Importing it
 * gives the student a library entry that can never open, and the URL rots the
 * moment Blackboard ships a new build.
 *
 * TESTED STRUCTURALLY, NOT BY NAME. The href ending in `#` is the giveaway and
 * it holds in any language: a link that goes nowhere is not a document. The
 * aria-label prefix is checked too, because Blackboard writes it (it is the
 * vendor's own chrome, not the instructor's words), but either signal alone is
 * enough — so a localised portal that translates the label still gets caught.
 *
 * NOT the same as hiding it. Surfacing Simple Syllabus as something a student
 * can act on is its own piece of work; this only keeps a broken URL out of the
 * library in the meantime.
 */
export function isUltraToolLaunch(href: string, ariaLabel: string): boolean {
  if (href.trim().endsWith("#")) return true;
  return /^\s*LTI Link\s*,/i.test(ariaLabel);
}

/**
 * Is the content actually rendered yet?
 *
 * NOT a visibility check. An earlier version of this refused to scan a
 * background tab, on the theory that Ultra tore its content down when hidden.
 * That was wrong: the zero readings behind it came from the broken
 * data-testid selector above, which matched nothing in any tab. The content
 * renders in a background tab perfectly well.
 *
 * What IS true is that Ultra mounts its content late, so the honest test is
 * simply whether the expanders exist yet — the caller polls on this.
 */
export function ultraContentReady(doc: Document): boolean {
  return doc.querySelectorAll(ULTRA_EXPANDER_SELECTOR).length > 0;
}

// ── What a DOCUMENT is, measured with a folder actually open ─────────────────
//
// Opening "Basics of Sterile Compounding" on the live course inserted exactly
// one row, and this is what it was:
//
//   <div class="itemContainer …nestedItemContainer">      ← indented 30px
//     <a data-analytics-id="content.item.course.outline.courseContent.link"
//        href="…/ultra/courses/_37630_1/outline/file/_2017715_1">
//       Basics of Sterile Compounding.pdf
//     <button id="content-item-overflow-menu-button-_2017715_1"
//             aria-expanded="false">        ← 🔴 NEVER CLICK THIS
//
// Three things in there contradict how the rest of the crawl works.

/** The one link on a row that is the material itself. */
export const ULTRA_DOCUMENT_ANALYTICS_ID = "content.item.course.outline.courseContent.link";
export const ULTRA_DOCUMENT_SELECTOR = `a[data-analytics-id="${ULTRA_DOCUMENT_ANALYTICS_ID}"]`;

/**
 * 🔴 EVERY DOCUMENT ROW CARRIES ITS OWN aria-expanded BUTTON.
 *
 * It is the row's "More options" overflow menu. A sweep over
 * `button[aria-expanded="false"]` — the obvious way to write this — opens a
 * context menu on every single document, over and over, and never finds a
 * folder. This is why the expander selector is a closed set of analytics ids
 * rather than a general disclosure sweep.
 */
export const ULTRA_OVERFLOW_MENU_ID_PREFIX = "content-item-overflow-menu-button-";

/** Rows are flat siblings; a child is marked by this ancestor, and by indent. */
export const ULTRA_NESTED_ANCESTOR_CLASS = "content-list-item";
export const ULTRA_ROW_CLASS = "itemContainer";
/** Measured: top level sits at x=33, its children at x=63. */
export const ULTRA_INDENT_PX = 30;

/**
 * The file's type, from its TITLE. PURE.
 *
 * 🔴 NOT from the href. Ultra's document URLs are
 * `…/outline/file/_2017715_1` — an opaque id with no extension on it at all.
 * `fileTypeOf(href)`, which every other portal in this extension relies on,
 * returns nothing here and the document gets filed as a "page" when it is a
 * PDF. The extension is in the visible title instead: "Basics of Sterile
 * Compounding.pdf".
 */
export function ultraFileTypeFromTitle(title: string): string | undefined {
  const match = /\.([a-z0-9]{1,5})\s*$/i.exec(title.trim());
  const ext = match?.[1]?.toLowerCase();
  // A trailing number is a version, not a format: "Lecture 3.2" is not a file
  // of type "2".
  if (!ext || /^\d+$/.test(ext)) return undefined;
  return ext;
}

/** The title without its extension, for a name a student would recognise. */
export function ultraDocumentTitle(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  const ext = ultraFileTypeFromTitle(text);
  return ext ? text.slice(0, text.length - ext.length - 1).trim() || text : text;
}

/**
 * Folder path for a row, from the indent of the rows above it. PURE.
 *
 * Ultra's outline is a FLAT list — expanding a folder inserts its children as
 * SIBLINGS immediately after it, not inside it. So nesting cannot be read from
 * the DOM tree (every row reports the same depth); it has to come from how far
 * each row is indented, and which folder was the last one shallower than this.
 *
 * `rows` must be in document order. Indents are pixel offsets as measured.
 */
export function ultraFolderPath(
  rows: readonly { indentPx: number; folderName?: string }[],
  index: number,
): string[] {
  const me = rows[index];
  if (!me) return [];
  const path: string[] = [];
  let depth = me.indentPx;
  for (let i = index - 1; i >= 0; i--) {
    const row = rows[i];
    if (!row || row.indentPx >= depth) continue;
    if (row.folderName) path.unshift(row.folderName);
    depth = row.indentPx;
    if (depth <= 0) break;
  }
  return path;
}

// ── 🔴 EVERY LIST IS PAGINATED AT TEN — INCLUDING EACH FOLDER'S OWN ─────
//
// The course outline lazy-loads: a list shows ten items and hides the rest
// behind a control carrying `…infiniteScroll.content.loadMoreButton…`. A crawl
// that skips this reads the first ten items and reports them as the whole
// course — the same silent-undercount family as the data-testid bug, and just
// as invisible.
//
// 🔴 AND IT IS PER LIST, NOT PER COURSE. This was first read as one
// paginated outline, so the code loaded the whole outline and THEN opened the
// folders. Measured from a cold load of the owner's course, that returned 80
// documents out of 107: a cold page has four rows and NO load-more controls at
// all, because each folder carries its own, inside itself, and it does not
// exist until the folder is open. Three of eight lecture folders stopped dead
// at exactly ten items.
//
// That is why revealWholeOutline interleaves the two instead of sequencing
// them. See the note on that function.
//
// WHY NOT READ THE BUTTON TEXT. The live and exhausted states share one
// analytics id and differ only in English words — "Load 10 more content items"
// versus "No more content items to load". Matching that breaks every
// non-English portal, the same mistake as a subject keyword list. The honest
// tests are structural: an exhausted control is genuinely `disabled`, and past
// that, whether the list actually grew.

export const ULTRA_LOAD_MORE_SELECTOR = '[data-analytics-id*="loadMoreButton"]';

