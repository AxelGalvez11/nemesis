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
} as const;

export const EXTENSION_MESSAGES = {
  PONG: "nemesis:pong",
  SCAN: "nemesis:scan",
  CLEARED: "nemesis:cleared",
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
