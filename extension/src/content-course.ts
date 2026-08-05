// Injected into ONE course's content page, by the sweep, to read it.
//
// The difference from content-scan.ts is what the tab is FOR. content-scan runs
// in a tab the student is looking at, reads whatever page they are on, and puts
// a status card on it. This runs in a tab the worker opened, off-screen, whose
// only job is to be read and closed — so there is no card, no course-list
// polling, and no branching on what kind of page it is. The worker only ever
// points it at a Blackboard Ultra outline.
//
// 🔴 THIS TAB IS NEVER FRONTMOST, WHICH USED TO BE FATAL. Chrome throttles
// timers in a hidden tab to about one wake per minute — measured, a 50ms
// timeout firing after 147 SECONDS. Every wait in here therefore goes through
// the MutationObserver-driven helpers in lms/ultra-read.ts, which are not
// throttled. A version of this built on sleeps would appear to work in testing
// (where the tab is usually visible) and take an hour per course in real use.
//
// READ-ONLY in the sense that matters: it opens disclosures and asks lists for
// their next page, which is the only way Ultra will show its contents at all.
// It never follows a link, submits anything, or touches a control outside the
// closed set of expanders identified in lms/ultra.ts.

import { ULTRA_COURSE_ROUTE, ultraContentReady } from "./lms/ultra.ts";
import { readUltraCourse, waitForChange } from "./lms/ultra-read.ts";
import { RUNTIME_MESSAGES } from "./messages.ts";
import type { ScrapedDocument } from "./wire.ts";

/**
 * How long to wait for Ultra to draw its outline before giving up on a course.
 *
 * Measured on the owner's own installation: the course list took about THIRTY
 * seconds to render, and for the first twenty-two the document held no course
 * content at all. A budget shorter than that reports an empty course, which is
 * the exact false report this whole feature exists to prevent.
 */
const READY_BUDGET_MS = 45_000;

/** Report back to the worker. Never throws: this tab is about to be closed by
 *  someone else, and an exception here would only strand the sweep. */
function report(payload: { url: string; documents: ScrapedDocument[]; truncated: boolean; error?: string }): void {
  try {
    chrome.runtime.sendMessage({ ...payload, type: RUNTIME_MESSAGES.COURSE_READ }, () => {
      // Reading lastError stops Chrome logging an unchecked-error warning into
      // the student's own console.
      void chrome.runtime.lastError;
    });
  } catch {
    // The extension was reloaded mid-sweep. Nothing to do about it from here.
  }
}

/** Wait until the outline is actually on the page, or the budget runs out. */
async function waitForContent(): Promise<boolean> {
  const deadline = Date.now() + READY_BUDGET_MS;
  while (Date.now() < deadline) {
    if (ultraContentReady(document)) return true;
    // Waits on the page DOING something rather than on a clock — see the header.
    // False means the page went quiet, which on a still-empty outline means it
    // is not going to fill: stop rather than sit out the whole budget.
    if (!(await waitForChange(3_000))) return ultraContentReady(document);
  }
  return ultraContentReady(document);
}

async function readThisCourse(): Promise<void> {
  const url = window.location.href;
  if (!ULTRA_COURSE_ROUTE.test(url)) {
    // The worker aims this precisely, so arriving anywhere else means the portal
    // redirected us — an expired session, or a course the student can no longer
    // open. Said out loud rather than reported as an empty course.
    report({ documents: [], error: "not-a-course-page", truncated: false, url });
    return;
  }

  if (!(await waitForContent())) {
    // 🔴 "NOTHING RENDERED" AND "NOTHING IN IT" ARE DIFFERENT NEWS and only one
    // of them is the student's. An empty result here would read as a course
    // with no material, which is the lie this extension keeps having to fix.
    report({ documents: [], error: "never-rendered", truncated: true, url });
    return;
  }

  try {
    const result = await readUltraCourse(() => {
      // Progress goes nowhere from a background tab — there is no card to draw
      // on and the popup is fed by the worker, which counts whole courses. The
      // callback exists because the reader takes one; ignoring it is correct.
    });
    report({ documents: result.documents, truncated: result.truncated, url });
  } catch {
    report({ documents: [], error: "read-failed", truncated: true, url });
  }
}

void readThisCourse();
