// The toolbar panel: where you are, what it can see, and one button.
//
// WHY IT DOES NOT CARRY THE RESULT. A toolbar popup closes the instant the
// student clicks the page, and on a slow portal they will, because reading
// takes the better part of a minute. So the live reading lives on the card at
// the bottom right of the portal, which survives clicks and this panel closing.
// What lives HERE is the state of the flow: what page you are on, what is
// already in hand, and the next thing to press.
//
// This panel also has to exist for a mechanical reason:
// chrome.permissions.request() only works inside a genuine user gesture. The
// student's press below IS that gesture, and it is the only moment a prompt
// naming their school's domain makes sense to them.
//
// IT SAYS WHAT IT SEES BEFORE YOU PRESS. Opening the popup is itself the
// gesture that lets Chrome show us the current tab's address, so making a
// student press a button to learn whether the page is even a portal was
// pointless. Detection runs on open: "Blackboard detected".
//
// AND WHEN IT CANNOT TELL, IT ASKS. Detection reads the URL's shape, which is
// what makes it work on any school's own domain without knowing the school
// exists. It cannot cover a portal behind a campus front door or an unusual
// reverse proxy, and there a dead end is a bad answer — so four tiles appear
// and the student's own answer beats anything we infer.

import { detectLms, factsFromUrl } from "../lms/detect.ts";
import { groupByTerm } from "../lms/term.ts";
import { type LmsOverride, OVERRIDE_KEY, RUNTIME_MESSAGES, type SweepState } from "../messages.ts";
import type { LmsKind, LmsScan, ScrapedCourse } from "../wire.ts";

const LABELS: Record<LmsKind, string> = {
  blackboard: "Blackboard",
  brightspace: "D2L Brightspace",
  canvas: "Canvas",
  moodle: "Moodle",
  unknown: "your school portal",
};


/** What the panel believes it is looking at. Set on open, and again if the
 *  student overrules it with a tile. */
let current: { lms: LmsKind; origin: string; tabId: number } | null = null;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing #${id}`);
  return found as T;
}

/** Which of Open / Read / Bring in is done, current, or still ahead. */
function setStages(at: "open" | "read" | "bring"): void {
  const order = ["open", "read", "bring"] as const;
  const reached = order.indexOf(at);
  order.forEach((name, index) => {
    const node = element(`stage-${name}`);
    if (index < reached) node.dataset.state = "done";
    else if (index === reached) node.dataset.state = "now";
    else delete node.dataset.state;
  });
}

function setDetected(lms: LmsKind): void {
  const pill = element("detected");
  const text = element("detected-text");
  if (lms === "unknown") {
    pill.dataset.tone = "none";
    text.textContent = "No portal";
    return;
  }
  delete pill.dataset.tone;
  // The owner's words: it should say "Blackboard detected".
  text.textContent = `${LABELS[lms]} detected`;
}

function setStatus(text: string, meta?: string): void {
  element("status").textContent = text;
  const metaNode = element("meta");
  metaNode.hidden = !meta;
  metaNode.textContent = meta ?? "";
}

function setTile(id: string, value: number): void {
  const tile = element(id);
  const strong = tile.querySelector("b");
  if (strong) strong.textContent = String(value);
  tile.dataset.empty = String(value === 0);
}

/** "Scanned today, 6:15 PM · Blackboard". Falls back to just the portal name
 *  when the stamp is unreadable — a wrong time is worse than none. */
function describeScan(scan: LmsScan): string {
  const portal = LABELS[scan.lms] ?? "your school portal";
  const when = new Date(scan.scannedAt);
  if (Number.isNaN(when.getTime())) return portal;
  const today = new Date();
  const sameDay =
    when.getFullYear() === today.getFullYear() &&
    when.getMonth() === today.getMonth() &&
    when.getDate() === today.getDate();
  const time = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const day = sameDay ? "today" : when.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `Scanned ${day}, ${time} · ${portal}`;
}

async function activeTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

/**
 * Say what we are looking at.
 *
 * Owner 2026-08-01: "it should not ask user for school website type, it should
 * detect it automatically." There used to be a four-way picker here for when
 * detection came up empty. It is gone — a student should not be asked to name
 * the software their school bought. Detection reads the URL's shape, which is
 * what lets this work on any institution's own domain.
 *
 * When we genuinely cannot tell, the honest move is to say so and leave Scan
 * disabled, not to hand the problem back as a quiz.
 */
function reflectPage(lms: LmsKind): void {
  setDetected(lms);
  const scanButton = element<HTMLButtonElement>("scan");
  if (lms === "unknown") {
    setStatus("This does not look like a school portal.", "Open the page that lists your courses.");
    scanButton.disabled = true;
    setStages("open");
    return;
  }
  scanButton.disabled = false;
  setStatus("Ready when you are.", "Open the page that lists your courses.");
  setStages("read");
}

async function scan(): Promise<void> {
  const button = element<HTMLButtonElement>("scan");
  button.disabled = true;

  try {
    const tab = await activeTab();
    if (!tab?.id || !tab.url) {
      setStatus("No page to read.");
      return;
    }

    // Narrowed to a local first: `current?.tabId === tab.id` reads as a guard
    // but does not narrow `current`.
    const seen = current;
    const lms: LmsKind = seen && seen.tabId === tab.id ? seen.lms : "unknown";
    if (lms === "unknown") {
      setStatus("This does not look like a school portal.", "Open the page that lists your courses.");
      return;
    }

    const origin = new URL(tab.url).origin;
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] }).catch(() => false);
    if (!granted) {
      setStatus("Nemesis needs your permission to read this page.");
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
      setStatus("Could not read this page.", "Try reloading it, then read again.");
      return;
    }

    // 🔴 NOTHING IS AWAITED HERE, deliberately. executeScript's return value is
    // not the scan — the bundle is an IIFE, so what comes back is undefined —
    // and waiting on it kept this panel alive pretending to work. The scanner
    // reports on the page and hands its result to the worker itself.
    setStages("read");
    setStatus(`Reading your ${LABELS[lms]}.`, "Watch the card at the bottom right — you can close this.");
  } finally {
    button.disabled = false;
  }
}

// ── Which courses to read ────────────────────────────────────────────────────
//
// 🔴 THE DEFAULT IS THIS TERM, NOT EVERYTHING. A student partway through a
// degree has every course they have ever enrolled in sitting in the portal's
// list — measured on a real account, 31 entries across two pages, a mix of
// open, closed and future-locked. Reading all of them means opening 31 pages
// and waiting for each to render, to bury this semester's four courses under
// twenty-seven finished ones.
//
// So the newest term is ticked and the rest are offered. Nothing is HIDDEN —
// an old course a student wants is one click away, and a filter that silently
// drops courses is the same failure as a scan that silently finds none.

/** Courses that can actually be opened. A course with no address cannot be
 *  swept, and offering it as a tickbox that does nothing is a lie. */
let readable: ScrapedCourse[] = [];
let picked = new Set<string>();

function renderPicker(): void {
  const list = element("course-list");
  list.textContent = "";
  const groups = groupByTerm(readable);

  for (const group of groups) {
    const heading = document.createElement("p");
    heading.className = "term";
    // The portal's own words where it wrote any; our own only for the absence.
    heading.textContent = group.term ?? "No term";
    list.append(heading);

    for (const course of group.courses) {
      const row = document.createElement("label");
      row.className = "course";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = picked.has(course.name);
      box.addEventListener("change", () => {
        if (box.checked) picked.add(course.name);
        else picked.delete(course.name);
        reflectSweepButton();
      });
      const text = document.createElement("span");
      text.textContent = course.name;
      if (course.code) {
        const code = document.createElement("small");
        code.textContent = course.code;
        text.append(code);
      }
      row.append(box, text);
      list.append(row);
    }
  }

  element("picker").hidden = readable.length === 0;
  reflectSweepButton();
}

function reflectSweepButton(): void {
  const button = element<HTMLButtonElement>("sweep");
  button.hidden = readable.length === 0;
  button.disabled = picked.size === 0;
  button.textContent = picked.size === 1 ? "Read 1 course" : `Read ${picked.size} courses`;
}

/** Tick the newest term, or everything when no course names a term at all —
 *  in which case there is no grouping to lean on and "all" is the only honest
 *  default. */
function preselectNewestTerm(): void {
  const groups = groupByTerm(readable);
  const newest = groups.find((group) => group.term !== null) ?? groups[0];
  picked = new Set((newest?.courses ?? readable).map((course) => course.name));
}

/**
 * 🔴 ONLY BLACKBOARD ULTRA COURSES CAN BE SWEPT, and offering the sweep
 * anywhere else is a button that reports nothing but failures.
 *
 * The sweep exists because an Ultra course cannot be FETCHED — its folders are
 * buttons, so the page has to be driven live in a real tab. Every other portal
 * is walked by the ordinary link crawl during the scan itself, and already has
 * its documents by the time this panel opens.
 *
 * Without this filter, a Canvas student ticking seven courses and pressing
 * "Read 7 courses" gets seven background tabs, seven injected readers, and
 * seven refusals — content-course.ts checks the route first and reports
 * "not-a-course-page" for /courses/16160. The panel would then say "0 documents
 * found. 7 could not be opened", which is both useless and untrue: those
 * courses were read perfectly well already.
 */
const ULTRA_OUTLINE = /\/ultra\/courses\/[^/]+\/outline/;

function showPicker(scan: LmsScan): void {
  readable = scan.courses.filter((course) => typeof course.url === "string" && ULTRA_OUTLINE.test(course.url));
  preselectNewestTerm();
  renderPicker();
}

async function startSweep(): Promise<void> {
  const courses = readable
    .filter((course) => picked.has(course.name))
    .map((course) => ({ name: course.name, url: course.url as string }));
  if (courses.length === 0) return;
  element<HTMLButtonElement>("sweep").disabled = true;
  setStatus(
    `Reading ${courses.length === 1 ? "1 course" : `${courses.length} courses`}.`,
    "Each one opens in a background tab. You can close this.",
  );
  try {
    await chrome.runtime.sendMessage({ courses, type: RUNTIME_MESSAGES.SWEEP_COURSES });
  } catch {
    setStatus("Could not start reading.", "Try reloading the portal tab.");
    reflectSweepButton();
  }
}

/** The sweep's own progress line. Says which course, because a five-minute wait
 *  with no name on it is indistinguishable from a hang. */
function showSweep(state: SweepState): void {
  if (state.running) {
    setStatus(
      `Reading ${state.current || "your courses"} (${state.done + 1} of ${state.total}).`,
      `${state.documents} documents so far. You can close this.`,
    );
    element<HTMLButtonElement>("sweep").disabled = true;
    return;
  }
  if (state.total === 0) return;
  // FINISHED. Courses that could not be read are NAMED — "found nothing" and
  // "never got in" are different news and the student can act on only one.
  const failed = state.failed.length > 0 ? ` ${state.failed.length} could not be opened: ${state.failed.join(", ")}.` : "";
  setStatus(`Read ${state.total === 1 ? "1 course" : `${state.total} courses`}.`, `${state.documents} documents found.${failed}`);
  reflectSweepButton();
  void refreshTiles();
}

/** Re-read what the worker holds, so the counts match the sweep that just
 *  finished rather than the scan that started it. */
async function refreshTiles(): Promise<void> {
  const stored = await new Promise<LmsScan | null>((resolve) => {
    chrome.runtime.sendMessage({ type: RUNTIME_MESSAGES.GET_STORED }, (value: unknown) => {
      void chrome.runtime.lastError;
      resolve((value as LmsScan | null) ?? null);
    });
  });
  if (stored) showStored(stored);
}

function showStored(scan: LmsScan): void {
  const items = scan.courses.reduce((total, course) => total + course.items.length, 0);
  // `documents` is optional on the wire: absent means the course was never
  // walked into, which is not the same as walked and empty.
  const docs = scan.courses.reduce((total, course) => total + (course.documents?.length ?? 0), 0);
  element("tiles").hidden = false;
  setTile("tile-courses", scan.courses.length);
  setTile("tile-items", items);
  setTile("tile-docs", docs);
  setStatus("Ready to bring in.", describeScan(scan));
  setStages("bring");
  showPicker(scan);

}

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
    reflectPage(lms);
  } else {
    reflectPage("unknown");
  }

  const stored = await new Promise<LmsScan | null>((resolve) => {
    chrome.runtime.sendMessage({ type: RUNTIME_MESSAGES.GET_STORED }, (value: unknown) => {
      void chrome.runtime.lastError;
      resolve((value as LmsScan | null) ?? null);
    });
  });
  // A reading in hand outranks whatever page happens to be open: the student
  // most likely came back to finish it, not to scan something else.
  if (stored && stored.courses.length > 0) showStored(stored);
}

// One control. "Bring into Nemesis" and "Clear what is stored" are gone
// (owner 2026-08-01): the card on the page carries the way into the app, and
// the reading is replaced by the next scan rather than needing to be swept up
// by hand. CLEAR_STORED still exists on the worker — nothing that writes to a
// student's browser should lose its off switch just because a button moved.
element("scan").addEventListener("click", () => void scan());
element("sweep").addEventListener("click", () => void startSweep());
element("pick-all").addEventListener("click", () => {
  // "All" means all, including the old terms — a student who wants three years
  // of material is allowed to have it, they just should not get it by default.
  const everything = readable.length > 0 && picked.size < readable.length;
  picked = new Set(everything ? readable.map((course) => course.name) : []);
  renderPicker();
});

// The sweep outlives this panel, so its progress arrives whether or not anyone
// is looking. Both paths matter: the message updates a popup that happens to be
// open, and restore() reads the stored state for one that was just opened.
chrome.runtime.onMessage.addListener((message: { type?: string; state?: SweepState }) => {
  if (message?.type === RUNTIME_MESSAGES.SWEEP_PROGRESS && message.state) showSweep(message.state);
  return false;
});

void restore();
