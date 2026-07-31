// The service worker: custodian of the last scan, and nothing else.
//
// Deliberately tiny. Scanning happens in the popup, because asking for
// permission to read a site MUST happen inside a real user gesture and a
// service worker does not have one — a request made from here is rejected by
// Chrome, which would look like a mysterious failure rather than a bug.
//
// So this file exists only so the bridge content script has somewhere to read
// the stored scan from. It holds one value: the student's most recent reading
// of their own portal, kept until they import it or clear it. No history, no
// second copy, and NO NETWORK CALLS ANYWHERE IN THIS FILE — the easiest kind of
// privacy claim to check is one where the code has no way to send anything.

import { RUNTIME_MESSAGES, STORAGE_KEY } from "./messages.ts";
import type { LmsScan } from "./wire.ts";

async function readStored(): Promise<LmsScan | null> {
  const bag = await chrome.storage.local.get(STORAGE_KEY);
  return (bag[STORAGE_KEY] as LmsScan | undefined) ?? null;
}

chrome.runtime.onMessage.addListener((message: { type?: string; scan?: unknown }, _sender, sendResponse) => {
  if (message?.type === RUNTIME_MESSAGES.SAVE_SCAN) {
    // Stored exactly as the scanner sent it. This worker deliberately does not
    // validate or reshape: the app sanitises everything on arrival, and a
    // second opinion here would only be a second thing to keep in step.
    void chrome.storage.local.set({ [STORAGE_KEY]: message.scan }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === RUNTIME_MESSAGES.GET_STORED) {
    void readStored().then(sendResponse);
    return true; // keeps the channel open for the async reply
  }
  if (message?.type === RUNTIME_MESSAGES.CLEAR_STORED) {
    void chrome.storage.local.remove(STORAGE_KEY).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
