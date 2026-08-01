// The only thing the Nemesis web app can talk to.
//
// Runs on app.enternemesis.com (and localhost during development), and does
// exactly three things: say whether the extension exists, hand over the last
// scan, and throw the last scan away.
//
// WHY THE APP PULLS AND THE EXTENSION NEVER PUSHES. The obvious design has the
// extension POST the scan to our server, which means the extension needs
// credentials — a token to mint, store, refresh and leak. This way it needs
// none. The student is already signed in on the page; the page asks for the
// data and writes it with the session it already has. The extension holds no
// secrets, has no server to talk to, and if it were compromised tomorrow the
// worst it could do is hand a page some made-up coursework, which the app
// sanitises and the student reviews before anything is saved.
//
// 🔴 NOTHING ON THIS CHANNEL IS TRUSTED IN EITHER DIRECTION. Any script on the
// page can post these messages, and the page is not a privileged caller. That
// is fine because the only verbs are "do you exist", "give me what you have"
// and "forget it" — none of which lets a caller reach anything it could not
// already reach. The reverse is enforced in the app, which sanitises every
// scan it receives no matter how legitimate the sender looked.

import { APP_MESSAGES, EXTENSION_MESSAGES, FROM_APP, FROM_EXTENSION, RUNTIME_MESSAGES } from "./messages.ts";

interface AppMessage {
  source?: unknown;
  type?: unknown;
  /** Echoed back so the page can match a reply to its request. */
  requestId?: unknown;
}

function reply(type: string, requestId: unknown, payload?: unknown): void {
  window.postMessage(
    { payload, requestId: typeof requestId === "string" ? requestId : null, source: FROM_EXTENSION, type },
    // Targeted at this page's own origin. "*" would broadcast a student's
    // coursework to any embedding frame.
    window.location.origin,
  );
}

window.addEventListener("message", (event: MessageEvent) => {
  // Only messages this page sent to itself. Anything from a frame or another
  // origin is ignored outright.
  if (event.source !== window || event.origin !== window.location.origin) return;

  const data = event.data as AppMessage | null;
  if (!data || typeof data !== "object" || data.source !== FROM_APP) return;
  const { requestId, type } = data;

  if (type === APP_MESSAGES.PING) {
    reply(EXTENSION_MESSAGES.PONG, requestId, { version: chrome.runtime.getManifest().version });
    return;
  }

  if (type === APP_MESSAGES.REQUEST_SCAN) {
    chrome.runtime.sendMessage({ type: RUNTIME_MESSAGES.GET_STORED }, (stored: unknown) => {
      // A dead service worker leaves lastError set; replying with null keeps
      // the page's promise from hanging forever on a silent failure.
      if (chrome.runtime.lastError) reply(EXTENSION_MESSAGES.SCAN, requestId, null);
      else reply(EXTENSION_MESSAGES.SCAN, requestId, stored ?? null);
    });
    return;
  }

  if (type === APP_MESSAGES.CLEAR_SCAN) {
    chrome.runtime.sendMessage({ type: RUNTIME_MESSAGES.CLEAR_STORED }, () => {
      void chrome.runtime.lastError;
      reply(EXTENSION_MESSAGES.CLEARED, requestId, null);
    });
  }
});
