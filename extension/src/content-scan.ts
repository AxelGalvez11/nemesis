// Injected into a school portal tab, on demand, to read it once.
//
// NOT a persistent content script. It is injected by the service worker with
// chrome.scripting only when the student presses "Scan this page", into the tab
// they are already looking at. That is why the manifest asks for no standing
// host permissions over the whole web: the extension has no ability to watch
// pages in the background, and cannot read a portal the student has not
// deliberately pointed it at.
//
// READ-ONLY. It reads the document and returns a value. It does not click,
// submit, navigate, store cookies, or modify anything on the page.

import { readFacts, readSnapshot } from "./lms/dom.ts";
import { detectLms, factsFromUrl } from "./lms/detect.ts";
import { isItemLink, parseSnapshot } from "./lms/parse.ts";
import type { LmsScan } from "./wire.ts";

function scanThisPage(): LmsScan {
  const empty: LmsScan = { courses: [], lms: "unknown", scannedAt: new Date().toISOString() };

  const { markers, url } = readFacts(document, window.location.href);
  const facts = factsFromUrl(url, markers);
  if (!facts) return empty;

  const lms = detectLms(facts);
  // A page we cannot place is not scanned at all. Better to tell the student
  // "this does not look like your school portal" than to hoover up a page we
  // do not understand.
  if (lms === "unknown") return empty;

  const snapshot = readSnapshot(document, url, (href) => isItemLink(href, lms));
  return { courses: parseSnapshot(snapshot, lms), lms, scannedAt: new Date().toISOString() };
}

// chrome.scripting.executeScript takes the last expression as the result, so
// this file evaluates to the scan.
scanThisPage();
