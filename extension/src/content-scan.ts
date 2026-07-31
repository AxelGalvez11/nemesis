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
import { showToast } from "./toast.ts";
import type { LmsKind, LmsScan, ScrapedCourse } from "./wire.ts";

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

function summarise(courses: readonly ScrapedCourse[]): string {
  const items = courses.reduce((total, course) => total + course.items.length, 0);
  const courseWord = courses.length === 1 ? "course" : "courses";
  if (items === 0) return `${courses.length} ${courseWord}`;
  return `${courses.length} ${courseWord}, ${items} ${items === 1 ? "item" : "items"}`;
}

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
    showToast(
      document,
      "error",
      "This does not look like a school portal",
      "Open the page that lists your courses, then try again.",
      6000,
    );
    return empty;
  }

  showToast(document, "working", `Reading your ${LABELS[lms]}`, "This can take a moment on a slow portal.");

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
      showToast(document, "working", `Reading your ${LABELS[lms]}`, `${summarise(best)} so far`);
      stable = grew ? 0 : stable + 1;
      if (stable >= STABLE_ROUNDS) break;
    }
  }

  if (best.length === 0) {
    showToast(
      document,
      "empty",
      `No courses found on this ${LABELS[lms]} page`,
      "Try the page that lists all of your courses.",
      8000,
    );
    return { courses: [], lms, scannedAt: stamp() };
  }

  showToast(document, "done", `Read ${summarise(best)}`, "Open Nemesis to finish bringing them in.", 10_000);
  return { courses: best, lms, scannedAt: stamp() };
}

// chrome.scripting.executeScript awaits a returned promise and uses the
// resolved value as the result, so the whole wait completes before the popup
// or the worker sees anything.
scanThisPage();
