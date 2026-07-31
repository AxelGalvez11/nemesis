// The popup: one button, and an honest account of what it found.
//
// Scanning lives here rather than in the service worker because
// chrome.permissions.request() only works inside a real user gesture. The
// student's click on "Read this page" IS that gesture, so the permission
// prompt — naming the exact site — appears as a direct result of them asking
// for it, which is also the only time it makes any sense to them.

import { detectLms, factsFromUrl } from "../lms/detect.ts";
import { RUNTIME_MESSAGES, STORAGE_KEY } from "../messages.ts";
import type { LmsKind, LmsScan } from "../wire.ts";

const LABELS: Record<LmsKind, string> = {
  blackboard: "Blackboard",
  brightspace: "D2L Brightspace",
  canvas: "Canvas",
  moodle: "Moodle",
  unknown: "your school portal",
};

const APP_URL = "https://app.enternemesis.com/";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing #${id}`);
  return found as T;
}

function setStatus(text: string, tone: "idle" | "good" | "bad" = "idle"): void {
  const status = element("status");
  status.textContent = text;
  status.dataset.tone = tone;
}

function describe(scan: LmsScan): string {
  const items = scan.courses.reduce((total, course) => total + course.items.length, 0);
  const courseWord = scan.courses.length === 1 ? "course" : "courses";
  if (items === 0) return `Found ${scan.courses.length} ${courseWord}.`;
  const itemWord = items === 1 ? "item" : "items";
  return `Found ${scan.courses.length} ${courseWord} and ${items} ${itemWord} of coursework.`;
}

function renderCourses(scan: LmsScan | null): void {
  const list = element("courses");
  list.replaceChildren();
  if (!scan) return;
  for (const course of scan.courses) {
    const row = document.createElement("li");
    const name = document.createElement("span");
    // textContent, never innerHTML — this string came off someone else's web
    // page and must never be parsed as markup.
    name.textContent = course.name;
    name.className = "name";
    row.append(name);
    if (course.items.length > 0) {
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = String(course.items.length);
      row.append(count);
    }
    list.append(row);
  }
}

async function activeTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function scan(): Promise<void> {
  const button = element<HTMLButtonElement>("scan");
  button.disabled = true;
  setStatus("Reading this page…");

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

    let results: chrome.scripting.InjectionResult<unknown>[];
    try {
      results = await chrome.scripting.executeScript({
        files: ["dist/content-scan.js"],
        target: { allFrames: false, tabId: tab.id },
      });
    } catch {
      setStatus("Could not read this page. Try reloading it, then scan again.", "bad");
      return;
    }

    const found = results[0]?.result as LmsScan | undefined;
    if (!found || found.courses.length === 0) {
      setStatus(`No courses found on this ${LABELS[lms]} page. Try your dashboard or course list.`, "bad");
      return;
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: found });
    setStatus(describe(found), "good");
    renderCourses(found);
    element("next").hidden = false;
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
    return;
  }
  setStatus(`${describe(stored)} Ready to bring into Nemesis.`, "good");
  renderCourses(stored);
  element("next").hidden = false;
}

element("scan").addEventListener("click", () => void scan());
element("next").addEventListener("click", () => {
  void chrome.tabs.create({ url: APP_URL });
});
element("clear").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: RUNTIME_MESSAGES.CLEAR_STORED }, () => {
    void chrome.runtime.lastError;
    renderCourses(null);
    element("next").hidden = true;
    setStatus("Cleared. Nothing is stored.");
  });
});

void restore();
