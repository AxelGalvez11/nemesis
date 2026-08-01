// The toolbar panel: says what it can see, and starts the read.
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
//
// IT SAYS WHAT IT SEES, BEFORE YOU PRESS (owner 2026-07-31). Opening the popup
// is itself the gesture that lets Chrome show us the current tab's address, so
// there is no reason to make a student press a button to find out whether this
// page is even a portal. Detection runs on open and the panel says so.
//
// AND WHEN IT CANNOT TELL, IT ASKS. Detection reads the URL's shape, which is
// what makes it work on any school's own domain without us knowing the school
// exists. It cannot cover a portal behind a campus front door or an unusual
// reverse proxy, and for those a dead end is a bad answer — so the student gets
// four tiles and can say which portal it is.

import { detectLms, factsFromUrl } from "../lms/detect.ts";
import { type LmsOverride, OVERRIDE_KEY, RUNTIME_MESSAGES } from "../messages.ts";
import type { LmsKind, LmsScan } from "../wire.ts";

const LABELS: Record<LmsKind, string> = {
  blackboard: "Blackboard",
  brightspace: "D2L Brightspace",
  canvas: "Canvas",
  moodle: "Moodle",
  unknown: "your school portal",
};

const APP_URL = "https://app.enternemesis.com/library?import=coursework";

/** What the panel currently believes it is looking at. Set on open, and again
 *  if the student overrules it with a tile. */
let current: { lms: LmsKind; origin: string; tabId: number } | null = null;

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

/** Reflect a choice in the tiles so the student can see it stuck. */
function markChosen(lms: LmsKind): void {
  for (const tile of Array.from(element("picker").querySelectorAll<HTMLButtonElement>("button[data-lms]"))) {
    tile.setAttribute("aria-pressed", String(tile.dataset.lms === lms));
  }
}

/** Say what we are looking at, and offer the tiles only when we cannot tell. */
function reflect(lms: LmsKind): void {
  const scanButton = element<HTMLButtonElement>("scan");
  if (lms === "unknown") {
    setStatus("This does not look like a school portal.", "bad");
    element("picker").hidden = false;
    // NOT disabled: the tiles below are the way forward, and a dead button with
    // no explanation is what this whole change exists to remove.
    scanButton.disabled = true;
    return;
  }
  element("picker").hidden = true;
  setStatus(`This looks like ${LABELS[lms]}. Open your course list, then read this page.`);
  scanButton.disabled = false;
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

    // Narrowed to a local first: `current?.tabId === tab.id` reads as a guard
    // but does not narrow `current`, and the version that leans on it only
    // works by accident.
    const seen = current;
    const lms: LmsKind = seen && seen.tabId === tab.id ? seen.lms : "unknown";
    if (lms === "unknown") {
      setStatus("Tell me which portal this is and I will read it.", "bad");
      element("picker").hidden = false;
      return;
    }

    const origin = new URL(tab.url).origin;
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] }).catch(() => false);
    if (!granted) {
      setStatus("Nemesis needs your permission to read this page.", "bad");
      return;
    }

    // Left for the scanner to pick up on the way in, stamped with the origin it
    // was chosen for so it can never be applied to a different site.
    const override: LmsOverride = { lms, origin };
    await chrome.storage.local.set({ [OVERRIDE_KEY]: override });

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

/** What is on screen right now, and what we are already holding. */
async function restore(): Promise<void> {
  const tab = await activeTab();
  if (tab?.id && tab.url) {
    const facts = factsFromUrl(tab.url);
    const lms = facts ? detectLms(facts) : "unknown";
    try {
      current = { lms, origin: new URL(tab.url).origin, tabId: tab.id };
    } catch {
      current = null;
    }
    reflect(lms);
  } else {
    reflect("unknown");
  }

  const stored = await new Promise<LmsScan | null>((resolve) => {
    chrome.runtime.sendMessage({ type: RUNTIME_MESSAGES.GET_STORED }, (value: unknown) => {
      void chrome.runtime.lastError;
      resolve((value as LmsScan | null) ?? null);
    });
  });
  if (!stored || stored.courses.length === 0) {
    showStoredControls(false);
    return;
  }
  // A reading in hand outranks whatever page happens to be open: the student
  // most likely came back here to finish it, not to scan something else.
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

for (const tile of element("picker").querySelectorAll<HTMLButtonElement>("button[data-lms]")) {
  tile.addEventListener("click", () => {
    const lms = tile.dataset.lms as LmsKind | undefined;
    if (!lms || !current) return;
    current = { ...current, lms };
    markChosen(lms);
    element<HTMLButtonElement>("scan").disabled = false;
    setStatus(`Reading it as ${LABELS[lms]}. Open your course list, then read this page.`);
  });
}

void restore();
