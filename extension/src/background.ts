// The service worker: custodian of the last scan, and driver of the two jobs
// that need more than one tab.
//
// It was deliberately tiny once, and the reason still holds for SCANNING:
// asking permission to read a site must happen inside a real user gesture, and
// a worker does not have one. Permission is still requested in the popup, and
// nothing here ever asks for it.
//
// What lives here now are the two things that CANNOT live in a single tab:
//
//   - THE SWEEP. Reading nine courses means being on nine pages. A content
//     script can only be on one, and a Blackboard Ultra course cannot be
//     fetched — its folders are buttons, so the page has to be driven live. So
//     the worker opens each course in a background tab, injects the reader,
//     waits for its answer, and closes it.
//   - FETCHING A FILE. The bytes can only be read from a tab on the portal's
//     own origin, where the student's session applies. The worker owns that
//     tab so the Nemesis page can ask for a file without knowing any of this.
//
// 🔴 STILL NO NETWORK CALLS IN THIS FILE. Every fetch happens in a content
// script, against the student's own portal, with their own session. Nothing is
// sent anywhere: the Nemesis page pulls what it wants over postMessage and
// writes it with its own login. That is the privacy claim, and it is checkable
// by grepping this file for `fetch`.

import {
  FETCH_KEY,
  type FetchRequest,
  RUNTIME_MESSAGES,
  STORAGE_KEY,
  SWEEP_KEY,
  type SweepState,
} from "./messages.ts";
import type { LmsScan, ScrapedDocument } from "./wire.ts";

async function readStored(): Promise<LmsScan | null> {
  const bag = await chrome.storage.local.get(STORAGE_KEY);
  return (bag[STORAGE_KEY] as LmsScan | undefined) ?? null;
}

// ── Waiting, without a clock we control ──────────────────────────────────────

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolve when a tab reports itself loaded, or when the budget runs out.
 *  `status` arrives on onUpdated without the "tabs" permission; the URL does
 *  not, and is not needed — the worker chose the address. */
function waitForTabLoad(tabId: number, budgetMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve(ok);
    };
    const onUpdated = (id: number, change: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && change.status === "complete") finish(true);
    };
    const timer = setTimeout(() => finish(false), budgetMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    // Already finished before we started listening.
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") finish(true);
    }).catch(() => finish(false));
  });
}

/**
 * Wait for one message from a specific tab, matched on type.
 *
 * Keyed on the SENDER'S TAB, not on a request id: two courses are never read at
 * once (the sweep is strictly sequential, both to be polite to the school's
 * server and because a dozen simultaneous Ultra tabs is a lot of laptop), so
 * the tab is a sufficient and much simpler correlation.
 */
function waitForMessage<T>(type: string, tabId: number, budgetMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      chrome.runtime.onMessage.removeListener(listener);
      clearTimeout(timer);
      resolve(value);
    };
    const listener = (message: { type?: string }, sender: chrome.runtime.MessageSender) => {
      if (message?.type === type && sender.tab?.id === tabId) finish(message as T);
      return false;
    };
    const timer = setTimeout(() => finish(null), budgetMs);
    chrome.runtime.onMessage.addListener(listener);
  });
}

// ── The sweep ────────────────────────────────────────────────────────────────

/** One course may take this long before the sweep gives up and moves on. A
 *  course that never renders must cost one course, never the whole reading. */
const COURSE_BUDGET_MS = 90_000;
/** A breath between courses. We are a guest on the school's server, and a burst
 *  of nine full course loads is exactly what looks like abuse. */
const BETWEEN_COURSES_MS = 800;

async function writeSweep(state: SweepState): Promise<void> {
  await chrome.storage.local.set({ [SWEEP_KEY]: state });
  try {
    // Best-effort: nobody may be listening, and that is fine — the popup reads
    // the stored state when it opens.
    chrome.runtime.sendMessage({ state, type: RUNTIME_MESSAGES.SWEEP_PROGRESS }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // No listener. The stored state is the source of truth.
  }
}

/** File the documents onto the course they belong to, in the stored scan. */
async function mergeDocuments(courseUrl: string, documents: ScrapedDocument[]): Promise<void> {
  const scan = await readStored();
  if (!scan) return;
  const courses = scan.courses.map((course) =>
    course.url === courseUrl ? { ...course, documents } : course,
  );
  await chrome.storage.local.set({ [STORAGE_KEY]: { ...scan, courses } });
}

/**
 * Read every course, one background tab at a time.
 *
 * 🔴 SEQUENTIAL ON PURPOSE, and it is slow — a course that takes thirty seconds
 * to render costs thirty seconds, so nine of them is minutes. That is the
 * honest price of a portal that only shows its contents to a real browser, and
 * the progress line says which course is being read so the wait is legible
 * rather than mysterious.
 */
async function sweep(courses: Array<{ name: string; url: string }>): Promise<void> {
  const state: SweepState = {
    current: "",
    documents: 0,
    done: 0,
    failed: [],
    running: true,
    total: courses.length,
  };
  await writeSweep(state);

  for (const course of courses) {
    state.current = course.name;
    await writeSweep(state);

    let tabId: number | undefined;
    try {
      const tab = await chrome.tabs.create({ active: false, url: course.url });
      tabId = tab.id;
      if (tabId === undefined) throw new Error("no tab");

      // The reader waits for Ultra to render on its own, so a load timeout here
      // is not fatal — inject anyway and let it decide.
      await waitForTabLoad(tabId, 30_000);
      await chrome.scripting.executeScript({
        files: ["dist/content-course.js"],
        target: { allFrames: false, tabId },
      });

      const result = await waitForMessage<{ documents?: ScrapedDocument[]; error?: string }>(
        RUNTIME_MESSAGES.COURSE_READ,
        tabId,
        COURSE_BUDGET_MS,
      );

      // 🔴 A COURSE THAT COULD NOT BE READ IS NAMED, NOT ROUNDED DOWN TO ZERO.
      // "Found nothing" and "never got in" are different facts, and only one of
      // them is the student's problem to act on.
      if (!result || result.error || !Array.isArray(result.documents)) {
        state.failed.push(course.name);
      } else {
        await mergeDocuments(course.url, result.documents);
        state.documents += result.documents.length;
      }
    } catch {
      state.failed.push(course.name);
    } finally {
      if (tabId !== undefined) {
        // Closing our own tab, always — a failed read must not leave nine
        // orphaned course pages in the student's window.
        await chrome.tabs.remove(tabId).catch(() => undefined);
      }
    }

    state.done += 1;
    await writeSweep(state);
    await sleep(BETWEEN_COURSES_MS);
  }

  state.current = "";
  state.running = false;
  await writeSweep(state);
}

// ── Fetching one file ────────────────────────────────────────────────────────

/**
 * A tab on the portal's origin that we may inject the fetcher into.
 *
 * Prefers one the STUDENT already has open, and in that case never closes it —
 * closing a tab somebody is using is the kind of thing an extension does once
 * before it is uninstalled. Only a tab this worker opened is this worker's to
 * close, which is what `owned` records.
 */
let fetchTab: { id: number; origin: string; owned: boolean } | null = null;

async function ensureFetchTab(origin: string): Promise<{ id: number; owned: boolean } | null> {
  if (fetchTab && fetchTab.origin === origin) {
    const alive = await chrome.tabs.get(fetchTab.id).catch(() => null);
    if (alive) return { id: fetchTab.id, owned: fetchTab.owned };
    fetchTab = null;
  }

  // The url filter here works on host permission alone — the portal's origin was
  // granted when the student pressed Scan.
  const open = await chrome.tabs.query({ url: `${origin}/*` }).catch(() => []);
  const existing = open.find((tab) => typeof tab.id === "number");
  if (existing?.id !== undefined) {
    fetchTab = { id: existing.id, origin, owned: false };
    return { id: existing.id, owned: false };
  }

  const created = await chrome.tabs.create({ active: false, url: `${origin}/` }).catch(() => null);
  if (created?.id === undefined) return null;
  await waitForTabLoad(created.id, 30_000);
  fetchTab = { id: created.id, origin, owned: true };
  return { id: created.id, owned: true };
}

interface FileReply {
  url: string;
  name?: string;
  mime?: string;
  base64?: string;
  error?: string;
}

async function fetchFile(url: string): Promise<FileReply> {
  let origin: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { error: "bad-url", url };
    origin = parsed.origin;
  } catch {
    return { error: "bad-url", url };
  }

  const tab = await ensureFetchTab(origin);
  if (!tab) return { error: "no-tab", url };

  const request: FetchRequest = { origin, url };
  await chrome.storage.local.set({ [FETCH_KEY]: request });
  try {
    await chrome.scripting.executeScript({
      files: ["dist/content-fetch.js"],
      target: { allFrames: false, tabId: tab.id },
    });
  } catch {
    // Almost always "no permission for this origin" — the student granted it
    // for the scan, but a document can legitimately live on a different host
    // (a CDN, a library proxy) that was never granted.
    await chrome.storage.local.remove(FETCH_KEY);
    return { error: "no-permission", url };
  }

  const reply = await waitForMessage<FileReply>(RUNTIME_MESSAGES.FILE_BYTES, tab.id, 70_000);
  return reply ?? { error: "timeout", url };
}

// ── The one listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: { type?: string; scan?: unknown; courses?: unknown; url?: unknown }, _sender, sendResponse) => {
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
  if (message?.type === RUNTIME_MESSAGES.GET_SWEEP) {
    void chrome.storage.local.get(SWEEP_KEY).then((bag) => sendResponse(bag[SWEEP_KEY] ?? null));
    return true;
  }
  if (message?.type === RUNTIME_MESSAGES.SWEEP_COURSES) {
    const courses = Array.isArray(message.courses)
      ? (message.courses as Array<{ name?: unknown; url?: unknown }>)
          .filter((course) => typeof course?.url === "string" && typeof course?.name === "string")
          .map((course) => ({ name: String(course.name), url: String(course.url) }))
      : [];
    // Answered immediately; the sweep runs on. The popup follows it through
    // SWEEP_PROGRESS and the stored state, because it will very likely be
    // closed long before this finishes.
    sendResponse({ started: courses.length });
    void sweep(courses);
    return true;
  }
  if (message?.type === RUNTIME_MESSAGES.FETCH_FILE && typeof message.url === "string") {
    // Requests only. The fetcher's REPLY carries a url too, but it comes back
    // under FILE_BYTES precisely so it cannot land here and start another
    // fetch — see the note on that name in messages.ts.
    void fetchFile(message.url).then(sendResponse);
    return true;
  }
  return false;
});
