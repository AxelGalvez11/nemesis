/**
 * The documents pane: nothing reloads, and the toolbar is not a cockpit.
 *
 * 🔴 BOTH DEFECTS WERE REPORTED IN ONE SENTENCE (owner, 2026-09-01): *"the current viewer is too
 * clunky (the toolbar is too much), slow (it has to load each pdf continually), it needs to be more
 * minimalist."* They have nothing in common in the code and everything in common on screen, which
 * is why they are guarded together — a change that fixes one by undoing the other is not a fix.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const PANE = read("./source-tab-viewer.tsx");
const BAR = readFileSync(new URL("../reader/reader-top-bar.tsx", import.meta.url), "utf8");
const TABS = readFileSync(new URL("../../../lib/learn/source-tabs.ts", import.meta.url), "utf8");

test("🔴🔴 every open tab stays mounted, so switching back does not re-read the PDF", () => {
  // Rendering only the active tab unmounted the reader on every switch: the file was fetched,
  // re-parsed by pdf.js and re-rendered from page one, losing the scroll position, the zoom and the
  // search with it. `hidden` keeps the rendered canvases alive, which IS the cost being avoided —
  // so this must never become a conditional render again.
  assert.match(PANE, /api\.state\.tabs\.map\(\(open\) => \(/, "the pane renders one tab again");
  assert.match(PANE, /open\.key === tab\.key \? "flex" : "hidden"/, "an inactive tab is unmounted rather than hidden");

  // 🔴 AND IT IS ONLY AFFORDABLE BECAUSE THE TABS ARE CAPPED. Six mounted readers is a bounded
  // cost; an unbounded pile is the memory problem the one-at-a-time render was avoiding.
  assert.match(TABS, /export const MAX_TABS = \d+;/, "the tab cap is gone, so mounted readers are unbounded");
  const cap = Number(/export const MAX_TABS = (\d+);/.exec(TABS)?.[1]);
  assert.ok(cap > 0 && cap <= 8, `MAX_TABS is ${cap}: too many readers to keep mounted`);
});

test("🔴 the pane's toolbar drops what the pane already says, and MOVES the rest", () => {
  // The pane is 360px wide and the full bar carries twelve controls. Dense drops the file name (the
  // TAB is the name) and the back button (the tab has a close), and folds the page field, the zoom
  // cluster and the Source/Reading switch away.
  assert.match(PANE, /<LibrarySourceReader className="min-h-0 flex-1" dense/, "the pane asks for the full toolbar");
  for (const [what, pattern] of [
    ["the back button", /\{onBack && !dense && \(/],
    ["the zoom cluster", /\{showZoom && !dense && \(/],
    ["the Source\/Reading switch", /\{modeAvailable && !dense && \(/],
    ["the page field", /\{unitCount > 1 && !dense && \(/],
  ] as const) {
    assert.match(BAR, pattern, `${what} is not trimmed in the pane`);
  }

  // 🔴 NOTHING IS DELETED. Every one of those is still reachable from the "…" menu — a reader who
  // needs to zoom a scan can still zoom it. Trading one complaint for a worse one is not a win.
  assert.match(BAR, /aria-label="Actions and details"/, "the menu that still holds them is gone");
});
