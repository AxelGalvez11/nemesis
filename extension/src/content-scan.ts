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
import { detectLms, factsFromUrl } from "./lms/detect.ts";
import { isItemLink, parseSnapshot } from "./lms/parse.ts";
import { RUNTIME_MESSAGES } from "./messages.ts";
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

function readOnce(lms: LmsKind, url: string): ScrapedCourse[] {
  const snapshot = readSnapshot(document, url, (href) => isItemLink(href, lms));
  return parseSnapshot(snapshot, lms);
}

/** What the card's checklist shows. Counts only — nothing here decides what
 *  any of it means. */
function counts(courses: readonly ScrapedCourse[]): ScanProgress {
  return {
    courses: courses.length,
    items: courses.reduce((total, course) => total + course.items.length, 0),
    syllabi: courses.reduce((total, course) => total + course.syllabusLinks.length, 0),
  };
}

const namesOf = (courses: readonly ScrapedCourse[]): string[] => courses.map((course) => course.name);

async function scanThisPage(): Promise<LmsScan> {
  const stamp = () => new Date().toISOString();
  const empty: LmsScan = { courses: [], lms: "unknown", scannedAt: stamp() };

  const { markers, url } = readFacts(document, window.location.href);
  const facts = factsFromUrl(url, markers);
  if (!facts) return empty;

  const lms = detectLms(facts);
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
    await sleep(POLL_MS);
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
      stable = grew ? 0 : stable + 1;
      if (stable >= STABLE_ROUNDS) break;
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

  const scan: LmsScan = { courses: best, lms, scannedAt: stamp() };
  save(scan);
  // The way back. Without this the student is left on their portal holding a
  // result with no idea where it goes — which is exactly what the owner hit.
  showCard(document, {
    action: { label: "Open Nemesis", onClick: () => window.open(APP_URL, "_blank", "noopener") },
    courseNames: namesOf(best),
    detail: "Each one becomes a folder in your Library once you bring it in.",
    progress: counts(best),
    title: "Read from your portal",
    tone: "done",
  });
  return scan;
}

// chrome.scripting.executeScript awaits a returned promise and uses the
// resolved value as the result, so the whole wait completes before the popup
// or the worker sees anything.
scanThisPage();
