// The toolbar panel: one button, and a pointer at where the real answer is.
//
// WHY IT IS THIS SMALL (owner 2026-07-31). It used to carry the whole result —
// status, course list, counts — and that was the wrong home for all of it. A
// toolbar popup closes the instant the student clicks the page, and on a slow
// portal they will, because reading takes the better part of a minute. So a
// student who pressed the button, looked at their courses rendering, and then
// reopened this got a panel that had started over. Everything about a reading
// now lives on the card at the bottom right of the portal, which survives
// clicks, scrolling and this panel closing.
//
// This still exists for one real reason: chrome.permissions.request() only
// works inside a genuine user gesture. The student's press below IS that
// gesture, which is also the only moment a permission prompt naming their
// school's domain makes any sense to them.

import { detectLms, factsFromUrl } from "../lms/detect.ts";
import { RUNTIME_MESSAGES } from "../messages.ts";
import type { LmsKind, LmsScan } from "../wire.ts";

const LABELS: Record<LmsKind, string> = {
  blackboard: "Blackboard",
  brightspace: "D2L Brightspace",
  canvas: "Canvas",
  moodle: "Moodle",
  unknown: "your school portal",
};

const APP_URL = "https://app.enternemesis.com/library?import=coursework";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing #${id}`);
  return found as T;
}

function setStatus(text: string, tone: "idle" | "bad" = "idle"): void {
  const status = element("status");
  status.textContent = text;
  status.dataset.tone = tone;
}

/** Whether the stored-reading controls are offered. */
function showStoredControls(visible: boolean): void {
  element("next").hidden = !visible;
  element("clear").hidden = !visible;
}

function describe(scan: LmsScan): string {
  const items = scan.courses.reduce((total, course) => total + course.items.length, 0);
  const courseWord = scan.courses.length === 1 ? "course" : "courses";
  if (items === 0) return `${scan.courses.length} ${courseWord} ready to bring in.`;
  return `${scan.courses.length} ${courseWord} and ${items} ${items === 1 ? "item" : "items"} ready to bring in.`;
}

async function activeTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function scan(): Promise<void> {
  const button = element<HTMLButtonElement>("scan");
  button.disabled = true;

  try {
    const tab = await activeTab();
    if (!tab?.id || !tab.url) {
      setStatus("No page to read.", "bad");
      return;
    }

    const facts = factsFromUrl(tab.url);
    const lms = facts ? detectLms(facts) : "unknown";
    if (lms === "unknown") {
      setStatus("This does not look like a school portal. Open your course list and try again.", "bad");
      return;
    }

    const origin = `${new URL(tab.url).origin}/*`;
    const granted = await chrome.permissions.request({ origins: [origin] }).catch(() => false);
    if (!granted) {
      setStatus("Nemesis needs your permission to read this page.", "bad");
      return;
    }

    try {
      await chrome.scripting.executeScript({
        files: ["dist/content-scan.js"],
        target: { allFrames: false, tabId: tab.id },
      });
    } catch {
      setStatus("Could not read this page. Try reloading it, then read again.", "bad");
      return;
    }

    // 🔴 NOTHING IS AWAITED HERE, deliberately. executeScript's return value is
    // not the scan — the bundle is an IIFE, so what comes back is undefined —
    // and waiting on it kept this panel alive pretending to work. The scanner
    // reports on the page and hands its result to the worker itself. All this
    // has to do is point at the card and get out of the way.
    setStatus(`Reading your ${LABELS[lms]}. Watch the card at the bottom right of the page — you can close this.`);
  } finally {
    button.disabled = false;
  }
}

async function restore(): Promise<void> {
  const stored = await new Promise<LmsScan | null>((resolve) => {
    chrome.runtime.sendMessage({ type: RUNTIME_MESSAGES.GET_STORED }, (value: unknown) => {
      void chrome.runtime.lastError;
      resolve((value as LmsScan | null) ?? null);
    });
  });
  if (!stored || stored.courses.length === 0) {
    setStatus("Open your school portal, then read this page.");
    showStoredControls(false);
    return;
  }
  setStatus(describe(stored));
  showStoredControls(true);
}

element("scan").addEventListener("click", () => void scan());
element("next").addEventListener("click", () => {
  void chrome.tabs.create({ url: APP_URL });
});
element("clear").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: RUNTIME_MESSAGES.CLEAR_STORED }, () => {
    void chrome.runtime.lastError;
    showStoredControls(false);
    setStatus("Cleared. Nothing is stored.");
  });
});

void restore();
