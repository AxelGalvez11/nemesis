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

  // 🔴 AND ONE TAB STRIP. Both bodies draw the same control over the same list, which is what makes
  // it read as one sidebar rather than two that happen to be the same width.
  // 🔴 REPOINTED 2026-09-03 EVENING: `DockSwitcher` (a dropdown) became `DockTabs` (a strip on its
  // own row). The owner asked for the dropdown that morning to buy space, then sent ChatGPT's
  // desktop pane and said *"i want it exactly like this"* — and that pane puts tabs alone on top.
  // What this test protects is unchanged: ONE control over ONE list, drawn identically by both
  // bodies. Only its name moved.
  for (const [name, source] of [["the document panel", read("./source-preview.tsx")], ["the artifact panel", read("./output-preview.tsx")]] as const) {
    assert.match(code(source), /<DockTabs\b/u, `${name} names what is open its own way again`);
  }

  // 🔴 ONLY ONE BODY IS EVER IN FRONT, and this is the clause that does it: the document panel
  // renders nothing without an active DOCUMENT, so an artifact taking the front stands it down
  // while its documents stay mounted behind.
  assert.match(code(read("./document-dock.tsx")), /active\?\.kind === "document" \? active\.source\.id : null/u,
    "the document panel no longer stands down when an artifact is in front");
});

test("🔴🔴 ONE ROW: the reader draws its controls in the panel's header, not a bar of its own", () => {
  // Owner, 2026-09-03, with a picture of the header: *"the comments icon is still like below, it
  // needs to be like ... all the tabs and icons should be on the same row"*.
  //
  // The docked panel had its header, and directly under it the reader painted a second 47px bar
  // carrying the comment toggle and the actions menu. Two rows of chrome above a document that has
  // little enough height, and the controls the owner had just asked to gather were split across
  // both of them.
  const panel = code(read("./source-preview.tsx"));
  const bar = code(read("../reader/reader-top-bar.tsx"));

  // 🔴 A SLOT, NOT A HOIST. Commenting is a mode of the DOCUMENT and the actions menu is built from
  // the reader's own state — its folder trail, its linked notes, its rotate handler. Lifting them
  // into the panel would move a dozen values up two components; lending a place to draw moves
  // nothing but the pixels.
  assert.match(panel, /ref=\{toolbarSlot\}/u, "the panel stopped lending the reader a row");
  assert.match(bar, /if \(toolbarSlot\) return slot \? createPortal\(bar, slot\) : null;/u,
    "the reader draws its own bar again, which puts the controls back on a second row");

  // 🔴 AND ONLY THE FRONT READER GETS IT. Every open document stays mounted, so handing the slot to
  // all of them stacks one set of controls per open document in a single row.
  assert.match(panel, /toolbarSlot=\{front \? toolbarSlot : undefined\}/u,
    "every mounted reader is drawing into the header at once");

  // 🔴 THE REF IS READ AFTER MOUNT, NOT DURING RENDER. `ref.current` is null on the first pass, and
  // portalling into it there draws nothing — silently, on the render that matters.
  assert.match(bar, /useEffect\(\(\) => setSlot\(toolbarSlot\?\.current \?\? null\), \[toolbarSlot\]\)/u,
    "the portal target is read during render, so the first paint is empty");
});

test("🔴 what is open is a dropdown, not a row of tabs", () => {
  // Owner, 2026-09-03: *"instead of tabs you have like a drop down menu of all the things you have
  // open, with a downwards arrow ... that way we can have all the icons on the top row and more
  // space for the thing."*
  //
  // Six open documents were six chips competing with the controls for one row, each truncated to
  // 220px, in a strip that scrolled — so the one you wanted was often off screen. One button costs
  // one slot however many are open.
  const switcher = code(read("./dock-switcher.tsx"));
  assert.match(switcher, /<ChevronDown\b/u, "the downwards arrow is gone, so the label reads as a title rather than a control");
  assert.match(switcher, /DropdownMenuContent/u, "there is no menu of the other open things");

  // 🔴 ONE OPEN THING IS A LABEL, NOT A MENU WITH ONE ROW IN IT — a chevron that opens a list of
  // the thing you are already looking at is a control that does nothing, and this is the sidebar's
  // most common state.
  assert.match(switcher, /if \(items\.length === 1\)/u, "a single open document grew a menu of itself");

  // 🔴 THE ✕ MUST NOT ALSO SWITCH. A button inside a `DropdownMenuItem` fires the item's select as
  // well as its own, so closing a document would first open it.
  assert.match(switcher, /event\.stopPropagation\(\);/u, "closing a row from the menu also selects it");
});

test("🔴 the sidebar carries the same controls whatever kind of thing is in it", () => {
  // Owner, 2026-09-03, with a picture of the four: comment, download, full screen, close —
  // *"these icons should be in the sidebar always"*. They were the ARTIFACT panel's header. A
  // document opened in the same sidebar had close and nothing else: no way to get the file back
  // out, and no way to read it whole. One sidebar showing two kinds of thing with two sets of
  // buttons is the inconsistency that made it read as two panels even after it became one.
  const document_ = code(read("./source-preview.tsx"));
  const artifact = code(read("./output-preview.tsx"));
  for (const [name, source] of [["the document panel", document_], ["the artifact panel", artifact]] as const) {
    assert.match(source, /name="download"/u, `${name} cannot hand the file back`);
    assert.match(source, /screen-full/u, `${name} cannot be read full screen`);
    assert.match(source, /name="close"/u, `${name} has no way out`);
  }

  // 🔴 THE DOWNLOAD GOES THROUGH `resolveUrl`, WHICH IS THE ONLY ROUTE TO THE BYTES. Storage is not
  // public, so a link built any other way is either dead or a signed url that outlives its session.
  assert.match(document_, /await state\.source\.resolveUrl\(\)/u, "the document download stopped minting a fresh url");
  // 🔴 AND FULL SCREEN PUSHES NOTHING. It covers the surface, so claiming an inset for it would
  // reserve a column beside something already filling the window.
  assert.match(document_, /useDeclareSidePanel\(active && !full \? width : 0, dragging\)/u,
    "full screen still pushes the conversation aside");

  // 🔴 COMMENT IS THE ONE THAT IS NOT DUPLICATED, AND THAT IS THE POINT OF THIS CLAUSE. A
  // document's comment mode belongs to the reader — `document-reader.tsx` owns the state and
  // already draws a control for it one row below the header. A second button here would be two
  // owners of one mode, which this repo has paid for before.
  assert.doesNotMatch(document_, /data-testid="output-comment-mode"/u, "the document panel grew a second comment control");
  // 🔴 REWORDED 2026-09-03 EVENING: the control is called ANNOTATING now, and it grows into its own
  // label rather than only changing colour. Read off ChatGPT's desktop app, whose Electron bundle
  // carries the component (`annotation-mode-button-*.js`). What this clause protects is unchanged —
  // the reader owns the mode and the panel does not draw a second control for it.
  const topBar = code(read("../reader/reader-top-bar.tsx"));
  assert.match(topBar, /commenting \? "Stop annotating" : "Annotate the document"/u,
    "the reader lost the comment control the panel is deliberately not duplicating");
  // 🔴 AND IT MUST STILL SAY WHICH MODE IT IS IN. A square button that only changes colour cannot;
  // the word is the whole reason this stopped being an icon. Calibration: drop the span and this
  // reddens.
  assert.match(topBar, /Annotating\s*<\/span>/u, "the annotate toggle no longer names the mode it is in");
  assert.match(topBar, /max-w-40 justify-start/u, "the toggle stopped growing into its label");
});

test("🔴 no '…' menu in the sidebar", () => {
  // Owner, 2026-09-03: *"remove the three dots icon from the sidebar because that's redundant and
  // it's not needed"* — the second time he has cut this menu, after 2026-08-26's *"contains
  // outdated actions that arent necessary"*, which is what moved the AI actions onto a highlight.
  //
  // 🔴 THE GATE IS `toolbarSlot`, NOT `dense`, AND THE DIFFERENCE IS WHICH SURFACE KEEPS IT. A slot
  // means "I am drawing inside someone else's header", which is only ever the docked panel — and
  // that header carries Download and Full screen as buttons, which is what made the menu redundant
  // there. The full Library reader keeps it: its folder trail, linked notes and "open in a new tab"
  // have nowhere else to live.
  const bar = code(read("../reader/reader-top-bar.tsx"));
  assert.match(bar, /\{!toolbarSlot && \(/u, "the actions menu is back in the panel's header");
  assert.match(bar, /aria-label="Actions and details"/u, "the full reader lost its menu too, which was not the ask");
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
