// Reading ONE Blackboard Ultra course, in a live tab.
//
// Lifted out of content-scan.ts unchanged in behaviour, because there are now
// TWO entry points that need it and a second copy would drift:
//
//   - content-scan.ts, when the student scans a course page they are looking at
//   - content-course.ts, when the sweep opens each of their courses in turn
//
// Everything here touches a real DOM, so it lives beside dom.ts rather than
// with the pure modules. The stopping rules it drives are in ultra.ts and are
// tested with no browser at all.

import {
  ULTRA_DOCUMENT_SELECTOR,
  ULTRA_EXPANDER_SELECTOR,
  ULTRA_LOAD_MORE_SELECTOR,
  ULTRA_ROW_CLASS,
  isUltraToolLaunch,
  revealWholeOutline,
  ultraDocumentTitle,
  ultraFileTypeFromTitle,
  ultraFolderName,
  ultraFolderPath,
} from "./ultra.ts";
import type { ScrapedDocument } from "../wire.ts";

// ── 🔴 THE CLOCK STOPS IN A BACKGROUND TAB. THE PAGE DOES NOT. ───────────────
//
// See the measurements at the top of ultra.ts. In a tab that is open but not
// frontmost, Chrome throttles timers to roughly one wake per minute: a
// `setTimeout(…, 50)` on the owner's live course fired 147 SECONDS later.
// MutationObserver, meanwhile, fired at 82ms — the page is entirely awake.
//
// This matters far more now than when it was first found. The sweep reads every
// course in a tab that is DELIBERATELY not frontmost, so the throttled path is
// no longer the unlucky case a distracted student stumbles into — it is the
// normal one, every time.
//
// So: wait for the page to DO something, not for the clock to move.

/** Long enough for a slow campus network to answer one click. */
const WAIT_BUDGET_MS = 6_000;

/**
 * Resolve as soon as `predicate` holds — true if it did, false if the budget
 * ran out first.
 *
 * MutationObserver is the engine, because it is not throttled. The timer is
 * only a backstop for the case where the thing never happens: it fires late in
 * a hidden tab, but late is survivable and never is not.
 */
export function waitUntil(predicate: () => boolean, budgetMs: number = WAIT_BUDGET_MS): Promise<boolean> {
  if (predicate()) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let backstop = 0;
    const observer = new MutationObserver(() => {
      if (predicate()) finish(true);
    });
    function finish(ok: boolean): void {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(backstop);
      resolve(ok);
    }
    // `aria-expanded` is watched by name because a folder opening is an
    // ATTRIBUTE flip on a button, not a new node — without it the one signal
    // that says "the click actually took" would be invisible here.
    observer.observe(document.documentElement, {
      attributeFilter: ["aria-expanded"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    backstop = window.setTimeout(() => finish(predicate()), budgetMs);
  });
}

/**
 * Wait for the page to change at all. False means it went quiet.
 *
 * Used where the thing being waited for has no single test — "has this portal
 * finished drawing its course list" — so the honest signal is simply whether it
 * is still doing anything.
 */
export function waitForChange(budgetMs: number): Promise<boolean> {
  let changed = false;
  const observer = new MutationObserver(() => { changed = true; });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return waitUntil(() => changed, budgetMs).finally(() => observer.disconnect());
}

export interface UltraReadResult {
  documents: ScrapedDocument[];
  truncated: boolean;
}

/**
 * Read an Ultra course by driving its page, because there is nothing to fetch.
 *
 * Runs the measured stages in the only order that works: open what is visible
 * and ask every open list for more, INTERLEAVED (each folder paginates its own
 * children, so a paging pass that runs first finds nothing to click), then
 * harvest, reading folder paths from indent because the list is flat.
 */
export async function readUltraCourse(
  onProgress: (documents: number, note: string) => void,
): Promise<UltraReadResult> {
  const rowCount = () => document.querySelectorAll(`div.${ULTRA_ROW_CLASS}`).length;

  const revealed = await revealWholeOutline({
    collapsed: () => Array.from(document.querySelectorAll<HTMLElement>(ULTRA_EXPANDER_SELECTOR)).map((element) => {
      // Held by ID, not by node. Ultra rebuilds the outline as each folder
      // opens, so the element captured here can be detached by the time we
      // retry — and clicking a detached node does nothing, silently. Looking it
      // up again each time is what makes the retry mean anything.
      const id = element.id;
      const live = (): HTMLElement | null =>
        (id ? document.getElementById(id) : null) ?? (element.isConnected ? element : null);
      return {
        isOpen: () => live()?.getAttribute("aria-expanded") === "true",
        label: element.getAttribute("aria-label") ?? "",
        open: () => live()?.click(),
      };
    }),
    // Only the LIVE ones. An exhausted control is a real disabled button —
    // measured, all seven of them on a finished outline — so this is both the
    // stopping signal and the reason a whole course costs no idle waiting.
    loadMore: () => Array.from(document.querySelectorAll<HTMLButtonElement>(ULTRA_LOAD_MORE_SELECTOR))
      .filter((button) => !button.disabled)
      .map((button) => ({ click: () => button.click() })),
    onRound: (opened, rows) => onProgress(0, `Opening the course (${opened} folders, ${rows} items)`),
    rowCount,
    waitUntil,
  });

  // One pass over the finished list. Indent is the only nesting signal there
  // is, so every row is measured before any path is built.
  const rows = Array.from(document.querySelectorAll<HTMLElement>(`div.${ULTRA_ROW_CLASS}`)).map((row) => {
    const expander = row.querySelector<HTMLElement>(ULTRA_EXPANDER_SELECTOR)
      ?? row.querySelector<HTMLElement>('button[data-analytics-id$="toggleFolder.button"], button[data-analytics-id$="toggleLm.button"]');
    const link = row.querySelector<HTMLAnchorElement>(ULTRA_DOCUMENT_SELECTOR);
    return {
      folderName: expander ? ultraFolderName(expander.getAttribute("aria-label") ?? "") : undefined,
      indentPx: Math.round(row.getBoundingClientRect().left),
      link,
    };
  });

  const documents: ScrapedDocument[] = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    if (!row.link) return;
    const href = row.link.href;
    if (!href || seen.has(href)) return;
    // A row that launches a tool rather than opening a document. Its href is
    // Ultra's own script bundle with a "#" on the end — importing it gives the
    // student a library entry that can never open.
    if (isUltraToolLaunch(href, row.link.getAttribute("aria-label") ?? "")) return;
    seen.add(href);
    const raw = (row.link.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!raw) return;
    // From the TITLE: an Ultra document URL is an opaque id with no extension.
    const fileType = ultraFileTypeFromTitle(raw);
    documents.push({
      folder: ultraFolderPath(rows, index),
      kind: fileType ? "file" : "page",
      title: ultraDocumentTitle(raw),
      url: href,
      ...(fileType ? { fileType } : {}),
    });
    onProgress(documents.length, "Reading what is inside");
  });

  // `refused` folds in here on purpose: a folder that would not open after
  // three tries is course material the student did not get, and saying "that is
  // everything" over the top of it is the false report this all exists to
  // prevent.
  return { documents, truncated: revealed.truncated || revealed.refused > 0 };
}
