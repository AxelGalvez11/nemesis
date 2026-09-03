/**
 * The documents pane: nothing reloads, and the toolbar is not a cockpit.
 *
 * 🔴 BOTH DEFECTS WERE REPORTED IN ONE SENTENCE (owner, 2026-09-01): *"the current viewer is too
 * clunky (the toolbar is too much), slow (it has to load each pdf continually), it needs to be more
 * minimalist."* They have nothing in common in the code and everything in common on screen, which
 * is why they are guarded together — a change that fixes one by undoing the other is not a fix.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

/** Source with comments stripped: the guards below assert ABSENCES, and the notes explaining each
 *  removal necessarily quote the very shape being searched for. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/^\s*\/\/.*$/gmu, " ");
const PANE = read("./source-preview.tsx");
const BAR = readFileSync(new URL("../reader/reader-top-bar.tsx", import.meta.url), "utf8");
const READER = readFileSync(new URL("../reader/document-reader.tsx", import.meta.url), "utf8");
const CONTROLS = read("./canvas-controls.tsx");

test("🔴🔴 recently-read documents stay mounted, so switching back does not re-read the PDF", () => {
  // 🔴 THIS IS THE HEADER'S SOURCES PANEL, AND IT IS NOW THE ONLY VIEWER. When this note was
  // written there were two — a citation pane (`source-tab-viewer`) reached only from a pill, and
  // this one — and the warning was to guard the right one, because guarding the wrong viewer is how
  // a fix ships and the complaint stays. The owner resolved that on 2026-09-03 by having the pill
  // open this panel and the other pane deleted, so the ambiguity is gone rather than navigated.
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

test("🔴 the pane's toolbar keeps only what acts on the FILE", () => {
  // Owner, 2026-09-01, item by item: *"remove the search magnifying glass icon, the outline is not
  // really necessary for this, the three dots icon contains outdated actions that arent
  // necessary"*, then *"also remove the slides, notes, outline options"*.
  //
  // 🔴 REPOINTED FROM "MOVES THE REST". The first pass folded these behind the "…" on the reasoning
  // that moving beats deleting. He then named the "…" itself, which settles it: on a column beside
  // a conversation these are not misplaced, they are surplus. What survives acts on the FILE and
  // has nowhere else to live — comment, download, open in a new tab, rotate.
  assert.match(PANE, /\n\s+dense\n/, "the panel asks for the full toolbar");
  for (const [what, pattern] of [
    ["the back button", /\{onBack && !dense && \(/],
    ["search", /\{!dense && \(\n\s+<div className="flex shrink-0 items-center gap-1 rounded-lg/],
    ["the contents rail", /\{onToggleRail && !dense && \(/],
    ["the zoom cluster", /\{showZoom && !dense && \(/],
    ["the Source\/Reading switch", /\{modeAvailable && !dense && \(/],
    ["the page field", /\{unitCount > 1 && !dense && \(/],
  ] as const) {
    assert.match(BAR, pattern, `${what} is not trimmed in the pane`);
  }
  // The five ask-about-this items — the same set cut from the highlight bar in #1015.
  assert.match(BAR, /\{!dense && \(\n\s+<>\n\s+<DropdownMenuLabel[\s\S]{0,120}?Ask Nemesis about/, "the stale menu actions are back in the pane");
  // And the slides/outline/notes row under the tab strip.
  assert.match(READER, /source\.kind === "slides" && loadState === "ready" && !dense && \(/, "the second tab row is back");

  // 🔴 THE STANDALONE READER KEEPS ALL OF IT. There the document is the whole screen and the chat
  // is not beside it, so search and the actions are the only way to do those things at all.
  assert.match(BAR, /dense = false,/, "dense stopped defaulting off, which strips the full reader too");
});


test("🔴🔴 one sidebar: a document and an artifact are tabs in it, never two stacked panels", () => {
  // Owner, 2026-09-03, with a screenshot of three panels overlapping on one edge: *"i dont want
  // this, documents, lectures, and everything should open in one sidebar."*
  //
  // The cause was two pieces of state that knew nothing about each other — the open documents in
  // `document-dock`, and `openedOutput` as a private `useState` in `SourcesControl`. Both panels
  // docked at the same width through the same hook, so opening a study guide while a lecture was
  // open put the second rectangle exactly on top of the first: two tab strips, two headers, two
  // close buttons, one behind the other.
  const controls = code(read("./canvas-controls.tsx"));
  const dock = code(read("./document-dock.tsx"));

  // 🔴 ONE LIST. If this state comes back, so does the second panel.
  assert.doesNotMatch(controls, /useState<CanvasOutput \| null>/u, "the artifact is a private state again, so it cannot know a document is open");
  assert.match(controls, /dock\.active\?\.kind === "output"/u, "the artifact in front no longer comes from the sidebar's own list");
  assert.match(dock, /openOutput: \(output: CanvasOutput\) => void;/u, "the sidebar cannot hold an artifact");

  // 🔴 AND ONE STRIP. Both bodies draw the same tabs from the same list, which is what makes it
  // read as one sidebar rather than two that happen to be the same width.
  for (const [name, source] of [["the document panel", read("./source-preview.tsx")], ["the artifact panel", read("./output-preview.tsx")]] as const) {
    assert.match(code(source), /<DockTabs\b/u, `${name} draws a strip of its own again`);
  }

  // 🔴 ONLY ONE BODY IS EVER IN FRONT, and this is the clause that does it: the document panel
  // renders nothing without an active DOCUMENT, so an artifact taking the front stands it down
  // while its documents stay mounted behind.
  assert.match(code(read("./document-dock.tsx")), /active\?\.kind === "document" \? active\.source\.id : null/u,
    "the document panel no longer stands down when an artifact is in front");
});

test("🔴🔴 there is ONE document reader, and the citation chip opens it", () => {
  // 🔴 THERE WERE TWO, AND THE CHIP LED TO THE WORSE ONE. Owner, 2026-09-03: *"clicking on the
  // inline source chip should open documents on the right sidebar, NOT this new sidebar"*, and of
  // the panel he wanted: *"this is the good sidebar"*.
  //
  // `source-tab-viewer.tsx` was a second reader with its own tab strip, its own 360px width and its
  // own passage view, opened only from a citation. Deleting it is the fix; this test is what keeps
  // it deleted, because the tempting way to "improve the citation experience" is to build it again.
  //
  // An earlier version of this test guarded a `+` that had been added to that pane's tab strip and
  // then removed — a second door for a job the Sources list already did. The pane went the same way
  // and for the same reason.
  assert.ok(
    !existsSync(new URL("./source-tab-viewer.tsx", import.meta.url)),
    "a second reading pane is back; a citation chip and the header must open the same one",
  );
  assert.match(CONTROLS, /<SourceRow key=\{source\.id\} onPreview=\{openDocument\} source=\{source\} \/>/,
    "the Sources list stopped opening documents, which leaves no door at all");
  // And the chip's route into it: one dock, shared, with no reader of its own.
  const dock = read("./document-dock.tsx");
  assert.match(dock, /export function useOpenSource\(\)/, "the pills lost their way into the dock");
  assert.doesNotMatch(dock, /LibrarySourceReader/, "the dock grew a reader of its own — that is the second pane returning");
});
