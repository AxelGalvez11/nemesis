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
const PANE = read("./source-preview.tsx");
const BAR = readFileSync(new URL("../reader/reader-top-bar.tsx", import.meta.url), "utf8");
const TABS = readFileSync(new URL("../../../lib/learn/source-tabs.ts", import.meta.url), "utf8");
const TABPANE = read("./source-tab-viewer.tsx");
const CONTROLS = read("./canvas-controls.tsx");

test("🔴🔴 recently-read documents stay mounted, so switching back does not re-read the PDF", () => {
  // 🔴 THIS IS THE HEADER'S SOURCES PANEL, WHICH IS THE VIEWER IN USE. The citation pane
  // (`source-tab-viewer`) is a different surface reached only from a pill; the owner's report was
  // about this one. Guarding the wrong viewer is how a fix ships and the complaint stays.
  //
  // It rendered the ACTIVE source alone, keyed by its id — a clean remount on every tab switch,
  // which is exactly the cost reported as "it has to load each pdf continually": fetched again,
  // re-parsed by pdf.js, re-rendered from page one, losing scroll, zoom and search.
  assert.match(PANE, /open\.filter\(\(source\) => mounted\.has\(source\.id\)\)\.map/, "the panel renders one document again");
  // 🔴 BOUNDED, because a full-size slide costs ~20 MB and six decks alive is a seized browser —
  // the measured reason the old design mounted only one. `source-preview.test.ts` owns the number.
  assert.match(PANE, /const MOUNT_LIMIT = \d+;/, "the mounted set is unbounded");
  assert.match(PANE, /const front = source\.id === activeId;/, "there is no front/back distinction, so all render");
  assert.doesNotMatch(PANE, /key=\{active\.id\}/, "the reader is keyed by the active source again, which remounts it");

  // 🔴 AND `invisible`, NOT `display: none`. pdf.js measures its container to lay pages out, so a
  // zero-size box makes it render nothing at all — the hidden tab would come forward blank.
  assert.match(PANE, /pointer-events-none invisible absolute inset-0/, "a hidden document is display:none and will render blank");

  // Each document resolves ONCE. Re-running the effect for a newly opened tab must not re-fetch
  // the ones already resolved, or the network cost comes straight back.
  assert.match(PANE, /if \(states\[source\.id\] \|\| !mounted\.has\(source\.id\)\) continue;/, "documents are re-fetched on every open");
});

test("🔴 the pane's toolbar drops what the pane already says, and MOVES the rest", () => {
  // The pane is 360px wide and the full bar carries twelve controls. Dense drops the file name (the
  // TAB is the name) and the back button (the tab has a close), and folds the page field, the zoom
  // cluster and the Source/Reading switch away.
  assert.match(PANE, /\n\s+dense\n/, "the panel asks for the full toolbar");
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

test("🔴 the door into a document is the header's Sources list, and there is only one", () => {
  // 🔴 A `+` WAS ADDED TO THE CITATION PANE'S TAB STRIP AND THEN REMOVED. It rendered only once a
  // tab was ALREADY open — `SourceTabPane` returns null with none — so it could add a second
  // document and never the first, which is not the door it claimed to be. The header's Sources
  // panel already lists every document and opens one, so the `+` was a second control for a job
  // that had one, on a surface the owner had just asked to simplify.
  assert.doesNotMatch(TABPANE, /source-tabs-open/, "the redundant opener is back in the citation pane");
  assert.match(CONTROLS, /<SourceRow key=\{source\.id\} onPreview=\{openDocument\} source=\{source\} \/>/,
    "the Sources list stopped opening documents, which leaves no door at all");
});
