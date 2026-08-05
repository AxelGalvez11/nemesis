// Injected into a school portal tab, on demand, to read it.
//
// NOT a persistent content script. The service worker injects it with
// chrome.scripting only when the student presses "Read this page", into the tab
// they are already looking at. That is why the manifest asks for no standing
// host permissions: the extension cannot watch pages in the background and
// cannot read a portal the student has not deliberately pointed it at.
//
// READ-ONLY. It reads the document and returns a value. It never clicks,
// submits, navigates, or changes anything the portal owns. The one thing it
// puts on the page is its own status card, inside a closed shadow root.
//
// 🔴 IT WAITS, AND THAT IS THE WHOLE FIX. Measured against a real Blackboard
// Ultra installation: the course list took about THIRTY SECONDS to render, and
// for the first twenty-two seconds the document held twenty-five anchors and
// no courses at all. A scanner that reads the DOM the instant it is injected
// reports "no courses found" on a page that is full of them. So this polls
// until the page stops producing new courses, and says what it is doing while
// it waits.

import { readFacts, readSnapshot } from "./lms/dom.ts";
import { newCrawl, type CrawlLink, type CrawlState } from "./lms/crawl.ts";
import { folderRule, walkCourse } from "./lms/walk.ts";
import { ULTRA_COURSE_ROUTE } from "./lms/ultra.ts";
import { readUltraCourse, waitForChange } from "./lms/ultra-read.ts";
import { detectLms, factsFromUrl } from "./lms/detect.ts";
import { isItemLink, parseSnapshot } from "./lms/parse.ts";
import { type LmsOverride, OVERRIDE_KEY, RUNTIME_MESSAGES } from "./messages.ts";
import { type ScanProgress, showCard } from "./toast.ts";
import type { LmsKind, LmsScan, ScrapedCourse } from "./wire.ts";

/** Where a student goes to turn a reading into Library folders. */
const APP_URL = "https://app.enternemesis.com/library?import=coursework";

/**
 * Hand the finished reading to the service worker, which owns storage.
 *
 * 🔴 THE SCANNER SAVES ITS OWN RESULT. Returning it was silently broken twice
 * over: the bundle is an IIFE so `executeScript` received `undefined` rather
 * than the scan, and the popup that awaited it closes the moment the student
 * clicks the page — which they will, because this waits up to forty-five
 * seconds. Both showed up as a popup insisting "no courses found" while the
 * page's own card reported nine.
 */
function save(scan: LmsScan): void {
  try {
    chrome.runtime.sendMessage({ scan, type: RUNTIME_MESSAGES.SAVE_SCAN }, () => {
      // A dead worker sets lastError; reading it stops Chrome logging an
      // unchecked-error warning into the student's console on their own portal.
      void chrome.runtime.lastError;
    });
  } catch {
    // The extension was reloaded or disabled mid-scan. Nothing to do, and
    // certainly nothing worth throwing over on someone's grade page.
  }
}

/** Enough for a slow portal, without hanging on a page that genuinely has no
 *  courses. Thirty seconds was not enough on the installation this was measured
 *  against. */
const MAX_WAIT_MS = 45_000;
const POLL_MS = 1_000;
/** Two polls that add nothing new means the page has settled. */
const STABLE_ROUNDS = 2;

const LABELS: Record<LmsKind, string> = {
  blackboard: "Blackboard",
  brightspace: "Brightspace",
  canvas: "Canvas",
  moodle: "Moodle",
  unknown: "this page",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 🔴 THE CLOCK STOPS IN A BACKGROUND TAB. THE PAGE DOES NOT. The waits used
// here are driven by MutationObserver rather than by a timer, for reasons
// measured on a live course and written up at the top of lms/ultra-read.ts.
// That file now owns them, because the sweep reads every course in a tab that
// is deliberately not frontmost — the throttled path is the normal one there.

/**
 * "The student says this page is Moodle", if they said so.
 *
 * 🔴 REFUSED UNLESS THE ORIGIN MATCHES. The choice is made in the popup and
 * left in storage, so it outlives the click that created it. Without the origin
 * check, choosing "Moodle" on one site and then scanning a different one would
 * parse the second site as the first student's Moodle. Consumed either way, so
 * it applies to exactly the one scan it was made for.
 */
async function takeOverride(): Promise<LmsKind | null> {
  try {
    const bag = await chrome.storage.local.get(OVERRIDE_KEY);
    const stored = bag[OVERRIDE_KEY] as LmsOverride | undefined;
    await chrome.storage.local.remove(OVERRIDE_KEY);
    if (!stored || stored.origin !== window.location.origin) return null;
    return (stored.lms in LABELS ? stored.lms : null) as LmsKind | null;
  } catch {
    // Extension reloaded mid-scan, or storage unavailable. Fall back to
    // detection rather than failing the whole read.
    return null;
  }
}

function readOnce(lms: LmsKind, url: string): ScrapedCourse[] {
  const snapshot = readSnapshot(document, url, (href) => isItemLink(href, lms));
  return parseSnapshot(snapshot, lms);
}

/** What the card's checklist shows. Counts only — nothing here decides what
 *  any of it means. */
/** How long one page may take before the walk gives up on it and moves on. A
 *  portal that hangs must not hang the whole scan. */
const PAGE_TIMEOUT_MS = 8_000;
/** A breath between page loads. We are a guest on the school's server. */
const POLITE_GAP_MS = 150;

/**
 * Read one page of the student's portal and hand back its links.
 *
 * Runs in the content script, so `credentials: "include"` sends the session
 * the student is ALREADY signed in with. The extension never sees, stores or
 * asks for a password — it reads what the browser could already show them.
 *
 * Returns null rather than throwing on anything unexpected. A folder that
 * 403s, times out or answers with something that is not a web page is one
 * folder skipped, not a failed scan.
 */
async function linksOnPage(url: string): Promise<readonly CrawlLink[] | null> {
  const abort = new AbortController();
  const timer = window.setTimeout(() => abort.abort(), PAGE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      credentials: "include",
      redirect: "follow",
      signal: abort.signal,
    });
    if (!response.ok) return null;
    // NEVER pull down a file. A .pdf or a 300MB lecture video is a thing to
    // LINK to, not to read here — and the walk only needs pages with links on
    // them. The Content-Type is the only honest way to know before reading the
    // body, so it is checked before the body is touched.
    if (!(response.headers.get("content-type") ?? "").includes("text/html")) return null;
    const parsed = new DOMParser().parseFromString(await response.text(), "text/html");
    return Array.from(parsed.querySelectorAll("a[href]")).flatMap((anchorEl) => {
      const href = anchorEl.getAttribute("href") ?? "";
      // What KIND of row is this? Canvas states it on the row's own class and
      // hides it nowhere else — every item shares one URL shape. Vendor-emitted
      // and functional, the same call already made for Ultra's analytics ids.
      const row = anchorEl.closest(".context_module_item");
      const attachment = row ? row.classList.contains("attachment") : undefined;
      // Resolved against the page it was found on, not against wherever this
      // script happens to be running.
      let absolute: string;
      try {
        absolute = new URL(href, url).href;
      } catch {
        return [];
      }
      return [{
        href: absolute,
        text: (anchorEl.textContent ?? "").replace(/\s+/g, " ").trim(),
        ...(attachment === undefined ? {} : { attachment }),
      }];
    });
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
    // A breath between requests, so a twenty-folder course does not arrive at
    // the school's server as a burst.
    //
    // SKIPPED IN A HIDDEN TAB, where this 150ms becomes ~2.5 minutes and a
    // twenty-page walk becomes an hour. Nothing is lost by it: the real
    // politeness is that these fetches are strictly one at a time, which is
    // still true, and one signed-in student reading their own course pages in
    // sequence is not a load a portal notices.
    if (!document.hidden) await sleep(POLITE_GAP_MS);
  }
}

function counts(courses: readonly ScrapedCourse[]): ScanProgress {
  return {
    courses: courses.length,
    items: courses.reduce((total, course) => total + course.items.length, 0),
    syllabi: courses.reduce((total, course) => total + course.syllabusLinks.length, 0),
  };
}

const namesOf = (courses: readonly ScrapedCourse[]): string[] => courses.map((course) => course.name);

/**
 * One honest sentence about the walk, for the finished card.
 *
 * There are FOUR different outcomes here and they used to look identical to a
 * student — the documents row was simply hidden whenever nothing was found:
 *
 *   - none of the courses could be opened  (Blackboard Ultra: no links to open)
 *   - opened them, and they held nothing we could read
 *   - found things, and that is all of them
 *   - found things, and there were more we did not have budget for
 *
 * "It found nothing" and "it never looked" are not the same news, and only one
 * of them is our bug. Saying which is the difference between a student
 * believing their course is empty and knowing the tool could not get in.
 */
function documentsDetail(
  courses: number,
  unopenable: number,
  documents: number,
  truncated: boolean,
): string {
  if (unopenable >= courses) {
    return "Courses read. This portal does not let us open them from here, so no slides or readings yet.";
  }
  if (documents === 0) {
    return "Courses read. Nothing readable inside them yet.";
  }
  if (truncated) {
    return "Each one becomes a folder in your Library. Some deeper folders were left for later.";
  }
  return "Each one becomes a folder in your Library once you bring it in.";
}


async function scanThisPage(): Promise<LmsScan> {
  const stamp = () => new Date().toISOString();
  const empty: LmsScan = { courses: [], lms: "unknown", scannedAt: stamp() };

  const { markers, url } = readFacts(document, window.location.href);
  const facts = factsFromUrl(url, markers);
  if (!facts) return empty;

  // THE STUDENT'S OWN ANSWER WINS. Detection reads the URL's shape, which is
  // what lets this work on any school's domain without knowing the school
  // exists — but it cannot cover a portal behind a campus front door or an
  // unusual reverse proxy. When they told the popup which one it is, that is
  // better evidence than anything we can infer, so it is used first.
  const lms = (await takeOverride()) ?? detectLms(facts);
  if (lms === "unknown") {
    // A page we cannot place is not read at all. Saying so is better than
    // hoovering up a page we do not understand.
    showCard(document, {
      autoHideMs: 6000,
      detail: "Open the page that lists your courses, then try again.",
      title: "This does not look like a school portal",
      tone: "error",
    });
    return empty;
  }

  showCard(document, {
    detail: "This can take a moment on a slow portal.",
    progress: { courses: 0, items: 0, syllabi: 0 },
    title: `Reading your ${LABELS[lms]}`,
    tone: "working",
  });

  let best: ScrapedCourse[] = readOnce(lms, url);
  let stable = 0;
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    // Wait for the portal to DRAW something, not for a second to pass. On a
    // slow portal this comes back the moment a course row lands, so the counts
    // climb as fast as the page can produce them; on a finished page it comes
    // back false, which is the most reliable "it has settled" there is.
    const stillDrawing = await waitForChange(POLL_MS);
    const next = readOnce(lms, url);
    // Keep the FULLEST reading seen, never the latest. A virtualised list drops
    // rows as they scroll out of view, and a scan must not go backwards.
    const grew = next.length > best.length;
    if (grew) best = next;

    if (best.length > 0) {
      // Redrawn every poll so the counts visibly climb. On a portal that takes
      // half a minute this IS the difference between working and stuck.
      showCard(document, {
        courseNames: namesOf(best),
        detail: "This can take a moment on a slow portal.",
        progress: counts(best),
        title: `Reading your ${LABELS[lms]}`,
        tone: "working",
      });
      // A page that has stopped mutating altogether is finished, whatever the
      // round count says — no reason to keep waiting on a static document.
      stable = grew ? 0 : stable + 1;
      if (!stillDrawing || stable >= STABLE_ROUNDS) break;
    }
  }

  if (best.length === 0) {
    showCard(document, {
      autoHideMs: 8000,
      detail: "Try the page that lists all of your courses.",
      title: `No courses found on this ${LABELS[lms]} page`,
      tone: "empty",
    });
    const nothing: LmsScan = { courses: [], lms, scannedAt: stamp() };
    save(nothing);
    return nothing;
  }

  // ── Walk INTO each course ─────────────────────────────────────────────────
  // Everything above reads the course LIST. That is where the scan used to
  // stop, which is why the Documents count was always zero: the slides and
  // readings a student actually wants live one or more folders deep, and
  // nothing had ever opened a course (owner 2026-08-01).
  //
  // The frontier and its budget are shared across every course, so one
  // enormous course cannot spend the whole scan's allowance and leave the
  // others unread.
  // A previous version refused to scan from a background tab, on the theory
  // that Ultra unmounted its content when hidden. That diagnosis was wrong —
  // the zeros behind it came from a selector that matched nothing anywhere —
  // and the guard would have blocked real scans. Removed rather than left in
  // as a superstition. ULTRA_COURSE_ROUTE stays: it is how the Ultra path
  // below knows it is on a course page.
  // Blackboard Ultra course page: no links to follow, so drive the page.
  if (ULTRA_COURSE_ROUTE.test(url)) {
    const courseName = best[0]?.name ?? document.title.replace(/^Content\s*\/\s*/, "").trim() ?? "This course";
    const ultra = await readUltraCourse((documents, note) => {
      showCard(document, {
        courseNames: [courseName],
        detail: note,
        documentsByCourse: { [courseName]: documents },
        progress: { ...counts(best), documents },
        title: `Reading ${courseName}`,
        tone: "working",
      });
    });
    const course: ScrapedCourse = {
      ...(best[0] ?? { items: [], name: courseName, syllabusLinks: [] }),
      documents: ultra.documents,
      url,
    };
    const ultraScan: LmsScan = { courses: [course], lms, scannedAt: stamp() };
    save(ultraScan);
    showCard(document, {
      action: { label: "Send to Nemesis", onClick: () => window.open(APP_URL, "_blank", "noopener") },
      courseNames: [course.name],
      detail: documentsDetail(1, 0, ultra.documents.length, ultra.truncated),
      documentsByCourse: { [course.name]: ultra.documents.length },
      progress: { ...counts([course]), documents: ultra.documents.length },
      title: "Read from your portal",
      tone: "done",
    });
    return ultraScan;
  }

  // 🔴 NEWEST TERM FIRST, BECAUSE THE PAGE BUDGET RUNS OUT LONG BEFORE THE
  // COURSES DO.
  //
  // MEASURED on a real signed-in Canvas account (2026-08-04): FIFTY-SIX courses
  // spanning eight terms, listed oldest first — "Bucs on Deck 2021", "CBU
  // Placement Exams (Fall 2021)", "Fall 2021 Calculus I", and so on. The crawl
  // shares one budget across every course (DEFAULT_LIMITS: 240 pages total, 40
  // per course), so walking them in the portal's own order spends the entire
  // allowance on courses from four years ago and reaches THIS semester with
  // nothing left.
  //
  // The term filter in the picker does not help here: this runs during the
  // scan, before the student has chosen anything. Ordering is what protects
  // them — if the budget runs out, it runs out on the oldest material rather
  // than the material they are actually studying.
  //
  // Courses with no term sort last for the same reason: an undated course is
  // less likely to be this semester's than one the portal stamped with a year.
  const yearOf = (course: ScrapedCourse) => Number(/\b(19[89]\d|20\d{2})\b/.exec(course.term ?? "")?.[1] ?? 0);
  const walkOrder = [...best].sort((a, b) => yearOf(b) - yearOf(a));

  const isFolder = folderRule(lms);
  let frontier: CrawlState = newCrawl();
  let documentsFound = 0;
  let anythingTruncated = false;
  const walked: ScrapedCourse[] = [];
  const perCourse: Record<string, number> = {};

  // Courses with no address to open. On Blackboard Ultra that is ALL of them:
  // measured on a live installation, every course link is `javascript:void(0)`
  // and navigation happens in JavaScript, so there is nothing to fetch.
  let unopenable = 0;

  for (const course of walkOrder) {
    if (!course.url) {
      // Leaving `documents` ABSENT is the honest record: the shared contract
      // reads absent as "never looked inside", which is not the same as an
      // empty array meaning "looked, found nothing". Counted, so the card can
      // SAY so — see below.
      unopenable += 1;
      walked.push(course);
      continue;
    }
    const result = await walkCourse(
      course.url,
      {
        isFolderHref: isFolder,
        linksOn: linksOnPage,
        onProgress: (soFar) => {
          showCard(document, {
            courseNames: namesOf(best),
            documentsByCourse: { ...perCourse, [course.name]: soFar },
            detail: `Opening ${course.name}`,
            progress: { ...counts(best), documents: documentsFound + soFar },
            title: `Reading your ${LABELS[lms]}`,
            tone: "working",
          });
        },
      },
      frontier,
    );
    frontier = result.state;
    documentsFound += result.documents.length;
    anythingTruncated = anythingTruncated || result.truncated;
    perCourse[course.name] = result.documents.length;
    walked.push({ ...course, documents: result.documents });
  }

  const scan: LmsScan = { courses: walked, lms, scannedAt: stamp() };
  save(scan);
  // The way back. Without this the student is left on their portal holding a
  // result with no idea where it goes — which is exactly what the owner hit.
  showCard(document, {
    // "Send to Nemesis", not "Open Nemesis" (owner 2026-08-01): the button
    // moves the reading somewhere, and the label should say that rather than
    // describe which window appears.
    action: { label: "Send to Nemesis", onClick: () => window.open(APP_URL, "_blank", "noopener") },
    courseNames: namesOf(walked),
    documentsByCourse: perCourse,
    detail: documentsDetail(best.length, unopenable, documentsFound, anythingTruncated),
    // ALWAYS a number once the walk has run, never absent (owner 2026-08-01:
    // "I need the extension to actually show if it picked up documents or
    // not"). A hidden row and a row reading 0 are different facts, and the
    // student was being shown neither.
    progress: { ...counts(walked), documents: documentsFound },
    title: "Read from your portal",
    tone: "done",
  });
  return scan;
}

// chrome.scripting.executeScript awaits a returned promise and uses the
// resolved value as the result, so the whole wait completes before the popup
// or the worker sees anything.
scanThisPage();
