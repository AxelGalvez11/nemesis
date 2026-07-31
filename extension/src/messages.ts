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
  /** Popup asks the worker to scan the tab the student is looking at. */
  SCAN_ACTIVE_TAB: "nemesis:scan-active-tab",
  /** Worker asks the injected scanner for a reading. */
  READ_PAGE: "nemesis:read-page",
  /** Anyone asks the worker what it is holding. */
  GET_STORED: "nemesis:get-stored",
  CLEAR_STORED: "nemesis:clear-stored",
} as const;

/** Where the worker keeps the last scan. */
export const STORAGE_KEY = "nemesis.scan.v1";
