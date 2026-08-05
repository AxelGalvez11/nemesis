// The names the three halves of this extension shout at each other, in one
// place so a typo is a build error rather than a silent no-op.
//
// TWO SEPARATE CHANNELS, and the difference matters:
//
//  - chrome.runtime messages, between the popup, the service worker and the
//    content scripts. Private to the extension.
//  - window.postMessage, between the bridge content script and the Nemesis web
//    page. PUBLIC — any script running on that page can see and send these.
//
// Everything on the second channel is untrusted in both directions. The page
// cannot make the extension do anything but scan and read back, and the app
// sanitises every scan it receives (packages/shared/src/lms-import.ts). The
// `source` fields below are for ROUTING ONLY, never for trust: a hostile script
// can set them to anything.

/** Marks a message as coming from the web page towards the extension. */
export const FROM_APP = "nemesis-app";

/** Marks a message as coming from the extension towards the web page. */
export const FROM_EXTENSION = "nemesis-extension";

export const APP_MESSAGES = {
  /** "Are you installed?" Answered with PONG. */
  PING: "nemesis:ping",
  /** "Give me the most recent scan you hold." */
  REQUEST_SCAN: "nemesis:request-scan",
  /** "Throw away what you hold." Sent after a successful import so a student's
   *  coursework does not sit in extension storage indefinitely. */
  CLEAR_SCAN: "nemesis:clear-scan",
  /**
   * "Fetch me the bytes of this one document."
   *
   * 🔴 THE ONLY WAY THE FILE CAN TRAVEL. The student's school session lives in
   * their browser, scoped to the portal's own origin. app.enternemesis.com
   * cannot fetch a Blackboard file — no cookie, and the portal would refuse the
   * cross-origin read anyway. The extension can, because it runs INSIDE a tab
   * on that origin, where the request is same-origin and already signed in.
   *
   * Deliberately ONE document per message, and the reply names the URL it is
   * answering: the import asks for the files the student ticked, one at a time,
   * so a slow or refused file costs that document and not the batch.
   */
  REQUEST_FILE: "nemesis:request-file",
} as const;

export const EXTENSION_MESSAGES = {
  PONG: "nemesis:pong",
  SCAN: "nemesis:scan",
  CLEARED: "nemesis:cleared",
  /** One document's bytes, or an `error` string saying why not. Carries the URL
   *  it answers, because replies can arrive out of order. */
  FILE: "nemesis:file",
} as const;

/** Runtime channel, extension-internal. */
export const RUNTIME_MESSAGES = {
  /**
   * The injected scanner hands its finished reading to the worker.
   *
   * 🔴 THE SCANNER SAVES ITS OWN RESULT, and this is why. Two independent
   * reasons a return value cannot be trusted here:
   *
   *  - The bundle is an IIFE, so `chrome.scripting.executeScript` receives the
   *    IIFE's completion value — `undefined` — not the scan. The popup read
   *    that as "no courses found" while the page's own status card was happily
   *    reporting nine.
   *  - The scan waits up to forty-five seconds for a slow portal to render,
   *    and a popup closes the instant the student clicks the page. Anything
   *    awaiting in the popup dies with it.
   *
   * Pushing the result to the worker survives both.
   */
  SAVE_SCAN: "nemesis:save-scan",
  /** Anyone asks the worker what it is holding. */
  GET_STORED: "nemesis:get-stored",
  CLEAR_STORED: "nemesis:clear-stored",
  /**
   * "Read every one of these courses." Sent by the popup once the student has
   * picked a term and ticked courses; the worker opens each in a background tab
   * and drives it, because an Ultra course cannot be read any other way.
   */
  SWEEP_COURSES: "nemesis:sweep-courses",
  /** One course finished, from the script injected into its tab. */
  COURSE_READ: "nemesis:course-read",
  /** How the sweep is getting on, for the popup's progress line. */
  SWEEP_PROGRESS: "nemesis:sweep-progress",
  /** The popup asks the worker where the sweep has got to (it may have opened
   *  after the sweep started, or been closed and reopened mid-way). */
  GET_SWEEP: "nemesis:get-sweep",
  /** The worker is ASKED for one file's bytes (by the bridge, on the app's
   *  behalf). */
  FETCH_FILE: "nemesis:fetch-file",
  /**
   * The injected fetcher ANSWERS with one file's bytes.
   *
   * 🔴 A SEPARATE NAME FROM THE REQUEST, and it has to be. Both messages carry
   * a `url`, and both land on the worker's one listener. Sharing a type made
   * the worker treat the fetcher's own reply as a fresh request and go round
   * again — a loop that would have opened a tab per lap.
   */
  FILE_BYTES: "nemesis:file-bytes",
} as const;

/** Where the worker keeps the last scan. */
export const STORAGE_KEY = "nemesis.scan.v1";

/**
 * Where the popup leaves "the student says this page is Moodle".
 *
 * WHY STORAGE AND NOT AN ARGUMENT. The scanner is injected as a FILE, and
 * chrome.scripting cannot hand arguments to a file injection — only to an
 * inline function, which a bundled module is not. So the choice is written
 * here first and the scanner picks it up on the way in.
 *
 * It carries the ORIGIN it was chosen for and the scanner refuses it against
 * any other, so a stale override cannot make tomorrow's page on a different
 * site get parsed as somebody's Moodle.
 */
export const OVERRIDE_KEY = "nemesis.lms-override.v1";

export interface LmsOverride {
  /** LmsKind, but this module stays free of wire imports. */
  lms: string;
  /** Exact origin the student made this choice on. */
  origin: string;
}

/**
 * Where the worker leaves the URL it wants a tab to fetch.
 *
 * Same mechanism, and the same reason, as OVERRIDE_KEY above:
 * chrome.scripting cannot pass arguments to a FILE injection, and a bundled
 * module is a file. So the request is written here and the injected script
 * picks it up on the way in.
 *
 * 🔴 CONSUMED ON READ, and the fetcher checks the origin matches the tab it
 * woke up in. A stale request must never be answered by a page it was not
 * meant for.
 */
export const FETCH_KEY = "nemesis.fetch-request.v1";

export interface FetchRequest {
  url: string;
  /** Origin the worker intends this to run on. */
  origin: string;
}

/** Where the worker keeps how far the sweep has got, so a popup that was
 *  closed and reopened can show the truth rather than starting again. */
export const SWEEP_KEY = "nemesis.sweep.v1";

export interface SweepState {
  running: boolean;
  /** Courses finished so far. */
  done: number;
  total: number;
  /** The course being read right now, for the progress line. */
  current: string;
  /** Documents found across the whole sweep. */
  documents: number;
  /** Courses that could not be read at all, by name — never silently dropped. */
  failed: string[];
}
